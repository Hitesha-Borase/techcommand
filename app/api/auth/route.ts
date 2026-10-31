import { z } from "zod";
import { apiError, getPasswordPortalIdentity } from "@/lib/portal-auth";
import { PasswordAuthError, assertSameOrigin, authBridge, authJson, clearPasswordResponse, passwordAuthConfigured, passwordResponse, passwordSessionConfirmation, passwordSignIn, readPasswordSession, refreshPasswordSession, requestCookie, PASSWORD_COOKIE, verifyPasswordSession } from "@/lib/password-auth";
import { resolvePasswordLogin } from "@/lib/login-usernames";
import { DEMO_ACCOUNTS, ensureDemoUserInDb, getDemoAccountFromCookie } from "@/lib/demo-auth";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), login: z.string().trim().min(1).max(254).optional(), email: z.string().trim().min(1).max(254).optional(), password: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("password"), password: z.string().min(12, "Use at least 12 characters for your own password.").max(256) }).strict(),
  z.object({ action: z.enum(["refresh", "logout", "owner"]) }).strict(),
]).refine(data => data.action !== "login" || !!data.login !== !!data.email, "Enter a username or email, not both.");

export async function GET(request: Request) {
  try {
    const demo = getDemoAccountFromCookie(request.headers.get("cookie"));
    if (demo) return passwordResponse({ configured: true, signedIn: true, needsPasswordChange: false });
    if (!passwordAuthConfigured()) return passwordResponse({ configured: true, signedIn: false });
    if (!requestCookie(request, PASSWORD_COOKIE)) return passwordResponse({ configured: true, signedIn: false });
    const { user } = await verifyPasswordSession(request, true);
    await getPasswordPortalIdentity(user, true);
    return passwordResponse({ configured: true, signedIn: true, needsPasswordChange: user.app_metadata.tc_temporary === true });
  } catch (error) {
    if (error instanceof PasswordAuthError && error.status === 401) return passwordResponse({ configured: true, signedIn: false });
    return apiError(error);
  }
}

export async function POST(request: Request) {
 const nativeForm=request.headers.get("content-type")?.split(";")[0].trim()==="application/x-www-form-urlencoded";
 let formError="";
 async function respond(response:Response,owner=false) {
  if(!nativeForm) return response;
  const result=await response.json() as {confirmation?:string};
  const headers=new Headers(response.headers);headers.delete("Content-Type");
  headers.set("Location",owner?"/signin-with-chatgpt?return_to=%2F":`/login?check=${result.confirmation}`);
  return new Response(null,{status:303,headers});
 }
 try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length")) > 4096) throw new PasswordAuthError(400, "Sign-in request is too large.");
    const raw = await request.text();
    if (raw.length > 4096) throw new PasswordAuthError(400, "Sign-in request is too large.");
    let fields:unknown;
    if(nativeForm) {
      const form=new URLSearchParams(raw);
      for(const key of form.keys()) if(form.getAll(key).length!==1) throw new PasswordAuthError(400,"Check the sign-in fields.");
      if(!["login","password","owner"].includes(form.get("action")||"")) throw new PasswordAuthError(400,"Choose a sign-in action.");
      if(form.get("action")==="password") {
        if(form.get("password")!==form.get("confirmation")){formError="mismatch";throw new PasswordAuthError(400,"Passwords do not match.");}
        form.delete("confirmation");form.delete("email"); // Autofill hint only; verified session selects identity.
      }
      fields=Object.fromEntries(form);
    } else fields=JSON.parse(raw);
    const parsed = input.safeParse(fields);
    if (!parsed.success) throw new PasswordAuthError(400, parsed.error.issues[0]?.message || "Check the sign-in fields.");
    const data = parsed.data;
    if (data.action === "owner") return respond(clearPasswordResponse("sso"),true);
    if (data.action === "logout") {
      const headers = new Headers();
      headers.set("Set-Cookie", "tc_demo_user=; Path=/; SameSite=Lax; Max-Age=0");
      headers.set("Location", "/login");
      try { const session = await readPasswordSession(request); await authJson("/logout?scope=local", { method: "POST", headers: { Authorization: `Bearer ${session.access}` } }); } catch { /* Local encrypted session is always cleared */ }
      if (nativeForm) return new Response(null, { status: 303, headers });
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    if (data.action === "login") {
      const loginStr = (data.login || data.email || "").trim().toLowerCase();
      if (DEMO_ACCOUNTS[loginStr]) {
        const demo = DEMO_ACCOUNTS[loginStr];
        if (data.password !== demo.password) {
          if (nativeForm) return new Response(null, { status: 303, headers: { Location: "/login?error=credentials" } });
          throw new PasswordAuthError(401, "Invalid password.");
        }
        await ensureDemoUserInDb(demo);
        const headers = new Headers();
        headers.set("Set-Cookie", `tc_demo_user=${demo.email}; Path=/; SameSite=Lax; Max-Age=604800`);
        headers.set("Location", "/");
        if (nativeForm) return new Response(null, { status: 303, headers });
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
      const result = await passwordSignIn(await resolvePasswordLogin(data.login || data.email!), data.password);
      await getPasswordPortalIdentity(result.user, true);
      return respond(await passwordResponse({ok:true,needsPasswordChange:result.user.app_metadata.tc_temporary===true,confirmation:await passwordSessionConfirmation(result.session)},result.session));
    }
    if (data.action === "refresh") {
      const result = await refreshPasswordSession(request);
      await getPasswordPortalIdentity(result.user, true);
      return passwordResponse({ ok: true, needsPasswordChange: result.user.app_metadata.tc_temporary === true }, result.session);
    }
    if (data.action !== "password") throw new PasswordAuthError(400, "Choose a sign-in action.");
    const { user, session } = await verifyPasswordSession(request, true);
    const identity = await getPasswordPortalIdentity(user, true);
    await authBridge("change_password", { providerId: user.id, expectedEpoch: session.epoch, password: data.password, actorUserId: identity.userId });
    // A real password grant supplies a fresh token with the new credential epoch.
    const result = await passwordSignIn(user.email, data.password);
    return respond(await passwordResponse({ok:true,needsPasswordChange:false,confirmation:await passwordSessionConfirmation(result.session)},result.session));
  } catch (error) {
    const response=apiError(error instanceof SyntaxError?new PasswordAuthError(400,"Check the sign-in fields."):error);
    if(!nativeForm) return response;
    const crossOrigin=request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site";
    const code=formError||(response.status===401?"credentials":response.status===400?"fields":response.status===429?"rate":response.status===403?crossOrigin?"origin":"access":"unavailable");
    return new Response(null,{status:303,headers:{Location:`/login?error=${code}`,"Cache-Control":"private, no-store"}});
  }
}
