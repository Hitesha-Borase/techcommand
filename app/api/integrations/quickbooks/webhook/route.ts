import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";

type QuickBooksEntity = {
  name?: string;
  id?: string;
  operation?: string;
  lastUpdated?: string;
};

type QuickBooksWebhook = {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: { entities?: QuickBooksEntity[] };
  }>;
};

function runtime() {
  return env as unknown as {
    DB: D1Database;
    QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN?: string;
  };
}

function base64Bytes(value: string) {
  try {
    const binary = atob(value.trim());
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

async function validSignature(body: string, signature: string, token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return constantTimeEqual(digest, base64Bytes(signature));
}

export async function POST(request: Request) {
  const current = runtime();
  const verifier = current.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  if (!verifier)
    return Response.json(
      { error: "QuickBooks webhook verification is not configured." },
      { status: 503 },
    );
  const rawBody = await request.text();
  const signature = request.headers.get("intuit-signature") || "";
  if (!signature || !(await validSignature(rawBody, signature, verifier)))
    return Response.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );

  let payload: QuickBooksWebhook;
  try {
    payload = JSON.parse(rawBody) as QuickBooksWebhook;
  } catch {
    return Response.json(
      { error: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  const statements: D1PreparedStatement[] = [];
  let accepted = 0;
  for (const notification of payload.eventNotifications || []) {
    const realmId = String(notification.realmId || "");
    for (const entity of notification.dataChangeEvent?.entities || []) {
      const entityName = String(entity.name || "");
      if (!["Invoice", "Payment"].includes(entityName) || !entity.id) continue;
      const externalEventId = [
        realmId,
        entityName,
        entity.id,
        entity.operation || "Update",
        entity.lastUpdated || "unknown",
      ].join(":");
      statements.push(
        current.DB.prepare(
          `INSERT OR IGNORE INTO integration_events
            (id, organization_id, integration_key, external_event_id, direction,
             event_type, entity_type, entity_id, status, payload_json)
           VALUES (?, ?, 'quickbooks', ?, 'inbound', ?, ?, ?, 'pending', ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          externalEventId,
          `${entityName.toLowerCase()}.${String(entity.operation || "update").toLowerCase()}`,
          entityName.toLowerCase(),
          String(entity.id),
          JSON.stringify({ realmId, ...entity }),
        ),
      );
      accepted += 1;
    }
  }
  if (statements.length) await current.DB.batch(statements);
  await current.DB.prepare(
    `INSERT INTO integration_connections
      (id, organization_id, integration_key, provider, display_name, status,
       connection_mode, last_sync_at, config_json)
     VALUES (?, ?, 'quickbooks', 'intuit', 'QuickBooks Online', 'webhook_received',
       'oauth_webhook', CURRENT_TIMESTAMP, ?)
     ON CONFLICT(organization_id, integration_key) DO UPDATE SET
       status = 'webhook_received', last_sync_at = CURRENT_TIMESTAMP,
       config_json = excluded.config_json, record_version = record_version + 1,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      JSON.stringify({
        realmIds: (payload.eventNotifications || [])
          .map((item) => item.realmId)
          .filter(Boolean),
      }),
    )
    .run();
  return Response.json({ accepted });
}
