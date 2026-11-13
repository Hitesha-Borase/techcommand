import { getPasswordPortalIdentity } from "@/lib/portal-auth";
import { passwordAuthConfigured, passwordSessionConfirmation, requestCookie, PASSWORD_COOKIE, verifyPasswordSession } from "@/lib/password-auth";
import { getDemoAccountFromCookie, seedAllDemoUsers } from "@/lib/demo-auth";
export type LoginStep = "login" | "password" | "ready";
// Fixed public messages only. Never reflect provider replies or credentials in URLs.
export const loginFeedback = {
 credentials: "Username, email or password was not accepted. Use your personal password if you have already set one. Otherwise, use the temporary password from your TechFlex administrator.",
 fields: "Check your username or email and password, then try again.",
 mismatch: "The two passwords do not match. Enter the same new password twice.",
 access: "Your login needs administrator attention. Contact TechFlex to check your account access.",
 origin: "Open app.techcommandhq.com directly in Safari or Chrome, then sign in again.",
 rate: "Too many sign-in attempts. Wait a few minutes, then try again.",
 unavailable: "Sign-in could not be confirmed. Check your connection and try again. If you just saved a new password, use that password to sign in.",
 cookies: "This browser did not keep the new sign-in session. Open app.techcommandhq.com directly in Safari or Chrome, allow cookies for this site, then try again.",
} as const;
export async function loginScreen(request: Request, options: {check?:string;error?:string;change?:string} = {}) {
 await seedAllDemoUsers();
 const demoUser = getDemoAccountFromCookie(request.headers.get("cookie"));
 if (demoUser) {
   if (options.change === "1") {
     return {
       configured: true,
       initialStep: "password" as LoginStep,
       initialEmail: demoUser.email,
       initialError: options.error && Object.hasOwn(loginFeedback, options.error) ? loginFeedback[options.error as keyof typeof loginFeedback] : "",
       confirmed: false,
     };
   }
   return { configured: true, initialStep: "ready" as LoginStep, initialEmail: demoUser.email, initialError: "", confirmed: true };
 }
 const configured = true;
 const initialError=options.error && Object.hasOwn(loginFeedback,options.error) ? loginFeedback[options.error as keyof typeof loginFeedback] : "";
 const signedOut={configured: true,initialStep:"login" as LoginStep,initialEmail:"",initialError,confirmed:false};
 if(!passwordAuthConfigured()) return signedOut;
 try {
  if(!requestCookie(request,PASSWORD_COOKIE)) return {...signedOut,initialError:options.check?loginFeedback.cookies:initialError};
  const {user,session}=await verifyPasswordSession(request,true);
  await getPasswordPortalIdentity(user,true);
  if(options.check && options.check!==await passwordSessionConfirmation(session)) return {...signedOut,initialError:loginFeedback.cookies};
  return {configured: true,initialStep:(user.app_metadata.tc_temporary===true||options.change==="1"?"password":"ready") as LoginStep,initialEmail:user.email,initialError,confirmed:!!options.check};
 } catch {return {...signedOut,initialError:initialError||"Your session could not be confirmed. Sign in again with your current password."};}
}
