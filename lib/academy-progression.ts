import {env} from "cloudflare:workers";
import {TECHFLEX_ORG_ID} from "@/lib/portal-auth";
import {exactUnit,trackCatalog,type AcademyTrack} from "@/lib/academy-catalog";
import {parseDisciplines} from "@/lib/service-disciplines";
import {summarizeQuality,type QualityRow} from "@/lib/academy-quality";

export const requirementKinds=["work_orders","pm_repetitions","repair_repetitions","equipment_families","training_minutes","training","credential","authorization","supervisor_signoffs","quality_reviews","diagnostic_resolution_percent","first_repair_success_percent","callback_free_percent","documentation_first_pass_percent"] as const;
export const requirementLabels:Record<string,string>={work_orders:"QA-approved work orders",pm_repetitions:"Verified PM repetitions",repair_repetitions:"Verified repair repetitions",equipment_families:"Equipment families serviced",training_minutes:"Verified training minutes",training:"Named verified training",credential:"Current verified credential",authorization:"Independent equipment/task authorizations",supervisor_signoffs:"Current practical competency sign-offs",quality_reviews:"Administrator-reviewed quality outcomes",diagnostic_resolution_percent:"Reviewed diagnostic resolution",first_repair_success_percent:"Reviewed first-repair success",callback_free_percent:"Reviewed same-issue callback-free rate",documentation_first_pass_percent:"Documentation accepted on first QA review"};
export type Requirement={id:string;kind:typeof requirementKinds[number];label:string;minimum:number;matchValue:string;issuer:string;familyId:string|null;manufacturer:string;model:string;task:string};
export type AcademyPolicy={id:string;track:AcademyTrack;targetLevel:string;title:string;status:string;compensationReview:number;payBandMinCents:number|null;payBandMaxCents:number|null;notes:string;version:number;requirements:Requirement[]};
type Evidence={day:string;technician:{status:string;disciplines:string};profile:{level:string;target:string;specialty:string;version:number}|null;training:{id:string;title:string;minutes:number}[];credentials:{id:string;name:string;issuer:string;status:string;expires:string|null}[];authorizations:{id:string;familyId:string;manufacturer:string;model:string;task:string;level:string;expires:string|null;signoffId:string}[];experience:{id:string;workOrderId:string|null;sourceKey:string;familyId:string|null;manufacturer:string;model:string;task:string;supervision:string;qaResult:string;disposition:string}[];quality:QualityRow[]};

