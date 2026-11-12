import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,PortalHttpError,requirePortalRole,TECHFLEX_ORG_ID} from "@/lib/portal-auth";
import {publicationProblems,technicalDraft,technicalTrack} from "@/lib/technical-knowledge";

const headers={"Cache-Control":"private, no-store"};
const roles=["owner_administrator","operations_administrator","biomedical_lead","dispatcher","technician","auditor"] as const;
const administrators=["owner_administrator","operations_administrator"];
const base={requestId:z.string().uuid(),id:z.string().uuid(),version:z.number().int().min(0)};
const schema=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("save_draft"),draft:technicalDraft}),
 z.object({...base,action:z.literal("prepare_rollback"),rollbackRevisionId:z.string().uuid(),reason:z.string().trim().min(10).max(2000)}),
 z.object({...base,action:z.literal("publish")}),
]);
function failure(e:unknown){const r=e instanceof z.ZodError?Response.json({error:"Check the technical-source fields and try again."},{status:400}):/technical_document_changed|technical_feedback_changed|UNIQUE constraint|malformed JSON/i.test(String(e))?Response.json({error:"This technical source changed. Reload it before saving; the published revision is unchanged."},{status:409}):apiError(e);r.headers.set("Cache-Control",headers["Cache-Control"]);return r;}

