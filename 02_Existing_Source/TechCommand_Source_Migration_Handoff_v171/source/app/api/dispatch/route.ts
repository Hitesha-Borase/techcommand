import { trainingAssignmentError, trainingRemovalError } from "@/lib/training-dispatch";
import { releasePendingSubmissionReviews } from "@/lib/submission-inbox";
import { routePlanSchema, saveRoutePlan } from "@/lib/save-route-plan";
import { canEditDispatchPlan, canRecordDispatchProgress, dispatchPlanLockedMessage, dispatchProgressLockedMessage } from "@/lib/dispatch-policy";
import { parseDisciplines, jobDiscipline } from "@/lib/service-disciplines";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";

const adminRoles = [
  "owner_administrator",
  "operations_administrator",
  "dispatcher",
  "biomedical_lead",
] as const;

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD service date.");

const actionSchema = z.discriminatedUnion("action", [
  routePlanSchema,
  z.object({
    action: z.literal("schedule"),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1),
    assignmentRole: z.enum(["primary", "support"]).default("primary"),
    routeDate: dateField,
    scheduledStart: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(720).default(60),
    legMiles: z.number().min(0).max(2500).optional().nullable(),
    driveMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  }),
  z.object({
    action: z.literal("unschedule"),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1),
  }),
  z.object({
    action: z.literal("reorder"),
    routeId: z.string().min(1),
    orderedStopIds: z.array(z.string().min(1)).min(1).max(75),
  }),
  z.object({
    action: z.literal("progress"),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1).optional(),
    state: z.enum(["en_route", "arrived", "service_in_progress"]),
  }),
]);

type RouteRow = {
  id: string;
  technicianId: string;
  routeDate: string;
  status: string;
  startLocationJson: string;
  totalMiles: number | null;
  totalDriveMinutes: number | null;
  optimizedAt: string | null;
  technicianName: string;
  technicianCode: string;
  version: number;
  planningJson: string | null;
};

// These fields are selected by scheduledSql; keep their types through address enrichment.
type ScheduledRow = Record<string, unknown> & {
  routeId: string | null;
  latitude: number | null;
  longitude: number | null;
  legMiles: number | null;
  driveMinutes: number | null;
};

function defaultDate() {
  return new Date().toISOString().slice(0, 10);
}

function haversineMiles(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const deltaLat = radians(Number(lat2) - Number(lat1));
  const deltaLon = radians(Number(lon2) - Number(lon1));
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(Number(lat1))) *
      Math.cos(radians(Number(lat2))) *
      Math.sin(deltaLon / 2) ** 2;
  return (
    Math.round(
      earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10,
    ) / 10
  );
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function fullAddress(row: Record<string, unknown>) {
  return [row.address1, row.address2, row.city, row.state, row.postalCode]
    .filter((value) => typeof value === "string" && value.trim())
    .join(", ");
}

