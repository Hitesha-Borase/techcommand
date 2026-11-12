import {env} from "cloudflare:workers";
import {PortalHttpError,TECHFLEX_ORG_ID,type PortalIdentity} from "@/lib/portal-auth";
import {parseDisciplines} from "@/lib/service-disciplines";
import {exactUnit,taskForService,dmeTaskForService,dmeFamilies,type AcademyTrack} from "@/lib/academy-catalog";

export const academyManagers = ["owner_administrator","operations_administrator","biomedical_lead"];
export const activeAcademyAssignments = "('offered','assigned','accepted','dispatched','arrived','in_progress','submitted')";
export type AcademyUnit = {assetId:string;assetTag:string;familyId:string|null;familyName:string|null;manufacturer:string;model:string;assetVersion:number;registryVersion:number;status:string;disposition:string|null};
export type DmeEvidenceInput={familyId?:string|null;equipmentType?:string|null;manufacturer?:string|null;model?:string|null;serialNumber?:string|null;customerComplaint?:string|null;findings?:string|null;workPerformed?:string|null;recommendation?:string|null;diagnosticSteps?:unknown;testResults?:string|null;partsUsed?:unknown;assetDisposition?:string|null;checklist?:unknown;documentDetails?:unknown};
export type AcademyAuthorization = {id:string;level:string;signoffId:string;reviewDueOn:string|null;recordVersion:number};
export type AcademyCheck = {unit:AcademyUnit;task:string;status:"AUTHORIZED"|"SUPERVISION REQUIRED"|"NOT CURRENTLY AUTHORIZED";reason:string;canPerform:boolean;canFinalize:boolean;authorization:AcademyAuthorization|null;supervisorId:string|null;reviewId:string|null};
export const academyFieldModeValues=["guided","experienced","trainee"] as const;
export type AcademyFieldMode=typeof academyFieldModeValues[number];
type AcademyWorkResult={applies:boolean;track?:AcademyTrack;enforced?:boolean;checks:AcademyCheck[];epoch:number;missingAssets:boolean;message?:string};
export type AcademyFieldModeState={mode:AcademyFieldMode|null;allowedModes:AcademyFieldMode[];recordVersion:number;selected:boolean;reason:string};
export const academyEpochSql = `(SELECT COUNT(*) FROM audit_logs WHERE organization_id='techflex' AND action LIKE 'academy.%')`;
export async function academyEpoch(){return Number((await env.DB.prepare(`SELECT ${academyEpochSql} AS n`).first<{n:number}>())?.n||0);}
export function academyEpochGuard(epoch:number){return env.DB.prepare(`SELECT CASE WHEN ${academyEpochSql}=? THEN 1 ELSE json('academy_changed_reload') END`).bind(epoch);}
export function academyAudit(identity:PortalIdentity,id:string,action:string,details:unknown){return env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,?,'biomedical_academy',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,`academy.${action}`,id,JSON.stringify(details));}
export async function academyTechnician(id:string,track:AcademyTrack="biomedical"){
  const row=await env.DB.prepare("SELECT t.id,t.user_id AS userId,t.technician_code AS technicianCode,t.service_disciplines_json AS disciplines,COALESCE(u.display_name,t.technician_code) AS name FROM technicians t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.organization_id=? AND t.status='active'").bind(id,TECHFLEX_ORG_ID).first<{id:string;userId:string|null;technicianCode:string;disciplines:string|null;name:string}>();
  if(!row||!parseDisciplines(row.disciplines).includes(track))throw new PortalHttpError(403,`Choose an active technician with the ${track==="biomedical"?"Biomedical / HTM":"DME / Mobility"} discipline. The other career track does not grant access or authorization.`);
  return row;
}
export async function actorTechnician(identity:PortalIdentity){return env.DB.prepare("SELECT id FROM technicians WHERE user_id=? AND organization_id=? AND status='active' LIMIT 1").bind(identity.userId,TECHFLEX_ORG_ID).first<{id:string}>();}
export function academyFieldModeOptions(result:AcademyWorkResult):AcademyFieldMode[]{
 // Field modes change the amount of optional guidance, never authorization.
 return result.applies ? [...academyFieldModeValues] : [];
}
export async function academyFieldModeState(workOrderId:string,technicianId:string,result:AcademyWorkResult):Promise<AcademyFieldModeState>{
 const allowedModes=academyFieldModeOptions(result);
 const saved=await env.DB.prepare("SELECT mode,record_version AS recordVersion FROM academy_field_modes WHERE organization_id=? AND work_order_id=? AND technician_id=?").bind(TECHFLEX_ORG_ID,workOrderId,technicianId).first<{mode:AcademyFieldMode;recordVersion:number}>();
 const validSaved=!!saved&&allowedModes.includes(saved.mode);
 const mode=validSaved?saved!.mode:allowedModes.includes("guided")?"guided":allowedModes[0]||null;
 const reason="Choose the amount of optional guidance you prefer. Field notes and submission never require administrator or supervisor review. Career qualifications are recorded separately.";
 return {mode,allowedModes,recordVersion:saved?.recordVersion||0,selected:validSaved,reason};
}
export function academyFieldModeSnapshot(result:AcademyWorkResult,mode:AcademyFieldMode){
 return JSON.stringify({mode,qualificationGranted:false,checks:result.checks.map(check=>({assetId:check.unit.assetId,assetVersion:check.unit.assetVersion,familyId:check.unit.familyId,manufacturer:check.unit.manufacturer,model:check.unit.model,task:check.task,status:check.status,authorization:check.authorization?{id:check.authorization.id,level:check.authorization.level,recordVersion:check.authorization.recordVersion,reviewDueOn:check.authorization.reviewDueOn}:null,supervisorId:check.supervisorId,reviewId:check.reviewId}))});
}
export async function exactAuthorization(technicianId:string,unit:Pick<AcademyUnit,"familyId"|"manufacturer"|"model">,task:string,track:AcademyTrack="biomedical"){
  if(!unit.familyId||!unit.manufacturer.trim()||!unit.model.trim())return null;
  return env.DB.prepare(`SELECT a.id,a.level,a.signoff_id AS signoffId,a.review_due_on AS reviewDueOn,a.record_version AS recordVersion FROM academy_authorizations a JOIN academy_families f ON f.id=a.family_id AND f.organization_id=a.organization_id AND f.track=a.track JOIN academy_signoffs s ON s.id=a.signoff_id AND s.organization_id=a.organization_id AND s.track=a.track AND s.technician_id=a.technician_id AND s.family_id=a.family_id AND s.manufacturer=a.manufacturer AND s.model=a.model AND s.task=a.task AND s.authorization_level=a.level JOIN technicians t ON t.id=a.technician_id AND t.organization_id=a.organization_id AND t.status='active' WHERE a.organization_id=? AND a.track=? AND a.technician_id=? AND a.family_id=? AND a.manufacturer=? AND a.model=? AND a.task=? AND (a.review_due_on IS NULL OR a.review_due_on>=date('now')) AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.service_disciplines_json) THEN t.service_disciplines_json ELSE '[]' END) WHERE value=?)`).bind(TECHFLEX_ORG_ID,track,technicianId,unit.familyId,exactUnit(unit.manufacturer),exactUnit(unit.model),task,track).first<AcademyAuthorization>();
}
export async function academyWorkContext(workOrderId:string){
  const work=await env.DB.prepare("SELECT service_type AS serviceType,asset_id AS assetId FROM work_orders WHERE id=? AND organization_id=?").bind(workOrderId,TECHFLEX_ORG_ID).first<{serviceType:string;assetId:string|null}>();
  if(!work||!work.serviceType.startsWith("biomed_"))return null;
  const rows=await env.DB.prepare(`SELECT a.id AS assetId,a.asset_tag AS assetTag,a.category_id AS familyId,c.name AS familyName,a.manufacturer,a.model,COALESCE(wa.record_version,0) AS assetVersion,a.record_version AS registryVersion,COALESCE(wa.status,'not_started') AS status,wa.disposition FROM work_orders w JOIN assets a ON a.organization_id=w.organization_id AND a.account_id=w.account_id AND a.location_id=w.location_id LEFT JOIN work_order_assets wa ON wa.work_order_id=w.id AND wa.asset_id=a.id AND wa.organization_id=w.organization_id LEFT JOIN asset_categories c ON c.id=a.category_id AND c.organization_id=a.organization_id WHERE w.organization_id=? AND w.id=? AND (wa.id IS NOT NULL OR a.id=w.asset_id) ORDER BY a.id`).bind(TECHFLEX_ORG_ID,workOrderId).all<AcademyUnit>();
  return {work,units:rows.results};
}
export async function checkBiomedicalWork(workOrderId:string,technicianId:string){
  const epoch=await academyEpoch();const context=await academyWorkContext(workOrderId);
  if(!context)return {applies:false,checks:[] as AcademyCheck[],epoch,missingAssets:false};
  const task=taskForService(context.work.serviceType);const checks:AcademyCheck[]=[];
  const peers=await env.DB.prepare(`SELECT wa.technician_id AS id FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=? AND t.status='active' WHERE wa.work_order_id=? AND wa.technician_id!=? AND wa.status IN ${activeAcademyAssignments}`).bind(TECHFLEX_ORG_ID,workOrderId,technicianId).all<{id:string}>();
  for(const unit of context.units){
    const authorization=await exactAuthorization(technicianId,unit,task);
    const base={unit,task,authorization,supervisorId:null,reviewId:null};
    if(authorization&&["independent","trainer"].includes(authorization.level)){checks.push({...base,status:"AUTHORIZED",reason:"Current exact-model and task authorization recorded.",canPerform:true,canFinalize:true});continue;}
    if(authorization&&["learning","observed","assisted","supervised_only","competent"].includes(authorization.level)){
      let supervisorId:string|null=null;let reviewId:string|null=null;
      for(const peer of peers.results){const permission=await exactAuthorization(peer.id,unit,task);if(permission?.level!=="trainer")continue;
        supervisorId ||= peer.id;
        const review=await env.DB.prepare("SELECT id FROM academy_supervision_reviews WHERE organization_id=? AND track='biomedical' AND work_order_id=? AND asset_id=? AND technician_id=? AND supervisor_id=? AND asset_version=?").bind(TECHFLEX_ORG_ID,workOrderId,unit.assetId,technicianId,peer.id,unit.assetVersion).first<{id:string}>();
        if(review){supervisorId=peer.id;reviewId=review.id;break;}
      }
      checks.push({...base,status:"SUPERVISION REQUIRED",supervisorId,reviewId,canPerform:!!supervisorId,canFinalize:!!reviewId,reason:!supervisorId?"Assign a current trainer authorized for this exact model and task.":!reviewId?"Qualified trainer assigned. The saved asset results need supervisor sign-off before final submission.":"Supervisor signed this saved asset revision."});
    }else checks.push({...base,status:"NOT CURRENTLY AUTHORIZED",reason:!unit.familyId?"Asset family is missing. An administrator must classify this asset before competency can be checked.":"No current matching authorization. Record a competency evaluation or arrange supervised training in Academy.",canPerform:false,canFinalize:false});
  }
  return {applies:true,checks,epoch,missingAssets:!context.units.length};
}
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value??null;
}
function parsed(value:string|null|undefined,fallback:unknown){try{return value?JSON.parse(value):fallback;}catch{return fallback;}}
export function dmeEvidenceFingerprint(value:DmeEvidenceInput){
 return JSON.stringify(stable({
  familyId:value.familyId||((value.documentDetails as {dmeFamilyId?:string}|null)?.dmeFamilyId)||null,
  equipmentType:value.equipmentType||null,manufacturer:exactUnit(value.manufacturer),model:exactUnit(value.model),serialNumber:(value.serialNumber||"").trim(),
  customerComplaint:(value.customerComplaint||"").trim(),findings:(value.findings||"").trim(),workPerformed:(value.workPerformed||"").trim(),recommendation:(value.recommendation||"").trim(),
  diagnosticSteps:value.diagnosticSteps||[],testResults:(value.testResults||"").trim(),partsUsed:value.partsUsed||[],assetDisposition:value.assetDisposition||null,checklist:value.checklist||[],documentDetails:value.documentDetails||{},
 }));
}
type DmeContext={work:{serviceType:string;externalId:string;recordVersion:number};unit:AcademyUnit&{reportId:string|null;evidenceFingerprint:string|null};evidence:DmeEvidenceInput};
export async function dmeWorkContext(workOrderId:string,technicianId:string,candidate?:DmeEvidenceInput):Promise<DmeContext|null>{
 const work=await env.DB.prepare("SELECT service_type AS serviceType,external_id AS externalId,record_version AS recordVersion FROM work_orders WHERE id=? AND organization_id=?").bind(workOrderId,TECHFLEX_ORG_ID).first<{serviceType:string;externalId:string|null;recordVersion:number}>();
 const task=work&&dmeTaskForService(work.serviceType);if(!work||!task)return null;
 const report=await env.DB.prepare(`SELECT id,record_version AS reportVersion,qa_status AS status,equipment_type AS equipmentType,manufacturer,model,serial_number AS serialNumber,customer_complaint AS customerComplaint,findings,work_performed AS workPerformed,recommendation,diagnostic_steps_json AS diagnosticSteps,test_results AS testResults,parts_used_json AS partsUsed,asset_disposition AS assetDisposition,checklist_json AS checklist,document_details_json AS documentDetails FROM service_reports WHERE work_order_id=? AND technician_id=? ORDER BY report_version DESC LIMIT 1`).bind(workOrderId,technicianId).first<Record<string,unknown>>();
 const intake=await env.DB.prepare("SELECT data_json AS dataJson FROM work_order_intakes WHERE converted_work_order_id=? AND organization_id=? ORDER BY updated_at DESC LIMIT 1").bind(workOrderId,TECHFLEX_ORG_ID).first<{dataJson:string}>();
 const source=parsed(intake?.dataJson,"{}") as Record<string,unknown>;
 const saved:DmeEvidenceInput=report?{
  equipmentType:String(report.equipmentType||""),manufacturer:String(report.manufacturer||""),model:String(report.model||""),serialNumber:String(report.serialNumber||""),customerComplaint:String(report.customerComplaint||""),findings:String(report.findings||""),workPerformed:String(report.workPerformed||""),recommendation:String(report.recommendation||""),diagnosticSteps:parsed(String(report.diagnosticSteps||"[]"),[]),testResults:String(report.testResults||""),partsUsed:parsed(String(report.partsUsed||"[]"),[]),assetDisposition:String(report.assetDisposition||""),checklist:parsed(String(report.checklist||"[]"),[]),documentDetails:parsed(String(report.documentDetails||"{}"),{}),
 }:{familyId:String(source.dmeFamilyId||""),equipmentType:String(source.equipmentType||""),manufacturer:String(source.manufacturer||""),model:String(source.model||""),serialNumber:String(source.serialNumber||"")};
 const evidence={...saved,...candidate,documentDetails:candidate?.documentDetails??saved.documentDetails};
 const familyId=String(evidence.familyId||((evidence.documentDetails as {dmeFamilyId?:string}|null)?.dmeFamilyId)||"")||null;
 const family=dmeFamilies.find(f=>f.id===familyId)||null;
 const fingerprint=report||candidate?dmeEvidenceFingerprint({...evidence,familyId}):null;
 return {work:{serviceType:work.serviceType,externalId:work.externalId||workOrderId,recordVersion:work.recordVersion},evidence:{...evidence,familyId},unit:{assetId:String(report?.id||workOrderId),assetTag:work.externalId||"DME work order",familyId:family?.id||null,familyName:family?.name||null,manufacturer:String(evidence.manufacturer||""),model:String(evidence.model||""),assetVersion:Number(report?.reportVersion||0),registryVersion:work.recordVersion,status:String(report?.status||"identity_pending"),disposition:String(evidence.assetDisposition||"")||null,reportId:report?String(report.id):null,evidenceFingerprint:fingerprint}};
}
export async function checkDmeWork(workOrderId:string,technicianId:string,candidate?:DmeEvidenceInput){
 const epoch=await academyEpoch();const context=await dmeWorkContext(workOrderId,technicianId,candidate);
 if(!context)return {applies:false,track:"dme_mobility" as const,checks:[] as AcademyCheck[],epoch,missingAssets:false,message:undefined};
 const task=dmeTaskForService(context.work.serviceType)!;const unit=context.unit;const enrolled=!!await env.DB.prepare("SELECT 1 FROM academy_profiles WHERE organization_id=? AND technician_id=? AND track='dme_mobility' UNION SELECT 1 FROM academy_authorizations WHERE organization_id=? AND technician_id=? AND track='dme_mobility' LIMIT 1").bind(TECHFLEX_ORG_ID,technicianId,TECHFLEX_ORG_ID,technicianId).first();const authorization=await exactAuthorization(technicianId,unit,task,"dme_mobility");
 const base={unit,task,authorization,supervisorId:null,reviewId:null};
 if(!unit.familyId||!unit.manufacturer.trim()||!unit.model.trim())return {applies:true,track:"dme_mobility" as const,enforced:enrolled,checks:[{...base,status:"NOT CURRENTLY AUTHORIZED" as const,reason:enrolled?"Confirm the DME equipment family, exact manufacturer and exact model. The assignment and draft can still be saved; normal completion waits for an exact competency check.":"This technician's DME Academy authorization program is not configured yet. Keep the assignment and draft; management should record reviewed exact-equipment authorizations without inventing qualifications.",canPerform:!enrolled,canFinalize:!enrolled}],epoch,missingAssets:true,message:"Equipment identity is incomplete."};
 if(authorization&&["independent","trainer"].includes(authorization.level))return {applies:true,track:"dme_mobility" as const,checks:[{...base,status:"AUTHORIZED" as const,reason:"Current exact-family, manufacturer/model and task authorization recorded.",canPerform:true,canFinalize:true}],epoch,missingAssets:false,message:undefined};
 if(authorization&&["learning","observed","assisted","supervised_only","competent"].includes(authorization.level)){
  const peers=await env.DB.prepare(`SELECT wa.technician_id AS id FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=? AND t.status='active' WHERE wa.work_order_id=? AND wa.technician_id!=? AND wa.status IN ${activeAcademyAssignments}`).bind(TECHFLEX_ORG_ID,workOrderId,technicianId).all<{id:string}>();
  let supervisorId:string|null=null,reviewId:string|null=null;
  for(const peer of peers.results){const permission=await exactAuthorization(peer.id,unit,task,"dme_mobility");if(permission?.level!=="trainer")continue;supervisorId ||= peer.id;
   if(!unit.reportId||!unit.evidenceFingerprint)continue;
   const reviews=await env.DB.prepare("SELECT id,evidence_snapshot_json AS snapshot FROM academy_report_supervision_reviews WHERE organization_id=? AND track='dme_mobility' AND work_order_id=? AND report_id=? AND technician_id=? AND supervisor_id=? AND evidence_fingerprint=? ORDER BY created_at DESC").bind(TECHFLEX_ORG_ID,workOrderId,unit.reportId,technicianId,peer.id,unit.evidenceFingerprint).all<{id:string;snapshot:string}>();
   const matched=reviews.results.find(row=>{const s=parsed(row.snapshot,{}) as {learnerAuthorization?:{id?:string;recordVersion?:number};supervisorAuthorization?:{id?:string;recordVersion?:number}};return s.learnerAuthorization?.id===authorization.id&&s.learnerAuthorization.recordVersion===authorization.recordVersion&&s.supervisorAuthorization?.id===permission.id&&s.supervisorAuthorization.recordVersion===permission.recordVersion;});
   if(matched){supervisorId=peer.id;reviewId=matched.id;break;}
  }
  return {applies:true,track:"dme_mobility" as const,checks:[{...base,status:"SUPERVISION REQUIRED" as const,supervisorId,reviewId,canPerform:!!supervisorId,canFinalize:!!reviewId,reason:!supervisorId?"Assign a different current trainer authorized for this exact DME family, model and task.":!unit.reportId?"Qualified trainer assigned. Save the field report draft, then request review.":!reviewId?"Qualified trainer assigned. The exact saved report evidence needs supervisor sign-off before submission.":"A qualified trainer signed this exact saved report evidence."}],epoch,missingAssets:false,message:undefined};
 }
 return {applies:true,track:"dme_mobility" as const,enforced:enrolled,checks:[{...base,status:"NOT CURRENTLY AUTHORIZED" as const,reason:enrolled?"No current matching DME authorization. Record a competency evaluation or arrange a supervised learning assignment after a learning-level authorization is documented.":"This technician's DME Academy authorization program is not configured yet. The check is advisory until management records the reviewed DME career profile or an exact authorization; no qualification is inferred.",canPerform:!enrolled,canFinalize:!enrolled}],epoch,missingAssets:false,message:undefined};
}
export function dmeHold(result:Awaited<ReturnType<typeof checkDmeWork>>,finalize=false){if(!result.applies)return null;const blocked=result.checks.find(c=>!(finalize?c.canFinalize:c.canPerform));return blocked?`${blocked.unit.assetTag}: ${blocked.status}. ${blocked.reason} Save draft remains available.`:null;}
export function dmeContextGuards(workOrderId:string,technicianId:string,result:Awaited<ReturnType<typeof checkDmeWork>>,reportVersion?:number){
 if(!result.applies)return [];
 const statements=[academyEpochGuard(result.epoch),env.DB.prepare("SELECT CASE WHEN date('now')=? THEN 1 ELSE json('academy_date_changed') END").bind(new Date().toISOString().slice(0,10))];
 const c=result.checks[0],unit=c.unit as typeof c.unit&{reportId?:string|null};statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM work_orders WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('academy_results_changed') END").bind(workOrderId,TECHFLEX_ORG_ID,unit.registryVersion));
 if(reportVersion!==undefined&&unit.reportId)statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM service_reports WHERE id=? AND work_order_id=? AND technician_id=? AND record_version=?) THEN 1 ELSE json('academy_results_changed') END").bind(unit.reportId,workOrderId,technicianId,reportVersion));
 for(const id of [technicianId,c.supervisorId].filter((v):v is string=>!!v))statements.push(env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=? AND t.status='active' WHERE wa.work_order_id=? AND wa.technician_id=? AND wa.status IN ${activeAcademyAssignments} AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.service_disciplines_json) THEN t.service_disciplines_json ELSE '[]' END) WHERE value='dme_mobility')) THEN 1 ELSE json('academy_assignment_changed') END`).bind(TECHFLEX_ORG_ID,workOrderId,id));
 return statements;
}
export function biomedicalHold(result:Awaited<ReturnType<typeof checkBiomedicalWork>>,finalize=false){
  if(!result.applies)return null;
  if(result.missingAssets)return "Biomedical authorization review needs a saved asset and its equipment family. Your draft can still be saved.";
  const blocked=result.checks.find(c=>c.unit.status!=="not_applicable"&&!(finalize?c.canFinalize:c.canPerform));
  return blocked?`${blocked.unit.assetTag}: ${blocked.status}. ${blocked.reason} Save for later remains available.`:null;
}
export function academyContextGuards(workOrderId:string,technicianId:string,result:Awaited<ReturnType<typeof checkBiomedicalWork>>,checkProgress=false){
  if(!result.applies)return [];
  const statements=[academyEpochGuard(result.epoch),env.DB.prepare("SELECT CASE WHEN date('now')=? THEN 1 ELSE json('academy_date_changed') END").bind(new Date().toISOString().slice(0,10))];
  for(const c of result.checks){
    statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM assets WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('academy_asset_changed') END").bind(c.unit.assetId,TECHFLEX_ORG_ID,c.unit.registryVersion));
    if(checkProgress)statements.push(env.DB.prepare("SELECT CASE WHEN COALESCE((SELECT record_version FROM work_order_assets WHERE organization_id=? AND work_order_id=? AND asset_id=?),0)=? THEN 1 ELSE json('academy_results_changed') END").bind(TECHFLEX_ORG_ID,workOrderId,c.unit.assetId,c.unit.assetVersion));
    for(const id of [technicianId,c.supervisorId].filter((v):v is string=>!!v))statements.push(env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=? AND t.status='active' WHERE wa.work_order_id=? AND wa.technician_id=? AND wa.status IN ${activeAcademyAssignments} AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.service_disciplines_json) THEN t.service_disciplines_json ELSE '[]' END) WHERE value='biomedical')) THEN 1 ELSE json('academy_assignment_changed') END`).bind(TECHFLEX_ORG_ID,workOrderId,id));
  }
  return statements;
}
export async function academyCloseoutStatements(workOrderId:string,technicianId:string,reportId:string,identity:PortalIdentity){
  const result=await checkBiomedicalWork(workOrderId,technicianId);const hold=biomedicalHold(result,true);if(hold)throw new PortalHttpError(409,hold);
  if(!result.applies){const dme=await checkDmeWork(workOrderId,technicianId);const dmeBlock=dmeHold(dme,true);if(dmeBlock)throw new PortalHttpError(409,dmeBlock);return dmeExperienceStatements(workOrderId,technicianId,reportId,identity,dme);}
  const statements=academyContextGuards(workOrderId,technicianId,result,true);
  for(const c of result.checks.filter(c=>c.unit.status==="completed"&&c.unit.familyId))statements.push(env.DB.prepare(`INSERT INTO academy_experience(id,source_key,organization_id,technician_id,work_order_id,report_id,asset_id,family_id,manufacturer,model,task,service_type,supervision,supervisor_id,authorization_snapshot_json,disposition,qa_result,verified_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,w.service_type,?,?,?,?, 'approved',? FROM work_orders w WHERE w.id=? AND w.organization_id=? ON CONFLICT(report_id,asset_id,technician_id) DO NOTHING`).bind(`${reportId}:${c.unit.assetId}:${technicianId}`,`${reportId}:${c.unit.assetId}`,TECHFLEX_ORG_ID,technicianId,workOrderId,reportId,c.unit.assetId,c.unit.familyId,c.unit.manufacturer,c.unit.model,c.task,c.supervisorId?"supervised":"independent",c.supervisorId,JSON.stringify(c),c.unit.disposition||"not_recorded",identity.userId,workOrderId,TECHFLEX_ORG_ID));
  return statements;
}

