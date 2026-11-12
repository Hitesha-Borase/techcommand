import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError } from "@/lib/portal-auth";

const requestSchema = z.object({
  externalId: z.string().trim().min(1).max(140),
  locationId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  serviceType: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(3).max(500),
  customerComplaint: z.string().trim().max(5000).optional().nullable(),
  authorization: z.number().min(0).max(1000000).optional().nullable(),
  requestedStart: z.string().datetime().optional().nullable(),
  sourceDetailUrl: z.string().url().max(2000).optional().nullable(),
});

function hex(bytes: Uint8Array) { return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function hash(value: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (!token || !idempotencyKey || idempotencyKey.length > 160)
      return Response.json({ error: "Bearer authorization and Idempotency-Key are required." }, { status: 401 });
    const key = await env.DB.prepare(
      `SELECT id,account_id AS accountId,scopes_json AS scopesJson,created_by AS createdBy FROM partner_api_keys
        WHERE organization_id=? AND key_hash=? AND status='active' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,
    ).bind(TECHFLEX_ORG_ID, await hash(token)).first<{ id: string; accountId: string; scopesJson: string; createdBy: string }>();
    if (!key || !(JSON.parse(key.scopesJson) as string[]).includes("work_orders:create"))
      return Response.json({ error: "The partner credential is invalid or expired." }, { status: 401 });
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM partner_api_requests WHERE api_key_id=? AND created_at>=datetime('now','-1 minute')").bind(key.id).first<{ count: number }>();
    if (Number(recent?.count || 0) >= 120)
      return Response.json({ error: "Partner request limit reached. Retry after one minute." }, { status: 429, headers: { "Retry-After": "60" } });
    const previous = await env.DB.prepare("SELECT response_json AS responseJson FROM partner_api_requests WHERE api_key_id=? AND idempotency_key=?").bind(key.id, idempotencyKey).first<{ responseJson: string }>();
    if (previous) return Response.json(JSON.parse(previous.responseJson));
    const input = requestSchema.parse(await request.json());
    const location = await env.DB.prepare("SELECT id FROM locations WHERE id=? AND account_id=? AND status='active'").bind(input.locationId, key.accountId).first();
    if (!location) return Response.json({ error: "The location is outside this partner account." }, { status: 403 });
    if (input.customerId) {
      const customer = await env.DB.prepare("SELECT id FROM customers WHERE id=? AND account_id=? AND location_id=? AND status='active'").bind(input.customerId, key.accountId, input.locationId).first();
      if (!customer) return Response.json({ error: "The customer is outside this partner scope." }, { status: 403 });
    }
    if (input.assetId) {
      const asset = await env.DB.prepare("SELECT id FROM assets WHERE id=? AND account_id=? AND location_id=? AND status!='retired'").bind(input.assetId, key.accountId, input.locationId).first();
      if (!asset) return Response.json({ error: "The asset is outside this partner scope." }, { status: 403 });
    }
    const intakeId = crypto.randomUUID();
    const response = { requestId: intakeId, status: "received", externalId: input.externalId };
    const data = { ...input, accountId: key.accountId, externalSource: "partner_api", noticeType: "new_assignment", scheduledStart: input.requestedStart || null };
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO work_order_intakes (id,organization_id,account_id,location_id,customer_id,asset_id,source,external_id,notice_type,source_detail_url,status,data_json,missing_fields_json,blocking_count,created_by,updated_by)
        VALUES (?,?,?,?,?,?,'partner_api',?, 'new_assignment',?,'needs_review',?,'[]',0,?,?)`).bind(intakeId, TECHFLEX_ORG_ID, key.accountId, input.locationId, input.customerId || null, input.assetId || null, input.externalId, input.sourceDetailUrl || null, JSON.stringify(data), key.createdBy, key.createdBy),
      env.DB.prepare("INSERT INTO partner_api_requests (id,organization_id,account_id,api_key_id,idempotency_key,operation,status,entity_type,entity_id,response_json) VALUES (?,?,?,?,?,'work_orders:create','accepted','work_order_intake',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, key.accountId, key.id, idempotencyKey, intakeId, JSON.stringify(response)),
      env.DB.prepare("UPDATE partner_api_keys SET last_used_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(key.id),
      env.DB.prepare("INSERT INTO integration_events (id,organization_id,integration_key,external_event_id,direction,event_type,entity_type,entity_id,status,payload_json,processed_at) VALUES (?,?,?,?,'inbound','partner.work_order.received','work_order_intake',?,'processed',?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, `partner_api:${key.accountId}`, idempotencyKey, intakeId, JSON.stringify({ externalId: input.externalId, apiKeyId: key.id })),
    ]);
    return Response.json(response, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "The partner work-order payload is invalid.", details: error.flatten() }, { status: 400 });
    return apiError(error);
  }
}
