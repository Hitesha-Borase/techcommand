import { headers } from "next/headers";
import { TechFlexCommandCenter } from "@/components/techflex-command-center";
import { PasswordLogin, PortalLoginControls } from "@/components/password-login";
import { requestCookie, PASSWORD_COOKIE, METHOD_COOKIE } from "@/lib/password-auth";
import { AppResilience } from "@/components/app-resilience";
import { SessionRecovery } from "@/components/session-recovery";
import { PortalStartup } from "@/components/portal-error-boundary";
import { getDemoAccountFromCookie, DEMO_ACCOUNTS } from "@/lib/demo-auth";

export const dynamic = "force-dynamic";

function displayNameFromEmail(email: string | null) {
  if (!email) return "";
  return email
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function CatchAllPage() {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") || "";
  let demoAccount = getDemoAccountFromCookie(cookieHeader);
  if (!demoAccount && cookieHeader.includes("tc_demo_user=")) {
    try {
      const { env } = await import("cloudflare:workers");
      const match = cookieHeader.split(";").map(s => s.trim()).find(s => s.startsWith("tc_demo_user="));
      if (match && env?.DB) {
        const email = decodeURIComponent(match.split("=")[1] || "").trim().toLowerCase();
        const row = await env.DB.prepare(`
          SELECT u.id AS userId, u.email, u.display_name AS displayName, r.name AS role, r.id AS roleId,
                 t.id AS technicianId, t.technician_code AS technicianCode
            FROM users u
            JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
            JOIN roles r ON r.id = m.role_id
            LEFT JOIN login_usernames lu ON lu.user_id = u.id
            LEFT JOIN technicians t ON t.user_id = u.id
           WHERE (lower(u.email) = ? OR lower(COALESCE(lu.username, '')) = ? OR lower(COALESCE(lu.username_key, '')) = ? OR lower(u.display_name) = ?)
             AND u.status = 'active'
           LIMIT 1
        `).bind(email, email, email, email).first<{
          userId: string; email: string; displayName: string; role: string; roleId: string;
          technicianId: string | null; technicianCode: string | null;
        }>();
        if (row) {
          demoAccount = {
            email: row.email,
            password: "",
            displayName: row.displayName,
            userId: row.userId,
            role: row.role as any,
            roleId: row.roleId,
            technicianId: row.technicianId,
            technicianCode: row.technicianCode || undefined,
            description: `${row.displayName} (${row.role})`,
          };
          DEMO_ACCOUNTS[row.email.toLowerCase()] = demoAccount;
        }
      }
    } catch {}
  }
  const request = new Request("https://app.techcommandhq.com/", { headers: requestHeaders });
  const passwordLogin = !!requestCookie(request, PASSWORD_COOKIE) || !!demoAccount;
  const method = requestCookie(request, METHOD_COOKIE);
  const email = demoAccount ? demoAccount.email : requestHeaders.get("oai-authenticated-user-email");
  if (!passwordLogin && (!email || method === "signed_out" || method === "password")) return <PasswordLogin configured={true} />;
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  let fullName: string | null = demoAccount ? demoAccount.displayName : null;
  if (!fullName && encodedFullName && requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encodedFullName); } catch { /* Use email-derived name */ }
  }
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const initialRole = demoAccount?.role;
  const initialPath = initialRole === "finance" ? "/finance/estimates-billing" : undefined;

  return (
    <><PortalStartup /><AppResilience /><SessionRecovery /><PortalLoginControls passwordLogin={passwordLogin} /><TechFlexCommandCenter
      displayName={demoAccount ? demoAccount.displayName : (passwordLogin ? "" : fullName ?? displayNameFromEmail(email))}
      email={demoAccount ? demoAccount.email : (passwordLogin ? "" : email ?? "")}
      initialRole={initialRole}
      initialPath={initialPath}
      todayLabel={todayLabel}
    /></>
  );
}
