import { headers } from "next/headers";
import { TechFlexCommandCenter } from "@/components/techflex-command-center";
import { PasswordLogin, PortalLoginControls } from "@/components/password-login";
import { requestCookie, PASSWORD_COOKIE, METHOD_COOKIE } from "@/lib/password-auth";
import { AppResilience } from "@/components/app-resilience";
import { SessionRecovery } from "@/components/session-recovery";
import { PortalStartup } from "@/components/portal-error-boundary";
import { getDemoAccountFromCookie } from "@/lib/demo-auth";

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
  const demoAccount = getDemoAccountFromCookie(cookieHeader);
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

  return (
    <><PortalStartup /><AppResilience /><SessionRecovery /><PortalLoginControls passwordLogin={passwordLogin} /><TechFlexCommandCenter
      displayName={demoAccount ? demoAccount.displayName : (passwordLogin ? "" : fullName ?? displayNameFromEmail(email))}
      email={demoAccount ? demoAccount.email : (passwordLogin ? "" : email ?? "")}
      todayLabel={todayLabel}
    /></>
  );
}
