import "@/lib/weakref-shim";
import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    if (env) {
      (globalThis as any).__WORKER_ENV__ = env;
      if (env.DB) (globalThis as any).__D1_DB__ = env.DB;
    }

    const response = await handler.fetch(request, env, ctx);

    // Resolve PDF Page 6 Permissions-Policy conflict: allow microphone and camera for field voice notes & scanning
    const headers = new Headers(response.headers);
    const currentPolicy = headers.get("Permissions-Policy");
    if (!currentPolicy || currentPolicy.includes("microphone=()")) {
      headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

