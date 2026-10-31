import { env } from "cloudflare:workers";
import { z } from "zod";

// Managed passwords stay in Supabase. The browser receives only an encrypted,
// authenticated HttpOnly session; roles always come from TechCommand's database.
export const PASSWORD_COOKIE = "__Host-tc-session";
export const METHOD_COOKIE = "__Host-tc-method";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
// Keep the chosen login method after its session expires. A lingering owner SSO
// session in a shared browser must not silently replace a technician identity.
const METHOD_SECONDS = 365 * 24 * 60 * 60;
type Configuration = { TC_AUTH_URL?: string; TC_AUTH_PUBLIC_KEY?: string; TC_AUTH_APP_ID?: string; TC_AUTH_SESSION_KEY?: string; TC_AUTH_ADMIN_KEY?: string; TC_AUTH_TEMP_PASSWORD?: string };
type Metadata = { tc_app?: string; tc_user?: string; tc_technician?: string; tc_epoch?: string; tc_temporary?: boolean; tc_email_enrollment?: boolean; tc_disabled?: boolean };
export type PasswordUser = { id: string; email: string; email_confirmed_at?: string; app_metadata: Metadata };
export type PasswordSession = { access: string; refresh: string; subject: string; epoch: string; started: number };
// Non-credential digest confirms the returned cookie is the newly issued session.
// It cannot establish access and contains no recoverable identity or credential.
export async function passwordSessionConfirmation(session: PasswordSession) {
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([session.subject,session.epoch,session.access])));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
}

const userSchema = z.object({ id: z.string().uuid(), email: z.string().email(), email_confirmed_at: z.string().optional(), app_metadata: z.object({ tc_app: z.string().optional(), tc_user: z.string().optional(), tc_technician: z.string().optional(), tc_epoch: z.string().optional(), tc_temporary: z.boolean().optional(), tc_email_enrollment: z.boolean().optional(), tc_disabled: z.boolean().optional() }) });
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), user: userSchema });
const bridgeUserSchema = z.object({ providerId: z.string().uuid(), email: z.string(), userId: z.string().nullable(), temporary: z.boolean(), disabled: z.boolean() });
type BridgeUser = z.infer<typeof bridgeUserSchema>;

export class PasswordAuthError extends Error {
  status: number;
  refreshable: boolean;
  constructor(status: number, message: string, refreshable = false) { super(message); this.status = status; this.refreshable = refreshable; }
}

