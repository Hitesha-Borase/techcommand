import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,PortalHttpError,requirePortalRole,TECHFLEX_ORG_ID} from "@/lib/portal-auth";
import {academyManagers,academyTechnician,academyEpoch,academyEpochGuard} from "@/lib/academy";
import {trackCatalog,dmeFamilies,exactUnit,type AcademyTrack} from "@/lib/academy-catalog";
import {academyPolicies,assessProgress,developmentRoadmap,evidenceSnapshot,evidenceHash,progressionEvidenceGuard,requirementKinds,workforceCapability} from "@/lib/academy-progression";

const headers={"Cache-Control":"private, no-store"};
const roles=["owner_administrator","operations_administrator","biomedical_lead","technician"] as const;
const administrators=["owner_administrator","operations_administrator"];
const trackSchema=z.enum(["biomedical","dme_mobility"]);
const txt=z.string().trim().max(4000),id=z.string().min(1).max(180);
const requirement=z.object({id:z.string().uuid(),kind:z.enum(requirementKinds),label:txt.max(200).default(""),minimum:z.number().int().min(1).max(100000),matchValue:txt.max(240).default(""),issuer:txt.max(240).default(""),familyId:id.nullable().default(null),manufacturer:txt.max(160).default(""),model:txt.max(160).default(""),task:txt.max(80).default("")});
const base={requestId:z.string().uuid(),track:trackSchema};
const schema=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("policy"),id:z.string().uuid(),version:z.number().int().min(0),targetLevel:txt.max(80),title:txt.max(240).default(""),status:z.enum(["draft","active"]),compensationReview:z.boolean().default(false),payBandMinCents:z.number().int().min(0).max(1000000).nullable().default(null),payBandMaxCents:z.number().int().min(0).max(1000000).nullable().default(null),notes:txt.default(""),requirements:z.array(requirement).max(40)}),
 z.object({...base,action:z.literal("request_review"),technicianId:id,policyId:z.string().uuid(),policyVersion:z.number().int().positive()}),
 z.object({...base,action:z.literal("review"),id:z.string().uuid(),version:z.number().int().positive(),decision:z.enum(["approved","deferred","additional_evidence"]),compensationDecision:z.enum(["pending_review","reviewed","deferred"]).default("pending_review"),notes:txt.min(5)}),
 z.object({...base,action:z.literal("compensation_review"),id:z.string().uuid(),version:z.number().int().positive(),decision:z.enum(["reviewed","deferred"]),notes:txt.min(5)}),
]);
function policyGuard(policyId:string,version:number){return env.DB.prepare("SELECT CASE WHEN COALESCE((SELECT record_version FROM academy_policies WHERE id=? AND organization_id=?),0)=? THEN 1 ELSE json('academy_policy_changed') END").bind(policyId,TECHFLEX_ORG_ID,version);}
const reviewSelect="SELECT r.id,r.technician_id AS technicianId,COALESCE(u.display_name,t.technician_code) AS technicianName,r.policy_id AS policyId,r.policy_version AS policyVersion,r.evidence_hash AS evidenceHash,r.status,r.compensation_status AS compensationStatus,r.decision_notes AS decisionNotes,r.compensation_notes AS compensationNotes,r.record_version AS version,r.created_at AS createdAt,r.decided_at AS decidedAt,json_extract(r.snapshot_json,'$.assessment') AS assessmentJson FROM academy_advancement_reviews r JOIN technicians t ON t.id=r.technician_id AND t.organization_id=r.organization_id LEFT JOIN users u ON u.id=t.user_id WHERE r.organization_id=? AND r.track=?";
export async function GET(request:Request){try{
 const identity=await requirePortalRole(request,[...roles]);const params=new URL(request.url).searchParams;const track=trackSchema.parse(params.get("track"));
 if(identity.role==="biomedical_lead"&&track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not expose DME development records.");
 const manager=academyManagers.includes(identity.role),canConfigure=administrators.includes(identity.role),technicianId=params.get("technicianId")||identity.technicianId;
 if(!manager&&(!technicianId||technicianId!==identity.technicianId))throw new PortalHttpError(403,"Your own career progress only.");
 if(technicianId)await academyTechnician(technicianId,track);
 const policies=await academyPolicies(track),raw=technicianId?await evidenceSnapshot(technicianId,track):null;
 const profile=raw?JSON.parse(raw).profile:null;const policy=policies.find(p=>p.status==="active"&&p.targetLevel===profile?.target);
 const assessment=policy&&raw?assessProgress(raw,policy):null;
 const reviews=await env.DB.prepare(reviewSelect+(manager?"":" AND r.technician_id=?")+" ORDER BY r.created_at DESC LIMIT 200").bind(TECHFLEX_ORG_ID,track,...(!manager?[technicianId]:[])).all();
 const ready=[];
 if(manager){
  const technicians=await env.DB.prepare("SELECT t.id,COALESCE(u.display_name,t.technician_code) AS name FROM technicians t JOIN academy_profiles p ON p.technician_id=t.id AND p.organization_id=t.organization_id AND p.track=? LEFT JOIN users u ON u.id=t.user_id WHERE t.organization_id=? AND t.status='active' AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.service_disciplines_json) THEN t.service_disciplines_json ELSE '[]' END) WHERE value=?) ORDER BY name").bind(track,TECHFLEX_ORG_ID,track).all<{id:string;name:string}>();
  for(const t of technicians.results){const snapshot=await evidenceSnapshot(t.id,track),profile=JSON.parse(snapshot).profile,p=policies.find(p=>p.status==="active"&&p.targetLevel===profile?.target);if(!p)continue;const result=assessProgress(snapshot,p);if(result.eligible)ready.push({technicianId:t.id,name:t.name,...result});}
 }
 return Response.json({canConfigure,manager,policies:manager?policies:policies.filter(p=>p.status==="active"),assessment,roadmap:raw?developmentRoadmap(raw,assessment,track):null,reviews:reviews.results.map(({assessmentJson,...review})=>({...review,assessment:JSON.parse(String(assessmentJson||"null"))})),ready,workforce:manager?await workforceCapability(track):null},{headers});
}catch(e){return failure(e);}}
function failure(e:unknown){const r=e instanceof z.ZodError?Response.json({error:"Check the highlighted career policy fields and retry."},{status:400}):/malformed JSON|academy_.*changed|UNIQUE constraint/i.test(String(e))?Response.json({error:"The career policy or evidence changed. Reload the current record before retrying; saved fieldwork is unchanged."},{status:409}):apiError(e);r.headers.set("Cache-Control",headers["Cache-Control"]);return r;}

export async function POST(request:Request){let requestId="",body="",actor="";try{
 const identity=await requirePortalRole(request,[...roles]);actor=identity.userId;
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new PortalHttpError(403,"Save from your signed-in portal.");
 const raw=await request.text();if(raw.length>60000)throw new PortalHttpError(413,"This career policy is too large.");
 const input=schema.parse(JSON.parse(raw));requestId=input.requestId;body=JSON.stringify(input);
 const replay=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?").bind(requestId).first<{actor:string;body:string}>();
 if(replay){if(replay.actor===actor&&replay.body===body)return Response.json({saved:true,replayed:true},{headers});throw new PortalHttpError(409,"This save identifier belongs to a different change.");}
 if(identity.role==="biomedical_lead"&&input.track!=="biomedical")throw new PortalHttpError(403,"Biomedical management does not manage DME career records.");
 const canConfigure=administrators.includes(identity.role);const epoch=await academyEpoch();const statements=[academyEpochGuard(epoch)];let entityId="";
 if(input.action==="policy"){
  if(!canConfigure)throw new PortalHttpError(403,"An owner or operations administrator configures advancement and compensation-review policies.");
  const catalog=trackCatalog(input.track);
  if(!catalog.levels.some(l=>l.id===input.targetLevel))throw new PortalHttpError(400,"Choose a target level in this career track.");
  if(input.payBandMinCents!==null&&input.payBandMaxCents!==null&&input.payBandMinCents>input.payBandMaxCents)throw new PortalHttpError(400,"The lower hourly career band cannot exceed the upper band.");
  if(new Set(input.requirements.map(r=>r.id)).size!==input.requirements.length)throw new PortalHttpError(400,"Each requirement needs its own row.");
  if(input.status==="active"&&(!input.title||!input.requirements.length))throw new PortalHttpError(400,"Add a policy name and evidence requirements before activating. You can save a draft now.");
  for(const r of input.requirements){
   if(r.task&&!(catalog.tasks as readonly string[]).includes(r.task))throw new PortalHttpError(400,"Requirement task must belong to this track.");
   if(r.kind==="credential"&&r.minimum!==1)throw new PortalHttpError(400,"Use one requirement per distinct credential. Duplicate credential entries cannot satisfy a higher credential count.");
   if(r.familyId){const family=input.track==="dme_mobility"?dmeFamilies.find(f=>f.id===r.familyId):await env.DB.prepare("SELECT id FROM asset_categories WHERE id=? AND organization_id=?").bind(r.familyId,TECHFLEX_ORG_ID).first();if(!family)throw new PortalHttpError(400,"Choose an equipment family in this track.");}
   if(input.status==="active"&&(!r.label||(r.kind==="training"&&!r.matchValue)||(r.kind==="credential"&&(!r.matchValue||!r.issuer))||(r.model&&!r.manufacturer)))throw new PortalHttpError(400,"Name each requirement; named training/credentials need an exact name, credentials need their issuer, and a model needs its manufacturer.");
   if(r.kind.endsWith("_percent")&&r.minimum>100)throw new PortalHttpError(400,"Quality percentage requirements must be between 1 and 100.");
  }
  if(input.status==="active"&&input.requirements.some(r=>r.kind.endsWith("_percent"))&&!input.requirements.some(r=>r.kind==="quality_reviews"))throw new PortalHttpError(400,"Add a minimum reviewed quality-outcome count before activating a percentage requirement.");
  const old=await env.DB.prepare("SELECT record_version AS version,track FROM academy_policies WHERE id=? AND organization_id=?").bind(input.id,TECHFLEX_ORG_ID).first<{version:number;track:AcademyTrack}>();
  if((old?.version||0)!==input.version||old&&old.track!==input.track)throw new PortalHttpError(409,"Policy changed. Reload it before editing.");
  statements.push(policyGuard(input.id,input.version),env.DB.prepare(`INSERT INTO academy_policies(id,organization_id,track,target_level,title,status,compensation_review,pay_band_min_cents,pay_band_max_cents,notes,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET target_level=excluded.target_level,title=excluded.title,status=excluded.status,compensation_review=excluded.compensation_review,pay_band_min_cents=excluded.pay_band_min_cents,pay_band_max_cents=excluded.pay_band_max_cents,notes=excluded.notes,updated_by=excluded.updated_by,record_version=academy_policies.record_version+1,updated_at=CURRENT_TIMESTAMP`).bind(input.id,TECHFLEX_ORG_ID,input.track,input.targetLevel,input.title,input.status,Number(input.compensationReview),input.payBandMinCents,input.payBandMaxCents,input.notes,identity.userId),env.DB.prepare("DELETE FROM academy_requirements WHERE policy_id=?").bind(input.id));
  input.requirements.forEach((r,i)=>statements.push(env.DB.prepare("INSERT INTO academy_requirements(id,policy_id,kind,label,minimum,match_value,issuer,family_id,manufacturer,model,task,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id,input.id,r.kind,r.label,r.minimum,r.matchValue,r.issuer,r.familyId,exactUnit(r.manufacturer),exactUnit(r.model),r.task,i)));
  entityId=input.id;
 }else if(input.action==="request_review"){
  if(input.technicianId!==identity.technicianId&&!academyManagers.includes(identity.role))throw new PortalHttpError(403,"Request review for your own career record.");
  await academyTechnician(input.technicianId,input.track);
  const policy=(await academyPolicies(input.track)).find(p=>p.id===input.policyId&&p.version===input.policyVersion);if(!policy)throw new PortalHttpError(409,"Reload the current advancement policy.");
  const snapshot=await evidenceSnapshot(input.technicianId,input.track),assessment=assessProgress(snapshot,policy);if(!assessment.eligible)throw new PortalHttpError(409,"The current verified requirements are not all met. Your draft training and fieldwork remain saved.");
  const hash=await evidenceHash(snapshot);
  const existing=await env.DB.prepare("SELECT id FROM academy_advancement_reviews WHERE organization_id=? AND technician_id=? AND policy_id=? AND policy_version=? AND evidence_hash=?").bind(TECHFLEX_ORG_ID,input.technicianId,policy.id,policy.version,hash).first<{id:string}>();
  entityId=existing?.id||requestId;
  statements.push(policyGuard(policy.id,policy.version),progressionEvidenceGuard(input.technicianId,input.track,snapshot));
  if(!existing)statements.push(env.DB.prepare("INSERT INTO academy_advancement_reviews(id,organization_id,track,technician_id,policy_id,policy_version,evidence_hash,snapshot_json,compensation_status,requested_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(requestId,TECHFLEX_ORG_ID,input.track,input.technicianId,policy.id,policy.version,hash,JSON.stringify({policy,assessment,evidence:JSON.parse(snapshot)}),policy.compensationReview?"pending_review":"not_requested",identity.userId));
 }else if(input.action==="compensation_review"){
  if(!canConfigure)throw new PortalHttpError(403,"An owner or operations administrator records compensation-review decisions.");
  const review=await env.DB.prepare("SELECT technician_id AS technicianId,status,compensation_status AS compensationStatus,record_version AS version FROM academy_advancement_reviews WHERE id=? AND organization_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,input.track).first<{technicianId:string;status:string;compensationStatus:string;version:number}>();
  if(!review||review.version!==input.version||review.status==="pending"||!["pending_review","deferred"].includes(review.compensationStatus))throw new PortalHttpError(409,"This compensation review changed or is already complete. Reload the decision history.");
  if(review.technicianId===identity.technicianId)throw new PortalHttpError(403,"Another administrator must review your compensation.");
  statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM academy_advancement_reviews WHERE id=? AND organization_id=? AND record_version=? AND status<>'pending' AND compensation_status IN ('pending_review','deferred')) THEN 1 ELSE json('academy_review_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version),env.DB.prepare("UPDATE academy_advancement_reviews SET compensation_status=?,compensation_notes=?,compensation_decided_by=?,compensation_decided_at=CURRENT_TIMESTAMP,record_version=record_version+1 WHERE id=? AND organization_id=?").bind(input.decision,input.notes,identity.userId,input.id,TECHFLEX_ORG_ID));entityId=input.id;
 }else{
  if(!canConfigure)throw new PortalHttpError(403,"An owner or operations administrator makes career and compensation-review decisions.");
  const review=await env.DB.prepare("SELECT technician_id AS technicianId,policy_id AS policyId,policy_version AS policyVersion,evidence_hash AS evidenceHash,status,record_version AS version,compensation_status AS compensationStatus FROM academy_advancement_reviews WHERE id=? AND organization_id=? AND track=?").bind(input.id,TECHFLEX_ORG_ID,input.track).first<{technicianId:string;policyId:string;policyVersion:number;evidenceHash:string;status:string;version:number;compensationStatus:string}>();
  if(!review||review.version!==input.version||review.status!=="pending")throw new PortalHttpError(409,"This review changed or was already decided. Its decision history is preserved.");
  if(review.technicianId===identity.technicianId)throw new PortalHttpError(403,"Another administrator must review your advancement.");
  await academyTechnician(review.technicianId,input.track);
  const snapshot=await evidenceSnapshot(review.technicianId,input.track),policy=(await academyPolicies(input.track)).find(p=>p.id===review.policyId);
  if(input.decision==="approved"){
   if(!policy||policy.version!==review.policyVersion||await evidenceHash(snapshot)!==review.evidenceHash||!assessProgress(snapshot,policy).eligible)throw new PortalHttpError(409,"The policy or supporting evidence changed. Request a fresh review before approving advancement.");
   statements.push(policyGuard(policy.id,policy.version),progressionEvidenceGuard(review.technicianId,input.track,snapshot),env.DB.prepare("UPDATE academy_profiles SET current_level=?,evidence=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND technician_id=? AND track=?").bind(policy.targetLevel,`Approved advancement review ${input.id}: ${input.notes}`,identity.userId,TECHFLEX_ORG_ID,review.technicianId,input.track));
  }
  statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM academy_advancement_reviews WHERE id=? AND organization_id=? AND status='pending' AND record_version=?) THEN 1 ELSE json('academy_review_changed') END").bind(input.id,TECHFLEX_ORG_ID,input.version),env.DB.prepare("UPDATE academy_advancement_reviews SET status=?,compensation_status=?,decision_notes=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,record_version=record_version+1 WHERE id=? AND organization_id=?").bind(input.decision,review.compensationStatus==="not_requested"?"not_requested":input.compensationDecision,input.notes,identity.userId,input.id,TECHFLEX_ORG_ID));entityId=input.id;
 }
 statements.push(env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,?,'academy_progression',?,?)").bind(requestId,TECHFLEX_ORG_ID,identity.userId,`academy.progression.${input.action}`,entityId,body));
 await env.DB.batch(statements);return Response.json({saved:true},{headers});
}catch(e){if(requestId&&actor){try{const done=await env.DB.prepare("SELECT actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?").bind(requestId).first<{actor:string;body:string}>();if(done?.actor===actor&&done.body===body)return Response.json({saved:true,replayed:true},{headers});}catch{/* Preserve original failure. */}}return failure(e);}}
