import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const schema = z.object({
  accountId: z.string().min(1), locationId: z.string().min(1), departmentId: z.string().optional().nullable(),
  assetTag: z.string().trim().min(2).max(80), customerAssetId: z.string().trim().max(80).optional().nullable(),
  manufacturer: z.string().trim().min(2).max(120), model: z.string().trim().min(1).max(120), serialNumber: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(240).optional().nullable(), riskClass: z.enum(["low", "medium", "high", "critical"]),
  pmIntervalMonths: z.number().int().min(1).max(60).optional().nullable(), lastPmOn: z.string().optional().nullable(), nextPmDueOn: z.string().optional().nullable(),
});

// Reuse the same ownership predicate for the helpful precheck and atomic insert.
const hierarchySql = `SELECT l.id FROM locations l
  JOIN accounts a ON a.id = l.account_id
  WHERE l.id = ? AND a.id = ? AND a.organization_id = ?
    AND a.status = 'active' AND l.status = 'active'
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM departments d
      WHERE d.id = ? AND d.location_id = l.id AND d.status = 'active'
    ))`;

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
    const isTechnician = identity.role === "technician";
    if (isTechnician && !identity.technicianId) {
      return Response.json({ error: "Your technician profile must be linked before you can view assigned equipment. Contact your administrator." }, { status: 403 });
    }
    const locationId = new URL(request.url).searchParams.get("locationId");
    const sql = `SELECT s.id, s.asset_tag AS assetTag, s.customer_asset_id AS customerAssetId, s.category_id AS categoryId,
              s.category_revision_id AS categoryRevisionId,cr.name AS categoryName,cr.revision AS categoryRevision,s.manufacturer, s.model,
              s.serial_number AS serialNumber, s.description, s.room, s.configuration, s.software_version AS softwareVersion,
              s.risk_class AS riskClass, s.status, s.record_version AS recordVersion,
              s.last_pm_on AS lastPmOn, s.next_pm_due_on AS nextPmDueOn, s.pm_interval_months AS pmIntervalMonths,
              a.id AS accountId, a.name AS accountName, l.id AS locationId, l.name AS locationName,
              l.city, l.state, s.department_id AS departmentId, d.name AS departmentName,
              pm.fields_json AS pmDraftJson, pm.updated_at AS pmDraftUpdatedAt, pm.record_version AS pmDraftVersion
         FROM assets s JOIN accounts a ON a.id = s.account_id AND a.organization_id = s.organization_id
         JOIN locations l ON l.id = s.location_id AND l.account_id = s.account_id
         LEFT JOIN departments d ON d.id = s.department_id AND d.location_id = s.location_id
         LEFT JOIN asset_category_revisions cr ON cr.id=s.category_revision_id AND cr.category_id=s.category_id AND cr.organization_id=s.organization_id
         LEFT JOIN biomedical_pm_draft_entries pm ON pm.organization_id=s.organization_id
           AND pm.report_key=COALESCE(json_extract(s.metadata_json,'$.pmReportKey'),'asset-registry')
           AND pm.unit_number=COALESCE(json_extract(s.metadata_json,'$.pmUnit'),s.id)
        WHERE s.organization_id = ? AND s.status != 'retired' AND (? IS NULL OR s.location_id = ?)
          AND (? = 0 OR EXISTS (
            SELECT 1 FROM work_orders w
            JOIN work_order_assignments wa ON wa.work_order_id = w.id
            JOIN technicians t ON t.id = wa.technician_id AND t.organization_id = s.organization_id
            WHERE w.asset_id = s.id AND w.organization_id = s.organization_id
              AND w.account_id = s.account_id AND w.location_id = s.location_id
              AND wa.technician_id = ? AND t.user_id = ? AND t.status = 'active'
              AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')
          ))
        ORDER BY CASE WHEN s.next_pm_due_on < date('now') THEN 1 WHEN s.next_pm_due_on <= date('now', '+30 days') THEN 2 ELSE 3 END, a.name, l.name, s.asset_tag`;
    const statement = env.DB.prepare(sql).bind(TECHFLEX_ORG_ID, locationId, locationId, isTechnician ? 1 : 0, identity.technicianId, identity.userId);
    const result = await statement.all();
    return Response.json({ assets: result.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator", "biomedical_lead"]);
    const input = schema.parse(await request.json());
    const departmentId = input.departmentId || null;
    const hierarchyValues = [input.locationId, input.accountId, TECHFLEX_ORG_ID, departmentId, departmentId];
    const hierarchy = await env.DB.prepare(hierarchySql).bind(...hierarchyValues).first();
    if (!hierarchy) return Response.json({ error: "Select an active account and its facility. Any department must belong to that facility." }, { status: 400 });
    const id = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO assets (id, organization_id, account_id, location_id, department_id, asset_tag, customer_asset_id, manufacturer, model, serial_number, description, risk_class, status, last_pm_on, next_pm_due_on, pm_interval_months, qr_code_value)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_service', ?, ?, ?, ?
        WHERE EXISTS (${hierarchySql})`).bind(id, TECHFLEX_ORG_ID, input.accountId, input.locationId, departmentId, input.assetTag, input.customerAssetId || null, input.manufacturer, input.model, input.serialNumber || null, input.description || null, input.riskClass, input.lastPmOn || null, input.nextPmDueOn || null, input.pmIntervalMonths || null, `techflex:asset:${id}`, ...hierarchyValues),
      env.DB.prepare(`INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
        SELECT ?, ?, ?, 'asset.created', 'asset', ?, ?
        WHERE EXISTS (SELECT 1 FROM assets WHERE id = ? AND organization_id = ?)`)
        .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify(input), id, TECHFLEX_ORG_ID),
    ]);
    if (results[0].meta.changes !== 1) {
      return Response.json({ error: "The account, facility or department changed before this asset was saved. Refresh the selections and try again." }, { status: 409 });
    }
    return Response.json({ asset: { id, ...input, status: "in_service" } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the biomedical asset fields.", details: error.flatten() }, { status: 400 });
    if (error instanceof Error && /UNIQUE constraint failed: assets\.organization_id, assets\.asset_tag|asset_label_code_conflict/i.test(error.message)) {
      return Response.json({ error: "This asset label is already assigned, including any retired equipment. Review the existing asset or choose an unused label." }, { status: 409 });
    }
    return apiError(error);
  }
}
