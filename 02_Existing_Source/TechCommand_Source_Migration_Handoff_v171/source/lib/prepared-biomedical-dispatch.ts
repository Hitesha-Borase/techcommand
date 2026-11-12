import { env } from "cloudflare:workers";
import { PortalHttpError, TECHFLEX_ORG_ID, type PortalIdentity } from "./portal-auth";
import { parseDisciplines } from "./service-disciplines";
import { trainingAssignmentError } from "./training-dispatch";

// Owner-requested preparation only. GET never creates business records. The
// signed-in administrator must submit POST before either assignment exists.
export const preparedBiomedicalDispatch = {
  key: "jim-cataloging-2026-09-17",
  technicianId: "03178620-122f-4482-97d7-8a626b3e4a5f",
  technicianEmail: "jmadigan45@yahoo.com",
  technicianName: "Jim Madigan",
  serviceDate: "2026-09-17",
  timezone: "America/New_York",
  stops: [
    { accountId: "dee490c5-5cc8-4558-9a5e-448db182729d", locationId: "163b34e5-4521-4bbb-b64c-f6a61c2eadb1", externalId: "TF-BIO-CATALOG-20260917-WFS-JM", start: "2026-09-17T13:30:00.000Z", timing: "September 17, 9:30 a.m. Eastern" },
    { accountId: "849106a9-8ded-4dfc-80c7-4217d6d1e045", locationId: "427328fb-107a-49fc-8e63-32329bc0f813", externalId: "TF-BIO-CATALOG-20260917-OAP-JM", start: null, timing: "September 17, after White Fence; arrival time to be set" },
  ],
} as const;

const source = "prepared_biomedical_dispatch";
const activeAssignments = "('offered','assigned','accepted','dispatched','arrived','submitted')";
type Existing = { id: string; externalId: string; status: string; scheduledStart: string | null; accountId: string; locationId: string; technicianId: string | null; assetCount: number };
type Asset = { id: string; version: number };

async function existingOrders(): Promise<Existing[]> {
  const result = await env.DB.prepare(`SELECT w.id, w.external_id AS externalId, w.status,
    w.scheduled_start AS scheduledStart, w.account_id AS accountId, w.location_id AS locationId,
    (SELECT wa.technician_id FROM work_order_assignments wa WHERE wa.work_order_id=w.id
      AND wa.role='primary' AND wa.status IN ${activeAssignments} LIMIT 1) AS technicianId,
    (SELECT count(*) FROM work_order_assets x WHERE x.work_order_id=w.id AND x.organization_id=w.organization_id) AS assetCount
    FROM work_orders w WHERE w.organization_id=? AND w.external_source=? AND w.external_id IN (?,?)`)
    .bind(TECHFLEX_ORG_ID, source, ...preparedBiomedicalDispatch.stops.map(s => s.externalId)).all<Existing>();
  return result.results;
}

async function resolvedPlan() {
  const plan = preparedBiomedicalDispatch;
  const technician = await env.DB.prepare(`SELECT t.id, t.service_disciplines_json AS disciplines
    FROM technicians t JOIN users u ON u.id=t.user_id AND u.status='active'
    WHERE t.id=? AND t.organization_id=? AND t.status='active' AND lower(u.email)=?
      AND EXISTS (SELECT 1 FROM memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
        WHERE m.user_id=u.id AND m.organization_id=t.organization_id AND m.status='active' AND r.name='technician')`)
    .bind(plan.technicianId, TECHFLEX_ORG_ID, plan.technicianEmail).first<{id: string; disciplines: string | null}>();
  if (!technician || !parseDisciplines(technician.disciplines).includes("biomedical"))
    throw new PortalHttpError(409, "Jim's active Biomedical/PM profile could not be verified. Review Service capabilities and his exact login email in Technicians before assigning.");
  const trainingError = await trainingAssignmentError(plan.technicianId, "", "primary");
  if (trainingError) throw new PortalHttpError(409, trainingError);
  const stops = [];
  for (const stop of plan.stops) {
    const facility = await env.DB.prepare(`SELECT a.name, l.address_1 AS address1, l.address_2 AS address2, l.city, l.state, l.postal_code AS postalCode
      FROM accounts a JOIN locations l ON l.account_id=a.id WHERE a.id=? AND l.id=? AND a.organization_id=?
        AND a.status='active' AND l.status='active' AND a.service_discipline='biomedical'`)
      .bind(stop.accountId, stop.locationId, TECHFLEX_ORG_ID).first<{name: string; address1: string; address2: string; city: string; state: string; postalCode: string}>();
    if (!facility) throw new PortalHttpError(409, "A prepared facility is unavailable or no longer classified Biomedical/PM. Review its saved account before assigning.");
    const assets = (await env.DB.prepare(`SELECT id, record_version AS version FROM assets WHERE organization_id=? AND account_id=? AND location_id=?
      AND status NOT IN ('retired','inventory_reference') ORDER BY asset_tag,id`)
      .bind(TECHFLEX_ORG_ID, stop.accountId, stop.locationId).all<Asset>()).results;
    if (!assets.length) throw new PortalHttpError(409, `${facility.name} has no available equipment. Refresh its saved inventory before assigning.`);
    stops.push({ ...stop, name: facility.name, address: [facility.address1,facility.address2,facility.city,facility.state,facility.postalCode].filter(Boolean).join(", "), assets });
  }
  return { ...plan, disciplines: technician.disciplines, stops };
}

