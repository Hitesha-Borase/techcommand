import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,requirePortalRole,TECHFLEX_ORG_ID,PortalHttpError} from "@/lib/portal-auth";
const headers={"Cache-Control":"private, no-store"};
export async function POST(request:Request){try{
 const identity=await requirePortalRole(request,["technician"]);
 const input=z.object({workOrderId:z.string().min(1).max(160),serviceType:z.enum(["biomed_cataloging","biomed_pm_a","biomed_repair","biomed_service_call"]),previousServiceType:z.string().max(80)}).strict().parse(await request.json());
 const scope=`FROM work_orders w JOIN accounts c ON c.id=w.account_id AND c.organization_id=w.organization_id JOIN locations l ON l.id=w.location_id AND l.account_id=c.id JOIN work_order_assignments a ON a.work_order_id=w.id JOIN technicians t ON t.id=a.technician_id AND t.organization_id=w.organization_id WHERE w.id=? AND w.organization_id=? AND t.id=? AND t.user_id=? AND t.status='active' AND w.service_type LIKE 'biomed_%'`;
 const args=[input.workOrderId,TECHFLEX_ORG_ID,identity.technicianId,identity.userId];
 const job=await env.DB.prepare(`SELECT w.service_type AS serviceType ${scope} AND a.status IN ('offered','assigned','accepted','dispatched','arrived','in_progress') AND w.status IN ('ready_to_assign','assigned','in_progress')`).bind(...args).first<{serviceType:string}>();
 if(!job)throw new PortalHttpError(403,"Open a biomedical facility assignment that belongs to you.");
 if(job.serviceType===input.serviceType)return Response.json({workOrderId:input.workOrderId,serviceType:job.serviceType},{headers});
 try{await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 ${scope} AND a.status IN ('offered','assigned','accepted','dispatched','arrived') AND w.status IN ('ready_to_assign','assigned') AND w.service_type=? AND w.accepted_price_cents IS NULL AND NOT EXISTS(SELECT 1 FROM service_reports r WHERE r.work_order_id=w.id) AND NOT EXISTS(SELECT 1 FROM work_order_assets p WHERE p.work_order_id=w.id AND (p.status!='not_started' OR p.record_version!=1 OR p.notes IS NOT NULL OR p.findings IS NOT NULL OR p.work_performed IS NOT NULL OR p.test_results IS NOT NULL OR p.disposition IS NOT NULL OR p.procedure_answers_json IS NOT NULL OR p.procedure_snapshot_json IS NOT NULL))) THEN 1 ELSE json('workflow_conflict') END`).bind(...args,input.previousServiceType),
  env.DB.prepare("UPDATE work_orders SET service_type=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(input.serviceType,input.workOrderId,TECHFLEX_ORG_ID),
  env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES (?,?,?,'biomedical.workflow_selected','work_order',?,?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.workOrderId,JSON.stringify({serviceType:job.serviceType}),JSON.stringify({serviceType:input.serviceType})),
 ]);}catch{throw new PortalHttpError(409,"This assignment already has work or approved pricing, or changed on another screen. Continue its saved workflow; create a separate work order for a different activity. Existing work is preserved.");}
 return Response.json({workOrderId:input.workOrderId,serviceType:input.serviceType},{headers});
}catch(error){if(error instanceof z.ZodError)return Response.json({error:"Choose Cataloging, Preventive maintenance or Corrective repair."},{status:400,headers});const response=apiError(error);response.headers.set("Cache-Control",headers["Cache-Control"]);return response;}}