async function loadDispatch(date: string, identity: PortalIdentity) {
  const technicianOnly = identity.role === "technician";
  const technicianId = technicianOnly ? identity.technicianId : null;
  if (technicianOnly && !technicianId)
    throw new Error("This login is not linked to a technician profile.");

  const technicianSql = `SELECT t.service_disciplines_json AS serviceDisciplinesJson, t.id, t.technician_code AS technicianCode, t.status, t.phone,
          t.home_postal_code AS homePostalCode, t.home_latitude AS homeLatitude,
          t.home_longitude AS homeLongitude, t.max_radius_miles AS maxRadiusMiles,
          t.dispatch_address_1 AS dispatchAddress1,t.dispatch_address_2 AS dispatchAddress2,
          t.dispatch_city AS dispatchCity,t.dispatch_state AS dispatchState,
          t.dispatch_postal_code AS dispatchPostalCode,t.dispatch_latitude AS dispatchLatitude,
          t.dispatch_longitude AS dispatchLongitude,
          COALESCE(u.display_name, t.technician_code) AS name
     FROM technicians t LEFT JOIN users u ON u.id = t.user_id
    WHERE t.organization_id = ? AND t.status = 'active' ${technicianOnly ? "AND t.id = ?" : ""}
    ORDER BY COALESCE(u.display_name, t.technician_code)`;
  const availableSql = `SELECT w.id, w.external_id AS externalId, w.external_source AS externalSource,
          w.service_type AS serviceType, w.summary, w.priority, w.status,
          w.required_technician_count AS requiredTechnicianCount,
          w.gross_margin_basis_points AS grossMarginBasisPoints,
          w.scheduled_start AS scheduledStart, a.name AS accountName,
          l.id AS locationId, l.name AS locationName, l.address_1 AS address1,
          l.address_2 AS address2, l.city, l.state, l.postal_code AS postalCode,
          l.latitude, l.longitude,
          (SELECT COUNT(*) FROM work_order_assignments wa
            WHERE wa.work_order_id = w.id AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')) AS assignedCount
     FROM work_orders w JOIN accounts a ON a.id = w.account_id JOIN locations l ON l.id = w.location_id
    WHERE w.organization_id = ? AND w.status IN ('ready_to_assign','assigned')
      AND (w.scheduled_start IS NULL OR
        (SELECT COUNT(*) FROM work_order_assignments wa
          WHERE wa.work_order_id = w.id AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')) < w.required_technician_count)
    ORDER BY CASE w.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, w.created_at`;
  const includeUnscheduledAssignments = technicianOnly && date === defaultDate();
  const scheduledSql = `SELECT w.id, w.external_id AS externalId, w.external_source AS externalSource,
          w.service_type AS serviceType, w.summary, w.priority, w.status,
          w.required_technician_count AS requiredTechnicianCount,
          w.scheduled_start AS scheduledStart, w.scheduled_end AS scheduledEnd,
          a.name AS accountName, l.id AS locationId, l.name AS locationName,
          l.address_1 AS address1, l.address_2 AS address2, l.city, l.state,
          l.postal_code AS postalCode, l.latitude, l.longitude,
          wa.id AS assignmentId, wa.technician_id AS technicianId, wa.role AS assignmentRole,
          wa.status AS assignmentStatus, COALESCE(u.display_name, t.technician_code) AS technicianName,
          t.technician_code AS technicianCode, r.id AS routeId, r.status AS routeStatus,
          rs.id AS stopId, rs.stop_order AS stopOrder, rs.planned_arrival AS plannedArrival,
          rs.planned_departure AS plannedDeparture, rs.leg_miles AS legMiles,
          rs.drive_minutes AS driveMinutes, rs.travel_source AS travelSource,
          rs.status AS stopStatus
     FROM work_order_assignments wa JOIN work_orders w ON w.id = wa.work_order_id
     JOIN accounts a ON a.id = w.account_id JOIN locations l ON l.id = w.location_id
     JOIN technicians t ON t.id = wa.technician_id LEFT JOIN users u ON u.id = t.user_id
     LEFT JOIN routes r ON r.technician_id = wa.technician_id AND r.route_date = ?
     LEFT JOIN route_stops rs ON rs.route_id = r.id AND rs.work_order_id = w.id
    WHERE w.organization_id = ?
      AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')
      AND (rs.id IS NOT NULL OR substr(w.scheduled_start, 1, 10) = ?${includeUnscheduledAssignments ? " OR w.scheduled_start IS NULL" : ""})
      ${technicianOnly ? "AND wa.technician_id = ?" : ""}
    ORDER BY COALESCE(u.display_name, t.technician_code), COALESCE(rs.stop_order, 999), w.scheduled_start`;
  const routeSql = `SELECT r.id, r.technician_id AS technicianId, r.route_date AS routeDate,
          r.status, r.start_location_json AS startLocationJson, r.total_miles AS totalMiles,
          r.total_drive_minutes AS totalDriveMinutes, r.optimized_at AS optimizedAt,
          r.record_version AS version, r.optimization_snapshot_json AS planningJson,
          COALESCE(u.display_name, t.technician_code) AS technicianName,
          t.technician_code AS technicianCode
     FROM routes r JOIN technicians t ON t.id = r.technician_id LEFT JOIN users u ON u.id = t.user_id
    WHERE r.organization_id = ? AND r.route_date = ? ${technicianOnly ? "AND r.technician_id = ?" : ""}
    ORDER BY COALESCE(u.display_name, t.technician_code)`;

  const [techniciansResult, availableResult, scheduledResult, routesResult] =
    await env.DB.batch([
      technicianOnly
        ? env.DB.prepare(technicianSql).bind(TECHFLEX_ORG_ID, technicianId)
        : env.DB.prepare(technicianSql).bind(TECHFLEX_ORG_ID),
      technicianOnly
        ? env.DB.prepare(`${availableSql} LIMIT 0`).bind(TECHFLEX_ORG_ID)
        : env.DB.prepare(availableSql).bind(TECHFLEX_ORG_ID),
      technicianOnly
        ? env.DB.prepare(scheduledSql).bind(
            date,
            TECHFLEX_ORG_ID,
            date,
            technicianId,
          )
        : env.DB.prepare(scheduledSql).bind(date, TECHFLEX_ORG_ID, date),
      technicianOnly
        ? env.DB.prepare(routeSql).bind(TECHFLEX_ORG_ID, date, technicianId)
        : env.DB.prepare(routeSql).bind(TECHFLEX_ORG_ID, date),
    ]);

  const technicians = techniciansResult.results as Array<
    Record<string, unknown>
  >;
  const available = (
    availableResult.results as Array<Record<string, unknown>>
  ).map((row) => {
    const nearest = technicians
      .map((technician) => ({
        technicianId: String(technician.id),
        technicianName: String(technician.name),
        miles: haversineMiles(
          technician.homeLatitude as number | null,
          technician.homeLongitude as number | null,
          row.latitude as number | null,
          row.longitude as number | null,
        ),
      }))
      .filter((item) => item.miles !== null)
      .sort((a, b) => Number(a.miles) - Number(b.miles))[0];
    return {
      ...row,
      address: fullAddress(row),
      nearestTechnician: nearest || null,
    };
  });
  const scheduled = (
    scheduledResult.results as ScheduledRow[]
  ).map((row) => ({ ...row, address: fullAddress(row) }));
  const routes = (routesResult.results as RouteRow[]).map((route) => {
    const stops = scheduled.filter((stop) => stop.routeId === route.id);
    const start = safeJson<Record<string, number | string | null>>(
      route.startLocationJson,
      {},
    );
    const planning = safeJson<{ startAddress?: string } | null>(route.planningJson, null);
    if (planning?.startAddress && planning.startAddress !== start.address) {
      start.address = planning.startAddress;
      start.latitude = null;
      start.longitude = null;
    }
    let previousLat =
      typeof start.latitude === "number" ? start.latitude : null;
    let previousLon =
      typeof start.longitude === "number" ? start.longitude : null;
    const enrichedStops = stops.map((stop) => {
      const approximateLegMiles =
        stop.legMiles === null
          ? haversineMiles(
              previousLat,
              previousLon,
              stop.latitude,
              stop.longitude,
            )
          : null;
      previousLat = stop.latitude;
      previousLon = stop.longitude;
      return { ...stop, approximateLegMiles };
    });
    return {
      ...route,
      startLocation: start,
      planning: safeJson(route.planningJson, null),
      stops: enrichedStops,
      missingTravelCount: enrichedStops.filter(
        (stop) => stop.legMiles === null || stop.driveMinutes === null,
      ).length,
    };
  });

  return {
    date,
    role: identity.role,
    technicianId,
    technicians,
    available,
    scheduled,
    routes,
  };
}

