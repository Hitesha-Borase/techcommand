import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,requirePortalRole,TECHFLEX_ORG_ID,PortalHttpError} from "@/lib/portal-auth";
import {checkBiomedicalWork,checkDmeWork,activeAcademyAssignments,academyFieldModeState,academyFieldModeSnapshot,academyFieldModeValues} from "@/lib/academy";
const roles=["owner_administrator","operations_administrator","biomedical_lead","dispatcher","technician"] as const;
const modeSchema=z.object({requestId:z.string().uuid(),workOrderId:z.string().min(1).max(180),technicianId:z.string().min(1).max(180).optional(),mode:z.enum(academyFieldModeValues),expectedRecordVersion:z.number().int().min(0)}).strict();
export async function GET(request:Request){try{
 const identity=await requirePortalRole(request,[...roles]);
 const params=new URL(request.url).searchParams;const workId=params.get("workOrderId")||"";
 const work=await env.DB.prepare("SELECT id,service_type AS serviceType FROM work_orders WHERE id=? AND organization_id=?").bind(workId,TECHFLEX_ORG_ID).first<{id:string;serviceType:string}>();if(!work)throw new PortalHttpError(404,"Work order not found.");
 let technicianId=identity.role==="technician"?identity.technicianId:params.get("technicianId");
 if(identity.role==="technician"&&(!technicianId||!await env.DB.prepare(`SELECT id FROM work_order_assignments WHERE work_order_id=? AND technician_id=? AND status IN ${activeAcademyAssignments}`).bind(workId,technicianId).first()))throw new PortalHttpError(403,"This work order is not assigned to you.");
 if(!technicianId){const primary=await env.DB.prepare(`SELECT technician_id AS id FROM work_order_assignments WHERE work_order_id=? AND role='primary' AND status IN ${activeAcademyAssignments} LIMIT 1`).bind(workId).first<{id:string}>();technicianId=primary?.id||null;}
 if(!technicianId)return Response.json({applies:true,track:work.serviceType.startsWith("biomed_")?"biomedical":"dme_mobility",checks:[],missingAssets:false,message:"Choose a technician to check exact equipment and task authorization.",fieldMode:{mode:null,allowedModes:[],recordVersion:0,selected:false,reason:"Choose an assigned technician before selecting a field mode."}},{headers:{"Cache-Control":"private, no-store"}});
 const result=work.serviceType.startsWith("biomed_")?await checkBiomedicalWork(workId,technicianId):await checkDmeWork(workId,technicianId);
 const fieldMode=await academyFieldModeState(workId,technicianId,result);
 return Response.json({...result,track:work.serviceType.startsWith("biomed_")?"biomedical":"dme_mobility",fieldMode},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){const r=apiError(e);r.headers.set("Cache-Control","private, no-store");return r;}}

export async function POST(request:Request){try{
 const identity=await requirePortalRole(request,[...roles]);
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new PortalHttpError(403,"Reopen this work order from the signed-in portal before selecting a field mode.");
 const input=modeSchema.parse(await request.json());
 const work=await env.DB.prepare("SELECT id,service_type AS serviceType FROM work_orders WHERE id=? AND organization_id=?").bind(input.workOrderId,TECHFLEX_ORG_ID).first<{id:string;serviceType:string}>();
 if(!work)throw new PortalHttpError(404,"Work order not found.");
 const track=work.serviceType.startsWith("biomed_")?"biomedical":"dme_mobility";
 if(identity.role==="biomedical_lead"&&track!=="biomedical")throw new PortalHttpError(403,"Biomedical lead access does not select DME field modes.");
 const technicianId=identity.role==="technician"?identity.technicianId:input.technicianId;
 if(!technicianId)throw new PortalHttpError(400,"Choose the assigned technician.");
 if(identity.role==="technician"&&input.technicianId&&input.technicianId!==technicianId)throw new PortalHttpError(403,"Select a field mode only for your own assignment.");
 const assigned=await env.DB.prepare(`SELECT wa.id FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=? AND t.status='active' WHERE wa.work_order_id=? AND wa.technician_id=? AND wa.status IN ${activeAcademyAssignments}`).bind(TECHFLEX_ORG_ID,input.workOrderId,technicianId).first();
 if(!assigned)throw new PortalHttpError(403,"Choose an active technician assigned to this work order.");
 const result=track==="biomedical"?await checkBiomedicalWork(input.workOrderId,technicianId):await checkDmeWork(input.workOrderId,technicianId);
 const state=await academyFieldModeState(input.workOrderId,technicianId,result);
 if(!state.allowedModes.includes(input.mode))throw new PortalHttpError(409,input.mode==="experienced"?"Experienced view requires current independent or trainer authorization for every selected unit and task.":"The current authorization requires a different field mode. Reload the exact competency check.");
 const existing=await env.DB.prepare("SELECT id,mode,last_request_id AS lastRequestId,record_version AS recordVersion FROM academy_field_modes WHERE organization_id=? AND work_order_id=? AND technician_id=?").bind(TECHFLEX_ORG_ID,input.workOrderId,technicianId).first<{id:string;mode:string;lastRequestId:string;recordVersion:number}>();
 if(existing?.lastRequestId===input.requestId){if(existing.mode===input.mode)return Response.json({saved:true,replayed:true,fieldMode:await academyFieldModeState(input.workOrderId,technicianId,result)},{headers:{"Cache-Control":"private, no-store"}});throw new PortalHttpError(409,"This save identifier was already used for a different mode. Reload before retrying.");}
 if((existing?.recordVersion||0)!==input.expectedRecordVersion)throw new PortalHttpError(409,"The field mode changed in another tab. Reload before saving.");
 const snapshot=academyFieldModeSnapshot(result,input.mode),id=existing?.id||crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_assignments WHERE work_order_id=? AND technician_id=? AND status IN ${activeAcademyAssignments}) THEN 1 ELSE json('academy_assignment_changed') END`).bind(input.workOrderId,technicianId),
  ...(existing?[env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM academy_field_modes WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('academy_changed_reload') END").bind(id,TECHFLEX_ORG_ID,input.expectedRecordVersion)]:[]),
  existing?env.DB.prepare("UPDATE academy_field_modes SET mode=?,authorization_snapshot_json=?,last_request_id=?,selected_by=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?").bind(input.mode,snapshot,input.requestId,identity.userId,id,TECHFLEX_ORG_ID,input.expectedRecordVersion):env.DB.prepare("INSERT INTO academy_field_modes(id,organization_id,track,work_order_id,technician_id,mode,authorization_snapshot_json,last_request_id,selected_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,TECHFLEX_ORG_ID,track,input.workOrderId,technicianId,input.mode,snapshot,input.requestId,identity.userId),
  env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'academy.field_mode_selected','academy_field_mode',?,?)").bind(input.requestId,TECHFLEX_ORG_ID,identity.userId,id,JSON.stringify({workOrderId:input.workOrderId,technicianId,track,mode:input.mode,qualificationGranted:false})),
 ]);
 return Response.json({saved:true,fieldMode:await academyFieldModeState(input.workOrderId,technicianId,result)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const r=e instanceof z.ZodError?Response.json({error:e.issues.map(issue=>issue.message).join(" ")},{status:400}):/malformed JSON|academy_(changed|date|asset|assignment|results)|UNIQUE constraint failed: academy_field_modes/i.test(String(e))?Response.json({error:"Authorization, assignment, or saved evidence changed during this selection. Reload and review the exact field mode."},{status:409}):apiError(e);
  r.headers.set("Cache-Control","private, no-store");return r;
 }}