export function passwordConfiguration() {
  const cfg = env as unknown as Configuration;
  if (!cfg.TC_AUTH_URL || !cfg.TC_AUTH_PUBLIC_KEY || !cfg.TC_AUTH_APP_ID || !cfg.TC_AUTH_SESSION_KEY || !cfg.TC_AUTH_ADMIN_KEY)
    throw new PasswordAuthError(503, "Direct sign-in is being configured. Your administrator can use the recovery sign-in below.");
  const url = new URL(cfg.TC_AUTH_URL);
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.pathname !== "/")
    throw new PasswordAuthError(503, "Direct sign-in configuration needs administrator attention.");
  return { url: url.origin, key: cfg.TC_AUTH_PUBLIC_KEY, app: cfg.TC_AUTH_APP_ID, sessionKey: cfg.TC_AUTH_SESSION_KEY, adminKey: cfg.TC_AUTH_ADMIN_KEY };
}
export function passwordAuthConfigured() { try { passwordConfiguration(); return true; } catch { return false; } }
export function administratorTemporaryPassword() {
  const password = (env as unknown as Configuration).TC_AUTH_TEMP_PASSWORD;
  if (!password || password.length < 8 || password.length > 256) throw new PasswordAuthError(503, "The standard temporary password needs administrator configuration. No login was changed.");
  return password;
}
export function individualTemporaryPassword() {
  // External reviewers never receive the company's reusable staff password.
  // 192 random bits, with a fixed prefix satisfying common provider policies.
  return `Tc9!${base64(crypto.getRandomValues(new Uint8Array(24)))}`;
}
export function requestCookie(request: Request, name: string) {
  const values = (request.headers.get("cookie") || "").split(";").map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  if (values.length > 1) throw new PasswordAuthError(401, "Please sign in again.");
  return values[0]?.slice(name.length + 1) || "";
}
export function usesPasswordLogin(request: Request) { return !!requestCookie(request, PASSWORD_COOKIE) || ["password", "signed_out"].includes(requestCookie(request, METHOD_COOKIE)); }
function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function unbase64(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
async function sessionKey() { return crypto.subtle.importKey("raw", unbase64(passwordConfiguration().sessionKey), "AES-GCM", false, ["encrypt", "decrypt"]); }
export async function sealPasswordSession(session: PasswordSession) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify(session));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(passwordConfiguration().app) }, await sessionKey(), payload);
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function readPasswordSession(request: Request): Promise<PasswordSession> {
  const value = requestCookie(request, PASSWORD_COOKIE);
  if (!value || value.length > 12000) throw new PasswordAuthError(401, "Sign in with your TechCommand username or email and password.");
  try {
    const [iv, cipher, extra] = value.split(".");
    if (!iv || !cipher || extra) throw new Error("cookie");
    const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv), additionalData: new TextEncoder().encode(passwordConfiguration().app) }, await sessionKey(), unbase64(cipher));
    const session = JSON.parse(new TextDecoder().decode(decoded)) as PasswordSession;
    if (!session.access || !session.refresh || !session.subject || !session.epoch || !Number.isFinite(session.started) || session.started > Date.now() + 10000 || Date.now() - session.started > SESSION_SECONDS * 1000) throw new Error("expired");
    return session;
  } catch { throw new PasswordAuthError(401, "Your session ended. Sign in again; unsaved work stays in its original tab."); }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
    throw new PasswordAuthError(403, "Open TechCommand directly and try again.");
}
export async function authJson(path: string, init: RequestInit = {}) {
  const cfg = passwordConfiguration();
  let response: Response;
  try { response = await fetch(`${cfg.url}/auth/v1${path}`, { ...init, headers: { apikey: cfg.key, "Content-Type": "application/json", ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(15000) }); }
  catch { throw new PasswordAuthError(503, "Sign-in service could not be reached. Keep your entries and try again."); }
  let data;
  try { data = await response.json(); } catch { throw new PasswordAuthError(503, "Sign-in service returned an unreadable reply. Please try again."); }
  if (!response.ok) {
    if (response.status === 429) throw new PasswordAuthError(429, "Too many sign-in attempts. Wait a few minutes, then try again.");
    if (response.status >= 500) throw new PasswordAuthError(503, "Sign-in service is temporarily unavailable. Please try again.");
    throw new PasswordAuthError(401, "Username, email or password was not accepted. Ask your administrator to create or reset your TechCommand login.", path === "/user");
  }
  return data;
}
export function validatePasswordUser(input: unknown, session?: PasswordSession): PasswordUser {
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) throw new PasswordAuthError(403, "Your TechCommand login needs administrator setup.");
  const user = parsed.data;
  const meta = user.app_metadata;
  if (!user.id || !user.email || !user.email_confirmed_at || meta?.tc_app !== passwordConfiguration().app || !meta.tc_epoch || meta.tc_disabled || (!meta.tc_user && !(meta.tc_email_enrollment && meta.tc_technician)))
    throw new PasswordAuthError(403, "Your TechCommand login needs administrator setup.");
  if (session && (session.subject !== user.id || session.epoch !== meta.tc_epoch))
    throw new PasswordAuthError(401, "Your password or access changed. Sign in again with your current password.");
  return user;
}
export async function verifyPasswordSession(request: Request, allowTemporary = false) {
  const session = await readPasswordSession(request);
  const user = validatePasswordUser(await authJson("/user", { headers: { Authorization: `Bearer ${session.access}` } }), session);
  if (user.app_metadata.tc_temporary && !allowTemporary) throw new PasswordAuthError(428, "Choose your own password before opening your assignments.");
  return { session, user };
}
export async function passwordSignIn(email: string, password: string) {
  const parsed = tokenSchema.safeParse(await authJson("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }));
  if (!parsed.success) throw new PasswordAuthError(503, "Sign-in was not confirmed. Please try again.");
  const data = parsed.data;
  const user = validatePasswordUser(data.user);
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new PasswordAuthError(503, "Sign-in was not confirmed. Please try again.");
  const session: PasswordSession = { access: data.access_token, refresh: data.refresh_token, subject: user.id, epoch: user.app_metadata.tc_epoch!, started: Date.now() };
  return { user, session };
}
export async function refreshPasswordSession(request: Request) {
  const old = await readPasswordSession(request);
  const parsed = tokenSchema.safeParse(await authJson("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: old.refresh }) }));
  if (!parsed.success) throw new PasswordAuthError(503, "Session refresh was not confirmed.");
  const data = parsed.data;
  const user = validatePasswordUser(data.user, old);
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new PasswordAuthError(503, "Session refresh was not confirmed.");
  return { user, session: { ...old, access: data.access_token, refresh: data.refresh_token } };
}
export function sessionHeaders() { return new Headers({ "Cache-Control": "private, no-store", "Content-Type": "application/json", "Vary": "Cookie" }); }
export async function passwordResponse(data: unknown, session?: PasswordSession) {
  const headers = sessionHeaders();
  if (session) {
    const remaining = Math.max(1, SESSION_SECONDS - Math.floor((Date.now() - session.started) / 1000));
    const sealed = await sealPasswordSession(session);
    if (sealed.length > 3800) throw new PasswordAuthError(503, "The sign-in session could not be saved. Ask your administrator to check login configuration.");
    headers.append("Set-Cookie", `${PASSWORD_COOKIE}=${sealed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${remaining}`);
    headers.append("Set-Cookie", `${METHOD_COOKIE}=password; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${METHOD_SECONDS}`);
  }
  return new Response(JSON.stringify(data), { headers });
}
export function clearPasswordResponse(method: "sso" | "signed_out") {
  const headers = sessionHeaders();
  headers.append("Set-Cookie", `${PASSWORD_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.append("Set-Cookie", `${METHOD_COOKIE}=${method}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${METHOD_SECONDS}`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
export function authBridge(operation: "list", payload?: Record<string, unknown>): Promise<{ users: BridgeUser[] }>;
export function authBridge(operation: "create" | "reset" | "disable" | "change_password", payload: Record<string, unknown>): Promise<{ user: BridgeUser }>;
export function authBridge(operation: "health", payload?: Record<string, unknown>): Promise<{ ok: boolean }>;
export async function authBridge(operation: string, payload: Record<string, unknown> = {}) {
  const cfg = passwordConfiguration();
  const body = JSON.stringify({ operation, payload, app: cfg.app, nonce: crypto.randomUUID(), expires: Date.now() + 45000 });
  const key = await crypto.subtle.importKey("jwk", JSON.parse(cfg.adminKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body));
  let response;
  try { response = await fetch(`${cfg.url}/functions/v1/techcommand-access`, { method: "POST", headers: { "Content-Type": "application/json", "X-TechCommand-Signature": base64(new Uint8Array(signature)) }, body, signal: AbortSignal.timeout(20000), cache: "no-store" }); }
  catch { throw new PasswordAuthError(503, "The login change could not be confirmed. Refresh login status before trying again."); }
  let data: { error?: string };
  try { data = z.object({ error: z.string().optional() }).passthrough().parse(await response.json()); } catch { throw new PasswordAuthError(503, "The login change returned an unreadable reply. Refresh login status before trying again."); }
  if (!response.ok) throw new PasswordAuthError(response.status >= 500 ? 503 : response.status, typeof data.error === "string" ? data.error : "The login change could not be completed.");
  const parsed = (operation === "list" ? z.object({ users: z.array(bridgeUserSchema) }) : operation === "health" ? z.object({ ok: z.boolean() }) : z.object({ user: bridgeUserSchema })).safeParse(data);
  if (!parsed.success) throw new PasswordAuthError(503, "The login change could not be verified. Refresh status before trying again.");
  return parsed.data;
}
