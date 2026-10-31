import { env } from "cloudflare:workers";
import { apiError, getPortalIdentity } from "@/lib/portal-auth";

type Runtime = {
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
};

const allowedHosts = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"]);

export async function GET(request: Request) {
  try {
    const identity = await getPortalIdentity(request);
    if (identity.role === "auditor") return Response.json({ enabled: false }, { headers: { "Cache-Control": "private, no-store" } });
    const runtime = env as unknown as Runtime;
    const host = runtime.POSTHOG_HOST?.replace(/\/$/, "") || "https://us.i.posthog.com";
    const projectToken = runtime.POSTHOG_PROJECT_TOKEN?.trim();
    const enabled = Boolean(projectToken && allowedHosts.has(host));
    return Response.json(
      enabled ? { enabled, projectToken, host } : { enabled: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
