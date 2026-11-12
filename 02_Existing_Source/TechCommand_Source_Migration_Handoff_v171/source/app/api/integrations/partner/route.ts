import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  expiresOn: z.string().date().optional().nullable(),
});

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const result = await env.DB.prepare(
      `SELECT k.id,k.account_id AS accountId,a.name AS accountName,k.name,k.key_prefix AS keyPrefix,
              k.scopes_json AS scopesJson,k.status,k.last_used_at AS lastUsedAt,k.expires_at AS expiresAt,k.created_at AS createdAt
         FROM partner_api_keys k JOIN accounts a ON a.id=k.account_id
        WHERE k.organization_id=? ORDER BY k.created_at DESC`,
    ).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ keys: result.results.map((row) => ({ ...row, scopes: JSON.parse(String((row as Record<string, unknown>).scopesJson || "[]")), scopesJson: undefined })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "revoke") {
      const id = z.string().min(1).parse(body.id);
      await env.DB.batch([
        env.DB.prepare("UPDATE partner_api_keys SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(id, TECHFLEX_ORG_ID),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id) VALUES (?,?,?,'partner_api_key.revoked','partner_api_key',?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id),
      ]);
      return Response.json({ status: "revoked" });
    }
    const input = createSchema.parse(body);
    const account = await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND organization_id=? AND status='active'").bind(input.accountId, TECHFLEX_ORG_ID).first();
    if (!account) return Response.json({ error: "Select an active partner account." }, { status: 400 });
    const random = crypto.getRandomValues(new Uint8Array(32));
    const token = `tc_live_${hex(random)}`;
    const id = crypto.randomUUID();
    const keyPrefix = token.slice(0, 16);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO partner_api_keys (id,organization_id,account_id,name,key_prefix,key_hash,scopes_json,expires_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, TECHFLEX_ORG_ID, input.accountId, input.name, keyPrefix, await hash(token), JSON.stringify(["work_orders:create"]), input.expiresOn ? `${input.expiresOn}T23:59:59Z` : null, identity.userId),
      env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'partner_api_key.created','partner_api_key',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify({ accountId: input.accountId, name: input.name, keyPrefix, scopes: ["work_orders:create"] })),
    ]);
    return Response.json({ key: { id, token, keyPrefix, scopes: ["work_orders:create"] }, warning: "Copy this credential now. TechCommand stores only its one-way hash and cannot display it again." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the partner API key settings." }, { status: 400 });
    return apiError(error);
  }
}
