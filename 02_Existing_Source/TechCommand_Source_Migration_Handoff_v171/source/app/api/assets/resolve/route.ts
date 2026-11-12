import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, PortalHttpError, apiError, requirePortalRole } from "@/lib/portal-auth";
import { assetManageRoles, assetReadRoles, requireAssetIdentity } from "@/lib/asset-access";
import { parseAssetScan, type ScannedJob } from "@/lib/asset-scanning";

const inputSchema = z.object({ code: z.string().min(1).max(256), locationId: z.string().max(80).optional(),
  kind: z.enum(["label", "facility_label"]).default("label") });
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...assetReadRoles]);
    const input = inputSchema.parse(await request.json());
    let scan;
    try { scan = parseAssetScan(input.code); } catch (error) {
      throw new PortalHttpError(400, error instanceof Error ? error.message : "Enter a valid asset tag.");
    }
    if (input.kind === "facility_label" && (!input.locationId || scan.kind !== "label")) {
      throw new PortalHttpError(400, "Select the exact facility before looking up its legacy asset number.");
    }
    // Find exact identities first. A facility filter must never hide a duplicate
    // permanent code. Unknown and unauthorized codes receive the same response.
    const matches = scan.kind === "asset_id"
      ? [{ assetId: scan.value, retired: 0 }]
      : (await env.DB.prepare(input.kind === "facility_label"
          ? `SELECT id AS assetId, 0 AS retired FROM assets WHERE organization_id = ? AND customer_asset_id = ? AND location_id = ? LIMIT 3`
          : `SELECT asset_id AS assetId, CASE WHEN status = 'retired' THEN 1 ELSE 0 END AS retired FROM asset_labels WHERE organization_id = ? AND label_code = ?
             UNION ALL SELECT id AS assetId, 0 AS retired FROM assets WHERE organization_id = ? AND asset_tag = ? LIMIT 4`)
        .bind(...(input.kind === "facility_label" ? [TECHFLEX_ORG_ID, scan.value, input.locationId!] : [TECHFLEX_ORG_ID, scan.value, TECHFLEX_ORG_ID, scan.value]))
        .all<{ assetId: string; retired: number }>()).results;
    if (!matches.length) throw new PortalHttpError(404, "No accessible asset matches this tag. Check the label and your assigned facility.");
    if (new Set(matches.map(row => row.assetId)).size !== 1) throw new PortalHttpError(409, "This label matches more than one asset. Choose the correct assigned unit by its asset tag while the duplicate is corrected.");
    const asset = await requireAssetIdentity(matches[0].assetId, identity);
    if (input.locationId && asset.locationId !== input.locationId) throw new PortalHttpError(409, "This asset is not at the selected facility. Confirm the physical equipment and facility before continuing.");
    if (matches.some(row => row.retired) || asset.status === "retired") throw new PortalHttpError(409, "This label or equipment is retired. Keep this identifier on its original asset; choose the correct assigned unit.");
    const jobs = await env.DB.prepare(`SELECT DISTINCT w.id, w.external_id AS externalId, w.service_type AS serviceType, w.status,
      w.scheduled_start AS scheduledStart, wa.id AS assignmentId,
      COALESCE(substr(w.scheduled_start, 1, 10), (SELECT MIN(r.route_date) FROM route_stops rs JOIN routes r ON r.id = rs.route_id
        WHERE rs.work_order_id = w.id AND r.organization_id = w.organization_id AND r.technician_id = wa.technician_id)) AS visitDate
      FROM work_orders w LEFT JOIN work_order_assignments wa ON wa.work_order_id = w.id
        AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')
      LEFT JOIN technicians t ON t.id = wa.technician_id AND t.organization_id = w.organization_id AND t.status = 'active'
      WHERE w.asset_id = ? AND w.organization_id = ? AND w.account_id = ? AND w.location_id = ?
        AND w.status NOT IN ('cancelled','closed')
        AND (? = 0 OR (t.id = ? AND t.user_id = ?))
      ORDER BY w.scheduled_start, w.created_at LIMIT 50`)
      .bind(asset.id, TECHFLEX_ORG_ID, asset.accountId, asset.locationId, identity.role === "technician" ? 1 : 0, identity.technicianId, identity.userId)
      .all<ScannedJob>();
    return Response.json({ asset, jobs: jobs.results, matchedBy: scan.kind === "asset_id" ? "asset_qr" : input.kind,
      canManageLabels: (assetManageRoles as readonly string[]).includes(identity.role) }, { headers: noStore });
  } catch (error) {
    const response = error instanceof z.ZodError ? Response.json({ error: "Scan one tag and select a valid facility." }, { status: 400 }) : apiError(error);
    response.headers.set("Cache-Control", "private, no-store"); return response;
  }
}
