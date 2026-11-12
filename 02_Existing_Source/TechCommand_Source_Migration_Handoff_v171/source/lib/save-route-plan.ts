import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, type PortalIdentity } from "@/lib/portal-auth";

export const routePlanSchema = z.object({
  action: z.literal("plan"), routeId: z.string().min(1), version: z.number().int().positive(),
  startAddress: z.string().trim().min(1).max(500),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid route start time.").default("08:00"),
  includeReturn: z.boolean(), returnAddress: z.string().trim().max(500),
  returnMinutes: z.number().int().min(0).max(1440).nullable(),
  stops: z.array(z.object({ stopId: z.string().min(1), serviceMinutes: z.number().int().min(1).max(720),
    driveMinutes: z.number().int().min(0).max(1440).nullable() })).min(1).max(75),
});

export async function saveRoutePlan(input: z.infer<typeof routePlanSchema>, identity: PortalIdentity) {
  const route = await env.DB.prepare(`SELECT technician_id AS technicianId, record_version AS version
    FROM routes WHERE id=? AND organization_id=?`).bind(input.routeId, TECHFLEX_ORG_ID)
    .first<{ technicianId: string; version: number }>();
  if (!route || (identity.role === "technician" && route.technicianId !== identity.technicianId))
    return Response.json({ error: "This route is not available to your account." }, { status: 403 });
  if (input.includeReturn && !input.returnAddress)
    return Response.json({ error: "Enter the return destination or turn off the return trip." }, { status: 400 });
  const existing = await env.DB.prepare("SELECT id FROM route_stops WHERE route_id=? ORDER BY stop_order")
    .bind(input.routeId).all<{ id: string }>();
  const ids = input.stops.map(stop => stop.stopId);
  if (route.version !== input.version || new Set(ids).size !== ids.length ||
    ids.length !== existing.results.length || existing.results.some(stop => !ids.includes(stop.id)))
    return Response.json({ error: "Dispatch changed this route. Your draft is still here; refresh and compare before saving." }, { status: 409 });
  const guard = env.DB.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM routes WHERE id=? AND organization_id=? AND technician_id=? AND record_version=?
  ) AND (SELECT json_group_array(id) FROM (SELECT id FROM route_stops WHERE route_id=? ORDER BY stop_order))=?
    THEN 1 ELSE json('route_plan_conflict') END`).bind(input.routeId, TECHFLEX_ORG_ID,
      route.technicianId, input.version, input.routeId, JSON.stringify(existing.results.map(stop => stop.id)));
  const missingDriveEstimate = input.stops.some(stop => stop.driveMinutes === null) ||
    (input.includeReturn && input.returnMinutes === null);
  const totalDriveMinutes = missingDriveEstimate ? null :
    input.stops.reduce((sum, stop) => sum + (stop.driveMinutes ?? 0), 0) +
      (input.includeReturn ? input.returnMinutes ?? 0 : 0);
  const statements = [guard,
    ...ids.map((id, i) => env.DB.prepare("UPDATE route_stops SET stop_order=? WHERE id=? AND route_id=?")
      .bind(-(i + 1), id, input.routeId)),
    ...input.stops.map((stop, i) => env.DB.prepare(`UPDATE route_stops SET stop_order=?, drive_minutes=?,
      leg_miles=NULL, travel_source='manual_estimate', updated_at=CURRENT_TIMESTAMP WHERE id=? AND route_id=?`)
      .bind(i + 1, stop.driveMinutes, stop.stopId, input.routeId)),
    env.DB.prepare(`UPDATE routes SET optimization_provider='manual_sequence', optimization_snapshot_json=?,
      total_miles=NULL, total_drive_minutes=?, record_version=record_version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(JSON.stringify(input), totalDriveMinutes, input.routeId),
    env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
      VALUES (?,?,?,'route.planned','route',?,?)`).bind(crypto.randomUUID(), TECHFLEX_ORG_ID,
        identity.userId, input.routeId, JSON.stringify({ stopIds: ids, estimated: true })),
  ];
  try { await env.DB.batch(statements); }
  catch (error) {
    if (/malformed JSON|route_plan_conflict/i.test(String(error)))
      return Response.json({ error: "The route changed while saving. Refresh and compare; no changes were saved." }, { status: 409 });
    throw error;
  }
  return Response.json({ routeId: input.routeId, version: input.version + 1 });
}
