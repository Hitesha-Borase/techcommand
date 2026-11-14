import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";
import { PasswordAuthError, administratorTemporaryPassword, individualTemporaryPassword, assertSameOrigin, authBridge, passwordAuthConfigured, passwordResponse } from "@/lib/password-auth";
import { loginDirectory, saveLoginUsername, usesPortalUsername, usesTechnicianUsername, type LoginDirectoryRow } from "@/lib/login-usernames";
import { DEMO_ACCOUNTS } from "@/lib/demo-auth";

type LoginRow = LoginDirectoryRow;
const operationalLoginRoles = ["technician", "biomedical_lead", "client_administrator", "client_location_user"];
const operationsMayManage = (row: LoginRow) => row.roles.every(role => operationalLoginRoles.includes(role));
export async function GET(request: Request) {
  try {
    const actor = await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const rows = await loginDirectory();
    if (!passwordAuthConfigured()) return passwordResponse({ configured: false, users: [] });
    const provider = await authBridge("list");
    let localSet = new Set<string>();
    try {
      const localUsers = await env.DB.prepare("SELECT email FROM local_credentials").all<{ email: string }>();
      localSet = new Set((localUsers?.results ?? []).map(r => r.email.toLowerCase()));
    } catch {}
    return passwordResponse({ configured: true, users: rows.filter(u => !u.email.endsWith("@demo.com") && (actor.role === "owner_administrator" || operationsMayManage(u))).map(row => {
      const found = provider.users.find(p => p.email.toLowerCase() === row.email && (!p.userId || p.userId === row.userId));
      const hasLocal = localSet.has(row.email.toLowerCase());
      const status = hasLocal ? "temporary_password" : (!found ? "not_created" : found.disabled ? "disabled" : found.temporary ? "temporary_password" : "ready");
      return { ...row, username: usesPortalUsername(row) ? row.suggestedUsername : null, login: usesPortalUsername(row) ? row.suggestedUsername : row.email, loginStatus: status };
    }) });
  } catch (error) { return apiError(error); }
}
const schema = z.union([
  z.object({ action: z.enum(["create", "reset", "disable", "username"]), userId: z.string().min(1).max(200), username: z.string().trim().max(80).optional() }).strict(),
  z.object({ action: z.literal("prepare_technicians") }).strict(),
]);
export async function POST(request: Request) {
  try {
    const actor = await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    assertSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PasswordAuthError(400, "Choose a user and a valid login action.");
    const data = parsed.data;
    const rows = await loginDirectory();
    if (data.action === "prepare_technicians") {
      const technicians = rows.filter(usesTechnicianUsername);
      if (technicians.length > 20) throw new PasswordAuthError(400, "Prepare logins individually for teams larger than 20 technicians.");
      const provider = await authBridge("list");
      const temporaryPassword = administratorTemporaryPassword();
      const results: { userId: string; name: string; login: string; status: string; message?: string }[] = [];
      for (const user of technicians) {
        let login = user.suggestedUsername || user.email;
        try {
          if (rows.some(row => row.userId !== user.userId && row.email === user.email)) throw new PasswordAuthError(409, "Duplicate email profiles need review.");
          const matches = provider.users.filter(p => p.email.toLowerCase() === user.email);
          if (matches.length > 1 || (matches[0]?.userId && matches[0].userId !== user.userId)) throw new PasswordAuthError(409, "The existing login is linked to another profile. Administrator review is required.");
          login = await saveLoginUsername(user) || user.email;
          const found = matches[0];
          if (found?.disabled) { results.push({ userId: user.userId, name: user.displayName, login, status: "disabled", message: "Disabled login was not restored." }); continue; }
          if (found && !found.temporary) { results.push({ userId: user.userId, name: user.displayName, login, status: "unchanged", message: "Personal password preserved." }); continue; }
          const action = found ? "reset" : "create";
          const requestId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?,?)")
            .bind(requestId,TECHFLEX_ORG_ID,actor.userId,`access.password_${action}_requested`,"user",user.userId,JSON.stringify({ batch: true, username: login })).run();
          const changed = await authBridge(action, { userId: user.userId, technicianId: user.technicianId, email: user.email, displayName: user.displayName, password: temporaryPassword, actorUserId: actor.userId });
          let message: string | undefined;
          try {
            await env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(),TECHFLEX_ORG_ID,actor.userId,`access.password_${action}`,"user",user.userId,JSON.stringify({ requestId, providerId: changed.user.providerId, temporary: true })).run();
          } catch { message = "Login is ready. The completion audit needs review; do not repeat the reset."; }
          results.push({ userId: user.userId, name: user.displayName, login, status: found ? "reset" : "created", message });
        } catch (error) { results.push({ userId: user.userId, name: user.displayName, login, status: "error", message: error instanceof PasswordAuthError ? error.message : "Setup could not be confirmed. Refresh this person’s login status before retrying." }); }
      }
      return passwordResponse({ ok: true, results, ...(results.some(row => ["created", "reset"].includes(row.status)) ? { temporaryPassword } : {}) });
    }
    const user = rows.find(row => row.userId === data.userId);
    if (!user || (actor.role !== "owner_administrator" && !operationsMayManage(user))) throw new PasswordAuthError(403, "You cannot manage this person's login.");
    if (user.userId === actor.userId && data.action === "disable") throw new PasswordAuthError(400, "Use Sign out for your own account.");
    if (rows.some(row => row.userId !== user.userId && row.email === user.email)) throw new PasswordAuthError(409, "Two profiles use this email. Resolve the duplicate before creating a login.");
    if (data.action === "username") {
      if (!usesPortalUsername(user) || !data.username) throw new PasswordAuthError(400, "Choose a technician or administrator and enter a username.");
      const username = await saveLoginUsername(user, data.username);
      await env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.username_updated','user',?,?)")
        .bind(crypto.randomUUID(),TECHFLEX_ORG_ID,actor.userId,user.userId,JSON.stringify({ username })).run();
      return passwordResponse({ ok: true, email: user.email, login: username, username });
    }
    if (data.action !== "disable" && user.roles.includes("auditor") && user.roles.some(role => role !== "auditor"))
      throw new PasswordAuthError(409, "This reviewer profile also has operational access. Resolve its roles before creating or resetting a login.");
    const username = data.action === "disable" ? user.username : await saveLoginUsername(user, data.username);
    const temporaryPassword = data.action === "disable" ? undefined
      : user.roles.includes("auditor") ? individualTemporaryPassword() : administratorTemporaryPassword();
    // Record intent before the external write. If D1 is unavailable, no password changes.
    const auditId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?,?)")
      .bind(auditId, TECHFLEX_ORG_ID, actor.userId, `access.password_${data.action}_requested`, "user", user.userId, JSON.stringify({ state: "requested" })).run();
    let result;
    if (data.action === "disable") {
      const provider = await authBridge("list");
      const found = provider.users.find(p => (!p.userId || p.userId === user.userId) && p.email.toLowerCase() === user.email);
      if (!found) throw new PasswordAuthError(404, "Create this login before managing it.");
      result = await authBridge("disable", { providerId: found.providerId, actorUserId: actor.userId });
    } else result = await authBridge(data.action, { userId: user.userId, email: user.email, displayName: user.displayName, technicianId: user.technicianId || undefined, password: temporaryPassword, actorUserId: actor.userId });
    let warning: string | undefined;
    try {
      await env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, actor.userId, `access.password_${data.action}`, "user", user.userId, JSON.stringify({ requestId: auditId, providerId: result.user.providerId, temporary: data.action !== "disable" })).run();
    } catch { warning = "The login changed successfully. The request is recorded, but its completion audit needs administrator review. Keep these login details; do not repeat the change."; }
    return passwordResponse({ ok: true, email: user.email, login: username || user.suggestedUsername || user.email, username, ...(data.action === "disable" ? {} : { temporaryPassword }), mustChangePassword: data.action !== "disable", warning });
  } catch (error) {
    console.error("DEBUG POST /api/access/passwords error:", error);
    return Response.json({ error: String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}
