import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID, PortalHttpError, type PortalIdentity } from "./portal-auth";
import { spinlifeData, spinlifeVisitSchema, type SpinLifeJob, type SpinLifeJobSummary } from "./spinlife-simple";

export const spinlifeAdminRoles = ["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead", "finance"] as const;
export const spinlifeRoles = [...spinlifeAdminRoles, "technician"] as const;
export const privateHeaders = { "Cache-Control": "private, no-store" };
const select = `SELECT i.id, i.external_id AS externalId, i.status, i.data_json AS dataJson, i.record_version AS intakeVersion,
  v.record_version AS version, v.technician_id AS technicianId, v.technician_pay_cents AS technicianPayCents,
  v.scheduled_start AS scheduledStart, v.started_at AS startedAt, v.documented_at AS documentedAt,
  v.visit_json AS visitJson, v.last_mutation_id AS lastMutationId,
  COALESCE(u.display_name,t.technician_code) AS technicianName,
  p.attachment_id AS packetAttachmentId, p.source_version AS packetSourceVersion
  FROM work_order_intakes i LEFT JOIN spinlife_visits v ON v.intake_id=i.id
  LEFT JOIN technicians t ON t.id=v.technician_id AND t.organization_id=i.organization_id
  LEFT JOIN users u ON u.id=t.user_id
  LEFT JOIN spinlife_packets p ON p.intake_id=i.id AND p.source_version=(SELECT MAX(p2.source_version) FROM spinlife_packets p2 WHERE p2.intake_id=i.id)
  WHERE i.organization_id=? AND lower(replace(i.source,' ',''))='spinlife'
  AND i.converted_work_order_id IS NULL AND i.status NOT IN ('archived','converted')`;
type Row = Omit<SpinLifeJob,"data"|"visit"> & { dataJson:string; visitJson:string|null; externalId:string|null };
function view(row: Row): SpinLifeJob {
  const {dataJson,visitJson,externalId,...rest}=row;
  return {...rest,version:row.version || 0,data:spinlifeData({...JSON.parse(dataJson),externalId:externalId || ""}),visit:spinlifeVisitSchema.parse(JSON.parse(visitJson || "{}"))};
}
export async function spinlifeJobs(identity: PortalIdentity, id?: string) {
  const filter = identity.role === "technician" ? " AND v.technician_id=?" : "";
  const args: (string|null)[] = [TECHFLEX_ORG_ID];
  if(identity.role === "technician") args.push(identity.technicianId);
  if(id) args.push(id);
  const result=await env.DB.prepare(`${select}${filter}${id?" AND i.id=?":""} ORDER BY i.updated_at DESC LIMIT 300`).bind(...args).all<Row>();
  return result.results.map(view);
}
export async function spinlifeJob(identity: PortalIdentity,id:string) {
  const job=(await spinlifeJobs(identity,id))[0];
  if(!job) throw new PortalHttpError(404,"Work order not found or not assigned to you.");
  return job;
}
/** Lists never hydrate notes, source documents, procedure answers or photo captions. */
export async function spinlifeJobSummaries(identity: PortalIdentity) {
  const filter = identity.role === "technician" ? " AND v.technician_id=?" : "";
  const args = identity.role === "technician" ? [TECHFLEX_ORG_ID, identity.technicianId] : [TECHFLEX_ORG_ID];
  const result = await env.DB.prepare(`SELECT i.id,i.external_id AS externalId,i.status,
    COALESCE(v.record_version,0) AS version,v.technician_id AS technicianId,
    v.technician_pay_cents AS technicianPayCents,v.scheduled_start AS scheduledStart,v.started_at AS startedAt,
    COALESCE(u.display_name,t.technician_code) AS technicianName,
    (SELECT MAX(p.source_version) FROM spinlife_packets p WHERE p.intake_id=i.id) AS packetSourceVersion,
    json_extract(i.data_json,'$.customerName') AS customerName,
    json_extract(i.data_json,'$.serviceType') AS serviceType,
    json_extract(i.data_json,'$.serviceAddress') AS serviceAddress
    FROM work_order_intakes i LEFT JOIN spinlife_visits v ON v.intake_id=i.id
    LEFT JOIN technicians t ON t.id=v.technician_id AND t.organization_id=i.organization_id
    LEFT JOIN users u ON u.id=t.user_id
    WHERE i.organization_id=? AND lower(replace(i.source,' ',''))='spinlife'
      AND i.converted_work_order_id IS NULL AND i.status NOT IN ('archived','converted')${filter}
    ORDER BY i.updated_at DESC,i.id LIMIT 300`).bind(...args).all<{
      id:string;externalId:string|null;status:string;version:number;technicianId:string|null;technicianName:string|null;
      technicianPayCents:number|null;scheduledStart:string|null;startedAt:string|null;packetSourceVersion:number|null;
      customerName:string|null;serviceType:unknown;serviceAddress:string|null;
    }>();
  return result.results.map(({externalId,customerName,serviceType,serviceAddress,...row}):SpinLifeJobSummary => {
    const valid=spinlifeData({serviceType});
    return {...row,data:{externalId:externalId||"",customerName:customerName||"",serviceType:valid.serviceType,serviceAddress:serviceAddress||""}};
  });
}
export function versionGuard(id:string, version:number, technicianId:string|null, identity:PortalIdentity) {
  return env.DB.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM spinlife_visits v JOIN work_order_intakes i ON i.id=v.intake_id
    WHERE i.id=? AND i.organization_id=? AND v.record_version=?
      AND i.converted_work_order_id IS NULL AND i.status NOT IN ('archived','converted')
      AND (?=0 OR v.technician_id=?)) THEN 1 ELSE json('spinlife_version_conflict') END`)
    .bind(id,TECHFLEX_ORG_ID,version,identity.role==="technician"?1:0,technicianId);
}
export function spinlifeAudit(identity:PortalIdentity,id:string,action:string,before:unknown,after:unknown) {
  return env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
    VALUES (?,?,?,?, 'work_order_intake',?,?,?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,action,id,JSON.stringify(before),JSON.stringify(after));
}
