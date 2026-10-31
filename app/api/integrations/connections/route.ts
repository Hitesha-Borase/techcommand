import { env } from "cloudflare:workers";
import { z } from "zod";
import { googleSheetsStatus } from "@/lib/google-sheets-sync";
import { googleWorkspaceEmailStatus } from "@/lib/google-workspace-email";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const catalog = [
  { key: "google_sheets", provider: "google", name: "Google Sheets Ledger", mode: "service_account", flows: ["Completed orders", "Technician pay", "Mentor earnings", "Financial exports"], buildBlockers: [] },
  { key: "google_workspace_email", provider: "google", name: "Gmail Notifications", mode: "service_account", flows: ["Customer email", "Review request", "Completion notice", "Retry queue"], buildBlockers: [] },
  { key: "google_drive", provider: "google", name: "Google Drive Archive", mode: "service_account", flows: ["Service packets", "Account folders", "Document archive", "Shared files"], buildBlockers: ["Drive filing connector and folder-mapping workflow"] },
  { key: "google_calendar", provider: "google", name: "Google Calendar", mode: "shared_plus_user_oauth", flows: ["TechCommand Dispatch calendar", "Per-user calendar connection", "Administrator scheduling", "Technician self-management", "Two-way event sync"], buildBlockers: ["OAuth callback and two-way event synchronization"] },
  { key: "quickbooks", provider: "intuit", name: "QuickBooks Online", mode: "oauth_webhook", flows: ["Customers", "Invoices", "Payments", "Expenses"], buildBlockers: ["OAuth callback, outbound queue processor, and payment reconciliation test"] },
  { key: "800_sms", provider: "800.com", name: "800.com SMS", mode: "rest_api", flows: ["Completion notice", "Satisfaction survey", "Review request", "Delivery status"], buildBlockers: ["Direct API sender, consent enforcement, and delivery-status handler"] },
  { key: "spinlife_portal", provider: "spinlife", name: "SpinLife FST Portal", mode: "provider_authorized", flows: ["Bid opportunities", "Assignments", "Status updates", "Documents", "Pricing rules"], buildBlockers: ["Provider-approved API, EDI, export, or documented portal access"] },
  { key: "partner_gateway", provider: "techcommand", name: "Partner Gateway", mode: "portal_api_import", flows: ["Work-order intake", "Quote approval", "Status updates", "Documents", "Secure messages"], buildBlockers: [] },
  { key: "maps_routes", provider: "google", name: "Maps and Routes", mode: "maps_api", flows: ["Driving-time estimates", "Optional return travel", "Manual stop order", "Navigation links"], buildBlockers: [] },
  { key: "knowledge_ai", provider: "openai", name: "Governed AI Knowledge", mode: "retrieval", flows: ["Approved manuals", "TechFlex SOPs", "Asset history", "QA-corrected reports"], buildBlockers: [] },
  { key: "monitoring", provider: "posthog", name: "Product Analytics & Monitoring", mode: "privacy_safe_telemetry", flows: ["Privacy-limited workflow usage", "Client and server failures", "Build identification"], buildBlockers: [] },
] as const;

const saveSchema = z.object({
  action: z.literal("save"),
  integrationKey: z.enum(catalog.map((item) => item.key) as [string, ...string[]]),
  enabled: z.boolean(),
  connectionMode: z.string().trim().min(2).max(80),
  ownerRole: z.enum(["owner_administrator", "operations_administrator", "finance"]),
  dataFlows: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  notes: z.string().trim().max(1500),
});
const actionSchema = z.discriminatedUnion("action", [
  saveSchema,
  z.object({ action: z.literal("test"), integrationKey: z.string().min(1) }),
  z.object({ action: z.literal("retry"), integrationKey: z.string().min(1) }),
]);

type Runtime = {
  DB: D1Database;
  QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN?: string;
  QUICKBOOKS_CLIENT_ID?: string;
  QUICKBOOKS_CLIENT_SECRET?: string;
  QUICKBOOKS_REALM_ID?: string;
  EIGHT_HUNDRED_API_TOKEN?: string;
  EIGHT_HUNDRED_FROM_NUMBER?: string;
  GOOGLE_REVIEW_URL?: string;
  GOOGLE_MAPS_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_SHARED_ID?: string;
};

