import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID, PortalHttpError, type PortalIdentity } from "@/lib/portal-auth";
import type { ScannedAsset } from "@/lib/asset-scanning";

export const assetReadRoles = ["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead", "technician", "auditor"] as const;
export const assetManageRoles = ["owner_administrator", "operations_administrator", "biomedical_lead"] as const;

export const assetIdentitySql = `SELECT s.id, s.asset_tag AS assetTag, s.customer_asset_id AS customerAssetId,
  s.category_id AS categoryId,s.category_revision_id AS categoryRevisionId,cr.name AS categoryName,cr.revision AS categoryRevision,
  s.manufacturer, s.model, s.serial_number AS serialNumber, s.description, s.room, s.configuration,
  s.software_version AS softwareVersion, s.risk_class AS riskClass, s.status,
  s.last_pm_on AS lastPmOn, s.next_pm_due_on AS nextPmDueOn, s.pm_interval_months AS pmIntervalMonths,
  s.record_version AS recordVersion, a.id AS accountId, a.name AS accountName, l.id AS locationId,
  l.name AS locationName, l.city, l.state, s.department_id AS departmentId, d.name AS departmentName
  FROM assets s JOIN accounts a ON a.id = s.account_id AND a.organization_id = s.organization_id
  JOIN locations l ON l.id = s.location_id AND l.account_id = s.account_id
  LEFT JOIN departments d ON d.id = s.department_id AND d.location_id = s.location_id
  LEFT JOIN asset_category_revisions cr ON cr.id=s.category_revision_id AND cr.category_id=s.category_id AND cr.organization_id=s.organization_id
  WHERE s.id = ? AND s.organization_id = ? AND a.status = 'active' AND l.status = 'active'`;

export const ownAssetAssignmentSql = `SELECT wa.id FROM work_order_assignments wa
  JOIN work_orders w ON w.id = wa.work_order_id
  JOIN technicians t ON t.id = wa.technician_id AND t.organization_id = w.organization_id
  WHERE (w.asset_id = ? OR EXISTS(SELECT 1 FROM work_order_assets waa WHERE waa.work_order_id=w.id AND waa.organization_id=w.organization_id AND waa.asset_id=?))
    AND w.organization_id = ? AND w.account_id = ? AND w.location_id = ?
    AND t.id = ? AND t.user_id = ? AND t.status = 'active'
    AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')`;

export async function requireAssetIdentity(assetId: string, identity: PortalIdentity): Promise<ScannedAsset> {
  const asset = await env.DB.prepare(assetIdentitySql).bind(assetId, TECHFLEX_ORG_ID).first<ScannedAsset>();
  if (!asset) throw new PortalHttpError(404, "No accessible asset matches this tag. Check the label and your assigned facility.");
  if (identity.role === "technician") {
    const assigned = identity.technicianId && await env.DB.prepare(ownAssetAssignmentSql)
      .bind(asset.id, asset.id, TECHFLEX_ORG_ID, asset.accountId, asset.locationId, identity.technicianId, identity.userId).first();
    if (!assigned) throw new PortalHttpError(404, "No accessible asset matches this tag. Check the label and your assigned facility.");
  }
  return asset;
}