export async function GET(request:Request){try{
 const identity=await requirePortalRole(request,[...roles]),params=new URL(request.url).searchParams,track=technicalTrack.parse(params.get("track")||"biomedical");
 if(identity.role==="biomedical_lead"&&track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not publish DME procedures.");
 const manager=administrators.includes(identity.role)||identity.role==="biomedical_lead";
 const rows=await env.DB.prepare(`SELECT d.id,d.track,d.family_id AS familyId,d.manufacturer,d.model,d.serial_range AS serialRange,d.document_type AS documentType,d.title,d.status,d.current_revision_id AS currentRevisionId,d.record_version AS version,d.updated_at AS updatedAt,${manager?"d.draft_json":"'{}'"} AS draftJson,r.revision_number AS revisionNumber,r.source_name AS sourceName,r.source_url AS sourceUrl,r.source_revision AS sourceRevision,r.effective_on AS effectiveOn,r.verified_on AS verifiedOn,r.applicability,r.limitations_json AS limitationsJson,r.review_basis AS reviewBasis,r.published_at AS publishedAt,t.service_type AS serviceType,t.steps_json AS stepsJson,${manager?"(SELECT COUNT(*) FROM admin_tasks task WHERE task.organization_id=d.organization_id AND task.source='technical_procedure_revision' AND task.status IN ('open','in_progress') AND EXISTS (SELECT 1 FROM technical_document_revisions task_revision WHERE task_revision.document_id=d.id AND task.source_record_id LIKE task_revision.id || ':%'))":"0"} AS openReviewCount FROM technical_documents d LEFT JOIN technical_document_revisions r ON r.id=d.current_revision_id LEFT JOIN technical_workflow_templates t ON t.revision_id=r.id WHERE d.organization_id=? AND d.track=? ${manager?"":"AND d.status='published'"} ORDER BY d.updated_at DESC LIMIT 300`).bind(TECHFLEX_ORG_ID,track).all();
 const revisions=manager?(await env.DB.prepare(`SELECT r.id AS revisionId,r.document_id AS documentId,r.revision_number AS revisionNumber,r.source_revision AS sourceRevision,r.effective_on AS effectiveOn,r.verified_on AS verifiedOn,r.published_at AS publishedAt,u.display_name AS publishedBy FROM technical_document_revisions r JOIN technical_documents d ON d.id=r.document_id JOIN users u ON u.id=r.published_by WHERE d.organization_id=? AND d.track=? ORDER BY r.document_id,r.revision_number DESC LIMIT 1200`).bind(TECHFLEX_ORG_ID,track).all()).results:[];
 return Response.json({track,manager,canPublish:manager,documents:rows.results,revisions},{headers});
 }catch(e){return failure(e);}}

export async function POST(request:Request){let requestId="",actor="",body="";try{
 const identity=await requirePortalRole(request,[...roles]);actor=identity.userId;
 if(!administrators.includes(identity.role)&&identity.role!=="biomedical_lead")throw new PortalHttpError(403,"An owner, operations administrator or Biomedical lead manages technical sources.");
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new PortalHttpError(403,"Save from your signed-in portal.");
 const raw=await request.text();if(raw.length>150000)throw new PortalHttpError(413,"This technical source is too large.");const input=schema.parse(JSON.parse(raw));requestId=input.requestId;body=JSON.stringify(input);
 const replay=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body,before_json AS resultJson FROM audit_logs WHERE id=?").bind(requestId).first<{actor:string;body:string;resultJson:string|null}>();if(replay){if(replay.actor===actor&&replay.body===body){
  if(input.action==="prepare_rollback"){
   const result=JSON.parse(replay.resultJson||"{}");
   if(result.draft&&result.resultingVersion)return Response.json({saved:true,replayed:true,version:result.resultingVersion,draft:technicalDraft.parse(result.draft)},{headers});
  }
  return Response.json({saved:true,replayed:true},{headers});
 }throw new PortalHttpError(409,"This save identifier belongs to another technical-source change.");}
 if(input.action==="save_draft"){
  if(identity.role==="biomedical_lead"&&input.draft.track!=="biomedical")throw new PortalHttpError(403,"Biomedical leads manage Biomedical procedures only.");
  const old=await env.DB.prepare("SELECT record_version AS version,track FROM technical_documents WHERE id=? AND organization_id=?").bind(input.id,TECHFLEX_ORG_ID).first<{version:number;track:string}>();if((old?.version||0)!==input.version||old&&old.track!==input.draft.track)throw new PortalHttpError(409,"Reload this technical source before editing it.");
  await env.DB.batch([
   env.DB.prepare("SELECT CASE WHEN COALESCE((SELECT record_version FROM technical_documents WHERE id=? AND organization_id=?),0)=? THEN 1 ELSE json('technical_document_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version),
   env.DB.prepare(`INSERT INTO technical_documents(id,organization_id,track,family_id,manufacturer,model,serial_range,document_type,title,draft_json,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET family_id=CASE WHEN technical_documents.status='draft' THEN excluded.family_id ELSE technical_documents.family_id END,manufacturer=CASE WHEN technical_documents.status='draft' THEN excluded.manufacturer ELSE technical_documents.manufacturer END,model=CASE WHEN technical_documents.status='draft' THEN excluded.model ELSE technical_documents.model END,serial_range=CASE WHEN technical_documents.status='draft' THEN excluded.serial_range ELSE technical_documents.serial_range END,document_type=CASE WHEN technical_documents.status='draft' THEN excluded.document_type ELSE technical_documents.document_type END,title=CASE WHEN technical_documents.status='draft' THEN excluded.title ELSE technical_documents.title END,draft_json=excluded.draft_json,updated_by=excluded.updated_by,record_version=technical_documents.record_version+1,updated_at=CURRENT_TIMESTAMP`).bind(input.id,TECHFLEX_ORG_ID,input.draft.track,input.draft.familyId,input.draft.manufacturer,input.draft.model,input.draft.serialRange,input.draft.documentType,input.draft.title,JSON.stringify(input.draft),identity.userId,identity.userId),
   env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'technical_knowledge.draft','technical_document',?,?)").bind(requestId,TECHFLEX_ORG_ID,identity.userId,input.id,body),
  ]);return Response.json({saved:true,version:input.version+1},{headers});
 }
 if(input.action==="prepare_rollback"){
  const current=await env.DB.prepare("SELECT track,current_revision_id AS currentRevisionId,record_version AS version FROM technical_documents WHERE id=? AND organization_id=?").bind(input.id,TECHFLEX_ORG_ID).first<{track:"biomedical"|"dme_mobility";currentRevisionId:string|null;version:number}>();
  if(!current||current.version!==input.version||!current.currentRevisionId)throw new PortalHttpError(409,"Reload the current published procedure before preparing a rollback.");
  if(identity.role==="biomedical_lead"&&current.track!=="biomedical")throw new PortalHttpError(403,"Biomedical leads manage Biomedical procedures only.");
  if(input.rollbackRevisionId===current.currentRevisionId)throw new PortalHttpError(400,"Choose an earlier published revision, not the current revision.");
  const selected=await env.DB.prepare(`SELECT r.id AS revisionId,r.source_name AS sourceName,r.source_url AS sourceUrl,r.source_revision AS sourceRevision,r.document_snapshot_json AS snapshotJson,r.applicability,r.limitations_json AS limitationsJson,r.review_basis AS reviewBasis,t.service_type AS serviceType,t.steps_json AS stepsJson FROM technical_document_revisions r JOIN technical_documents d ON d.id=r.document_id JOIN technical_workflow_templates t ON t.revision_id=r.id WHERE r.id=? AND r.document_id=? AND d.organization_id=? AND d.track=?`).bind(input.rollbackRevisionId,input.id,TECHFLEX_ORG_ID,current.track).first<{revisionId:string;sourceName:string;sourceUrl:string;sourceRevision:string;snapshotJson:string;applicability:string;limitationsJson:string;reviewBasis:string;serviceType:string;stepsJson:string}>();
  if(!selected)throw new PortalHttpError(409,"That historical revision is unavailable for this procedure.");
  const snapshot=JSON.parse(selected.snapshotJson),draft=technicalDraft.parse({
   track:current.track,familyId:snapshot.familyId??null,manufacturer:snapshot.manufacturer??"",model:snapshot.model??"",serialRange:snapshot.serialRange??"",documentType:snapshot.documentType??"service_manual",title:snapshot.title??"",
   sourceName:selected.sourceName,sourceUrl:selected.sourceUrl,sourceRevision:selected.sourceRevision,effectiveOn:null,verifiedOn:null,applicability:selected.applicability,limitations:JSON.parse(selected.limitationsJson),reviewBasis:selected.reviewBasis,
   feedbackIds:[],rollbackRevisionId:selected.revisionId,revisionImpact:"review_open_work",revisionImpactNote:input.reason,serviceType:selected.serviceType,steps:JSON.parse(selected.stepsJson),
  });
  const draftJson=JSON.stringify(draft);
  await env.DB.batch([
   env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_documents WHERE id=? AND organization_id=? AND record_version=? AND current_revision_id=?) THEN 1 ELSE json('technical_document_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version,current.currentRevisionId),
   env.DB.prepare("UPDATE technical_documents SET draft_json=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=? AND current_revision_id=?").bind(draftJson,identity.userId,input.id,TECHFLEX_ORG_ID,input.version,current.currentRevisionId),
   env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,'technical_knowledge.rollback_draft','technical_document',?,?,?)").bind(requestId,TECHFLEX_ORG_ID,identity.userId,input.id,JSON.stringify({currentRevisionId:current.currentRevisionId,resultingVersion:input.version+1,draft}),body),
  ]);
  return Response.json({saved:true,version:input.version+1,draft},{headers});
 }
 const current=await env.DB.prepare("SELECT track,draft_json AS draftJson,current_revision_id AS currentRevisionId,record_version AS version FROM technical_documents WHERE id=? AND organization_id=?").bind(input.id,TECHFLEX_ORG_ID).first<{track:"biomedical"|"dme_mobility";draftJson:string;currentRevisionId:string|null;version:number}>();if(!current||current.version!==input.version)throw new PortalHttpError(409,"Reload the current technical-source draft before publishing.");if(identity.role==="biomedical_lead"&&current.track!=="biomedical")throw new PortalHttpError(403,"Biomedical leads publish Biomedical procedures only.");
 const draft=technicalDraft.parse(JSON.parse(current.draftJson)),problems=publicationProblems(draft);if(problems.length)throw new PortalHttpError(400,problems[0]);
 if(draft.rollbackRevisionId){
  if(!current.currentRevisionId||draft.rollbackRevisionId===current.currentRevisionId)throw new PortalHttpError(409,"Choose an earlier revision before publishing a forward rollback.");
  const rollback=await env.DB.prepare("SELECT r.id FROM technical_document_revisions r JOIN technical_documents d ON d.id=r.document_id WHERE r.id=? AND r.document_id=? AND d.organization_id=? AND d.track=?").bind(draft.rollbackRevisionId,input.id,TECHFLEX_ORG_ID,current.track).first<{id:string}>();
  if(!rollback)throw new PortalHttpError(409,"The selected rollback revision no longer belongs to this procedure.");
 }
 if(draft.feedbackIds.length){
  if(!current.currentRevisionId)throw new PortalHttpError(409,"Feedback can only revise an existing published procedure.");
  const placeholders=draft.feedbackIds.map(()=>"?").join(","),linked=await env.DB.prepare(`SELECT id FROM technical_procedure_feedback WHERE organization_id=? AND document_id=? AND revision_id=? AND status='ready_for_revision' AND id IN (${placeholders})`).bind(TECHFLEX_ORG_ID,input.id,current.currentRevisionId,...draft.feedbackIds).all<{id:string}>();
  if(linked.results.length!==draft.feedbackIds.length)throw new PortalHttpError(409,"One or more linked feedback items changed or belong to another procedure revision.");
 }
 const latest=await env.DB.prepare("SELECT COALESCE(MAX(revision_number),0) AS revision FROM technical_document_revisions WHERE document_id=?").bind(input.id).first<{revision:number}>(),revision=Number(latest?.revision||0)+1,templateId=`workflow:${requestId}`;
 const statements=[
  env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_documents WHERE id=? AND organization_id=? AND record_version=? AND draft_json=?) THEN 1 ELSE json('technical_document_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version,current.draftJson),
  env.DB.prepare("INSERT INTO technical_document_revisions(id,document_id,revision_number,source_name,source_url,source_revision,document_snapshot_json,effective_on,verified_on,applicability,limitations_json,review_basis,published_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(requestId,input.id,revision,draft.sourceName,draft.sourceUrl,draft.sourceRevision,JSON.stringify({track:draft.track,familyId:draft.familyId,manufacturer:draft.manufacturer,model:draft.model,serialRange:draft.serialRange,documentType:draft.documentType,title:draft.title,serviceType:draft.serviceType,revisionImpact:draft.revisionImpact,revisionImpactNote:draft.revisionImpactNote,feedbackIds:draft.feedbackIds,rollbackRevisionId:draft.rollbackRevisionId}),draft.effectiveOn,draft.verifiedOn,draft.applicability,JSON.stringify(draft.limitations),draft.reviewBasis,identity.userId),
  env.DB.prepare("INSERT INTO technical_workflow_templates(id,revision_id,service_type,steps_json) VALUES(?,?,?,?)").bind(templateId,requestId,draft.serviceType,JSON.stringify(draft.steps)),
  ...draft.steps.flatMap((step,si)=>step.measurements.map((m,mi)=>env.DB.prepare("INSERT INTO technical_measurement_requirements(id,template_id,step_id,name,unit,expected_min,expected_max,expected_text,conditions,source_locator,required,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${requestId}:${si}:${mi}`,templateId,step.id,m.name,m.unit,m.expectedMin,m.expectedMax,m.expectedText,m.conditions,m.sourceLocator,Number(m.required),si*100+mi))),
  env.DB.prepare("UPDATE technical_documents SET status='published',track=?,family_id=?,manufacturer=?,model=?,serial_range=?,document_type=?,title=?,current_revision_id=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?").bind(draft.track,draft.familyId,draft.manufacturer,draft.model,draft.serialRange,draft.documentType,draft.title,requestId,identity.userId,input.id,TECHFLEX_ORG_ID,input.version),
  ...draft.feedbackIds.flatMap(feedbackId=>[
   env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_procedure_feedback WHERE id=? AND organization_id=? AND document_id=? AND revision_id=? AND status='ready_for_revision') THEN 1 ELSE json('technical_feedback_changed') END").bind(feedbackId,TECHFLEX_ORG_ID,input.id,current.currentRevisionId),
   env.DB.prepare("UPDATE technical_procedure_feedback SET status='implemented',implemented_revision_id=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND document_id=? AND revision_id=? AND status='ready_for_revision'").bind(requestId,feedbackId,TECHFLEX_ORG_ID,input.id,current.currentRevisionId),
  ]),
  ...(current.currentRevisionId&&draft.revisionImpact!=="routine"?[
   env.DB.prepare(`INSERT INTO admin_tasks(id,organization_id,account_id,work_order_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
    SELECT 'technical-review:' || ? || ':' || wa.id,w.organization_id,w.account_id,w.id,?,'technical_procedure_review',?, ?,?,'open','technical_procedure_revision',? || ':' || wa.id
     FROM work_order_assets wa JOIN work_orders w ON w.id=wa.work_order_id AND w.organization_id=wa.organization_id
     WHERE ?='biomedical' AND wa.organization_id=? AND w.status NOT IN ('ready_to_invoice','invoiced','paid','cancelled','closed')
       AND json_valid(wa.procedure_snapshot_json) AND json_extract(wa.procedure_snapshot_json,'$.id')=?
    ON CONFLICT(id) DO NOTHING`).bind(requestId,"biomedical_lead",`${draft.manufacturer} ${draft.model}: reviewed procedure update`,`${draft.revisionImpact==="stop_and_review_open_work"?"Urgent stop and technical review":"Technical review required before continuing"}. New reviewed source revision: ${draft.sourceRevision||"not labeled"}. ${draft.revisionImpactNote} The saved field evidence remains pinned and has not been rewritten. Compare the new source with the open record and document the disposition.`,draft.revisionImpact==="stop_and_review_open_work"?"urgent":"high",requestId,draft.track,TECHFLEX_ORG_ID,current.currentRevisionId),
   env.DB.prepare(`INSERT INTO admin_tasks(id,organization_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
    SELECT 'technical-review:' || ? || ':' || v.intake_id,i.organization_id,'operations_administrator','technical_procedure_review',?, ?,?,'open','technical_procedure_revision',? || ':' || v.intake_id
     FROM spinlife_visits v JOIN work_order_intakes i ON i.id=v.intake_id AND i.organization_id=?
     WHERE ?='dme_mobility' AND i.status IN ('spinlife_draft','spinlife_assigned','spinlife_in_progress','spinlife_review')
       AND json_valid(v.visit_json) AND json_extract(v.visit_json,'$.manufacturerGuide.id')=?
    ON CONFLICT(id) DO NOTHING`).bind(requestId,`${draft.manufacturer} ${draft.model}: reviewed DME procedure update`,`${draft.revisionImpact==="stop_and_review_open_work"?"Urgent stop and technical review":"Technical review required before continuing"}. New reviewed source revision: ${draft.sourceRevision||"not labeled"}. ${draft.revisionImpactNote} The saved DME evidence remains pinned and has not been rewritten. Compare the new source with the open visit and document the disposition.`,draft.revisionImpact==="stop_and_review_open_work"?"urgent":"high",requestId,TECHFLEX_ORG_ID,draft.track,current.currentRevisionId),
  ]:[]),
  env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'technical_knowledge.publish','technical_document',?,?)").bind(requestId,TECHFLEX_ORG_ID,identity.userId,input.id,body),
 ];await env.DB.batch(statements);return Response.json({saved:true,revision,revisionId:requestId,version:input.version+1},{headers});
 }catch(e){if(requestId&&actor){try{const done=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?").bind(requestId).first<{actor:string;body:string}>();if(done?.actor===actor&&done.body===body)return Response.json({saved:true,replayed:true},{headers});}catch{}}return failure(e);}}
