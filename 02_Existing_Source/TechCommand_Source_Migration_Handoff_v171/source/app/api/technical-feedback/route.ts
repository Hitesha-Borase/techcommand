import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiError, PortalHttpError, requirePortalRole, TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { technicalCaseQuality } from "@/lib/technical-case-quality";
import { technicalTrack } from "@/lib/technical-knowledge";

const headers = { "Cache-Control": "private, no-store" };
const roles = ["owner_administrator", "operations_administrator", "biomedical_lead", "dispatcher", "technician", "auditor"] as const;
const managers = ["owner_administrator", "operations_administrator", "biomedical_lead"] as const;
const feedbackType = z.enum(["needs_clarification", "observed_difference", "contradicts_current", "source_revision_notice"]);
const submitSchema = z.object({
  id: z.string().uuid(), documentId: z.string().uuid(), revisionId: z.string().uuid(), feedbackType,
  summary: z.string().trim().min(10).max(1000), observedResult: z.string().trim().max(2000).default(""),
  expectedResult: z.string().trim().max(2000).default(""), sourceLocator: z.string().trim().min(3).max(300),
  supportingSourceUrl: z.string().trim().max(2000).default(""), negatingEvidence: z.string().trim().max(3000).default(""),
  workReference: z.string().trim().max(120).regex(/^[A-Za-z0-9#_.:/-]*$/).default(""),
}).strict();
const decisionSchema = z.object({
  id: z.string().uuid(), version: z.number().int().positive(),
  action: z.enum(["start_review", "prepare_revision", "decline"]), decisionNote: z.string().trim().max(2000).default(""),
}).strict();
type FeedbackRow = {id:string;documentId:string;revisionId:string;track:"biomedical"|"dme_mobility";manufacturer:string;model:string;feedbackType:string;summary:string;observedResult:string;expectedResult:string;sourceLocator:string;supportingSourceUrl:string|null;negatingEvidence:string;workReference:string;status:string;decisionNote:string;recordVersion:number;submittedBy:string;reviewedBy:string|null;reviewedAt:string|null;implementedRevisionId:string|null;createdAt:string;updatedAt:string};

function manager(role:string){return (managers as readonly string[]).includes(role);}
function failure(error:unknown){
  const response=error instanceof z.ZodError
    ? Response.json({error:"Check the feedback fields and try again."},{status:400})
    : /technical_feedback_changed|UNIQUE constraint/i.test(String(error))
      ? Response.json({error:"This feedback changed after you opened it. Refresh before continuing."},{status:409})
      : apiError(error);
  response.headers.set("Cache-Control",headers["Cache-Control"]);return response;
}
function validUrl(value:string){if(!value)return null;try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)return null;return url.toString();}catch{return null;}}