function routeTotalStatements(routeIds: string[]) {
  const unique = [...new Set(routeIds.filter(Boolean))];
  return unique.map((routeId) =>
      env.DB.prepare(
        `UPDATE routes SET
           total_miles = (SELECT CASE WHEN COUNT(*) = 0 OR SUM(CASE WHEN leg_miles IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE ROUND(SUM(leg_miles), 1) END FROM route_stops WHERE route_id = ?),
           total_drive_minutes = (SELECT CASE WHEN COUNT(*) = 0 OR SUM(CASE WHEN drive_minutes IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE SUM(drive_minutes) END FROM route_stops WHERE route_id = ?),
           optimization_snapshot_json = CASE WHEN optimization_snapshot_json IS NOT NULL THEN json_set(optimization_snapshot_json, '$.returnMinutes', NULL) ELSE NULL END,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(routeId, routeId, routeId),
  );
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      ...adminRoles,
      "technician",
    ]);
    await releasePendingSubmissionReviews();
    const date = new URL(request.url).searchParams.get("date") || defaultDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return Response.json(
        { error: "Use a valid service date." },
        { status: 400 },
      );
    return Response.json(await loadDispatch(date, identity));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      ...adminRoles,
      "technician",
    ]);
    const input = actionSchema.parse(await request.json());
    if (input.action === "plan") return await saveRoutePlan(input, identity);

    if (input.action === "progress") {
      const scopedTechnicianId =
        identity.role === "technician"
          ? identity.technicianId
          : input.technicianId || null;
      if (identity.role === "technician" && !scopedTechnicianId)
        return Response.json(
          { error: "This login is not linked to a technician profile." },
          { status: 403 },
        );
      const assignment = await env.DB.prepare(
        `SELECT wa.id, wa.technician_id AS technicianId, wa.status AS assignmentStatus,
                w.status AS workStatus
           FROM work_order_assignments wa JOIN work_orders w ON w.id = wa.work_order_id
          WHERE wa.work_order_id = ? AND w.organization_id = ?
            AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')
            AND (? IS NULL OR wa.technician_id = ?)
          LIMIT 1`,
      )
        .bind(
          input.workOrderId,
          TECHFLEX_ORG_ID,
          scopedTechnicianId,
          scopedTechnicianId,
        )
        .first<{ id: string; technicianId: string; assignmentStatus: string; workStatus: string }>();
      if (!assignment)
        return Response.json(
          { error: "This work order is not assigned to this technician." },
          { status: 403 },
        );
      if (!canRecordDispatchProgress(assignment.workStatus))
        return Response.json({ error: dispatchProgressLockedMessage }, { status: 409 });
      const assignmentStatus =
        input.state === "en_route"
          ? "dispatched"
          : input.state === "arrived"
            ? "arrived"
            : assignment.assignmentStatus;
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE work_order_assignments SET status = ?,
             dispatched_at = CASE WHEN ? = 'en_route' THEN COALESCE(dispatched_at, CURRENT_TIMESTAMP) ELSE dispatched_at END,
             arrived_at = CASE WHEN ? = 'arrived' THEN COALESCE(arrived_at, CURRENT_TIMESTAMP) ELSE arrived_at END,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(assignmentStatus, input.state, input.state, assignment.id),
        env.DB.prepare(
          `UPDATE work_orders SET status = CASE WHEN ? = 'service_in_progress' THEN 'in_progress' ELSE status END,
             record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND organization_id = ?`,
        ).bind(input.state, input.workOrderId, TECHFLEX_ORG_ID),
        env.DB.prepare(
          `UPDATE route_stops SET status = ?, actual_arrival = CASE WHEN ? = 'arrived' THEN COALESCE(actual_arrival, CURRENT_TIMESTAMP) ELSE actual_arrival END,
             updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ? AND route_id IN (SELECT id FROM routes WHERE technician_id = ?)`,
        ).bind(
          input.state,
          input.state,
          input.workOrderId,
          assignment.technicianId,
        ),
        env.DB.prepare(
          `INSERT INTO work_order_events (id, work_order_id, event_type, actor_user_id, source, payload_json)
           VALUES (?, ?, ?, ?, 'portal', ?)`,
        ).bind(
          crypto.randomUUID(),
          input.workOrderId,
          `dispatch.${input.state}`,
          identity.userId,
          JSON.stringify({ technicianId: assignment.technicianId }),
        ),
      ]);
      return Response.json({
        workOrderId: input.workOrderId,
        state: input.state,
      });
    }

    if (!adminRoles.includes(identity.role as (typeof adminRoles)[number]))
      return Response.json(
        { error: "Only dispatch administrators can change route plans." },
        { status: 403 },
      );

    if (input.action === "reorder") {
      const route = await env.DB.prepare(
        "SELECT id FROM routes WHERE id = ? AND organization_id = ?",
      )
        .bind(input.routeId, TECHFLEX_ORG_ID)
        .first();
      if (!route)
        return Response.json({ error: "Route not found." }, { status: 404 });
      const existing = await env.DB.prepare(
        "SELECT id FROM route_stops WHERE route_id = ? ORDER BY stop_order",
      )
        .bind(input.routeId)
        .all<{ id: string }>();
      const expected = existing.results.map((row) => row.id).sort();
      const received = [...new Set(input.orderedStopIds)].sort();
      if (
        expected.length !== received.length ||
        expected.some((id, index) => id !== received[index])
      )
        return Response.json(
          { error: "Refresh the route before changing its stop order." },
          { status: 409 },
        );
      const negative = input.orderedStopIds.map((id, index) =>
        env.DB.prepare(
          "UPDATE route_stops SET stop_order = ?, leg_miles = NULL, drive_minutes = NULL, travel_source = 'missing', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND route_id = ?",
        ).bind(-(index + 1), id, input.routeId),
      );
      const positive = input.orderedStopIds.map((id, index) =>
        env.DB.prepare(
          "UPDATE route_stops SET stop_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND route_id = ?",
        ).bind(index + 1, id, input.routeId),
      );
      await env.DB.batch([
        ...negative,
        ...positive,
        env.DB.prepare(
          "UPDATE routes SET status = 'planned', total_miles = NULL, total_drive_minutes = NULL, optimization_snapshot_json = CASE WHEN optimization_snapshot_json IS NOT NULL THEN json_set(optimization_snapshot_json, '$.returnMinutes', NULL) ELSE NULL END, optimization_provider = 'manual_sequence', optimized_at = CURRENT_TIMESTAMP, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(input.routeId),
        env.DB.prepare(
          `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'route.reordered', 'route', ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          identity.userId,
          input.routeId,
          JSON.stringify({ orderedStopIds: input.orderedStopIds }),
        ),
      ]);
      return Response.json({ routeId: input.routeId, status: "planned" });
    }

    if (input.action === "unschedule") {
      const trainingError = await trainingRemovalError(input.technicianId, input.workOrderId);
      if (trainingError) return Response.json({error:trainingError},{status:409});
      const assignment = await env.DB.prepare(
        `SELECT wa.id, wa.status AS assignmentStatus, w.status AS workStatus FROM work_order_assignments wa JOIN work_orders w ON w.id = wa.work_order_id
          WHERE wa.work_order_id = ? AND wa.technician_id = ? AND w.organization_id = ? LIMIT 1`,
      )
        .bind(input.workOrderId, input.technicianId, TECHFLEX_ORG_ID)
        .first<{ id: string; assignmentStatus: string; workStatus: string }>();
      if (!assignment)
        return Response.json(
          { error: "Assignment not found." },
          { status: 404 },
        );
      if (!canEditDispatchPlan(assignment.workStatus, assignment.assignmentStatus))
        return Response.json({ error: dispatchPlanLockedMessage }, { status: 409 });
      const routeRows = await env.DB.prepare(
        `SELECT DISTINCT r.id FROM routes r JOIN route_stops rs ON rs.route_id = r.id
          WHERE r.technician_id = ? AND rs.work_order_id = ?`,
      )
        .bind(input.technicianId, input.workOrderId)
        .all<{ id: string }>();
      await env.DB.batch([
        env.DB.prepare(
          `DELETE FROM route_stops WHERE work_order_id = ? AND route_id IN
            (SELECT id FROM routes WHERE technician_id = ?)`,
        ).bind(input.workOrderId, input.technicianId),
        env.DB.prepare(
          "UPDATE work_order_assignments SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(assignment.id),
        env.DB.prepare(
          `UPDATE work_orders SET
             status = CASE WHEN (SELECT COUNT(*) FROM work_order_assignments WHERE work_order_id = ? AND status IN ('offered','assigned','accepted','dispatched','arrived')) >= required_technician_count THEN 'assigned' ELSE 'ready_to_assign' END,
             scheduled_start = CASE WHEN (SELECT COUNT(*) FROM work_order_assignments WHERE work_order_id = ? AND status IN ('offered','assigned','accepted','dispatched','arrived')) = 0 THEN NULL ELSE scheduled_start END,
             scheduled_end = CASE WHEN (SELECT COUNT(*) FROM work_order_assignments WHERE work_order_id = ? AND status IN ('offered','assigned','accepted','dispatched','arrived')) = 0 THEN NULL ELSE scheduled_end END,
             record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND organization_id = ?`,
        ).bind(
          input.workOrderId,
          input.workOrderId,
          input.workOrderId,
          input.workOrderId,
          TECHFLEX_ORG_ID,
        ),
        env.DB.prepare(
          `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'dispatch.assignment_removed', 'work_order', ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          identity.userId,
          input.workOrderId,
          JSON.stringify({ technicianId: input.technicianId }),
        ),
        ...routeTotalStatements(routeRows.results.map((row) => row.id)),
      ]);
      return Response.json({
        workOrderId: input.workOrderId,
        unscheduled: true,
      });
    }

    const trainingError = await trainingAssignmentError(input.technicianId, input.workOrderId, input.assignmentRole);
    if (trainingError) return Response.json({error:trainingError},{status:409});
    const workOrder = await env.DB.prepare(
      `SELECT w.id, w.service_type AS serviceType, w.external_id AS externalId, w.status,w.account_id AS accountId,
          w.required_technician_count AS requiredTechnicianCount,
          w.gross_margin_basis_points AS grossMarginBasisPoints,
          w.accepted_price_cents AS acceptedPriceCents,w.estimated_cost_cents AS estimatedCostCents,
          l.id AS locationId, l.name AS locationName, l.address_1 AS address1,
          l.address_2 AS address2, l.city, l.state, l.postal_code AS postalCode,
          l.latitude, l.longitude
       FROM work_orders w JOIN locations l ON l.id = w.location_id
      WHERE w.id = ? AND w.organization_id = ?`,
    )
      .bind(input.workOrderId, TECHFLEX_ORG_ID)
      .first<Record<string, unknown>>();
    if (!workOrder)
      return Response.json({ error: "Work order not found." }, { status: 404 });
    if (!canEditDispatchPlan(String(workOrder.status)))
      return Response.json(
        { error: ["new", "needs_information", "pricing_review", "estimate_draft", "awaiting_authorization"].includes(String(workOrder.status))
            ? "This work order must clear pricing before dispatch. Review its pricing and authorization first."
            : dispatchPlanLockedMessage },
        { status: 409 },
      );
    if (Number(workOrder.grossMarginBasisPoints || 0) < 4000)
      return Response.json(
        {
          error:
            "Dispatch is blocked because the recorded price does not meet the 40% gross-margin floor.",
        },
        { status: 409 },
      );
    const technician = await env.DB.prepare(
      `SELECT t.id, t.service_disciplines_json AS serviceDisciplinesJson, t.home_postal_code AS homePostalCode, t.home_latitude AS homeLatitude,
              t.home_longitude AS homeLongitude,t.dispatch_address_1 AS dispatchAddress1,
              t.dispatch_address_2 AS dispatchAddress2,t.dispatch_city AS dispatchCity,
              t.dispatch_state AS dispatchState,t.dispatch_postal_code AS dispatchPostalCode,
              t.dispatch_latitude AS dispatchLatitude,t.dispatch_longitude AS dispatchLongitude,
              CASE WHEN t.employment_type='employee' THEN t.current_hourly_rate_cents ELSE 0 END AS currentHourlyRateCents,
              COALESCE(u.display_name, t.technician_code) AS name
         FROM technicians t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = ? AND t.organization_id = ? AND t.status = 'active'`,
    )
      .bind(input.technicianId, TECHFLEX_ORG_ID)
      .first<Record<string, unknown>>();
    if (!technician)
      return Response.json(
        { error: "Select an active technician." },
        { status: 400 },
      );

    if (technician.serviceDisciplinesJson !== null && technician.serviceDisciplinesJson !== undefined && !parseDisciplines(technician.serviceDisciplinesJson).includes(jobDiscipline(String(workOrder.serviceType))))
      return Response.json({error:"Choose a technician with the capability for this job: Biomedical / PM or DME / Mobility. Update Service capabilities on the technician roster if needed."},{status:409});
    const [latestEstimate, assignedRates] = await Promise.all([
      env.DB.prepare(`SELECT pricing_snapshot_json AS pricingSnapshotJson FROM estimates WHERE work_order_id=? ORDER BY created_at DESC LIMIT 1`).bind(input.workOrderId).first<{pricingSnapshotJson:string}>(),
      env.DB.prepare(`SELECT CASE WHEN t.employment_type='employee' THEN t.current_hourly_rate_cents ELSE 0 END AS rateCents FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id WHERE wa.work_order_id=? AND wa.status IN ('offered','assigned','accepted','dispatched','arrived') AND wa.technician_id!=?`).bind(input.workOrderId,input.technicianId).all<{rateCents:number}>(),
    ]);
    const pricingSnapshot=safeJson<{calculation?:{fixedDirectCosts?:number}}>(latestEstimate?.pricingSnapshotJson,{});
    const fixedDirectCostsCents=Math.round(Number(pricingSnapshot.calculation?.fixedDirectCosts || 0)*100);
    const paidHours=(input.durationMinutes+Number(input.driveMinutes || 0))/60;
    const assignedHourlyRates=[...assignedRates.results.map((row)=>Number(row.rateCents)),Number(technician.currentHourlyRateCents || 2500)];
    const hourlyLaborCents=Math.ceil(assignedHourlyRates.reduce((sum,rate)=>sum+rate*paidHours,0));
    const adjustedCostCents=fixedDirectCostsCents+hourlyLaborCents;
    const acceptedPriceCents=Number(workOrder.acceptedPriceCents || 0);
    const compensationMarginBps=acceptedPriceCents>0?Math.floor(((acceptedPriceCents-adjustedCostCents)/acceptedPriceCents)*10000):0;
    if(compensationMarginBps<4000){
      const requiredBidCents=Math.ceil(adjustedCostCents/0.6);
      return Response.json({
        error:`Dispatch is held because this technician's earned rate would reduce the job below the 40% margin floor. Authorization must be at least $${(requiredBidCents/100).toFixed(2)}.`,
        requiredBidCents,adjustedCostCents,projectedMarginBasisPoints:compensationMarginBps,
      },{status:409});
    }

    const scheduledEnd = new Date(
      new Date(input.scheduledStart).getTime() + input.durationMinutes * 60000,
    ).toISOString();
    const conflict = await env.DB.prepare(
      `SELECT w.external_id AS externalId FROM work_orders w
         JOIN work_order_assignments wa ON wa.work_order_id = w.id
        WHERE wa.technician_id = ? AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')
          AND w.id != ? AND w.scheduled_start IS NOT NULL
          AND datetime(w.scheduled_start) < datetime(?)
          AND datetime(COALESCE(w.scheduled_end, datetime(w.scheduled_start, '+90 minutes'))) > datetime(?)
        LIMIT 1`,
    )
      .bind(
        input.technicianId,
        input.workOrderId,
        scheduledEnd,
        input.scheduledStart,
      )
      .first<{ externalId: string }>();
    if (conflict)
      return Response.json(
        {
          error: `This time overlaps work order ${conflict.externalId}. Choose another appointment or technician.`,
        },
        { status: 409 },
      );

    const existingRoute = await env.DB.prepare(
      "SELECT id FROM routes WHERE technician_id = ? AND route_date = ? AND organization_id = ?",
    )
      .bind(input.technicianId, input.routeDate, TECHFLEX_ORG_ID)
      .first<{ id: string }>();
    const route = existingRoute || { id: crypto.randomUUID() };
    // Creating the route must commit with its assignment, stop, audit and totals.
    // A concurrent new-route conflict fails the whole save safely; retry finds that route.
    const statements: D1PreparedStatement[] = [];
    if (!existingRoute) statements.push(env.DB.prepare(
      `INSERT INTO routes
        (id, organization_id, technician_id, route_date, status, start_location_json)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
    )
      .bind(
        route.id,
        TECHFLEX_ORG_ID,
        input.technicianId,
        input.routeDate,
        JSON.stringify({
          address: [technician.dispatchAddress1,technician.dispatchAddress2,technician.dispatchCity,technician.dispatchState,technician.dispatchPostalCode].filter(Boolean).join(", ") || null,
          postalCode: technician.dispatchPostalCode || technician.homePostalCode || null,
          latitude: technician.dispatchLatitude || technician.homeLatitude || null,
          longitude: technician.dispatchLongitude || technician.homeLongitude || null,
        }),
      ));

    const existingStop = await env.DB.prepare(
      "SELECT id, stop_order AS stopOrder FROM route_stops WHERE route_id = ? AND work_order_id = ? LIMIT 1",
    )
      .bind(route.id, input.workOrderId)
      .first<{ id: string; stopOrder: number }>();
    const maxOrder = await env.DB.prepare(
      "SELECT COALESCE(MAX(stop_order), 0) AS maxOrder FROM route_stops WHERE route_id = ?",
    )
      .bind(route.id)
      .first<{ maxOrder: number }>();
    const priorRoutes = await env.DB.prepare(
            `SELECT DISTINCT r.id FROM routes r JOIN route_stops rs ON rs.route_id = r.id
              JOIN work_order_assignments wa ON wa.work_order_id = rs.work_order_id AND wa.technician_id = r.technician_id
             WHERE rs.work_order_id = ? AND r.organization_id = ?
               AND ((r.technician_id = ? AND r.id != ?)
                 OR (? = 'primary' AND wa.role = 'primary'
                   AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')
                   AND wa.technician_id != ?))`,
          )
            .bind(input.workOrderId, TECHFLEX_ORG_ID, input.technicianId, route.id, input.assignmentRole, input.technicianId)
            .all<{ id: string }>();
    const stopAddress = {
      name: workOrder.locationName,
      address: fullAddress(workOrder),
      latitude: workOrder.latitude || null,
      longitude: workOrder.longitude || null,
    };
    statements.push(env.DB.prepare(
      `DELETE FROM route_stops WHERE work_order_id = ? AND route_id IN
        (SELECT id FROM routes WHERE technician_id = ? AND organization_id = ? AND id != ?)`,
    ).bind(input.workOrderId, input.technicianId, TECHFLEX_ORG_ID, route.id));
    if (input.assignmentRole === "primary") {
      statements.push(
        env.DB.prepare(
          `DELETE FROM route_stops WHERE work_order_id = ? AND route_id IN
            (SELECT r.id FROM routes r JOIN work_order_assignments wa ON wa.technician_id = r.technician_id
              WHERE wa.work_order_id = ? AND wa.role = 'primary'
                AND wa.status IN ('offered','assigned','accepted','dispatched','arrived')
                AND wa.technician_id != ?)`,
        ).bind(input.workOrderId, input.workOrderId, input.technicianId),
        env.DB.prepare(
          `UPDATE work_order_assignments SET status = 'declined', updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = ? AND role = 'primary' AND technician_id != ?
              AND status IN ('offered','assigned','accepted','dispatched','arrived')`,
        ).bind(input.workOrderId, input.technicianId),
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO work_order_assignments
          (id, work_order_id, technician_id, role, status, responded_at)
         VALUES (?, ?, ?, ?, 'assigned', CURRENT_TIMESTAMP)
         ON CONFLICT(work_order_id, technician_id) DO UPDATE SET
           role = excluded.role, status = 'assigned', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(),
        input.workOrderId,
        input.technicianId,
        input.assignmentRole,
      ),
    );
    if (existingStop) {
      statements.push(
        env.DB.prepare(
          `UPDATE route_stops SET address_json = ?, planned_arrival = ?, planned_departure = ?,
             leg_miles = ?, drive_minutes = ?, travel_source = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(
          JSON.stringify(stopAddress),
          input.scheduledStart,
          scheduledEnd,
          input.legMiles ?? null,
          input.driveMinutes ?? null,
          input.legMiles !== null && input.legMiles !== undefined
            ? "admin_verified"
            : "missing",
          existingStop.id,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO route_stops
            (id, route_id, work_order_id, stop_order, stop_type, address_json,
             planned_arrival, planned_departure, leg_miles, drive_minutes, travel_source, status)
           VALUES (?, ?, ?, ?, 'service', ?, ?, ?, ?, ?, ?, 'planned')`,
        ).bind(
          crypto.randomUUID(),
          route.id,
          input.workOrderId,
          Number(maxOrder?.maxOrder || 0) + 1,
          JSON.stringify(stopAddress),
          input.scheduledStart,
          scheduledEnd,
          input.legMiles ?? null,
          input.driveMinutes ?? null,
          input.legMiles !== null && input.legMiles !== undefined
            ? "admin_verified"
            : "missing",
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        `UPDATE work_orders SET scheduled_start = ?, scheduled_end = ?,
           status = CASE WHEN (SELECT COUNT(*) FROM work_order_assignments
             WHERE work_order_id = ? AND status IN ('offered','assigned','accepted','dispatched','arrived')) >= required_technician_count
             THEN 'assigned' ELSE 'ready_to_assign' END,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      ).bind(
        input.scheduledStart,
        scheduledEnd,
        input.workOrderId,
        input.workOrderId,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `INSERT INTO work_order_events (id, work_order_id, event_type, actor_user_id, source, payload_json)
         VALUES (?, ?, 'dispatch.scheduled', ?, 'portal', ?)`,
      ).bind(
        crypto.randomUUID(),
        input.workOrderId,
        identity.userId,
        JSON.stringify({
          technicianId: input.technicianId,
          role: input.assignmentRole,
          routeDate: input.routeDate,
          scheduledStart: input.scheduledStart,
          scheduledEnd,
          legMiles: input.legMiles ?? null,
          driveMinutes: input.driveMinutes ?? null,
        }),
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'dispatch.scheduled', 'work_order', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.workOrderId,
        JSON.stringify(input),
      ),
      ...routeTotalStatements([route.id, ...priorRoutes.results.map((row) => row.id)]),
    );
    await env.DB.batch(statements);
    const assigned = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM work_order_assignments
        WHERE work_order_id = ? AND status IN ('offered','assigned','accepted','dispatched','arrived')`,
    )
      .bind(input.workOrderId)
      .first<{ count: number }>();
    const crewGap = Math.max(
      0,
      Number(workOrder.requiredTechnicianCount) - Number(assigned?.count || 0),
    );
    return Response.json({
      workOrderId: input.workOrderId,
      routeId: route.id,
      scheduledStart: input.scheduledStart,
      scheduledEnd,
      crewGap,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the dispatch details.", details: error.flatten() },
        { status: 400 },
      );
    return apiError(error);
  }
}
