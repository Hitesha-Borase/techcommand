import { env } from "cloudflare:workers";
import { apiError, requirePortalRole, TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { facilityAssetException } from "@/lib/work-order-asset-policy";
import { generateFacilityRoundReportPdf, type FacilityRoundReportItem } from "@/lib/techflex-pdfs";

const allowedRoles = [
  "owner_administrator",
  "operations_administrator",
  "dispatcher",
  "biomedical_lead",
  "technician",
  "auditor",
] as const;

type Round = {
  id: string;
  workOrderNumber: string | null;
  serviceType: string;
  status: string;
  accountName: string;
  locationName: string;
  locationAddress: string;
  locationId: string;
  reviewed: number;
  facilityDocumentCount: number;
  workOrderEvidenceCount: number;
};

type RoundItem = Omit<FacilityRoundReportItem, "exceptionReason">;

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...allowedRoles]);
    const params = new URL(request.url).searchParams;
    const workOrderId = params.get("workOrderId")?.trim();
    const reportType = params.get("report") || "master";
    if (!workOrderId) return Response.json({ error: "Choose a biomedical work order." }, { status: 400 });
    if (!new Set(["master", "exceptions"]).has(reportType))
      return Response.json({ error: "Choose the master or exceptions report." }, { status: 400 });

    const round = await env.DB.prepare(`
      SELECT w.id,w.external_id AS workOrderNumber,w.service_type AS serviceType,w.status,
        a.name AS accountName,l.id AS locationId,l.name AS locationName,
        trim(l.address_1 || CASE WHEN l.address_2 IS NOT NULL AND trim(l.address_2)<>'' THEN ', ' || l.address_2 ELSE '' END ||
          CASE WHEN trim(l.city)<>'' THEN ', ' || l.city ELSE '' END ||
          CASE WHEN trim(l.state)<>'' THEN ', ' || l.state ELSE '' END ||
          CASE WHEN trim(l.postal_code)<>'' THEN ' ' || l.postal_code ELSE '' END) AS locationAddress,
        EXISTS(SELECT 1 FROM service_reports sr WHERE sr.work_order_id=w.id AND sr.qa_status='approved') AS reviewed,
        (SELECT COUNT(*) FROM attachments x WHERE x.organization_id=w.organization_id AND x.entity_type='location' AND x.entity_id=l.id
          AND NOT EXISTS(SELECT 1 FROM document_records d WHERE d.organization_id=x.organization_id AND d.attachment_id=x.id AND (d.status='deleted' OR d.deleted_at IS NOT NULL))) AS facilityDocumentCount,
        (SELECT COUNT(*) FROM attachments x WHERE x.organization_id=w.organization_id AND x.entity_type='work_order' AND x.entity_id=w.id
          AND NOT EXISTS(SELECT 1 FROM document_records d WHERE d.organization_id=x.organization_id AND d.attachment_id=x.id AND (d.status='deleted' OR d.deleted_at IS NOT NULL))) AS workOrderEvidenceCount
      FROM work_orders w
      JOIN accounts a ON a.id=w.account_id AND a.organization_id=w.organization_id
      JOIN locations l ON l.id=w.location_id AND l.account_id=w.account_id
      WHERE w.id=? AND w.organization_id=? AND w.service_type LIKE 'biomed_%'
        AND (?=0 OR EXISTS(
          SELECT 1 FROM work_order_assignments wa
          JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=w.organization_id
            AND t.user_id=? AND t.status='active'
          WHERE wa.work_order_id=w.id AND t.id=?
            AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','in_progress','submitted')
        ))
      LIMIT 1`)
      .bind(
        workOrderId,
        TECHFLEX_ORG_ID,
        identity.role === "technician" ? 1 : 0,
        identity.userId,
        identity.technicianId,
      )
      .first<Round>();
    if (!round)
      return Response.json({ error: "The assigned biomedical round could not be found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

    const result = await env.DB.prepare(`
      SELECT a.asset_tag AS assetTag,a.manufacturer,a.model,a.serial_number AS serialNumber,
        p.status,p.disposition,p.not_applicable_reason AS notApplicableReason,p.findings,
        p.work_performed AS workPerformed,p.test_results AS testResults,p.notes,p.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM asset_visits v WHERE v.organization_id=p.organization_id AND v.asset_id=p.asset_id
          AND (v.work_order_id IS NULL OR v.work_order_id<>p.work_order_id)) AS historyCount,
        (SELECT v.visited_at FROM asset_visits v WHERE v.organization_id=p.organization_id AND v.asset_id=p.asset_id
          AND (v.work_order_id IS NULL OR v.work_order_id<>p.work_order_id) ORDER BY v.visited_at DESC,v.id DESC LIMIT 1) AS lastVisitedAt,
        (SELECT v.disposition FROM asset_visits v WHERE v.organization_id=p.organization_id AND v.asset_id=p.asset_id
          AND (v.work_order_id IS NULL OR v.work_order_id<>p.work_order_id) ORDER BY v.visited_at DESC,v.id DESC LIMIT 1) AS lastDisposition,
        (SELECT COUNT(*) FROM attachments x WHERE x.organization_id=p.organization_id AND x.entity_type='asset' AND x.entity_id=p.asset_id
          AND NOT EXISTS(SELECT 1 FROM document_records d WHERE d.organization_id=x.organization_id AND d.attachment_id=x.id AND (d.status='deleted' OR d.deleted_at IS NOT NULL))) AS assetDocumentCount
      FROM work_order_assets p
      JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=p.organization_id
      JOIN assets a ON a.id=p.asset_id AND a.organization_id=p.organization_id
        AND a.account_id=w.account_id AND a.location_id=w.location_id
      WHERE p.work_order_id=? AND p.organization_id=?
      ORDER BY lower(a.asset_tag),a.id`)
      .bind(round.id, TECHFLEX_ORG_ID)
      .all<RoundItem>();
    if (!result.results.length)
      return Response.json({ error: "This biomedical round has no selected equipment." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

    const items = result.results.map((item) => ({
      ...item,
      historyCount: Number(item.historyCount || 0),
      assetDocumentCount: Number(item.assetDocumentCount || 0),
      exceptionReason: facilityAssetException(round.serviceType, item),
    }));
    const bytes = await generateFacilityRoundReportPdf({
      reportType: reportType as "master" | "exceptions",
      workOrderNumber: round.workOrderNumber || round.id,
      accountName: round.accountName,
      locationName: round.locationName,
      locationAddress: round.locationAddress,
      serviceType: round.serviceType,
      workOrderStatus: round.status,
      reviewed: !!round.reviewed,
      facilityDocumentCount: Number(round.facilityDocumentCount || 0),
      workOrderEvidenceCount: Number(round.workOrderEvidenceCount || 0),
      items,
    });
    const releaseStatus = round.reviewed ? "Reviewed" : "Draft";
    const filename = `TechFlex-WO-${round.workOrderNumber || round.id}-${round.locationName}-${reportType}-${releaseStatus}-report.pdf`
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-TechCommand-Report-Status": releaseStatus.toLowerCase(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
