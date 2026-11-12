import { env } from "cloudflare:workers";
import { z } from "zod";
import { assetManageRoles, assetReadRoles, requireAssetIdentity } from "@/lib/asset-access";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const updateSchema = z.object({
  requestId: z.string().uuid(),
  assetId: z.string().min(1),
  expectedRecordVersion: z.number().int().positive(),
  accountId: z.string().min(1),
  locationId: z.string().min(1),
  departmentId: z.string().min(1).nullable().optional(),
  room: z.string().trim().max(120).nullable().optional(),
  configuration: z.string().trim().max(500).nullable().optional(),
  softwareVersion: z.string().trim().max(160).nullable().optional(),
  reason: z.string().trim().min(5).max(1000),
});

type PlacementInput = z.infer<typeof updateSchema>;
const clean = (value?: string | null) => value?.trim() || null;
async function fingerprint(input: PlacementInput) {
  const payload = JSON.stringify({
    assetId: input.assetId,
    expectedRecordVersion: input.expectedRecordVersion,
    accountId: input.accountId,
    locationId: input.locationId,
    departmentId: input.departmentId || null,
    room: clean(input.room),
    configuration: clean(input.configuration),
    softwareVersion: clean(input.softwareVersion),
    reason: input.reason.trim(),
  });
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

const eventSql = `SELECT e.id,e.asset_id AS assetId,e.request_id AS requestId,e.request_fingerprint AS requestFingerprint,
  e.from_account_id AS fromAccountId,fa.name AS fromAccountName,e.from_location_id AS fromLocationId,fl.name AS fromLocationName,
  e.from_department_id AS fromDepartmentId,fd.name AS fromDepartmentName,e.from_room AS fromRoom,
  e.from_configuration AS fromConfiguration,e.from_software_version AS fromSoftwareVersion,
  e.to_account_id AS toAccountId,ta.name AS toAccountName,e.to_location_id AS toLocationId,tl.name AS toLocationName,
  e.to_department_id AS toDepartmentId,td.name AS toDepartmentName,e.to_room AS toRoom,
  e.to_configuration AS toConfiguration,e.to_software_version AS toSoftwareVersion,
  e.reason,e.asset_version AS assetVersion,e.created_at AS createdAt,COALESCE(u.display_name,u.email) AS changedBy
  FROM asset_placement_events e
  JOIN accounts fa ON fa.id=e.from_account_id JOIN locations fl ON fl.id=e.from_location_id
  JOIN accounts ta ON ta.id=e.to_account_id JOIN locations tl ON tl.id=e.to_location_id
  LEFT JOIN departments fd ON fd.id=e.from_department_id LEFT JOIN departments td ON td.id=e.to_department_id
  JOIN users u ON u.id=e.changed_by`;

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...assetReadRoles]);
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (!assetId) return Response.json({ error: "Select an asset." }, { status: 400 });
    const asset = await requireAssetIdentity(assetId, identity);
    const history = await env.DB.prepare(`${eventSql} WHERE e.organization_id=? AND e.asset_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 200`)
      .bind(TECHFLEX_ORG_ID, assetId).all();
    const canManage = (assetManageRoles as readonly string[]).includes(identity.role);
    if (!canManage) return Response.json({ asset, history: history.results, options: null }, { headers: privateNoStore });
    const [accounts, locations, departments] = await Promise.all([
      env.DB.prepare("SELECT id,name FROM accounts WHERE organization_id=? AND status='active' ORDER BY name").bind(TECHFLEX_ORG_ID).all(),
      env.DB.prepare("SELECT l.id,l.account_id AS accountId,l.name FROM locations l JOIN accounts a ON a.id=l.account_id AND a.organization_id=? WHERE l.status='active' AND a.status='active' ORDER BY a.name,l.name").bind(TECHFLEX_ORG_ID).all(),
      env.DB.prepare("SELECT d.id,d.location_id AS locationId,d.name FROM departments d JOIN locations l ON l.id=d.location_id JOIN accounts a ON a.id=l.account_id AND a.organization_id=? WHERE d.status='active' AND l.status='active' AND a.status='active' ORDER BY d.name").bind(TECHFLEX_ORG_ID).all(),
    ]);
    return Response.json({ asset, history: history.results, options: { accounts: accounts.results, locations: locations.results, departments: departments.results } }, { headers: privateNoStore });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  let replayInput: PlacementInput | null = null;
  let replayDigest = "";
  try {
    const identity = await requirePortalRole(request, [...assetManageRoles]);
    const input = updateSchema.parse(await request.json());
    const digest = await fingerprint(input);
    replayInput = input;
    replayDigest = digest;
    const replay = await env.DB.prepare("SELECT id,request_fingerprint AS requestFingerprint,asset_id AS assetId,asset_version AS assetVersion FROM asset_placement_events WHERE organization_id=? AND request_id=?")
      .bind(TECHFLEX_ORG_ID, input.requestId).first<{id:string;requestFingerprint:string;assetId:string;assetVersion:number}>();
    if (replay) {
      if (replay.requestFingerprint !== digest || replay.assetId !== input.assetId) return Response.json({ error: "This request identity was already used for different asset details." }, { status: 409 });
      return Response.json({ movement: replay, replayed: true });
    }
    const asset = await requireAssetIdentity(input.assetId, identity);
    if (asset.recordVersion !== input.expectedRecordVersion) return Response.json({ error: "The asset changed in another tab. Refresh its lifetime record before saving." }, { status: 409 });
    const departmentId = input.departmentId || null;
    const room = clean(input.room), configuration = clean(input.configuration), softwareVersion = clean(input.softwareVersion);
    const changed = asset.accountId !== input.accountId || asset.locationId !== input.locationId || asset.departmentId !== departmentId || asset.room !== room || asset.configuration !== configuration || asset.softwareVersion !== softwareVersion;
    if (!changed) return Response.json({ error: "Record a changed facility, department, room, configuration, or software version." }, { status: 400 });
    const id = crypto.randomUUID();
    const scopeGuard = `EXISTS(SELECT 1 FROM accounts a JOIN locations l ON l.account_id=a.id
      WHERE a.id=? AND a.organization_id=? AND a.status='active' AND l.id=? AND l.status='active'
      AND (? IS NULL OR EXISTS(SELECT 1 FROM departments d WHERE d.id=? AND d.location_id=l.id AND d.status='active')))`;
    const openWork = `EXISTS(SELECT 1 FROM work_orders w WHERE w.organization_id=?
      AND w.status NOT IN ('ready_to_invoice','completed','approved','invoiced','paid','cancelled','closed')
      AND (w.asset_id=? OR EXISTS(SELECT 1 FROM work_order_assets wa WHERE wa.work_order_id=w.id AND wa.asset_id=?)))`;
    const destination = await env.DB.prepare(`SELECT CASE WHEN ${scopeGuard} THEN 1 ELSE 0 END AS valid`).bind(input.accountId, TECHFLEX_ORG_ID, input.locationId, departmentId, departmentId).first<{valid:number}>();
    if (!destination?.valid) return Response.json({ error: "Select an active account and its facility. Any department must belong to that facility." }, { status: 409 });
    const activeWork = await env.DB.prepare(`SELECT CASE WHEN ${openWork} THEN 1 ELSE 0 END AS active`).bind(TECHFLEX_ORG_ID, input.assetId, input.assetId).first<{active:number}>();
    if (activeWork?.active) return Response.json({ error: "Finish or cancel the asset's open work before changing its placement or configuration." }, { status: 409 });
    const before = {
      accountId: asset.accountId, locationId: asset.locationId,
      departmentId: asset.departmentId || null,
      room: asset.room || null, configuration: asset.configuration || null, softwareVersion: asset.softwareVersion || null,
    };
    await env.DB.batch([
      env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM assets WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('asset_placement_changed') END").bind(input.assetId, TECHFLEX_ORG_ID, input.expectedRecordVersion),
      env.DB.prepare(`SELECT CASE WHEN ${scopeGuard} THEN 1 ELSE json('asset_placement_scope_changed') END`).bind(input.accountId, TECHFLEX_ORG_ID, input.locationId, departmentId, departmentId),
      env.DB.prepare(`SELECT CASE WHEN NOT ${openWork} THEN 1 ELSE json('asset_placement_open_work') END`).bind(TECHFLEX_ORG_ID, input.assetId, input.assetId),
      env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_placement_events WHERE organization_id=? AND request_id=?) THEN 1 ELSE json('asset_placement_request_conflict') END").bind(TECHFLEX_ORG_ID, input.requestId),
      env.DB.prepare(`INSERT INTO asset_placement_events
        (id,organization_id,asset_id,request_id,request_fingerprint,from_account_id,from_location_id,from_department_id,from_room,from_configuration,from_software_version,to_account_id,to_location_id,to_department_id,to_room,to_configuration,to_software_version,reason,asset_version,changed_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, TECHFLEX_ORG_ID, input.assetId, input.requestId, digest, before.accountId, before.locationId, before.departmentId, before.room, before.configuration, before.softwareVersion, input.accountId, input.locationId, departmentId, room, configuration, softwareVersion, input.reason.trim(), input.expectedRecordVersion + 1, identity.userId),
      env.DB.prepare(`UPDATE assets SET account_id=?,location_id=?,department_id=?,room=?,configuration=?,software_version=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?`).bind(input.accountId, input.locationId, departmentId, room, configuration, softwareVersion, input.assetId, TECHFLEX_ORG_ID, input.expectedRecordVersion),
      env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,'asset.placement_changed','asset',?,?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, input.assetId, JSON.stringify(before), JSON.stringify({ accountId: input.accountId, locationId: input.locationId, departmentId, room, configuration, softwareVersion, reason: input.reason.trim(), requestId: input.requestId })),
    ]);
    return Response.json({ movement: { id, assetId: input.assetId, assetVersion: input.expectedRecordVersion + 1 }, replayed: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the asset placement fields.", details: error.flatten() }, { status: 400 });
    const message = error instanceof Error ? error.message : "";
    if (/asset_placement_open_work/.test(message)) return Response.json({ error: "Finish or cancel the asset's open work before changing its placement or configuration." }, { status: 409 });
    if (/asset_placement_scope_changed/.test(message)) return Response.json({ error: "The destination account, facility, or department changed. Refresh and try again." }, { status: 409 });
    if (/asset_placement_changed|asset_placement_request_conflict|UNIQUE constraint failed: asset_placement_events|malformed JSON/.test(message)) {
      if (replayInput) {
        const replay = await env.DB.prepare("SELECT id,request_fingerprint AS requestFingerprint,asset_id AS assetId,asset_version AS assetVersion FROM asset_placement_events WHERE organization_id=? AND request_id=?").bind(TECHFLEX_ORG_ID, replayInput.requestId).first<{id:string;requestFingerprint:string;assetId:string;assetVersion:number}>();
        if (replay && replay.requestFingerprint === replayDigest && replay.assetId === replayInput.assetId) return Response.json({ movement: replay, replayed: true });
      }
      return Response.json({ error: "The asset changed in another tab. Refresh its lifetime record before saving." }, { status: 409 });
    }
    return apiError(error);
  }
}