// One read freezes all relevant evidence. The same expression is rechecked in
// the write transaction, including legacy credential updates outside Academy.
export const academyEvidenceSql=`SELECT json_object(
 'day',date('now'),
 'technician',json((SELECT json_object('status',status,'disciplines',service_disciplines_json) FROM technicians WHERE organization_id='techflex' AND id=?1)),
 'profile',json((SELECT json_object('level',current_level,'target',target_level,'specialty',specialty,'version',record_version) FROM academy_profiles WHERE organization_id='techflex' AND technician_id=?1 AND track=?2)),
 'training',json((SELECT json_group_array(json_object('id',id,'title',title,'minutes',COALESCE(minutes,0))) FROM (SELECT id,title,minutes FROM academy_training_records WHERE organization_id='techflex' AND technician_id=?1 AND track=?2 AND status='verified' ORDER BY id))),
 'credentials',json((SELECT json_group_array(json_object('id',id,'name',credential_type,'issuer',issuer,'status',status,'expires',expires_on)) FROM (SELECT id,credential_type,issuer,status,expires_on FROM technician_credentials WHERE technician_id=?1 ORDER BY id))),
 'authorizations',json((SELECT json_group_array(json_object('id',id,'familyId',family_id,'manufacturer',manufacturer,'model',model,'task',task,'level',level,'expires',review_due_on,'signoffId',signoff_id)) FROM (SELECT a.* FROM academy_authorizations a JOIN academy_families f ON f.id=a.family_id AND f.organization_id=a.organization_id AND f.track=a.track JOIN academy_signoffs s ON s.id=a.signoff_id AND s.organization_id=a.organization_id AND s.track=a.track AND s.technician_id=a.technician_id AND s.family_id=a.family_id AND s.manufacturer=a.manufacturer AND s.model=a.model AND s.task=a.task AND s.authorization_level=a.level WHERE a.organization_id='techflex' AND a.technician_id=?1 AND a.track=?2 ORDER BY a.id))),
 'experience',json((SELECT json_group_array(json_object('id',id,'workOrderId',work_order_id,'sourceKey',source_key,'familyId',family_id,'manufacturer',manufacturer,'model',model,'task',task,'supervision',supervision,'qaResult',qa_result,'disposition',disposition)) FROM (SELECT * FROM academy_experience WHERE organization_id='techflex' AND technician_id=?1 AND track=?2 ORDER BY id))),
 'quality',json((SELECT json_group_array(json_object('id',id,'reportId',report_id,'workOrderId',work_order_id,'reportVersion',report_version,'revision',revision,'diagnosticOutcome',diagnostic_outcome,'firstRepairOutcome',first_repair_outcome,'callbackOutcome',callback_outcome,'documentationOutcome',documentation_outcome,'reviewedThroughOn',reviewed_through_on,'evidence',evidence,'createdAt',created_at)) FROM (SELECT q.* FROM academy_quality_reviews q WHERE q.organization_id='techflex' AND q.technician_id=?1 AND q.track=?2 AND q.revision=(SELECT MAX(n.revision) FROM academy_quality_reviews n WHERE n.organization_id=q.organization_id AND n.track=q.track AND n.report_id=q.report_id AND n.technician_id=q.technician_id) ORDER BY q.report_id)))
) AS snapshot`;
export async function evidenceSnapshot(technicianId:string,track:AcademyTrack){const row=await env.DB.prepare(academyEvidenceSql).bind(technicianId,track).first<{snapshot:string}>();return row?.snapshot||"{}";}
export function progressionEvidenceGuard(technicianId:string,track:AcademyTrack,snapshot:string){return env.DB.prepare(`SELECT CASE WHEN (${academyEvidenceSql})=?3 THEN 1 ELSE json('academy_evidence_changed') END`).bind(technicianId,track,snapshot);}
export async function evidenceHash(snapshot:string){const evidence=JSON.parse(snapshot);delete evidence.day;return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(evidence))))).map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function academyPolicies(track:AcademyTrack){
 const rows=await env.DB.prepare("SELECT id,track,target_level AS targetLevel,title,status,compensation_review AS compensationReview,pay_band_min_cents AS payBandMinCents,pay_band_max_cents AS payBandMaxCents,notes,record_version AS version FROM academy_policies WHERE organization_id=? AND track=? ORDER BY target_level").bind(TECHFLEX_ORG_ID,track).all<Omit<AcademyPolicy,"requirements">>();
 const requirements=await env.DB.prepare("SELECT r.id,r.policy_id AS policyId,r.kind,r.label,r.minimum,r.match_value AS matchValue,r.issuer,r.family_id AS familyId,r.manufacturer,r.model,r.task FROM academy_requirements r JOIN academy_policies p ON p.id=r.policy_id WHERE p.organization_id=? AND p.track=? ORDER BY r.sort_order,r.id").bind(TECHFLEX_ORG_ID,track).all<Requirement&{policyId:string}>();
 return rows.results.map(p=>({...p,requirements:requirements.results.filter(r=>r.policyId===p.id)}));
}
function matches(row:{familyId:string|null;manufacturer:string;model:string;task:string},r:Requirement){return (!r.familyId||r.familyId===row.familyId)&&(!r.manufacturer||exactUnit(r.manufacturer)===exactUnit(row.manufacturer))&&(!r.model||exactUnit(r.model)===exactUnit(row.model))&&(!r.task||r.task===row.task);}
export function assessProgress(snapshot:string,policy:AcademyPolicy){
 const data=JSON.parse(snapshot) as Evidence;
 const currentAuth=(data.authorizations||[]).filter(a=>!a.expires||a.expires>=data.day);
 const jobs=(data.experience||[]).filter(e=>e.qaResult==="approved");
 const quality=summarizeQuality(data.quality||[]);
 const requirements=policy.requirements.map(r=>{
  const scoped=jobs.filter(e=>matches(e,r));let actual=0;
  switch(r.kind){
   case "work_orders":actual=new Set(scoped.map(e=>e.workOrderId||e.sourceKey)).size;break;
   case "pm_repetitions":actual=scoped.filter(e=>e.task==="pm"&&["passed","returned_to_service"].includes(e.disposition)).length;break;
   case "repair_repetitions":actual=scoped.filter(e=>e.task==="corrective_repair"&&["passed","returned_to_service"].includes(e.disposition)).length;break;
   case "equipment_families":actual=new Set(scoped.map(e=>e.familyId).filter(Boolean)).size;break;
   case "training_minutes":actual=(data.training||[]).filter(t=>!r.matchValue||exactUnit(t.title)===exactUnit(r.matchValue)).reduce((n,t)=>n+t.minutes,0);break;
   case "training":actual=(data.training||[]).filter(t=>exactUnit(t.title)===exactUnit(r.matchValue)).length;break;
   case "credential":actual=Number((data.credentials||[]).some(c=>c.status==="current"&&(!c.expires||c.expires>=data.day)&&exactUnit(c.name)===exactUnit(r.matchValue)&&exactUnit(c.issuer)===exactUnit(r.issuer)));break;
   case "authorization":actual=currentAuth.filter(a=>matches(a,r)&&["independent","trainer"].includes(a.level)).length;break;
   case "supervisor_signoffs":actual=new Set(currentAuth.filter(a=>matches(a,r)&&["competent","independent","trainer"].includes(a.level)).map(a=>a.signoffId)).size;break;
   case "quality_reviews":actual=quality.reviewedReports;break;
   case "diagnostic_resolution_percent":actual=quality.diagnosticResolution.percent??0;break;
   case "first_repair_success_percent":actual=quality.firstRepairSuccess.percent??0;break;
   case "callback_free_percent":actual=quality.callbackFree.percent??0;break;
   case "documentation_first_pass_percent":actual=quality.documentationFirstPass.percent??0;break;
  }
  return {...r,actual,met:actual>=r.minimum};
 });
 const levels=trackCatalog(policy.track).levels,currentIndex=levels.findIndex(l=>l.id===data.profile?.level),targetIndex=levels.findIndex(l=>l.id===policy.targetLevel);
 const eligible=policy.status==="active"&&data.technician?.status==="active"&&parseDisciplines(data.technician?.disciplines).includes(policy.track)&&data.profile?.target===policy.targetLevel&&currentIndex>=0&&targetIndex>currentIndex&&requirements.length>0&&requirements.every(r=>r.met);
 const percent=requirements.length?Math.floor(requirements.reduce((n,r)=>n+Math.min(r.actual/r.minimum,1),0)/requirements.length*100):0;
 return {policyId:policy.id,policyVersion:policy.version,targetLevel:policy.targetLevel,title:policy.title,requirements,percent,eligible,completed:requirements.filter(r=>r.met).length,remaining:requirements.filter(r=>!r.met).length,compensationReview:!!policy.compensationReview,payBandMinCents:policy.payBandMinCents,payBandMaxCents:policy.payBandMaxCents};
}

