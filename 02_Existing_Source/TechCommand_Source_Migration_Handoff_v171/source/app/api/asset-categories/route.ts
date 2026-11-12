import { env } from "cloudflare:workers";
import { z } from "zod";
import { assetManageRoles } from "@/lib/asset-access";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const requestId=z.string().uuid(), id=z.string().uuid(), short=z.string().trim().min(2).max(120);
const draft=z.object({action:z.literal("save_draft"),requestId,id,expectedRecordVersion:z.number().int().min(0),name:short,riskClass:z.enum(["low","medium","high","critical"]),defaultPmIntervalMonths:z.number().int().min(1).max(60).nullable(),policyBasis:z.string().trim().min(10).max(2000),sourceReference:z.string().trim().min(3).max(500),effectiveOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
const publish=z.object({action:z.literal("publish"),requestId,id,expectedRecordVersion:z.number().int().positive()});
const schema=z.discriminatedUnion("action",[draft,publish]);
const privateNoStore={"Cache-Control":"private, no-store"} as const;

async function digest(value:unknown){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))));return Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");}
const selectCategory=`SELECT c.id,
 CASE WHEN c.status='draft' THEN COALESCE(c.draft_name,c.name) ELSE c.name END AS name,
 CASE WHEN c.status='draft' THEN COALESCE(c.draft_risk_class,c.risk_class) ELSE c.risk_class END AS riskClass,
 CASE WHEN c.status='draft' THEN c.draft_default_pm_interval_months ELSE c.default_pm_interval_months END AS defaultPmIntervalMonths,
 c.policy_basis AS policyBasis,c.source_reference AS sourceReference,c.effective_on AS effectiveOn,c.status,
 c.current_revision_id AS currentRevisionId,c.record_version AS recordVersion,c.last_request_id AS lastRequestId,
 c.last_request_fingerprint AS lastRequestFingerprint,COALESCE(u.display_name,u.email) AS updatedBy
 FROM asset_categories c LEFT JOIN users u ON u.id=c.updated_by WHERE c.organization_id=?`;

export async function GET(request:Request){
 try{
  await requirePortalRole(request,[...assetManageRoles]);
  const [categories,revisions]=await Promise.all([
   env.DB.prepare(`${selectCategory} ORDER BY c.name`).bind(TECHFLEX_ORG_ID).all(),
   env.DB.prepare(`SELECT r.id,r.category_id AS categoryId,r.revision,r.name,r.risk_class AS riskClass,
    r.default_pm_interval_months AS defaultPmIntervalMonths,r.policy_basis AS policyBasis,r.source_reference AS sourceReference,
    r.effective_on AS effectiveOn,r.created_at AS publishedAt,COALESCE(u.display_name,u.email) AS publishedBy
    FROM asset_category_revisions r JOIN users u ON u.id=r.published_by WHERE r.organization_id=? ORDER BY r.category_id,r.revision DESC`).bind(TECHFLEX_ORG_ID).all(),
  ]);
  return Response.json({categories:categories.results,revisions:revisions.results},{headers:privateNoStore});
 }catch(error){return apiError(error);}
}

