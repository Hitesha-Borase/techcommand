import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";
import { requireAssetIdentity } from "@/lib/asset-access";

const schema = z.object({
  assetId: z.string().min(1),
  workOrderId: z.string().optional().nullable(),
  technicianId: z.string().optional().nullable(),
  visitType: z.enum([
    "diagnostic",
    "repair",
    "preventive_maintenance",
    "installation",
    "inspection",
    "follow_up",
  ]),
  visitedAt: z.string().min(1),
  complaint: z.string().trim().max(5000).optional().nullable(),
  findings: z.string().trim().min(5).max(10000),
  workPerformed: z.string().trim().min(5).max(10000),
  parts: z.string().trim().max(5000).optional().nullable(),
  testResults: z.string().trim().max(5000).optional().nullable(),
  disposition: z.enum([
    "passed",
    "returned_to_service",
    "parts_required",
    "follow_up_required",
    "quarantined",
    "retired",
  ]),
  nextAction: z.string().trim().max(5000).optional().nullable(),
});

export function validHistoricalVisitDate(
  value: string,
  today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    value <= today
  );
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
      "auditor",
      "client_administrator",
      "client_location_user",
    ]);
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (assetId) await requireAssetIdentity(assetId, identity);

    if (identity.role === "technician") {
      if (!assetId || !identity.technicianId) {
        return Response.json(
          { error: "Select an asset from one of your assigned work orders." },
          { status: 400 },
        );
      }
      const assignedAsset = await env.DB.prepare(
        `SELECT a.id
           FROM assets a
           JOIN work_orders w ON w.asset_id = a.id AND w.organization_id = a.organization_id
           JOIN work_order_assignments wa ON wa.work_order_id = w.id
          WHERE a.id = ? AND a.organization_id = ? AND wa.technician_id = ?
            AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')
          LIMIT 1`,
      )
        .bind(assetId, TECHFLEX_ORG_ID, identity.technicianId)
        .first();
      if (!assignedAsset) {
        return Response.json(
          { error: "This asset is not linked to one of your assigned work orders." },
          { status: 403 },
        );
      }
    }

    const rows = await env.DB.prepare(
      `SELECT v.id, v.asset_id AS assetId, v.work_order_id AS workOrderId,
              v.visit_type AS visitType, v.visited_at AS visitedAt, v.complaint,
              v.findings, v.work_performed AS workPerformed, v.parts_json AS parts,
              v.test_results_json AS testResults, v.disposition,
              v.next_action AS nextAction,
              COALESCE(u.display_name, t.technician_code) AS technicianName,
              w.external_id AS workOrderNumber
         FROM asset_visits v
         LEFT JOIN technicians t ON t.id = v.technician_id
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN work_orders w ON w.id = v.work_order_id
        WHERE v.organization_id = ? AND (? IS NULL OR v.asset_id = ?)
        ORDER BY v.visited_at DESC, v.created_at DESC LIMIT 500`,
    )
      .bind(TECHFLEX_ORG_ID, assetId, assetId)
      .all();
    return Response.json({ visits: rows.results });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
    ]);
    const input = schema.parse(await request.json());
    if (!validHistoricalVisitDate(input.visitedAt)) {
      return Response.json(
        { error: "Enter a real visit date that is not in the future." },
        { status: 400 },
      );
    }
    if (input.workOrderId) {
      return Response.json(
        {
          error:
            "Work-order visits are created only from an approved service report. Leave the work order blank when adding verified historical service.",
        },
        { status: 400 },
      );
    }
    const asset = await env.DB.prepare(
      "SELECT id FROM assets WHERE id = ? AND organization_id = ?",
    )
      .bind(input.assetId, TECHFLEX_ORG_ID)
      .first();
    if (!asset)
      return Response.json({ error: "Asset not found." }, { status: 404 });

    if (input.technicianId) {
      const technician = await env.DB.prepare(
        "SELECT id FROM technicians WHERE id = ? AND organization_id = ?",
      )
        .bind(input.technicianId, TECHFLEX_ORG_ID)
        .first();
      if (!technician) {
        return Response.json(
          { error: "Select a TechFlex technician for this historical record." },
          { status: 400 },
        );
      }
    }

    const id = crypto.randomUUID();
    const auditRecord = {
      visitId: id,
      assetId: input.assetId,
      technicianId: input.technicianId || null,
      visitType: input.visitType,
      visitedAt: input.visitedAt,
      disposition: input.disposition,
      historicalRecord: true,
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO asset_visits (id, organization_id, asset_id, work_order_id, technician_id, visit_type, visited_at, complaint, findings, work_performed, parts_json, test_results_json, disposition, next_action, created_by) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        id,
        TECHFLEX_ORG_ID,
        input.assetId,
        input.technicianId || null,
        input.visitType,
        input.visitedAt,
        input.complaint || null,
        input.findings,
        input.workPerformed,
        input.parts || null,
        input.testResults || null,
        input.disposition,
        input.nextAction || null,
        identity.userId,
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'asset_visit.historical_record_created', 'asset', ?, ?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.assetId,
        JSON.stringify(auditRecord),
      ),
    ]);
    return Response.json(
      { visit: { id, ...input, workOrderId: null, historicalRecord: true } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Complete the required historical service record." },
        { status: 400 },
      );
    return apiError(error);
  }
}