export function developmentRoadmap(snapshot:string,assessment:ReturnType<typeof assessProgress>|null,track:AcademyTrack){
 const data=JSON.parse(snapshot) as Evidence,catalog=trackCatalog(track);
 const current=catalog.levels.find(l=>l.id===data.profile?.level)?.name||"Awaiting reviewed level",target=catalog.levels.find(l=>l.id===data.profile?.target)?.name||"No reviewed target selected";
 const remaining=assessment?.requirements.filter(r=>!r.met)||[],quality=summarizeQuality(data.quality||[]);
 const actions:{label:string;progress:string;kind:string}[]=remaining.slice(0,5).map(r=>({label:r.label,progress:`${r.actual} / ${r.minimum}`,kind:r.kind}));
 if(!assessment)actions.push({label:"Ask an administrator to configure evidence requirements for the reviewed target level.",progress:"Not configured",kind:"configuration"});
 else if(assessment.eligible)actions.push({label:"Request an advancement review from management.",progress:"Verified requirements met",kind:"review"});
 if((data.quality||[]).length===0&&track==="dme_mobility")actions.push({label:"Have an administrator review actual DME diagnostic, repair, callback and documentation outcomes.",progress:"No reviewed outcomes",kind:"quality_reviews"});
 return {currentLevel:current,targetLevel:target,longTermInterest:data.profile?.specialty||null,nextActions:actions.slice(0,6),qualityReviewedReports:quality.reviewedReports,updatesFromVerifiedEvidence:true};
}

