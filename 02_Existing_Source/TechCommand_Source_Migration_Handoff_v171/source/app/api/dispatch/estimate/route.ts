import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, PortalHttpError, requirePortalRole, type PortalIdentity } from "@/lib/portal-auth";
import { googleEstimateRequestSchema, googleRouteChunks, type GoogleEstimateRequest } from "@/lib/google-route-estimate";
import { computeGoogleDriveTimes, RouteEstimateError } from "@/lib/google-routes-client";
import { createErrorReference, safeServerLog } from "@/lib/server-observability";

const roles = ["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead", "technician"] as const;
const runtime = env as typeof env & { GOOGLE_MAPS_API_KEY?: string; GOOGLE_ROUTES_DAILY_REQUEST_LIMIT?: string };
const noStore = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache" };
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: noStore }); }
function dailyLimit() {
  const value = Number(runtime.GOOGLE_ROUTES_DAILY_REQUEST_LIMIT || 100);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 100;
}
async function connectionPaused() {
  const row = await env.DB.prepare("SELECT status,config_json AS configJson FROM integration_connections WHERE organization_id=? AND integration_key='maps_routes'")
    .bind(TECHFLEX_ORG_ID).first<{ status: string; configJson: string | null }>();
  if (!row) return false;
  if (row.status === "paused") return true;
  try { return row.configJson ? JSON.parse(row.configJson).enabled === false : false; }
  catch { return true; }
}
function failure(error: unknown) {
  if (error instanceof PortalHttpError) return json({ error: error.message }, error.status);
  if (error instanceof RouteEstimateError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return json({ error: "Review the route, addresses and stop order before requesting estimates." }, 400);
  const reference = createErrorReference();
  safeServerLog("route_estimate", error, reference);
  return Response.json(
    { error: "Driving estimates could not be completed. Your plan is unchanged. Try again later.", reference },
    { status: 500, headers: { ...noStore, "X-TechCommand-Error-Reference": reference } },
  );
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...roles]);
    const paused = await connectionPaused();
    return json({ configured: Boolean(runtime.GOOGLE_MAPS_API_KEY?.trim()) && !paused, paused, mode: "standard_no_traffic", dailyRequestLimit: dailyLimit() });
  } catch (error) { return failure(error); }
}

type RouteIdentity = { technicianId: string; version: number };
type StopAddress = { id: string; workOrderId: string | null; workOrganization: string | null;
  locationAccount: string | null; accountId: string | null; accountOrganization: string | null;
  assigned: number; address1: string | null; address2: string | null; city: string | null; state: string | null; postalCode: string | null };

async function authorizedAddresses(input: GoogleEstimateRequest, identity: PortalIdentity) {
  const route = await env.DB.prepare(`SELECT r.technician_id AS technicianId, r.record_version AS version
    FROM routes r JOIN technicians t ON t.id=r.technician_id AND t.organization_id=r.organization_id
    WHERE r.id=? AND r.organization_id=? AND t.status='active'
      AND (?=0 OR (t.id=? AND t.user_id=?))`).bind(input.routeId, TECHFLEX_ORG_ID,
    identity.role === "technician" ? 1 : 0, identity.technicianId, identity.userId).first<RouteIdentity>();
  if (!route) throw new RouteEstimateError(403, "route_unavailable", "This route is not available to your account.");
  if (route.version !== input.version) throw new RouteEstimateError(409, "route_changed", "Dispatch changed this route. Refresh and compare before calculating driving estimates.");
  const rows = await env.DB.prepare(`SELECT rs.id, w.id AS workOrderId, w.organization_id AS workOrganization,
    w.account_id AS accountId, l.account_id AS locationAccount, a.organization_id AS accountOrganization,
    l.address_1 AS address1, l.address_2 AS address2, l.city, l.state, l.postal_code AS postalCode,
    EXISTS(SELECT 1 FROM work_order_assignments wa WHERE wa.work_order_id=w.id AND wa.technician_id=?
      AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')) AS assigned
    FROM route_stops rs LEFT JOIN work_orders w ON w.id=rs.work_order_id
    LEFT JOIN accounts a ON a.id=w.account_id LEFT JOIN locations l ON l.id=w.location_id
    WHERE rs.route_id=? ORDER BY rs.stop_order`).bind(route.technicianId, input.routeId).all<StopAddress>();
  if (rows.results.length !== input.stops.length)
    throw new RouteEstimateError(409, "route_changed", "The route's stops changed. Refresh the route before calculating.");
  const addresses = input.stops.map(stop => {
    const row = rows.results.find(item => item.id === stop.stopId);
    if (!row || !row.workOrderId || !row.assigned || row.workOrganization !== TECHFLEX_ORG_ID ||
      row.accountOrganization !== TECHFLEX_ORG_ID || row.accountId !== row.locationAccount)
      throw new RouteEstimateError(403, "stop_unavailable", "A stop is no longer available on this assigned route. Ask dispatch to review it.");
    if (!row.address1?.trim() || !row.city?.trim() || !row.state?.trim())
      throw new RouteEstimateError(400, "address_missing", "A stop is missing its street, city or state. Ask dispatch to complete the service address.");
    const address = [row.address1, row.address2, row.city, row.state, row.postalCode]
      .filter(value => typeof value === "string" && value.trim()).join(", ").trim();
    if (address !== stop.address)
      throw new RouteEstimateError(409, "address_changed", "A service address changed. Refresh the route before calculating driving estimates.");
    return address;
  });
  return [input.startAddress, ...addresses, ...(input.includeReturn ? [input.returnAddress] : [])];
}