export async function GET(request:Request){try{
  const identity=await requirePortalRole(request,[...roles]);
  const track=technicalTrack.parse(new URL(request.url).searchParams.get("track")||"biomedical");
  if(identity.role==="biomedical_lead"&&track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not review DME procedure feedback.");
  const canManage=manager(identity.role);
  const result=await env.DB.prepare(`SELECT f.id,f.document_id AS documentId,f.revision_id AS revisionId,f.track,f.manufacturer,f.model,f.feedback_type AS feedbackType,
    f.summary,f.observed_result AS observedResult,f.expected_result AS expectedResult,f.source_locator AS sourceLocator,f.supporting_source_url AS supportingSourceUrl,
    f.negating_evidence AS negatingEvidence,f.work_reference AS workReference,f.status,f.decision_note AS decisionNote,f.record_version AS recordVersion,
    f.submitted_by AS submittedBy,f.reviewed_by AS reviewedBy,f.reviewed_at AS reviewedAt,f.implemented_revision_id AS implementedRevisionId,
    f.created_at AS createdAt,f.updated_at AS updatedAt,r.revision_number AS revisionNumber
    FROM technical_procedure_feedback f
    JOIN technical_documents d ON d.id=f.document_id AND d.organization_id=f.organization_id AND d.track=f.track
    JOIN technical_document_revisions r ON r.id=f.revision_id AND r.document_id=d.id
    WHERE f.organization_id=? AND f.track=? ${canManage?"":"AND f.submitted_by=?"}
    ORDER BY CASE f.status WHEN 'submitted' THEN 1 WHEN 'in_review' THEN 2 WHEN 'ready_for_revision' THEN 3 ELSE 4 END,f.created_at DESC LIMIT 200`)
    .bind(...(canManage?[TECHFLEX_ORG_ID,track]:[TECHFLEX_ORG_ID,track,identity.userId])).all<FeedbackRow>();
  let quality=null;
  if(canManage){
    const aggregate=await env.DB.prepare(`SELECT COUNT(*) AS totalCases,
      SUM(CASE WHEN f.status IN ('submitted','in_review') THEN 1 ELSE 0 END) AS openCases,
      SUM(CASE WHEN f.status IN ('ready_for_revision','implemented','declined') THEN 1 ELSE 0 END) AS evaluatedCases,
      SUM(CASE WHEN f.status IN ('ready_for_revision','implemented') THEN 1 ELSE 0 END) AS acceptedCases,
      SUM(CASE WHEN f.status='implemented' THEN 1 ELSE 0 END) AS implementedCases,
      SUM(CASE WHEN f.status='declined' THEN 1 ELSE 0 END) AS declinedCases,
      SUM(CASE WHEN f.status IN ('ready_for_revision','implemented','declined') AND length(trim(f.decision_note))>=10 THEN 1 ELSE 0 END) AS decisionBasisCases,
      SUM(CASE WHEN f.feedback_type='contradicts_current' AND f.status IN ('ready_for_revision','implemented','declined') THEN 1 ELSE 0 END) AS contradictionEvaluatedCases,
      SUM(CASE WHEN f.feedback_type='contradicts_current' AND f.status IN ('ready_for_revision','implemented') THEN 1 ELSE 0 END) AS contradictionAcceptedCases,
      SUM(CASE WHEN length(trim(f.work_reference))>0 THEN 1 ELSE 0 END) AS workLinkedCases,
      SUM(CASE WHEN f.supporting_source_url IS NOT NULL AND length(trim(f.supporting_source_url))>0 THEN 1 ELSE 0 END) AS sourceLinkedCases
      FROM technical_procedure_feedback f JOIN technical_documents d ON d.id=f.document_id AND d.organization_id=f.organization_id AND d.track=f.track
      WHERE f.organization_id=? AND f.track=?`).bind(TECHFLEX_ORG_ID,track).first();
    const groups=await env.DB.prepare(`SELECT f.manufacturer,f.model,COUNT(*) AS totalCases,
      SUM(CASE WHEN f.status IN ('submitted','in_review') THEN 1 ELSE 0 END) AS openCases,
      SUM(CASE WHEN f.status IN ('ready_for_revision','implemented','declined') THEN 1 ELSE 0 END) AS evaluatedCases,
      SUM(CASE WHEN f.status IN ('ready_for_revision','implemented') THEN 1 ELSE 0 END) AS acceptedCases,
      SUM(CASE WHEN f.status='implemented' THEN 1 ELSE 0 END) AS implementedCases
      FROM technical_procedure_feedback f JOIN technical_documents d ON d.id=f.document_id AND d.organization_id=f.organization_id AND d.track=f.track
      WHERE f.organization_id=? AND f.track=? GROUP BY f.manufacturer,f.model ORDER BY totalCases DESC,f.manufacturer,f.model LIMIT 500`).bind(TECHFLEX_ORG_ID,track).all();
    quality=technicalCaseQuality(aggregate,groups.results);
  }
  return Response.json({track,manager:canManage,feedback:result.results,quality},{headers});
}catch(error){return failure(error);}}

export async function POST(request:Request){try{
  const identity=await requirePortalRole(request,[...roles]);
  if(identity.role==="auditor")throw new PortalHttpError(403,"Auditors review records without submitting procedure changes.");
  if(request.headers.get("origin")!==new URL(request.url).origin)throw new PortalHttpError(403,"Submit feedback from your signed-in portal.");
  const raw=await request.text();if(raw.length>20000)throw new PortalHttpError(413,"This feedback is too large.");
  const input=submitSchema.parse(JSON.parse(raw));
  const sourceUrl=validUrl(input.supportingSourceUrl);if(input.supportingSourceUrl&&!sourceUrl)throw new PortalHttpError(400,"Use an exact public HTTPS supporting-source URL or leave it blank.");
  const existing=await env.DB.prepare(`SELECT document_id AS documentId,revision_id AS revisionId,feedback_type AS feedbackType,summary,
    observed_result AS observedResult,expected_result AS expectedResult,source_locator AS sourceLocator,supporting_source_url AS supportingSourceUrl,
    negating_evidence AS negatingEvidence,work_reference AS workReference,submitted_by AS submittedBy
    FROM technical_procedure_feedback WHERE id=? AND organization_id=?`).bind(input.id,TECHFLEX_ORG_ID).first<{documentId:string;revisionId:string;feedbackType:string;summary:string;observedResult:string;expectedResult:string;sourceLocator:string;supportingSourceUrl:string|null;negatingEvidence:string;workReference:string;submittedBy:string}>();
  if(existing){
    const exact=existing.submittedBy===identity.userId&&existing.documentId===input.documentId&&existing.revisionId===input.revisionId&&existing.feedbackType===input.feedbackType&&existing.summary===input.summary&&existing.observedResult===input.observedResult&&existing.expectedResult===input.expectedResult&&existing.sourceLocator===input.sourceLocator&&(existing.supportingSourceUrl||null)===(sourceUrl||null)&&existing.negatingEvidence===input.negatingEvidence&&existing.workReference===input.workReference;
    if(exact)return Response.json({saved:true,duplicate:true,id:input.id},{headers});
    throw new PortalHttpError(409,"This feedback identifier was already used for different evidence.");
  }
  const source=await env.DB.prepare(`SELECT d.track,d.current_revision_id AS currentRevisionId,r.document_snapshot_json AS snapshot
    FROM technical_documents d JOIN technical_document_revisions r ON r.id=? AND r.document_id=d.id
    WHERE d.id=? AND d.organization_id=? AND d.status='published'`).bind(input.revisionId,input.documentId,TECHFLEX_ORG_ID).first<{track:"biomedical"|"dme_mobility";currentRevisionId:string;snapshot:string}>();
  if(!source||source.currentRevisionId!==input.revisionId)throw new PortalHttpError(409,"Choose the current reviewed procedure revision before submitting feedback.");
  if(identity.role==="biomedical_lead"&&source.track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not submit DME procedure feedback.");
  const snapshot=JSON.parse(source.snapshot) as {manufacturer?:string;model?:string};
  if(!snapshot.manufacturer||!snapshot.model)throw new PortalHttpError(409,"The reviewed procedure does not have an exact manufacturer/model identity.");
  if(input.feedbackType==="contradicts_current"&&input.negatingEvidence.length<10)throw new PortalHttpError(400,"Describe the actual evidence that contradicts the published guidance.");
  if(input.feedbackType==="contradicts_current"&&(!input.observedResult||!input.expectedResult))throw new PortalHttpError(400,"Record both the observed result and the cited expected result.");
  await env.DB.batch([
    env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_documents WHERE id=? AND organization_id=? AND track=? AND status='published' AND current_revision_id=?) THEN 1 ELSE json('technical_feedback_changed') END").bind(input.documentId,TECHFLEX_ORG_ID,source.track,input.revisionId),
    env.DB.prepare(`INSERT INTO technical_procedure_feedback(id,organization_id,document_id,revision_id,track,manufacturer,model,feedback_type,summary,observed_result,expected_result,source_locator,supporting_source_url,negating_evidence,work_reference,submitted_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(input.id,TECHFLEX_ORG_ID,input.documentId,input.revisionId,source.track,snapshot.manufacturer,snapshot.model,input.feedbackType,input.summary,input.observedResult,input.expectedResult,input.sourceLocator,sourceUrl,input.negatingEvidence,input.workReference,identity.userId),
    env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'technical_feedback.submitted','technical_procedure_feedback',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.id,JSON.stringify({documentId:input.documentId,revisionId:input.revisionId,track:source.track,feedbackType:input.feedbackType,manufacturer:snapshot.manufacturer,model:snapshot.model,workReference:input.workReference||null})),
  ]);
  return Response.json({saved:true,id:input.id},{status:201,headers});
}catch(error){return failure(error);}}

export async function PATCH(request:Request){try{
  const identity=await requirePortalRole(request,[...roles]);if(!manager(identity.role))throw new PortalHttpError(403,"An owner, operations administrator or Biomedical lead reviews procedure feedback.");
  if(request.headers.get("origin")!==new URL(request.url).origin)throw new PortalHttpError(403,"Review feedback from your signed-in portal.");
  const input=decisionSchema.parse(await request.json());
  const row=await env.DB.prepare("SELECT track,status,record_version AS version,submitted_by AS submittedBy FROM technical_procedure_feedback WHERE id=? AND organization_id=?").bind(input.id,TECHFLEX_ORG_ID).first<{track:string;status:string;version:number;submittedBy:string}>();
  if(!row)throw new PortalHttpError(404,"This procedure feedback no longer exists.");
  if(identity.role==="biomedical_lead"&&row.track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not review DME procedure feedback.");
  if(row.submittedBy===identity.userId)throw new PortalHttpError(403,"A different authorized reviewer must evaluate this feedback.");
  if(row.version!==input.version)throw new PortalHttpError(409,"This feedback changed after you opened it. Refresh before continuing.");
  const next=input.action==="start_review"?"in_review":input.action==="prepare_revision"?"ready_for_revision":"declined";
  const allowed=input.action==="start_review"?row.status==="submitted":input.action==="prepare_revision"?["submitted","in_review"].includes(row.status):["submitted","in_review"].includes(row.status);
  if(!allowed)throw new PortalHttpError(409,"This feedback already has a later review decision.");
  if(input.action==="prepare_revision"&&input.decisionNote.length<10)throw new PortalHttpError(400,"Record the source-review basis before preparing a procedure revision.");
  if(input.action==="decline"&&input.decisionNote.length<10)throw new PortalHttpError(400,"Record why this feedback will not become a procedure revision.");
  const result=await env.DB.batch([
    env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_procedure_feedback WHERE id=? AND organization_id=? AND record_version=? AND status=?) THEN 1 ELSE json('technical_feedback_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version,row.status),
    env.DB.prepare("UPDATE technical_procedure_feedback SET status=?,decision_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=? AND status=?").bind(next,input.decisionNote,identity.userId,input.id,TECHFLEX_ORG_ID,input.version,row.status),
    env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,'technical_procedure_feedback',?,?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,`technical_feedback.${input.action}`,input.id,JSON.stringify({status:row.status,version:row.version}),JSON.stringify({status:next,version:row.version+1,decisionNote:input.decisionNote})),
  ]);
  if(!result[1]?.meta?.changes)throw new PortalHttpError(409,"This feedback changed after you opened it. Refresh before continuing.");
  return Response.json({saved:true,feedback:{id:input.id,status:next,recordVersion:input.version+1}},{headers});
}catch(error){return failure(error);}}
