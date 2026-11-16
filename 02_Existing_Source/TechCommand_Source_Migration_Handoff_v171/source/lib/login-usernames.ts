import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { PasswordAuthError } from "@/lib/password-auth";

export const loginUsernameSchema = z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+$/, "Use a username such as First.Last (letters, numbers, dots, hyphens or underscores).");
export type LoginDirectoryRow = {
  userId: string; email: string; displayName: string; role: string; technicianId: string | null;
  roles: string[]; username: string | null; suggestedUsername?: string;
};
export function usesTechnicianUsername(row: Pick<LoginDirectoryRow, "roles" | "technicianId">) {
  return !!row.technicianId && row.roles.length > 0 && row.roles.every(role => ["technician", "biomedical_lead"].includes(role));
}
export function usesPortalUsername(row: Pick<LoginDirectoryRow, "roles" | "technicianId">) {
  return usesTechnicianUsername(row) || (row.roles.length > 0 && row.roles.every(role => ["owner_administrator", "operations_administrator"].includes(role)));
}
export function defaultTechnicianUsername(name: string) {
  const parts = name.trim().split(/\s+/).map(part => part.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
  const title = (part: string) => part[0].toUpperCase() + part.slice(1);
  return `${title(parts[0] || "New")}.${title(parts.length > 1 ? parts.at(-1)! : "Technician")}`.slice(0, 75);
}
export function availableTechnicianUsername(name: string, reserved: Iterable<string>) {
  const taken = new Set([...reserved].map(value => value.toLowerCase()));
  const base = defaultTechnicianUsername(name);
  let candidate = base, suffix = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base}.${suffix++}`;
  return candidate;
}

export async function loginDirectory(): Promise<LoginDirectoryRow[]> {
  const result = await env.DB.prepare(`SELECT u.id AS userId, lower(u.email) AS email, u.display_name AS displayName,
    r.name AS role, t.id AS technicianId, lu.username
    FROM users u JOIN memberships m ON m.user_id=u.id AND m.status='active'
    JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
    LEFT JOIN technicians t ON t.user_id=u.id AND t.organization_id=m.organization_id AND t.status='active'
    LEFT JOIN login_usernames lu ON lu.user_id=u.id
    WHERE u.status='active' AND m.organization_id=? AND lower(u.email) NOT LIKE '%@demo.com'
    ORDER BY u.display_name, CASE r.name WHEN 'owner_administrator' THEN 1 WHEN 'operations_administrator' THEN 2 WHEN 'biomedical_lead' THEN 9 WHEN 'technician' THEN 10 ELSE 3 END`)
    .bind(TECHFLEX_ORG_ID).all<LoginDirectoryRow>();
  const unique = new Map<string, LoginDirectoryRow>();
  for (const row of result.results) {
    const previous = unique.get(row.userId);
    if (previous) previous.roles.push(row.role);
    else unique.set(row.userId, { ...row, roles: [row.role] });
  }
  const rows = [...unique.values()];
  const aliases = await env.DB.prepare("SELECT username FROM login_usernames").all<{ username: string }>();
  const taken = aliases.results.map(row => row.username);
  // Existing email logins immediately accept an unambiguous First.Last alias,
  // without resetting any personal password or changing administrator roles.
  for (const row of [...rows].sort((a, b) => a.userId.localeCompare(b.userId))) {
    if (!usesPortalUsername(row)) continue;
    row.suggestedUsername = row.username || availableTechnicianUsername(row.displayName, taken);
    taken.push(row.suggestedUsername);
  }
  return rows;
}

export async function resolvePasswordLogin(value: string) {
  const login = value.trim();
  if (login.includes("@")) {
    const email = z.string().email().max(254).safeParse(login.toLowerCase());
    if (email.success) return email.data;
  } else if (loginUsernameSchema.safeParse(login).success) {
    const rows = await loginDirectory();
    const match = rows.filter(row => usesPortalUsername(row) && row.suggestedUsername?.toLowerCase() === login.toLowerCase());
    if (match.length === 1) return match[0].email;
  }
  throw new PasswordAuthError(401, "Username, email or password was not accepted. Ask your administrator to check your login details.");
}

export async function saveLoginUsername(user: LoginDirectoryRow, value?: string) {
  if (!usesPortalUsername(user)) {
    if (value) throw new PasswordAuthError(400, "This account uses its email login. Technician and administrator accounts can use First.Last usernames.");
    return null;
  }
  const parsed = loginUsernameSchema.safeParse(value || user.username || user.suggestedUsername || defaultTechnicianUsername(user.displayName));
  if (!parsed.success) throw new PasswordAuthError(400, parsed.error.issues[0].message);
  const username = parsed.data;
  const rows = await loginDirectory();
  if (rows.some(row => row.userId !== user.userId && row.suggestedUsername?.toLowerCase() === username.toLowerCase()))
    throw new PasswordAuthError(409, "That username is already assigned. Add a number, such as First.Last.2.");
  try {
    await env.DB.prepare(`INSERT INTO login_usernames (user_id,username,username_key) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,username_key=excluded.username_key,updated_at=CURRENT_TIMESTAMP`)
      .bind(user.userId, username, username.toLowerCase()).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint")) throw new PasswordAuthError(409, "That username is already assigned. Choose another username.");
    throw error;
  }
  return username;
}
