import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,requirePortalRole,TECHFLEX_ORG_ID,PortalHttpError,type PortalIdentity} from "@/lib/portal-auth";
import {academyEpoch,academyEpochGuard,academyTechnician} from "@/lib/academy";
import {courseResult,courseSnapshotSchema,learningActionSchema,safeJson} from "@/lib/academy-learning";

const roles=["owner_administrator","operations_administrator","biomedical_lead","technician","school_coordinator"] as const;
const financeRoles=["owner_administrator","operations_administrator"];
const headers={"Cache-Control":"private, no-store"};
type Row=Record<string,unknown>;

function fail(message:string,status=400):never{throw new PortalHttpError(status,message);}
function canAuthor(identity:PortalIdentity,track:string){return financeRoles.includes(identity.role)||(identity.role==="biomedical_lead"&&track==="biomedical");}
function manager(identity:PortalIdentity){return financeRoles.includes(identity.role)||identity.role==="biomedical_lead";}
async function target(identity:PortalIdentity,technicianId:string,track:"biomedical"|"dme_mobility"){
 if(identity.role==="biomedical_lead"&&track!=="biomedical")fail("Biomedical lead access does not manage DME learning.",403);
 const tech=await academyTechnician(technicianId,track);
 const own=tech.userId===identity.userId;
 if(!own&&!manager(identity))fail("Your own learning record only.",403);
 return {tech,own};
}
function publicSnapshot(value:unknown){const snapshot=courseSnapshotSchema.parse(value);return {...snapshot,questions:snapshot.questions.map(q=>({id:q.id,prompt:q.prompt,choices:q.choices}))};}
function audit(identity:PortalIdentity,requestId:string,action:string,entityId:string,body:string){return env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,?,'academy_learning',?,?)").bind(requestId,TECHFLEX_ORG_ID,identity.userId,`academy.learning.${action}`,entityId,body);}
function guard(query:string,...args:unknown[]){return env.DB.prepare(`SELECT CASE WHEN EXISTS(${query}) THEN 1 ELSE json('academy_learning_changed') END`).bind(...args);}

