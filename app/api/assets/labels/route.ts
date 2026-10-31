import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, PortalHttpError, apiError, requirePortalRole } from "@/lib/portal-auth";
import { assetManageRoles, assetReadRoles, requireAssetIdentity } from "@/lib/asset-access";
import { parseAssetScan } from "@/lib/asset-scanning";

const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ assetId: z.string().min(1).max(80), labelCode: z.string().min(1).max(256),
  source: z.enum(["intelliscanner", "custom"]), physicalMatch: z.literal(true), recordVersion: z.number().int().positive(),
  locationId: z.string().min(1), manufacturer: z.string(), model: z.string(), serialNumber: z.string().nullable() });
const membership = `EXISTS (SELECT 1 FROM memberships m JOIN roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
  WHERE m.organization_id = ? AND m.user_id = ? AND m.status = 'active' AND r.name IN ('owner_administrator','operations_administrator','biomedical_lead'))`;
const guard = `SELECT s.id FROM assets s JOIN accounts a ON a.id = s.account_id AND a.organization_id = s.organization_id
  JOIN locations l ON l.id = s.location_id AND l.account_id = s.account_id
  WHERE s.id = ? AND s.organization_id = ? AND s.record_version = ? AND s.location_id = ?
    AND s.manufacturer = ? AND s.model = ? AND COALESCE(s.serial_number, '') = ?
    AND s.status != 'retired' AND a.status = 'active' AND l.status = 'active' AND ${membership}`;

