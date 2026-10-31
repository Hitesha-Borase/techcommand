import { env } from "cloudflare:workers";
import { z } from "zod";
import { generatePmEventStickerPdf } from "@/lib/techflex-pdfs";
import { TECHFLEX_ORG_ID, PortalHttpError, apiError, requirePortalRole } from "@/lib/portal-auth";

const headers = { "Cache-Control": "private, no-store" };
const paramsSchema = z.object({ workOrderId: z.string().trim().min(1).max(160), assetId: z.string().trim().min(1).max(160) });
const reviewedAsset = z.tuple([
  z.string(), z.string(), z.string().nullable(), z.string().nullable(), z.string().nullable(), z.number(), z.number(),
  z.string(), z.string().nullable(), z.string().nullable(), z.string().nullable(), z.string().nullable(),
  z.string().nullable(), z.string().nullable(), z.string().nullable(),
]);

type StickerRow = {
  workOrderNumber: string | null;
  serviceType: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  reportId: string;
  reportVersion: number;
  qaReviewedAt: string;
  technicianId: string;
  technicianName: string;
  technicianCode: string;
  snapshotJson: string;
};

function safeJson(value: string) {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator", "biomedical_lead", "technician"]);
    const url = new URL(request.url);
    const input = paramsSchema.parse({ workOrderId: url.searchParams.get("workOrderId"), assetId: url.searchParams.get("assetId") });
    const technicianGuard = identity.role === "technician" ? "AND sr.technician_id=?" : "";
    const bindings = [TECHFLEX_ORG_ID, input.workOrderId, input.assetId, ...(identity.role === "technician" ? [identity.technicianId || ""] : [])];
    const row = await env.DB.prepare(`SELECT w.external_id AS workOrderNumber,w.service_type AS serviceType,
      a.asset_tag AS assetTag,a.manufacturer,a.model,a.serial_number AS serialNumber,
      sr.id AS reportId,sr.report_version AS reportVersion,sr.qa_reviewed_at AS qaReviewedAt,sr.technician_id AS technicianId,
      COALESCE(u.display_name,t.technician_code) AS technicianName,t.technician_code AS technicianCode,
      snapshot.after_json AS snapshotJson
      FROM work_orders w
      JOIN work_order_assets progress ON progress.work_order_id=w.id AND progress.organization_id=w.organization_id
      JOIN assets a ON a.id=progress.asset_id AND a.organization_id=w.organization_id AND a.account_id=w.account_id AND a.location_id=w.location_id
      JOIN service_reports sr ON sr.work_order_id=w.id AND sr.qa_status='approved' AND sr.qa_reviewed_at IS NOT NULL AND sr.report_pdf_attachment_id IS NOT NULL
      JOIN technicians t ON t.id=sr.technician_id AND t.organization_id=w.organization_id
      LEFT JOIN users u ON u.id=t.user_id
      JOIN audit_logs snapshot ON snapshot.organization_id=w.organization_id
        AND snapshot.action='service_report.submission_snapshot' AND snapshot.entity_type='service_report_revision'
        AND snapshot.entity_id=sr.id || ':r' || sr.report_version
      WHERE w.organization_id=? AND w.id=? AND a.id=? AND w.service_type LIKE 'biomed_pm_%' ${technicianGuard}
      ORDER BY sr.report_version DESC,snapshot.occurred_at DESC LIMIT 1`).bind(...bindings).first<StickerRow>();
    if (!row) throw new PortalHttpError(404, "A reviewed Biomedical PM result is not available for this exact work order and asset.");
    const snapshot = safeJson(row.snapshotJson);
    if (!snapshot || snapshot.reportId !== row.reportId || snapshot.workOrderId !== input.workOrderId || Number(snapshot.reportVersion) !== row.reportVersion)
      throw new PortalHttpError(409, "The reviewed report revision could not be matched to its immutable equipment evidence.");
    const assets = z.array(reviewedAsset).safeParse(snapshot.assets);
    if (!assets.success) throw new PortalHttpError(409, "The reviewed equipment evidence cannot be read safely. Keep the approved report as the authoritative record.");
    const matches = assets.data.filter((item) => item[0] === input.assetId);
    if (matches.length !== 1) throw new PortalHttpError(409, "The approved report does not contain one exact reviewed record for this asset.");
    const item = matches[0];
    if (item[1] !== row.assetTag || (item[2] || "") !== (row.manufacturer || "") || (item[3] || "") !== (row.model || "") || (item[4] || "") !== (row.serialNumber || ""))
      throw new PortalHttpError(409, "The equipment identity changed after review. Reconcile the current asset record before printing a dated sticker.");
    if (item[7] !== "completed" || !item[11]) throw new PortalHttpError(409, "Only a completed, reviewed PM result can produce an event sticker. N/A, unfinished and unperformed records remain unstickered.");
    const fields = z.object({ documentDetails: z.object({ workOrderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) }).passthrough().safeParse(snapshot.fields);
    if (!fields.success || !validDate(fields.data.documentDetails.workOrderDate) || fields.data.documentDetails.workOrderDate > row.qaReviewedAt.slice(0, 10))
      throw new PortalHttpError(409, "The actual performed date was not recorded in the reviewed report, so a dated PM sticker cannot be produced.");
    let procedureRevision = "";
    if (item[13]) {
      try { procedureRevision = z.object({ id: z.string().min(1) }).parse(JSON.parse(item[13])).id; } catch { procedureRevision = ""; }
    }
    const savedPlan = procedureRevision ? await env.DB.prepare(`SELECT next_due_on AS nextDueOn FROM pm_plans
      WHERE asset_id=? AND status='active' AND procedure_version=? AND next_due_on>=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`).bind(input.assetId, procedureRevision, fields.data.documentDetails.workOrderDate).first<{ nextDueOn: string }>() : null;
    const plan = savedPlan && validDate(savedPlan.nextDueOn) ? savedPlan : null;
    const bytes = await generatePmEventStickerPdf({
      workOrderNumber: row.workOrderNumber || input.workOrderId,
      reportVersion: row.reportVersion,
      evidenceRevision: item[6],
      assetTag: item[1], manufacturer: item[2], model: item[3], serialNumber: item[4],
      disposition: item[11], performedOn: fields.data.documentDetails.workOrderDate,
      technicianName: row.technicianName, technicianCode: row.technicianCode,
      authorizedNextDueOn: plan?.nextDueOn || null,
    });
    const filename = `TechFlex-${row.workOrderNumber || input.workOrderId}-${item[1]}-R${row.reportVersion}-PM-event-sticker.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "X-TechCommand-Report-Version": String(row.reportVersion), "X-TechCommand-Evidence-Revision": String(item[6]), "X-TechCommand-Next-Due-Status": plan ? "authorized" : "not-recorded", ...headers } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Choose the exact work order and asset." }, { status: 400, headers });
    const response = apiError(error); response.headers.set("Cache-Control", headers["Cache-Control"]); return response;
  }
}
