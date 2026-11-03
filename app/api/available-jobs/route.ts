import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,requirePortalRole,TECHFLEX_ORG_ID,PortalHttpError} from "@/lib/portal-auth";
import {parseDisciplines,jobDiscipline} from "@/lib/service-disciplines";
import {trainingAssignmentError} from "@/lib/training-dispatch";
const headers={"Cache-Control":"private, no-store"};
const active="('offered','assigned','accepted','dispatched','arrived','submitted','in_progress')";
const scope=`FROM work_orders w JOIN accounts c ON c.id=w.account_id AND c.organization_id=w.organization_id AND c.status='active' JOIN locations l ON l.id=w.location_id AND l.account_id=c.id AND l.status='active' WHERE w.organization_id=? AND w.status='ready_to_assign' AND w.required_technician_count=1 AND NOT EXISTS(SELECT 1 FROM service_reports sr WHERE sr.work_order_id=w.id) AND NOT EXISTS(SELECT 1 FROM work_order_assignments a WHERE a.work_order_id=w.id AND a.status IN ${active})`;
async function technician(request:Request){
 const identity=await requirePortalRole(request,["technician", "owner_administrator", "operations_administrator"]);
 if(!identity.technicianId){
  return {identity,disciplines:["biomedical","dme_mobility"]};
 }
 const row=await env.DB.prepare("SELECT service_disciplines_json AS disciplines FROM technicians WHERE id=? AND user_id=? AND organization_id=? AND status='active'").bind(identity.technicianId,identity.userId,TECHFLEX_ORG_ID).first<{disciplines:string|null}>();
 if(!row)return {identity,disciplines:["biomedical","dme_mobility"]};
 return {identity,disciplines:parseDisciplines(row.disciplines)};
}
export async function GET(request:Request){try{
 const {disciplines}=await technician(request);
 const result=await env.DB.prepare(`SELECT w.id,w.external_id AS externalId,w.service_type AS serviceType,w.summary,c.name AS accountName,l.name AS locationName,l.city,l.state,w.scheduled_start AS scheduledStart ${scope} ORDER BY w.created_at LIMIT 100`).bind(TECHFLEX_ORG_ID).all<{id:string;serviceType:string}>();
 return Response.json({jobs:result.results.filter(job=>disciplines.includes(jobDiscipline(job.serviceType)))},{headers});
}catch(error){const response=apiError(error);response.headers.set("Cache-Control",headers["Cache-Control"]);return response;}}
export async function POST(request:Request){try{
 const {identity,disciplines}=await technician(request);
 if(!identity.technicianId)throw new PortalHttpError(403,"An active technician profile is needed to claim work.");
 const {workOrderId}=z.object({workOrderId:z.string().min(1).max(160)}).strict().parse(await request.json());
 const own=await env.DB.prepare(`SELECT w.id FROM work_order_assignments a JOIN work_orders w ON w.id=a.work_order_id AND w.organization_id=? WHERE w.id=? AND a.technician_id=? AND a.status IN ${active}`).bind(TECHFLEX_ORG_ID,workOrderId,identity.technicianId).first();
 if(own)return Response.json({workOrderId,assigned:true},{headers});
 const job=await env.DB.prepare(`SELECT w.service_type AS serviceType ${scope} AND w.id=?`).bind(TECHFLEX_ORG_ID,workOrderId).first<{serviceType:string}>();
 if(!job)throw new PortalHttpError(409,"This job was already assigned or is no longer available. Refresh available jobs; your other work is unchanged.");
 if(!disciplines.includes(jobDiscipline(job.serviceType)))throw new PortalHttpError(403,"This job needs a different service capability.");
 const trainingError=await trainingAssignmentError(identity.technicianId!,workOrderId,"primary");if(trainingError)throw new PortalHttpError(409,trainingError);
 try{await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 ${scope} AND w.id=? AND w.service_type=? AND EXISTS(SELECT 1 FROM technicians t,json_each(t.service_disciplines_json) d WHERE t.id=? AND t.organization_id=w.organization_id AND t.user_id=? AND t.status='active' AND d.value=?)) THEN 1 ELSE json('claim_conflict') END`).bind(TECHFLEX_ORG_ID,workOrderId,job.serviceType,identity.technicianId,identity.userId,jobDiscipline(job.serviceType)),
  env.DB.prepare("INSERT INTO work_order_assignments(id,work_order_id,technician_id,role,status,responded_at) VALUES (?,?,?,'primary','assigned',CURRENT_TIMESTAMP) ON CONFLICT(work_order_id,technician_id) DO UPDATE SET role='primary',status='assigned',responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP").bind(crypto.randomUUID(),workOrderId,identity.technicianId),
  env.DB.prepare("UPDATE work_orders SET status='assigned',record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(workOrderId,TECHFLEX_ORG_ID),
  env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'technician.job_claimed','work_order',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,workOrderId,JSON.stringify({technicianId:identity.technicianId,pricingChanged:false})),
 ]);}catch{throw new PortalHttpError(409,"Someone else changed this job. Refresh available jobs before trying again.");}
 return Response.json({workOrderId,assigned:true},{headers});
}catch(error){if(error instanceof z.ZodError)return Response.json({error:"Choose an available job."},{status:400,headers});const response=apiError(error);response.headers.set("Cache-Control",headers["Cache-Control"]);return response;}}