/** QA records actual service evidence, not a qualification or a claim of independent work. */
async function dmeExperienceStatements(workOrderId:string,technicianId:string,reportId:string,identity:PortalIdentity,result:Awaited<ReturnType<typeof checkDmeWork>>){
 const source=await env.DB.prepare(`SELECT w.service_type AS serviceType,w.record_version AS workVersion,sr.record_version AS reportVersion,sr.equipment_type AS equipmentType,sr.manufacturer,sr.model,sr.serial_number AS serialNumber,sr.asset_disposition AS disposition,sr.document_details_json AS details,sr.findings,sr.work_performed AS workPerformed,sr.test_results AS testResults FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id JOIN accounts a ON a.id=w.account_id AND a.organization_id=w.organization_id JOIN locations l ON l.id=w.location_id AND l.account_id=a.id JOIN technicians t ON t.id=sr.technician_id AND t.organization_id=w.organization_id WHERE sr.id=? AND sr.technician_id=? AND w.id=? AND w.organization_id=? AND sr.qa_status='submitted'`).bind(reportId,technicianId,workOrderId,TECHFLEX_ORG_ID).first<{serviceType:string;workVersion:number;reportVersion:number;equipmentType:string;manufacturer:string;model:string;serialNumber:string;disposition:string;details:string|null;findings:string;workPerformed:string;testResults:string}>();
 const task=source&&dmeTaskForService(source.serviceType);if(!source||!task)return [];
 let details:{dmeFamilyId?:string}={};try{details=JSON.parse(source.details||"{}");}catch{/* Unknown family remains missing, never guessed. */}
 const family=dmeFamilies.find(f=>f.id===details.dmeFamilyId)||null;
 const check=result.checks[0],authorization=check?.authorization||null,supervision=check?.status==="SUPERVISION REQUIRED"?"supervised":check?.status==="AUTHORIZED"?"independent":"not_recorded";
 const snapshot=JSON.stringify({source,authorizationAtQa:authorization,supervisorId:check?.supervisorId||null,supervisionReviewId:check?.reviewId||null,checkedAt:new Date().toISOString(),supervision,qualificationGranted:false,explanation:"QA accepted this service record under the exact current DME task check. It records experience only; no competency, title or pay change is made."});
 const statements=[...(("enforced" in result&&result.enforced)?dmeContextGuards(workOrderId,technicianId,result,source.reportVersion):[]),env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id WHERE sr.id=? AND sr.technician_id=? AND sr.record_version=? AND sr.qa_status='submitted' AND w.id=? AND w.organization_id=? AND w.record_version=?) THEN 1 ELSE json('academy_experience_changed') END").bind(reportId,technicianId,source.reportVersion,workOrderId,TECHFLEX_ORG_ID,source.workVersion)];
 if(family)statements.push(env.DB.prepare("INSERT INTO academy_families(id,organization_id,track,name) VALUES(?,?,'dme_mobility',?) ON CONFLICT(id) DO NOTHING").bind(family.id,TECHFLEX_ORG_ID,family.name),env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM academy_families WHERE id=? AND organization_id=? AND track='dme_mobility') THEN 1 ELSE json('academy_family_changed') END").bind(family.id,TECHFLEX_ORG_ID));
 statements.push(env.DB.prepare("INSERT INTO academy_experience(id,organization_id,track,technician_id,work_order_id,report_id,source_key,family_id,manufacturer,model,task,service_type,supervision,supervisor_id,authorization_snapshot_json,disposition,qa_result,verified_by) VALUES(?,?,'dme_mobility',?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?) ON CONFLICT(organization_id,track,source_key,technician_id) DO NOTHING").bind(`dme:${reportId}:${technicianId}`,TECHFLEX_ORG_ID,technicianId,workOrderId,reportId,`report:${reportId}`,family?.id||null,source.manufacturer,source.model,task,source.serviceType,supervision,check?.supervisorId||null,snapshot,source.disposition,identity.userId));
 return statements;
}