export async function workforceCapability(track:AcademyTrack){
 const rows=await env.DB.prepare(`SELECT a.technician_id AS technicianId,a.family_id AS familyId,f.name AS familyName,a.manufacturer,a.model,a.task,a.level FROM academy_authorizations a JOIN academy_families f ON f.id=a.family_id AND f.organization_id=a.organization_id AND f.track=a.track JOIN academy_signoffs s ON s.id=a.signoff_id AND s.organization_id=a.organization_id AND s.track=a.track AND s.technician_id=a.technician_id AND s.family_id=a.family_id AND s.manufacturer=a.manufacturer AND s.model=a.model AND s.task=a.task AND s.authorization_level=a.level JOIN technicians t ON t.id=a.technician_id AND t.organization_id=a.organization_id AND t.status='active' WHERE a.organization_id=? AND a.track=? AND (a.review_due_on IS NULL OR a.review_due_on>=date('now')) AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.service_disciplines_json) THEN t.service_disciplines_json ELSE '[]' END) WHERE value=?)`).bind(TECHFLEX_ORG_ID,track,track).all<{technicianId:string;familyId:string;familyName:string;manufacturer:string;model:string;task:string;level:string}>();
 const scopes=new Map<string,{family:string;manufacturer:string;model:string;task:string;authorized:Set<string>;developing:Set<string>}>();
 for(const a of rows.results){const key=JSON.stringify([a.familyId,a.manufacturer,a.model,a.task]);const entry=scopes.get(key)||{family:a.familyName,manufacturer:a.manufacturer,model:a.model,task:a.task,authorized:new Set<string>(),developing:new Set<string>()};if(["independent","trainer"].includes(a.level))entry.authorized.add(a.technicianId);else if(a.level!=="not_trained")entry.developing.add(a.technicianId);scopes.set(key,entry);}
 const facilities: {id:string;name:string;total:number;covered:number;gaps:{assetTag:string;manufacturer:string;model:string;reason:string}[]}[]=[];
 if(track==="biomedical"){
  const units=await env.DB.prepare(`SELECT a.asset_tag AS assetTag,a.category_id AS familyId,a.manufacturer,a.model,l.id AS locationId,l.name AS locationName FROM assets a JOIN accounts c ON c.id=a.account_id AND c.organization_id=a.organization_id AND c.status='active' AND c.service_discipline='biomedical' JOIN locations l ON l.id=a.location_id AND l.account_id=c.id AND l.status='active' WHERE a.organization_id=? AND a.status NOT IN ('retired','removed','inventory_reference') ORDER BY l.name,a.asset_tag`).bind(TECHFLEX_ORG_ID).all<{assetTag:string;familyId:string|null;manufacturer:string;model:string;locationId:string;locationName:string}>();
  for(const unit of units.results){let f=facilities.find(f=>f.id===unit.locationId);if(!f){f={id:unit.locationId,name:unit.locationName,total:0,covered:0,gaps:[]};facilities.push(f);}f.total++;const scope=scopes.get(JSON.stringify([unit.familyId,exactUnit(unit.manufacturer),exactUnit(unit.model),"pm"]));if(scope?.authorized.size)f.covered++;else f.gaps.push({assetTag:unit.assetTag,manufacturer:unit.manufacturer,model:unit.model,reason:!unit.familyId||!unit.manufacturer.trim()||!unit.model.trim()?"Verify equipment family and exact identity":"No current independently authorized PM technician recorded"});}
 }
 return {scopes:Array.from(scopes.values()).map(s=>({...s,authorized:s.authorized.size,developing:s.developing.size})),facilities};
}