export async function readPreparedBiomedicalDispatch() {
  const plan = await resolvedPlan();
  const saved = await existingOrders();
  return { key: plan.key, technicianName: plan.technicianName, serviceDate: plan.serviceDate, timezone: plan.timezone,
    alreadySaved: saved.length === plan.stops.length,
    stops: plan.stops.map(({assets, ...stop}) => ({...stop, assetCount: assets.length, workOrder: saved.find(w => w.externalId === stop.externalId) || null})),
    billingNote: "Record actual time separately for each facility. Annual PM is already covered; cataloging is not a separate hourly line in the signed terms. Additional charges require agreement/authorization review. No invoice or technician pay is created by assigning.",
  };
}

export async function savePreparedBiomedicalDispatch(identity: PortalIdentity) {
  const plan = await resolvedPlan();
  const saved = await existingOrders();
  if (saved.length === plan.stops.length) return readPreparedBiomedicalDispatch();
  if (saved.length) throw new PortalHttpError(409, "One prepared work order already exists. Open it in Work Orders before continuing; no additional job was created.");
  if (new Date().toISOString() >= "2026-09-18T04:00:00.000Z")
    throw new PortalHttpError(409, "The September 17 visit date has passed. Use Work Orders to schedule a new date; this prepared assignment was not created.");
  const statements = [env.DB.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id AND u.status='active'
    WHERE t.id=? AND t.organization_id=? AND t.status='active' AND lower(u.email)=?
      AND t.service_disciplines_json IS ? AND EXISTS (SELECT 1 FROM memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
        WHERE m.user_id=u.id AND m.organization_id=t.organization_id AND m.status='active' AND r.name='technician')
      AND NOT EXISTS (SELECT 1 FROM training_placements p WHERE p.technician_id=t.id AND p.organization_id=t.organization_id AND p.status IN ('active','paused'))
    ) THEN 1 ELSE json('prepared_dispatch_changed') END`).bind(plan.technicianId, TECHFLEX_ORG_ID, plan.technicianEmail, plan.disciplines)];
  for (const [index, stop] of plan.stops.entries()) {
    const conflict = await env.DB.prepare(`SELECT w.external_id AS externalId FROM work_orders w JOIN work_order_assignments wa ON wa.work_order_id=w.id
      WHERE w.organization_id=? AND w.account_id=? AND w.location_id=? AND wa.technician_id=? AND wa.status IN ${activeAssignments}
        AND w.status NOT IN ('cancelled','canceled','completed') AND w.service_type LIKE 'biomed%'
        AND (date(w.scheduled_start,'-4 hours')=? OR w.description LIKE ?) LIMIT 1`)
      .bind(TECHFLEX_ORG_ID, stop.accountId, stop.locationId, plan.technicianId, plan.serviceDate, `%Planned service date: ${plan.serviceDate}%`).first<{externalId:string}>();
    if (conflict) throw new PortalHttpError(409, `${stop.name} already has a Biomedical/PM job for Jim on September 17 (${conflict.externalId}). Open that job in Work Orders; no duplicate was created.`);
    statements.push(env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM locations l JOIN accounts a ON a.id=l.account_id
      WHERE l.id=? AND a.id=? AND a.organization_id=? AND l.status='active' AND a.status='active' AND a.service_discipline='biomedical')
      AND (SELECT count(*) FROM assets WHERE organization_id=? AND account_id=? AND location_id=? AND status NOT IN ('retired','inventory_reference'))=?
      AND (SELECT count(*) FROM assets a JOIN json_each(?) j ON a.id=json_extract(j.value,'$.id') AND a.record_version=json_extract(j.value,'$.version')
        WHERE a.organization_id=? AND a.account_id=? AND a.location_id=? AND a.status NOT IN ('retired','inventory_reference'))=?
      AND NOT EXISTS (SELECT 1 FROM work_orders w JOIN work_order_assignments wa ON wa.work_order_id=w.id
        WHERE w.organization_id=? AND w.account_id=? AND w.location_id=? AND wa.technician_id=? AND wa.status IN ${activeAssignments}
          AND w.status NOT IN ('cancelled','canceled','completed') AND w.service_type LIKE 'biomed%'
          AND (date(w.scheduled_start,'-4 hours')=? OR w.description LIKE ?))
      THEN 1 ELSE json('prepared_dispatch_changed') END`)
      .bind(stop.locationId, stop.accountId, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, stop.accountId, stop.locationId, stop.assets.length,
        JSON.stringify(stop.assets), TECHFLEX_ORG_ID, stop.accountId, stop.locationId, stop.assets.length,
        TECHFLEX_ORG_ID, stop.accountId, stop.locationId, plan.technicianId, plan.serviceDate, `%Planned service date: ${plan.serviceDate}%`));
    const workOrderId = crypto.randomUUID();
    const instructions = [
      `Planned service date: ${plan.serviceDate}. ${stop.timing}. Stop ${index+1} of 2.`,
      "Catalog the facility equipment and perform only applicable, authorized preventive-maintenance work. Verify each original tag, manufacturer, model, serial and location; retain discrepancies for review rather than merging records.",
      "Open each asset, review the exact-model manufacturer reference and applicability, then document the actual procedure steps, measurements, test conditions, findings and any parts/follow-up needed. Missing references or unfinished work remain explicit. Save each asset and move to the next.",
      "Record total actual on-site minutes for this facility in Review > Actual on-site time (minutes). Do not include the other facility or travel. Save progress even when incomplete.",
      "Generate the branded asset reports and send the completed work for administrator review. This assignment does not certify inspection, create a signed report, authorize a repair or set technician pay.",
    ];
    statements.push(env.DB.prepare(`INSERT INTO work_orders (id,organization_id,account_id,location_id,external_source,external_id,service_type,priority,status,summary,description,required_technician_count,scheduled_start,required_skills_json)
      VALUES (?,?,?,?,?,?,'biomed_cataloging','normal','assigned',?,?,1,?,?)`)
      .bind(workOrderId,TECHFLEX_ORG_ID,stop.accountId,stop.locationId,source,stop.externalId,`Cataloging and PM assessment — ${stop.name}`,instructions.join("\n\n"),stop.start,JSON.stringify({instructions})));
    statements.push(env.DB.prepare(`INSERT INTO work_order_assignments (id,work_order_id,technician_id,role,status) VALUES (?,?,?,'primary','assigned')`)
      .bind(crypto.randomUUID(),workOrderId,plan.technicianId));
    statements.push(env.DB.prepare(`INSERT INTO work_order_assets (id,organization_id,work_order_id,asset_id,status,updated_by)
      SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.assetId'),'not_started',? FROM json_each(?)`)
      .bind(TECHFLEX_ORG_ID,workOrderId,identity.userId,JSON.stringify(stop.assets.map(asset=>({id:crypto.randomUUID(),assetId:asset.id})))));
    const details = JSON.stringify({planKey:plan.key,technicianId:plan.technicianId,accountId:stop.accountId,locationId:stop.locationId,plannedDate:plan.serviceDate,scheduledStart:stop.start,stopOrder:index+1,assetIds:stop.assets.map(a=>a.id),billingCreated:false,technicianPaySet:false});
    statements.push(env.DB.prepare(`INSERT INTO work_order_events (id,work_order_id,event_type,actor_user_id,source,payload_json) VALUES (?,?,'biomedical.round_assigned',?,?,?)`)
      .bind(crypto.randomUUID(),workOrderId,identity.userId,source,details));
    statements.push(env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json,request_id) VALUES (?,?,?,'biomedical.round_assigned','work_order',?,?,?)`)
      .bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,workOrderId,details,plan.key));
  }
  try { await env.DB.batch(statements); }
  catch (error) {
    if ((await existingOrders()).length === plan.stops.length) return readPreparedBiomedicalDispatch();
    if (String(error).includes("malformed JSON") || String(error).includes("prepared_dispatch_changed"))
      throw new PortalHttpError(409,"The technician, inventory or schedule changed while saving. Refresh this preparation and review the current jobs. Neither assignment was partially saved.");
    throw new PortalHttpError(503,"The assignment save could not be confirmed. Refresh the prepared visit before retrying; the same save reference prevents duplicate jobs.");
  }
  return readPreparedBiomedicalDispatch();
}
