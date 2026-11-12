type Config = { app: string; publicKey: JsonWebKey; url: string; serviceKey: string };
type User = { id: string; email: string; app_metadata: Record<string, unknown>; banned_until?: string };
class AccessError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
const utf8 = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
function string(value: unknown, maximum = 254) { return typeof value === "string" && value.length <= maximum ? value : ""; }

/** Service-to-service provisioning. Browser JWTs, emails and role claims alone never authorize this endpoint. */
export async function handleAccess(request: Request, cfg: Config): Promise<Response> {
  try {
    if (request.method !== "POST" || !cfg.serviceKey || !cfg.url || Number(request.headers.get("content-length")) > 10000) throw new AccessError(401, "Authorized login management is required.");
    const signature = request.headers.get("X-TechCommand-Signature") || "";
    if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new AccessError(401, "Authorized login management is required.");
    const body = await request.text();
    if (body.length > 10000) throw new AccessError(400, "Request is too large.");
    const key = await crypto.subtle.importKey("jwk", cfg.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytes, utf8.encode(body))) throw new AccessError(401, "Authorized login management is required.");
    const input = JSON.parse(body);
    if (input.app !== cfg.app || !uuid.test(input.nonce || "") || !Number.isFinite(input.expires) || input.expires < Date.now() || input.expires > Date.now() + 60000) throw new AccessError(401, "Login management request expired.");
    const payload = input.payload || {};
    const call = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${cfg.url}${path}`, { ...init, headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(12000) });
      const raw = await response.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { throw new AccessError(503, "Login service returned an unreadable reply."); }
      if (!response.ok) {
        if (path.startsWith("/rest/v1/techcommand_auth_operations") && response.status === 409) throw new AccessError(409, "This login request was already handled. Refresh login status.");
        // Never return provider errors containing passwords, tokens, or account details.
        throw new AccessError(response.status === 429 ? 429 : 503, "The login change could not be confirmed. Refresh login status before retrying.");
      }
      return data;
    };
    // Unique, durable nonces reject signed replay, even across cold starts. No password is stored here.
    await call("/rest/v1/techcommand_auth_operations", { method: "POST", body: JSON.stringify({ id: input.nonce, operation: string(input.operation, 40), expires_at: new Date(input.expires).toISOString() }) });
    if (input.operation === "health") return reply({ ok: true });
    const managed = (user: User) => user.app_metadata?.tc_app === cfg.app;
    const publicUser = (user: User) => ({ providerId: user.id, email: user.email, userId: user.app_metadata.tc_user || null, temporary: user.app_metadata.tc_temporary === true, disabled: user.app_metadata.tc_disabled === true });
    const all = async (): Promise<User[]> => {
      const users: User[] = [];
      for (let page = 1; page <= 100; page++) {
        const data = await call(`/auth/v1/admin/users?page=${page}&per_page=100`);
        if (!Array.isArray(data.users)) throw new AccessError(503, "Login directory could not be read.");
        users.push(...data.users);
        if (data.users.length < 100) return users;
      }
      throw new AccessError(503, "Login directory is too large for this operation.");
    };
    if (input.operation === "list") return reply({ users: (await all()).filter(managed).map(publicUser) });
    if (input.operation === "create" || input.operation === "reset") {
      const email = string(payload.email).trim().toLowerCase();
      const userId = string(payload.userId, 200);
      // Initial owner-directed enrollment may use a verified existing technician ID
      // when the local user ID is not exposed to administration tooling. The app
      // requires BOTH exact email and this existing active technician, never a new role.
      const technicianId = string(payload.technicianId, 200);
      const enrollment = !userId && payload.emailEnrollment === true && uuid.test(technicianId);
      const password = string(payload.password, 256);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!userId && !enrollment) || password.length < 8) throw new AccessError(400, "A verified profile, email and temporary password are required.");
      const matches = (await all()).filter(u => u.email?.toLowerCase() === email);
      if (matches.length > 1 || (matches[0] && (!managed(matches[0]) || (matches[0].app_metadata.tc_user && matches[0].app_metadata.tc_user !== userId)))) throw new AccessError(409, "This email already belongs to another login. Administrator review is required.");
      const existing = matches[0];
      if (existing && enrollment && (!existing.app_metadata.tc_email_enrollment || existing.app_metadata.tc_user || existing.app_metadata.tc_technician !== technicianId)) throw new AccessError(409, "This login is linked to a different profile. Use its administrator login controls.");
      if (existing && input.operation === "create") throw new AccessError(409, "This login already exists. Use Reset password if needed.");
      if (!existing && input.operation === "reset") throw new AccessError(409, "This login does not exist yet. Use Create login.");
      const data = { email, password, email_confirm: true, app_metadata: { ...(existing?.app_metadata || {}), tc_app: cfg.app, ...(enrollment ? { tc_email_enrollment: true, tc_technician: technicianId } : { tc_user: userId }), tc_epoch: crypto.randomUUID(), tc_temporary: true, tc_disabled: false }, ...(existing ? {} : { user_metadata: { name: string(payload.displayName, 200) } }) };
      const result = await call(existing ? `/auth/v1/admin/users/${existing.id}` : "/auth/v1/admin/users", { method: existing ? "PUT" : "POST", body: JSON.stringify(data) });
      const user = result.user || result;
      if (!user.id || !managed(user)) throw new AccessError(503, "The login change could not be verified.");
      return reply({ user: publicUser(user) });
    }
    if (input.operation === "change_password" || input.operation === "disable") {
      const id = string(payload.providerId, 100);
      if (!uuid.test(id)) throw new AccessError(400, "Choose a valid login.");
      const data = await call(`/auth/v1/admin/users/${id}`);
      const user: User = data.user || data;
      if (!managed(user)) throw new AccessError(403, "This login belongs to another application.");
      let update;
      if (input.operation === "change_password") {
        const password = string(payload.password, 256);
        if (password.length < 12 || user.app_metadata.tc_disabled || payload.expectedEpoch !== user.app_metadata.tc_epoch) throw new AccessError(409, "Your login changed. Sign in again before choosing a new password.");
        update = { password, app_metadata: { ...user.app_metadata, tc_epoch: crypto.randomUUID(), tc_temporary: false } };
      } else update = { app_metadata: { ...user.app_metadata, tc_epoch: crypto.randomUUID(), tc_disabled: true } };
      const result = await call(`/auth/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify(update) });
      return reply({ user: publicUser(result.user || result) });
    }
    throw new AccessError(400, "Unknown login operation.");
  } catch (error) {
    return error instanceof AccessError ? reply({ error: error.message }, error.status) : reply({ error: "Login management could not be completed. Refresh status before retrying." }, 503);
  }
}