export async function GET(request:Request){try{
 const identity=await requirePortalRole(request,[...roles]);
 if(identity.role==="school_coordinator"){
  const courses=await env.DB.prepare(`SELECT c.id,c.track,c.title,c.category,c.level,c.difficulty
   FROM academy_courses c JOIN academy_course_revisions r ON r.id=c.published_revision_id AND r.course_id=c.id AND r.organization_id=c.organization_id AND r.track=c.track
   WHERE c.organization_id=? AND c.status='published' ORDER BY c.track,c.title,c.id`).bind(TECHFLEX_ORG_ID).all<Row>();
  const progress=await env.DB.prepare(`SELECT p.id AS placementId,p.student_name AS studentName,p.status AS placementStatus,p.technician_id AS technicianId,c.id AS courseId,c.track,c.title,e.status,e.progress_json AS progressJson,r.snapshot_json AS snapshotJson
   FROM training_schools s JOIN training_placements p ON p.school_id=s.id AND p.organization_id=s.organization_id
   LEFT JOIN academy_enrollments e ON e.technician_id=p.technician_id AND e.organization_id=p.organization_id
   LEFT JOIN academy_course_revisions r ON r.id=e.revision_id AND r.organization_id=e.organization_id
   LEFT JOIN academy_courses c ON c.id=r.course_id AND c.organization_id=r.organization_id AND c.track=e.track
   WHERE s.organization_id=? AND s.coordinator_email=? AND s.active=1 AND p.status IN ('active','paused','completed') ORDER BY p.student_name,c.title`).bind(TECHFLEX_ORG_ID,identity.email).all<Row>();
  return Response.json({schoolView:true,courses:courses.results,progress:progress.results.map(row=>{const p=safeJson<{completedLessonIds?:string[]}>(row.progressJson,{}),s=safeJson<{lessons?:unknown[]}>(row.snapshotJson,{});return {placementId:row.placementId,studentName:row.studentName,placementStatus:row.placementStatus,canAssign:row.placementStatus==="active"&&Boolean(row.technicianId),courseId:row.courseId,track:row.track,title:row.title,status:row.status,completedLessons:p.completedLessonIds?.length||0,totalLessons:s.lessons?.length||0};})},{headers});
 }
 const url=new URL(request.url),track=z.enum(["biomedical","dme_mobility"]).parse(url.searchParams.get("track")||"biomedical");
 const technicianId=url.searchParams.get("technicianId")||identity.technicianId;
 if(!technicianId)fail("A linked technician profile is required.",403);
 const {own}=await target(identity,technicianId,track);
 const author=canAuthor(identity,track),finance=financeRoles.includes(identity.role);
 const courses=await env.DB.prepare(`SELECT c.id,c.title,c.category,c.level,c.manufacturer,c.model,c.credential,c.specialty,c.difficulty,c.status,c.record_version AS version,c.published_revision_id AS publishedRevisionId,c.draft_json AS draftJson,r.revision,r.snapshot_json AS publishedJson
  FROM academy_courses c LEFT JOIN academy_course_revisions r ON r.id=c.published_revision_id AND r.organization_id=c.organization_id AND r.track=c.track
  WHERE c.organization_id=? AND c.track=? ${author?"":"AND c.status='published'"} ORDER BY c.title,c.id`).bind(TECHFLEX_ORG_ID,track).all<Row>();
 const enrollments=await env.DB.prepare(`SELECT e.id,e.status,e.record_version AS version,e.progress_json AS progressJson,e.training_record_id AS trainingRecordId,tr.status AS trainingStatus,r.id AS revisionId,r.revision,r.snapshot_json AS snapshotJson,c.id AS courseId,c.title,c.category,c.level,c.manufacturer,c.model,c.credential,c.specialty,c.difficulty
  FROM academy_enrollments e JOIN academy_course_revisions r ON r.id=e.revision_id AND r.organization_id=e.organization_id AND r.track=e.track JOIN academy_courses c ON c.id=r.course_id AND c.organization_id=e.organization_id AND c.track=e.track LEFT JOIN academy_training_records tr ON tr.id=e.training_record_id AND tr.organization_id=e.organization_id AND tr.technician_id=e.technician_id AND tr.track=e.track
  WHERE e.organization_id=? AND e.track=? AND e.technician_id=? ORDER BY e.updated_at DESC`).bind(TECHFLEX_ORG_ID,track,technicianId).all<Row>();
 const education=await env.DB.prepare(`SELECT id,course,provider,official_url AS officialUrl,cost_cents AS costCents,requested_company_cents AS requestedCompanyCents,approved_company_cents AS approvedCompanyCents,employee_remainder_cents AS employeeRemainderCents,agreement_reference AS agreementReference,notes,status,decision_notes AS decisionNotes,training_record_id AS trainingRecordId,record_version AS version FROM academy_education_requests WHERE organization_id=? AND track=? AND technician_id=? ORDER BY updated_at DESC`).bind(TECHFLEX_ORG_ID,track,technicianId).all();
 const verifiedTraining=await env.DB.prepare("SELECT id,title,provider,completed_on AS completedOn FROM academy_training_records WHERE organization_id=? AND track=? AND technician_id=? AND status='verified' ORDER BY completed_on DESC,created_at DESC LIMIT 200").bind(TECHFLEX_ORG_ID,track,technicianId).all();
 return Response.json({schoolView:false,track,technicianId,own,author,finance,courses:courses.results.map(row=>({...row,draft:author?safeJson(row.draftJson,{}):undefined,published:row.publishedJson?publicSnapshot(safeJson(row.publishedJson,{})):null,draftJson:undefined,publishedJson:undefined})),enrollments:enrollments.results.map(row=>({...row,progress:safeJson(row.progressJson,{}),snapshot:publicSnapshot(safeJson(row.snapshotJson,{})),progressJson:undefined,snapshotJson:undefined})),education:education.results,verifiedTraining:verifiedTraining.results},{headers});
 }catch(error){const response=error instanceof z.ZodError?Response.json({error:error.issues.map(i=>i.message).join(" ")},{status:400}):apiError(error);response.headers.set("Cache-Control",headers["Cache-Control"]);return response;}}