async function readiness(key: string) {
  const current = env as unknown as Runtime;
  if (key === "google_sheets") return { ready: googleSheetsStatus().configured, missing: googleSheetsStatus().missing };
  if (key === "google_workspace_email") return { ready: googleWorkspaceEmailStatus().configured, missing: googleWorkspaceEmailStatus().missing };
  if (key === "google_drive" || key === "spinlife_portal") return { ready: false, missing: [] };
  if (key === "google_calendar") {
    const values = [["GOOGLE_CALENDAR_CLIENT_ID", current.GOOGLE_CALENDAR_CLIENT_ID], ["GOOGLE_CALENDAR_CLIENT_SECRET", current.GOOGLE_CALENDAR_CLIENT_SECRET], ["GOOGLE_CALENDAR_SHARED_ID", current.GOOGLE_CALENDAR_SHARED_ID]];
    const missing = values.filter(([, value]) => !value).map(([name]) => name!);
    return { ready: !missing.length, missing };
  }
  if (key === "quickbooks") {
    const values = [["QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN", current.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN], ["QUICKBOOKS_CLIENT_ID", current.QUICKBOOKS_CLIENT_ID], ["QUICKBOOKS_CLIENT_SECRET", current.QUICKBOOKS_CLIENT_SECRET], ["QUICKBOOKS_REALM_ID", current.QUICKBOOKS_REALM_ID]];
    const missing = values.filter(([, value]) => !value).map(([name]) => name!);
    return { ready: !missing.length, missing };
  }
  if (key === "800_sms") {
    const values = [["EIGHT_HUNDRED_API_TOKEN", current.EIGHT_HUNDRED_API_TOKEN], ["EIGHT_HUNDRED_FROM_NUMBER", current.EIGHT_HUNDRED_FROM_NUMBER], ["GOOGLE_REVIEW_URL", current.GOOGLE_REVIEW_URL]];
    const missing = values.filter(([, value]) => !value).map(([name]) => name!);
    return { ready: !missing.length, missing };
  }
  if (key === "maps_routes") return { ready: Boolean(current.GOOGLE_MAPS_API_KEY), missing: current.GOOGLE_MAPS_API_KEY ? [] : ["GOOGLE_MAPS_API_KEY"] };
  if (key === "knowledge_ai") {
    const missing = [["OPENAI_API_KEY", current.OPENAI_API_KEY]].filter(([, value]) => !value).map(([name]) => name!);
    return { ready: !missing.length, missing };
  }
  if (key === "monitoring") return { ready: Boolean(current.POSTHOG_PROJECT_TOKEN), missing: current.POSTHOG_PROJECT_TOKEN ? [] : ["POSTHOG_PROJECT_TOKEN"] };
  if (key === "partner_gateway") {
    const result = await current.DB.batch([
      current.DB.prepare("SELECT COUNT(*) AS count FROM partner_api_keys WHERE organization_id=? AND status='active'").bind(TECHFLEX_ORG_ID),
      current.DB.prepare("SELECT COUNT(*) AS count FROM partner_launches WHERE organization_id=? AND status='active'").bind(TECHFLEX_ORG_ID),
    ]);
    const apiKeys = Number((result[0].results[0] as { count?: number } | undefined)?.count || 0);
    const launches = Number((result[1].results[0] as { count?: number } | undefined)?.count || 0);
    return { ready: apiKeys + launches > 0, missing: apiKeys + launches > 0 ? [] : ["Active partner configuration or API credential"] };
  }
  return { ready: false, missing: ["Connection configuration"] };
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const current = env as unknown as Runtime;
    const [connections, queues, completed] = await current.DB.batch([
      current.DB.prepare(`SELECT integration_key AS integrationKey,provider,display_name AS displayName,status,connection_mode AS connectionMode,config_json AS configJson,last_sync_at AS lastSyncAt,last_success_at AS lastSuccessAt,last_error AS lastError,updated_at AS updatedAt FROM integration_connections WHERE organization_id=?`).bind(TECHFLEX_ORG_ID),
      current.DB.prepare(`SELECT integration_key AS integrationKey,status,COUNT(*) AS count FROM integration_events WHERE organization_id=? AND status IN ('pending','retry','processing','failed') GROUP BY integration_key,status`).bind(TECHFLEX_ORG_ID),
      current.DB.prepare(`SELECT integration_key AS integrationKey,COUNT(*) AS count,MAX(processed_at) AS lastProcessedAt FROM integration_events WHERE organization_id=? AND status='processed' GROUP BY integration_key`).bind(TECHFLEX_ORG_ID),
    ]);
    const saved = new Map(connections.results.map((row) => [String((row as Record<string, unknown>).integrationKey), row as Record<string, unknown>]));
    const queueRows = queues.results as Array<Record<string, unknown>>;
    const completedRows = completed.results as Array<Record<string, unknown>>;
    const items = await Promise.all(catalog.map(async (item) => {
      const row = saved.get(item.key);
      const prerequisiteCheck = await readiness(item.key);
      const check = { ready: prerequisiteCheck.ready && item.buildBlockers.length === 0, missing: [...prerequisiteCheck.missing, ...item.buildBlockers] };
      const config = row?.configJson ? JSON.parse(String(row.configJson)) as Record<string, unknown> : {};
      const matchingCompleted = completedRows.filter((event) =>
        item.key === "partner_gateway"
          ? String(event.integrationKey || "").startsWith("partner_api:")
          : event.integrationKey === item.key,
      );
      const transactionCount = matchingCompleted.reduce((sum, event) => sum + Number(event.count || 0), 0);
      const recordedTransaction = transactionCount > 0 || row?.status === "webhook_received" || row?.status === "transaction_verified";
      const effectiveStatus = row?.status === "verified" && !recordedTransaction
        ? "credentials_ready"
        : row?.status || "not_connected";
      return {
        integrationKey: item.key, provider: item.provider, displayName: item.name,
        recommendedMode: item.mode, availableFlows: item.flows,
        status: effectiveStatus, connectionMode: row?.connectionMode || item.mode,
        configured: Boolean(row), runtimeReady: check.ready, missing: check.missing,
        transactionVerified: recordedTransaction, transactionCount,
        ownerRole: config.ownerRole || "operations_administrator", dataFlows: config.dataFlows || item.flows,
        notes: config.notes || "", enabled: config.enabled !== false,
        lastSyncAt: row?.lastSyncAt || null, lastSuccessAt: row?.lastSuccessAt || null,
        lastError: row?.lastError || null,
        retryable: item.key === "maps_routes" ? 0 : queueRows.filter((queue) => (queue.integrationKey === item.key || item.key === "partner_gateway" && String(queue.integrationKey).startsWith("partner_api:")) && ["failed","retry"].includes(String(queue.status))).reduce((sum, queue) => sum + Number(queue.count || 0), 0),
        queue: queueRows.filter((queue) => queue.integrationKey === item.key || item.key === "partner_gateway" && String(queue.integrationKey).startsWith("partner_api:")).reduce((sum, queue) => sum + Number(queue.count || 0), 0),
      };
    }));
    return Response.json({ connections: items, viewerRole:identity.role },{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const input = actionSchema.parse(await request.json());
    const current = env as unknown as Runtime;
    const item = catalog.find((candidate) => candidate.key === input.integrationKey);
    if (!item) return Response.json({ error: "Unknown integration." }, { status: 404 });
    if (input.action === "save") {
      const config = { enabled: input.enabled, ownerRole: input.ownerRole, dataFlows: input.dataFlows, notes: input.notes };
      const status = input.enabled ? "setup_documented" : "paused";
      await current.DB.batch([
        current.DB.prepare(`INSERT INTO integration_connections (id,organization_id,integration_key,provider,display_name,status,connection_mode,config_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,integration_key) DO UPDATE SET provider=excluded.provider,display_name=excluded.display_name,status=CASE WHEN integration_connections.status IN ('verified','webhook_received') AND ?=1 THEN integration_connections.status ELSE excluded.status END,connection_mode=excluded.connection_mode,config_json=excluded.config_json,record_version=integration_connections.record_version+1,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, item.key, item.provider, item.name, status, input.connectionMode, JSON.stringify(config), input.enabled ? 1 : 0),
        current.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'integration.configuration_saved','integration_connection',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, item.key, JSON.stringify(config)),
      ]);
      return Response.json({ status });
    }
    if (input.action === "retry") {
      if (item.key === "maps_routes") return Response.json({ error: "Request fresh driving estimates from the technician's route planner. Google route requests are never replayed in the background." }, { status: 400 });
      const result = await current.DB.prepare("UPDATE integration_events SET status='pending',attempt_count=attempt_count+1,next_attempt_at=CURRENT_TIMESTAMP,error_message=NULL WHERE organization_id=? AND (integration_key=? OR (?='partner_gateway' AND integration_key GLOB 'partner_api:*')) AND status IN ('failed','retry')").bind(TECHFLEX_ORG_ID, item.key, item.key).run();
      await current.DB.prepare("UPDATE integration_connections SET last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND integration_key=?").bind(TECHFLEX_ORG_ID, item.key).run();
      return Response.json({ retried: result.meta.changes || 0 });
    }
    const prerequisiteCheck = await readiness(item.key);
    const check = { ready: prerequisiteCheck.ready && item.buildBlockers.length === 0, missing: [...prerequisiteCheck.missing, ...item.buildBlockers] };
    await current.DB.prepare(`INSERT INTO integration_connections (id,organization_id,integration_key,provider,display_name,status,connection_mode,last_success_at,last_error) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,integration_key) DO UPDATE SET status=CASE WHEN json_extract(integration_connections.config_json,'$.enabled')=0 THEN 'paused' ELSE excluded.status END,last_error=excluded.last_error,record_version=integration_connections.record_version+1,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, item.key, item.provider, item.name, check.ready ? "credentials_ready" : "attention_needed", item.mode, null, check.ready ? null : `Missing: ${check.missing.join(", ")}`).run();
    return Response.json({ passed: check.ready, transactionVerified: false, missing: check.missing, message: check.ready ? "Required credentials are present. Complete one real transaction before calling this connection verified." : "Connection is not ready yet." });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the integration settings." }, { status: 400 });
    return apiError(error);
  }
}