export async function POST(request: Request) {
  let usageId: string | undefined;
  try {
    const identity = await requirePortalRole(request, [...roles]);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Request estimates from your TechCommand route planner." }, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Use a JSON route request." }, 415);
    const text = await request.text();
    if (text.length > 64_000) return json({ error: "This route request is too large." }, 413);
    const input = googleEstimateRequestSchema.parse(JSON.parse(text));
    const addresses = await authorizedAddresses(input, identity);
    if (await connectionPaused()) throw new RouteEstimateError(503, "connection_paused", "Your administrator has paused Google driving estimates. Manual planning remains available.");
    const key = runtime.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) throw new RouteEstimateError(503, "not_connected", "Google Routes is not connected yet. Your administrator must add its API key securely. Manual planning remains available.");
    const requests = googleRouteChunks(addresses).length;
    usageId = crypto.randomUUID();
    // A single conditional insert reserves the entire possible cost before any request.
    // Count failures too; never retry or silently create a paid background job.
    const reserved = await env.DB.prepare(`INSERT INTO integration_events
      (id,organization_id,integration_key,direction,event_type,entity_type,entity_id,status,attempt_count,payload_json)
      SELECT ?,?,'maps_routes','outbound','route.drive_estimate','route',?,'reserved',?,'{"mode":"standard_no_traffic"}'
      WHERE (SELECT COALESCE(SUM(attempt_count),0) FROM integration_events
        WHERE integration_key='maps_routes' AND organization_id=? AND event_type='route.drive_estimate' AND created_at>=date('now')) + ? <= ?
        AND NOT EXISTS(SELECT 1 FROM integration_events WHERE integration_key='maps_routes' AND organization_id=?
          AND entity_id=? AND event_type='route.drive_estimate' AND created_at>=datetime('now','-60 seconds'))`)
      .bind(usageId, TECHFLEX_ORG_ID, input.routeId, requests, TECHFLEX_ORG_ID, requests, dailyLimit(), TECHFLEX_ORG_ID, input.routeId).run();
    if (reserved.meta.changes !== 1) {
      usageId = undefined;
      throw new RouteEstimateError(429, "usage_limit", "Wait at least one minute between estimates for this route. If the company daily limit is reached, use manual estimates or contact your administrator.");
    }
    const result = await computeGoogleDriveTimes(addresses, key);
    // Recheck authorization, version and addresses after the network request.
    const currentIdentity = await requirePortalRole(request, [...roles]);
    await authorizedAddresses(input, currentIdentity);
    if (await connectionPaused()) throw new RouteEstimateError(503, "connection_paused", "Google driving estimates were paused while this request was running. Your manual plan is unchanged.");
    await env.DB.prepare("UPDATE integration_events SET status='processed',processed_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?")
      .bind(usageId, TECHFLEX_ORG_ID).run();
    return json({ provider: "google_maps", mode: "standard_no_traffic", estimatedAt: new Date().toISOString(), version: input.version,
      stops: input.stops.map((stop, index) => ({ stopId: stop.stopId, driveMinutes: result.minutes[index] })),
      returnMinutes: input.includeReturn ? result.minutes.at(-1) : null, warnings: result.warnings });
  } catch (error) {
    if (usageId) {
      try {
        await env.DB.prepare("UPDATE integration_events SET status='failed',error_message=?,processed_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?")
          .bind(error instanceof RouteEstimateError ? error.code : "internal_error", usageId, TECHFLEX_ORG_ID).run();
      } catch { /* Reserved usage remains counted even if status recovery fails. */ }
    }
    return failure(error);
  }
}