export async function POST(request:Request){let replay={id:"",actor:"",body:""};try{
 const identity=await requirePortalRole(request,[...roles]);
 if(request.headers.get("origin")!==new URL(request.url).origin)fail("Reopen Academy from the signed-in portal before saving.",403);
 const raw=await request.text();if(raw.length>120000)fail("This learning record is too large. Shorten lesson text or keep supporting documents in Documents.",413);
 const input=learningActionSchema.parse(JSON.parse(raw));replay={id:input.requestId,actor:identity.userId,body:JSON.stringify(input)};
 const prior=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?").bind(input.requestId).first<{actor:string;body:string}>();
 if(prior){if(prior.actor===identity.userId&&prior.body===replay.body)return Response.json({saved:true,replayed:true},{headers});fail("This save identifier was already used. Reload before making a new change.",409);}
 const epoch=await academyEpoch();const statements=[academyEpochGuard(epoch)];
 if(input.action==="school_assign"){
  if(identity.role!=="school_coordinator")fail("School coordinator access is required.",403);
  const placement=await env.DB.prepare(`SELECT p.technician_id AS technicianId
   FROM training_schools s JOIN training_placements p ON p.school_id=s.id AND p.organization_id=s.organization_id
   WHERE s.organization_id=? AND s.coordinator_email=? AND s.active=1 AND p.id=? AND p.status='active' AND p.technician_id IS NOT NULL`).bind(TECHFLEX_ORG_ID,identity.email,input.placementId).first<{technicianId:string}>();
  if(!placement?.technicianId)fail("Choose an active student placement linked to a technician.",403);
  const tech=await academyTechnician(placement.technicianId,input.track);
  const course=await env.DB.prepare("SELECT published_revision_id AS revisionId FROM academy_courses WHERE id=? AND organization_id=? AND track=? AND status='published'").bind(input.courseId,TECHFLEX_ORG_ID,input.track).first<{revisionId:string}>();
  if(!course?.revisionId)fail("Choose a reviewed published course in this career track.");
  if(await env.DB.prepare("SELECT id FROM academy_enrollments WHERE organization_id=? AND technician_id=? AND revision_id=?").bind(TECHFLEX_ORG_ID,tech.id,course.revisionId).first())fail("This course revision is already in the student’s learning plan.",409);
  statements.push(guard(`SELECT 1 FROM training_schools s JOIN training_placements p ON p.school_id=s.id AND p.organization_id=s.organization_id
   WHERE s.organization_id=? AND s.coordinator_email=? AND s.active=1 AND p.id=? AND p.status='active' AND p.technician_id=?`,TECHFLEX_ORG_ID,identity.email,input.placementId,tech.id));
  statements.push(guard("SELECT 1 FROM technicians t WHERE t.id=? AND t.organization_id=? AND EXISTS (SELECT 1 FROM json_each(t.service_disciplines_json) WHERE value=?)",tech.id,TECHFLEX_ORG_ID,input.track));
  statements.push(guard("SELECT 1 FROM academy_courses WHERE id=? AND organization_id=? AND track=? AND status='published' AND published_revision_id=?",input.courseId,TECHFLEX_ORG_ID,input.track,course.revisionId));
  statements.push(guard("SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM academy_enrollments WHERE organization_id=? AND technician_id=? AND revision_id=?)",TECHFLEX_ORG_ID,tech.id,course.revisionId));
  statements.push(env.DB.prepare("INSERT INTO academy_enrollments(id,organization_id,track,technician_id,revision_id,progress_json,assigned_by) VALUES(?,?,?,?,?,'{}',?)").bind(input.requestId,TECHFLEX_ORG_ID,input.track,tech.id,course.revisionId,identity.userId));
 }else{
  if(identity.role==="school_coordinator")fail("School coordinators may only assign reviewed learning to their active placements.",403);
  const {tech,own}=await target(identity,input.technicianId,input.track);
  if(input.action==="course"){
  if(!canAuthor(identity,input.track))fail("Academy author access is required.",403);
  const old=await env.DB.prepare("SELECT record_version AS version FROM academy_courses WHERE id=? AND organization_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,input.track).first<{version:number}>();
  if((old?.version||0)!==input.version)fail("This course changed. Reload; your draft remains on screen.",409);
  const snapshot=input.snapshot;
  if(old)statements.push(guard("SELECT 1 FROM academy_courses WHERE id=? AND organization_id=? AND track=? AND record_version=?",input.id,TECHFLEX_ORG_ID,input.track,input.version));
  statements.push(old?env.DB.prepare("UPDATE academy_courses SET title=?,category=?,level=?,manufacturer=?,model=?,credential=?,specialty=?,difficulty=?,draft_json=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND track=? AND record_version=?").bind(input.title,input.category,input.level,input.manufacturer,input.model,input.credential,input.specialty,input.difficulty,JSON.stringify(snapshot),identity.userId,input.id,TECHFLEX_ORG_ID,input.track,input.version):env.DB.prepare("INSERT INTO academy_courses(id,organization_id,track,title,category,level,manufacturer,model,credential,specialty,difficulty,draft_json,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(input.id,TECHFLEX_ORG_ID,input.track,input.title,input.category,input.level,input.manufacturer,input.model,input.credential,input.specialty,input.difficulty,JSON.stringify(snapshot),identity.userId));
 }else if(input.action==="publish"){
  if(!canAuthor(identity,input.track))fail("Academy author access is required.",403);
  const row=await env.DB.prepare("SELECT title,draft_json AS draftJson,record_version AS version FROM academy_courses WHERE id=? AND organization_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,input.track).first<Row>();
  if(!row||row.version!==input.version)fail("This course changed. Reload before publishing.",409);
  if(!String(row.title).trim())fail("Add a course title before publishing.");
  const snapshot=courseSnapshotSchema.parse(safeJson(row.draftJson,{}));
  if(!snapshot.sourceReviewed||snapshot.lessons.some(l=>!l.sourceName||!l.sourceReference))fail("Review the actual source and record a source name and reference for every lesson before publishing.");
  const current=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM academy_course_revisions WHERE course_id=? AND organization_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,input.track).first<{revision:number}>(),revision=(current?.revision||0)+1,revisionId=crypto.randomUUID();
  statements.push(guard("SELECT 1 FROM academy_courses WHERE id=? AND organization_id=? AND track=? AND record_version=?",input.id,TECHFLEX_ORG_ID,input.track,input.version));
  statements.push(env.DB.prepare("INSERT INTO academy_course_revisions(id,course_id,organization_id,track,revision,snapshot_json,published_by) VALUES(?,?,?,?,?,?,?)").bind(revisionId,input.id,TECHFLEX_ORG_ID,input.track,revision,JSON.stringify(snapshot),identity.userId));
  statements.push(env.DB.prepare("UPDATE academy_courses SET status='published',published_revision_id=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND track=? AND record_version=?").bind(revisionId,identity.userId,input.id,TECHFLEX_ORG_ID,input.track,input.version));
 }else if(input.action==="enroll"){
  if(!own&&!manager(identity))fail("Enroll yourself or ask an Academy administrator.",403);
  const course=await env.DB.prepare("SELECT published_revision_id AS revisionId FROM academy_courses WHERE id=? AND organization_id=? AND track=? AND status='published'").bind(input.courseId,TECHFLEX_ORG_ID,input.track).first<{revisionId:string}>();if(!course?.revisionId)fail("Choose a published course in this career track.");
  if(await env.DB.prepare("SELECT id FROM academy_enrollments WHERE organization_id=? AND technician_id=? AND revision_id=?").bind(TECHFLEX_ORG_ID,tech.id,course.revisionId).first())fail("This course revision is already in the learner’s plan.",409);
  statements.push(env.DB.prepare("INSERT INTO academy_enrollments(id,organization_id,track,technician_id,revision_id,progress_json,assigned_by) VALUES(?,?,?,?,?,'{}',?)").bind(input.requestId,TECHFLEX_ORG_ID,input.track,tech.id,course.revisionId,identity.userId));
 }else if(input.action==="progress"){
  if(!own)fail("Only the learner can record their actual participation and answers.",403);
  const row=await env.DB.prepare(`SELECT e.status,e.record_version AS version,e.training_record_id AS trainingRecordId,tr.status AS trainingStatus,r.snapshot_json AS snapshotJson,c.title
   FROM academy_enrollments e JOIN academy_course_revisions r ON r.id=e.revision_id AND r.organization_id=e.organization_id AND r.track=e.track JOIN academy_courses c ON c.id=r.course_id AND c.organization_id=e.organization_id AND c.track=e.track LEFT JOIN academy_training_records tr ON tr.id=e.training_record_id AND tr.organization_id=e.organization_id
   WHERE e.id=? AND e.organization_id=? AND e.technician_id=? AND e.track=?`).bind(input.id,TECHFLEX_ORG_ID,tech.id,input.track).first<Row>();
  if(!row||row.version!==input.version)fail("Course progress changed. Reload; your answers remain on screen.",409);
  if(row.status==="submitted"&&row.trainingStatus!=="returned"&&row.trainingStatus!=null)fail("Submitted learning is locked while training evidence is under review or verified.",409);
  const snapshot=courseSnapshotSchema.parse(safeJson(row.snapshotJson,{}));const allowedLessons=new Set(snapshot.lessons.map(l=>l.id));if(input.completedLessonIds.some(id=>!allowedLessons.has(id))||input.lessonIndex>=snapshot.lessons.length)fail("Course content changed. Reload the pinned course revision.",409);
  const allowedQuestions=new Set(snapshot.questions.map(q=>q.id));if(Object.keys(input.answers).some(id=>!allowedQuestions.has(id)))fail("An answer does not belong to this course revision.",409);
  const result=courseResult(snapshot,input.completedLessonIds,input.answers);if(input.status==="submitted"&&!result.passed)fail(`Complete every lesson and assessment at ${snapshot.passPercent}% or better before requesting training verification.`);
  const progress={lessonIndex:input.lessonIndex,completedLessonIds:[...new Set(input.completedLessonIds)],answers:input.answers,notes:input.notes,lastSavedAt:new Date().toISOString(),score:result.score};
  let trainingId:string|null=null;
  if(input.status==="submitted"){
   trainingId=crypto.randomUUID();statements.push(env.DB.prepare("INSERT INTO academy_training_records(id,organization_id,technician_id,track,title,provider,completed_on,evidence,status,submitted_by) VALUES(?,?,?,?,?,? ,date('now'),?,'submitted',?)").bind(trainingId,TECHFLEX_ORG_ID,tech.id,input.track,String(row.title),snapshot.provider,`Completed pinned course revision. Score ${result.score}%. Course completion requests evidence review; it does not grant competency or service authority.`,identity.userId));
  }
  statements.push(guard("SELECT 1 FROM academy_enrollments WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND record_version=?",input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
  statements.push(env.DB.prepare("UPDATE academy_enrollments SET progress_json=?,status=?,training_record_id=COALESCE(?,training_record_id),record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND record_version=?").bind(JSON.stringify(progress),input.status,trainingId,input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
 }else if(input.action==="education"){
  if(!own&&!financeRoles.includes(identity.role))fail("Save your own request or ask an owner/operations administrator.",403);
  const old=await env.DB.prepare("SELECT status,record_version AS version FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,tech.id,input.track).first<{status:string;version:number}>();
  if((old?.version||0)!==input.version||old&&!["draft","returned"].includes(old.status))fail("This education request changed or has a decision. Reload or start a new request.",409);
  if(input.requestedCompanyCents!==null&&input.costCents!==null&&input.requestedCompanyCents>input.costCents)fail("Requested company contribution cannot exceed the known course cost.");
  if(input.officialUrl&&!/^https:\/\//i.test(input.officialUrl))fail("Use an HTTPS official provider link.");
  if(input.status==="submitted"&&(!input.course||!input.provider||input.costCents===null||input.requestedCompanyCents===null))fail("Add the course, provider, known cost and requested contribution before submitting. Save draft remains available.");
  if(old)statements.push(guard("SELECT 1 FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND record_version=? AND status IN ('draft','returned')",input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
  statements.push(old?env.DB.prepare("UPDATE academy_education_requests SET course=?,provider=?,official_url=?,cost_cents=?,requested_company_cents=?,agreement_reference=?,notes=?,status=?,decision_notes='',decided_by=NULL,decided_at=NULL,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND record_version=?").bind(input.course,input.provider,input.officialUrl,input.costCents,input.requestedCompanyCents,input.agreementReference,input.notes,input.status,input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version):env.DB.prepare("INSERT INTO academy_education_requests(id,organization_id,track,technician_id,course,provider,official_url,cost_cents,requested_company_cents,agreement_reference,notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(input.id,TECHFLEX_ORG_ID,input.track,tech.id,input.course,input.provider,input.officialUrl,input.costCents,input.requestedCompanyCents,input.agreementReference,input.notes,input.status,identity.userId));
 }else if(input.action==="education_review"){
  if(!financeRoles.includes(identity.role))fail("Owner or operations administrator approval is required.",403);if(own)fail("Another owner or operations administrator must decide this request.",403);
  const row=await env.DB.prepare("SELECT cost_cents AS cost,requested_company_cents AS requested,record_version AS version,created_by AS createdBy FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='submitted'").bind(input.id,TECHFLEX_ORG_ID,tech.id,input.track).first<{cost:number;requested:number;version:number;createdBy:string}>();
  if(!row||row.version!==input.version)fail("Only the current submitted request can be decided.",409);
  if(row.createdBy===identity.userId)fail("Another owner or operations administrator must decide this request.",403);
  if(input.status==="approved"&&(input.approvedCompanyCents===null||input.approvedCompanyCents>row.cost))fail("Record an approved company contribution no greater than the known course cost.");
  const approved=input.status==="approved"?input.approvedCompanyCents:null,remainder=approved===null?null:row.cost-approved;
  statements.push(guard("SELECT 1 FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='submitted' AND record_version=?",input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
  statements.push(env.DB.prepare("UPDATE academy_education_requests SET status=?,approved_company_cents=?,employee_remainder_cents=?,agreement_reference=?,decision_notes=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='submitted' AND record_version=?").bind(input.status,approved,remainder,input.agreementReference,input.decisionNotes,identity.userId,input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
 }else if(input.action==="education_completion"){
  if(!own&&!financeRoles.includes(identity.role))fail("Link your own completion or ask an owner/operations administrator.",403);
  const row=await env.DB.prepare("SELECT record_version AS version FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='approved'").bind(input.id,TECHFLEX_ORG_ID,tech.id,input.track).first<{version:number}>();if(!row||row.version!==input.version)fail("Only the current approved request can link completion.",409);
  if(!await env.DB.prepare("SELECT id FROM academy_training_records WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='verified'").bind(input.trainingRecordId,TECHFLEX_ORG_ID,tech.id,input.track).first())fail("Link an independently verified training record for this technician and career track.");
  statements.push(guard("SELECT 1 FROM academy_education_requests WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='approved' AND record_version=?",input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
  statements.push(guard("SELECT 1 FROM academy_training_records WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='verified'",input.trainingRecordId,TECHFLEX_ORG_ID,tech.id,input.track));
  statements.push(env.DB.prepare("UPDATE academy_education_requests SET status='completed',training_record_id=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND technician_id=? AND track=? AND status='approved' AND record_version=?").bind(input.trainingRecordId,input.id,TECHFLEX_ORG_ID,tech.id,input.track,input.version));
 }
 }
 const entityId="placementId" in input?input.placementId:"id" in input?input.id:input.courseId;
 statements.push(audit(identity,input.requestId,input.action,entityId,replay.body));await env.DB.batch(statements);return Response.json({saved:true},{headers});
 }catch(error){
  if(replay.id&&replay.actor){try{const done=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?").bind(replay.id).first<{actor:string;body:string}>();if(done?.actor===replay.actor&&done.body===replay.body)return Response.json({saved:true,replayed:true},{headers});}catch{/* original error wins */}}
  const response=error instanceof z.ZodError?Response.json({error:error.issues.map(i=>i.message).join(" ")},{status:400}):/academy_learning_changed|malformed JSON/i.test(String(error))?Response.json({error:"This Academy learning record changed. Reload and review your entries before retrying."},{status:409}):apiError(error);response.headers.set("Cache-Control",headers["Cache-Control"]);return response;
 }}
