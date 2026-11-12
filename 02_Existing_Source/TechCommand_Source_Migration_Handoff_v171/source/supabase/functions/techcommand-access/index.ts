import { handleAccess } from "./handler.ts";
import configuration from "./config.json" with { type: "json" };
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(request => handleAccess(request, { ...configuration, url: Deno.env.get("SUPABASE_URL") || "", serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" }));