export async function POST(request:Request){
 try{
  const identity=await requirePortalRole(request,[...assetManageRoles]);
  const input=schema.parse(await request.json());
  if(input.action==="save_draft"){
   const fingerprint=await digest(input);
   const replay=await env.DB.prepare(`${selectCategory} AND c.last_request_id=?`).bind(TECHFLEX_ORG_ID,input.requestId).first<Record<string,unknown>>();
   if(replay){if(replay.lastRequestFingerprint!==fingerprint||replay.id!==input.id)return Response.json({error:"This request identity was already used for different category details."},{status:409});return Response.json({category:replay,replayed:true});}
   if(input.expectedRecordVersion===0){
    await env.DB.batch([
     env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_categories WHERE organization_id=? AND (id=? OR lower(name)=lower(?))) THEN 1 ELSE json('asset_category_conflict') END").bind(TECHFLEX_ORG_ID,input.id,input.name),
     env.DB.prepare(`INSERT INTO asset_categories(id,organization_id,name,risk_class,default_pm_interval_months,draft_name,draft_risk_class,draft_default_pm_interval_months,policy_basis,source_reference,effective_on,status,record_version,last_request_id,last_request_fingerprint,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft',1,?,?,?)`).bind(input.id,TECHFLEX_ORG_ID,input.name,input.riskClass,input.defaultPmIntervalMonths,input.name,input.riskClass,input.defaultPmIntervalMonths,input.policyBasis,input.sourceReference,input.effectiveOn,input.requestId,fingerprint,identity.userId),
     env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'asset_category.draft_created','asset_category',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.id,JSON.stringify({name:input.name,riskClass:input.riskClass,defaultPmIntervalMonths:input.defaultPmIntervalMonths,policyBasis:input.policyBasis,sourceReference:input.sourceReference,effectiveOn:input.effectiveOn})),
    ]);
   }else{
    await env.DB.batch([
     env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM asset_categories WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('asset_category_stale') END").bind(input.id,TECHFLEX_ORG_ID,input.expectedRecordVersion),
     env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_categories WHERE organization_id=? AND id<>? AND lower(COALESCE(draft_name,name))=lower(?)) THEN 1 ELSE json('asset_category_conflict') END").bind(TECHFLEX_ORG_ID,input.id,input.name),
     env.DB.prepare(`UPDATE asset_categories SET draft_name=?,draft_risk_class=?,draft_default_pm_interval_months=?,policy_basis=?,source_reference=?,effective_on=?,status='draft',record_version=record_version+1,last_request_id=?,last_request_fingerprint=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?`).bind(input.name,input.riskClass,input.defaultPmIntervalMonths,input.policyBasis,input.sourceReference,input.effectiveOn,input.requestId,fingerprint,identity.userId,input.id,TECHFLEX_ORG_ID,input.expectedRecordVersion),
     env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'asset_category.draft_saved','asset_category',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.id,JSON.stringify({name:input.name,riskClass:input.riskClass,defaultPmIntervalMonths:input.defaultPmIntervalMonths,policyBasis:input.policyBasis,sourceReference:input.sourceReference,effectiveOn:input.effectiveOn})),
    ]);
   }
   const category=await env.DB.prepare(`${selectCategory} AND c.id=?`).bind(TECHFLEX_ORG_ID,input.id).first();
   return Response.json({category,replayed:false},{status:input.expectedRecordVersion===0?201:200});
  }
  const fingerprint=await digest(input);
  const replay=await env.DB.prepare("SELECT id,category_id AS categoryId,revision,request_fingerprint AS requestFingerprint FROM asset_category_revisions WHERE organization_id=? AND request_id=?").bind(TECHFLEX_ORG_ID,input.requestId).first<{id:string;categoryId:string;revision:number;requestFingerprint:string}>();
  if(replay){if(replay.requestFingerprint!==fingerprint||replay.categoryId!==input.id)return Response.json({error:"This request identity was already used for a different category publication."},{status:409});return Response.json({revision:replay,replayed:true});}
  const category=await env.DB.prepare(`${selectCategory} AND c.id=?`).bind(TECHFLEX_ORG_ID,input.id).first<{id:string;name:string;riskClass:string;defaultPmIntervalMonths:number|null;policyBasis:string;sourceReference:string;effectiveOn:string|null;recordVersion:number}>();
  if(!category)return Response.json({error:"Category draft not found."},{status:404});
  if(category.recordVersion!==input.expectedRecordVersion)return Response.json({error:"The category draft changed in another tab. Refresh before publishing."},{status:409});
  if(!category.effectiveOn||category.policyBasis.trim().length<10||category.sourceReference.trim().length<3)return Response.json({error:"Record the policy basis, source reference, and effective date before publishing."},{status:400});
  const prior=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM asset_category_revisions WHERE organization_id=? AND category_id=?").bind(TECHFLEX_ORG_ID,input.id).first<{revision:number}>();
  const revision=(prior?.revision||0)+1,revisionId=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM asset_categories WHERE id=? AND organization_id=? AND record_version=? AND COALESCE(draft_name,name)=? AND COALESCE(draft_risk_class,risk_class)=? AND COALESCE(draft_default_pm_interval_months,-1)=COALESCE(?,-1) AND policy_basis=? AND source_reference=? AND effective_on=?) THEN 1 ELSE json('asset_category_stale') END").bind(input.id,TECHFLEX_ORG_ID,input.expectedRecordVersion,category.name,category.riskClass,category.defaultPmIntervalMonths,category.policyBasis,category.sourceReference,category.effectiveOn),
   env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_categories WHERE organization_id=? AND id<>? AND lower(name)=lower(?)) THEN 1 ELSE json('asset_category_conflict') END").bind(TECHFLEX_ORG_ID,input.id,category.name),
   env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_category_revisions WHERE organization_id=? AND request_id=?) THEN 1 ELSE json('asset_category_request_conflict') END").bind(TECHFLEX_ORG_ID,input.requestId),
   env.DB.prepare(`INSERT INTO asset_category_revisions(id,organization_id,category_id,revision,name,risk_class,default_pm_interval_months,policy_basis,source_reference,effective_on,request_id,request_fingerprint,published_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId,TECHFLEX_ORG_ID,input.id,revision,category.name,category.riskClass,category.defaultPmIntervalMonths,category.policyBasis,category.sourceReference,category.effectiveOn,input.requestId,fingerprint,identity.userId),
   env.DB.prepare("UPDATE asset_categories SET name=?,risk_class=?,default_pm_interval_months=?,draft_name=NULL,draft_risk_class=NULL,draft_default_pm_interval_months=NULL,status='published',current_revision_id=?,record_version=record_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?").bind(category.name,category.riskClass,category.defaultPmIntervalMonths,revisionId,identity.userId,input.id,TECHFLEX_ORG_ID,input.expectedRecordVersion),
   env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'asset_category.published','asset_category',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.id,JSON.stringify({revisionId,revision,name:category.name,riskClass:category.riskClass,defaultPmIntervalMonths:category.defaultPmIntervalMonths,policyBasis:category.policyBasis,sourceReference:category.sourceReference,effectiveOn:category.effectiveOn})),
  ]);
  return Response.json({revision:{id:revisionId,categoryId:input.id,revision},replayed:false},{status:201});
 }catch(error){
  if(error instanceof z.ZodError)return Response.json({error:"Review the category policy fields.",details:error.flatten()},{status:400});
  const message=error instanceof Error?error.message:"";
  if(/asset_category_conflict|UNIQUE constraint failed: asset_categories/.test(message))return Response.json({error:"Use a unique category name and request identity."},{status:409});
  if(/asset_category_stale|asset_category_request_conflict|asset_category_conflict|UNIQUE constraint failed: asset_category_revisions|UNIQUE constraint failed: asset_categories|malformed JSON/.test(message))return Response.json({error:"The category draft changed in another tab or conflicts with another category. Refresh before saving or publishing."},{status:409});
  return apiError(error);
 }
}