function failure(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Confirm the physical equipment and complete the tag details." }, { status: 400, headers });
  if (error instanceof Error && /asset_label_|UNIQUE constraint failed: asset_labels/.test(error.message))
    return Response.json({ error: "This code is already reserved or cannot be reassigned. Refresh the asset and use an unused tag." }, { status: 409, headers });
  const response = apiError(error); response.headers.set("Cache-Control", headers["Cache-Control"]); return response;
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...assetReadRoles]);
    const assetId = new URL(request.url).searchParams.get("assetId") || "";
    await requireAssetIdentity(assetId, identity);
    const labels = await env.DB.prepare(`SELECT id, label_code AS labelCode, source, status, created_at AS createdAt,
      retired_at AS retiredAt, retirement_reason AS retirementReason,
      (SELECT COUNT(*) FROM asset_label_print_events p WHERE p.organization_id=asset_labels.organization_id AND p.label_id=asset_labels.id) AS printCount,
      (SELECT MAX(created_at) FROM asset_label_print_events p WHERE p.organization_id=asset_labels.organization_id AND p.label_id=asset_labels.id) AS lastPrintedAt
      FROM asset_labels WHERE organization_id = ? AND asset_id = ? ORDER BY created_at, id`)
      .bind(TECHFLEX_ORG_ID, assetId).all();
    return Response.json({ labels: labels.results }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...assetManageRoles]);
    const input = schema.parse(await request.json());
    let code;
    try { code = parseAssetScan(input.labelCode); } catch { throw new PortalHttpError(400, "Enter the printed asset tag number, including every leading zero."); }
    if (code.kind !== "label") throw new PortalHttpError(400, "An internal asset QR cannot be assigned as a new physical label.");
    if (input.source === "intelliscanner" && !/^\d{7,8}$/.test(code.value)) throw new PortalHttpError(400, "IntelliScanner tags contain 7 or 8 digits. Check the scan or choose another custom tag.");
    const asset = await requireAssetIdentity(input.assetId, identity);
    if (asset.status === "retired") throw new PortalHttpError(409, "Retired equipment cannot receive a new active tag.");
    if (asset.locationId !== input.locationId || asset.manufacturer !== input.manufacturer || asset.model !== input.model || (asset.serialNumber || "") !== (input.serialNumber || ""))
      throw new PortalHttpError(409, "Equipment identity changed. Refresh and confirm the physical match again.");
    const existing = await env.DB.prepare("SELECT id, asset_id AS assetId, status FROM asset_labels WHERE organization_id = ? AND label_code = ?")
      .bind(TECHFLEX_ORG_ID, code.value).first<{ id: string; assetId: string; status: string }>();
    if (existing) {
      if (existing.assetId === asset.id && existing.status === "active") return Response.json({ label: existing, reused: true }, { headers });
      throw new PortalHttpError(409, "This tag is already reserved, including retired labels. Use an unused tag.");
    }
    if (asset.recordVersion !== input.recordVersion) throw new PortalHttpError(409, "The asset changed. Refresh and confirm it again before linking a tag.");
    const id = crypto.randomUUID();
    const values = [asset.id, TECHFLEX_ORG_ID, input.recordVersion, input.locationId, input.manufacturer, input.model,
      input.serialNumber || "", TECHFLEX_ORG_ID, identity.userId];
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO asset_labels(id, organization_id, asset_id, label_code, source, created_by)
        SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (${guard})`)
        .bind(id, TECHFLEX_ORG_ID, asset.id, code.value, input.source, identity.userId, ...values),
      env.DB.prepare(`UPDATE assets SET record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ? AND EXISTS (SELECT 1 FROM asset_labels WHERE id = ?)`)
        .bind(asset.id, TECHFLEX_ORG_ID, id),
      env.DB.prepare(`INSERT INTO audit_logs(id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
        SELECT ?, ?, ?, 'asset_label.assigned', 'asset', ?, ? WHERE EXISTS (SELECT 1 FROM asset_labels WHERE id = ?)`)
        .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, asset.id, JSON.stringify({ labelId: id, labelCode: code.value, source: input.source, physicalMatchConfirmed: true }), id),
    ]);
    if (result[0].meta.changes !== 1) throw new PortalHttpError(409, "The asset or your access changed before the tag was linked. Refresh and confirm again.");
    return Response.json({ label: { id, assetId: asset.id, labelCode: code.value, status: "active" }, reused: false }, { status: 201, headers });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...assetManageRoles]);
    const input = z.object({ assetId: z.string().min(1), labelId: z.string().min(1), reason: z.string().trim().min(5).max(500) }).parse(await request.json());
    await requireAssetIdentity(input.assetId, identity);
    const label = await env.DB.prepare("SELECT status FROM asset_labels WHERE id = ? AND organization_id = ? AND asset_id = ?")
      .bind(input.labelId, TECHFLEX_ORG_ID, input.assetId).first<{ status: string }>();
    if (!label) throw new PortalHttpError(404, "Label not found.");
    if (label.status === "retired") return Response.json({ retired: true, reused: true }, { headers });
    const auditId = crypto.randomUUID();
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO audit_logs(id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
        SELECT ?, ?, ?, 'asset_label.retired', 'asset', ?, ? WHERE EXISTS
          (SELECT 1 FROM asset_labels WHERE id = ? AND organization_id = ? AND asset_id = ? AND status = 'active') AND ${membership}`)
        .bind(auditId, TECHFLEX_ORG_ID, identity.userId, input.assetId, JSON.stringify({ labelId: input.labelId, reason: input.reason }),
          input.labelId, TECHFLEX_ORG_ID, input.assetId, TECHFLEX_ORG_ID, identity.userId),
      env.DB.prepare(`UPDATE asset_labels SET status='retired', retired_at=CURRENT_TIMESTAMP, retired_by=?, retirement_reason=?
        WHERE id=? AND organization_id=? AND asset_id=? AND EXISTS (SELECT 1 FROM audit_logs WHERE id=?)`)
        .bind(identity.userId, input.reason, input.labelId, TECHFLEX_ORG_ID, input.assetId, auditId),
    ]);
    if (result[0].meta.changes !== 1) throw new PortalHttpError(409, "The label or your access changed. Refresh before trying again.");
    return Response.json({ retired: true, reused: false }, { headers });
  } catch (error) { return failure(error); }
}
