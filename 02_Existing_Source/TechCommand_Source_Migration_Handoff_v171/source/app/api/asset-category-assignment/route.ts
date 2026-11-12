import { env } from "cloudflare:workers";
import { z } from "zod";
import { assetManageRoles, assetReadRoles, requireAssetIdentity } from "@/lib/asset-access";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const schema=z.object({requestId:z.string().uuid(),assetId:z.string().min(1),expectedRecordVersion:z.number().int().positive(),revisionId:z.string().uuid(),reason:z.string().trim().min(5).max(1000)});
type Input=z.infer<typeof schema>;
const privateNoStore={"Cache-Control":"private, no-store"} as const;
async function fingerprint(input:Input){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input))));return Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");}
const eventSql=`SELECT e.id,e.from_category_id AS fromCategoryId,fr.name AS fromCategoryName,fr.revision AS fromRevision,
 e.to_category_id AS toCategoryId,tr.name AS toCategoryName,tr.revision AS toRevision,e.reason,e.asset_version AS assetVersion,
 e.created_at AS createdAt,COALESCE(u.display_name,u.email) AS changedBy
 FROM asset_category_events e LEFT JOIN asset_category_revisions fr ON fr.id=e.from_revision_id
 JOIN asset_category_revisions tr ON tr.id=e.to_revision_id JOIN users u ON u.id=e.changed_by`;

export async function GET(request:Request){
 try{
  const identity=await requirePortalRole(request,[...assetReadRoles]);
  const assetId=new URL(request.url).searchParams.get("assetId");
  if(!assetId)return Response.json({error:"Select an asset."},{status:400});
  const asset=await requireAssetIdentity(assetId,identity);
  const [history,current]=await Promise.all([
   env.DB.prepare(`${eventSql} WHERE e.organization_id=? AND e.asset_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 200`).bind(TECHFLEX_ORG_ID,assetId).all(),
   asset.categoryRevisionId?env.DB.prepare(`SELECT id,category_id AS categoryId,revision,name,risk_class AS riskClass,default_pm_interval_months AS defaultPmIntervalMonths,policy_basis AS policyBasis,source_reference AS sourceReference,effective_on AS effectiveOn,created_at AS publishedAt FROM asset_category_revisions WHERE id=? AND organization_id=?`).bind(asset.categoryRevisionId,TECHFLEX_ORG_ID).first():null,
  ]);
  const canManage=(assetManageRoles as readonly string[]).includes(identity.role);
  const options=canManage?(await env.DB.prepare(`SELECT r.id,r.category_id AS categoryId,r.revision,r.name,r.risk_class AS riskClass,r.default_pm_interval_months AS defaultPmIntervalMonths,r.policy_basis AS policyBasis,r.source_reference AS sourceReference,r.effective_on AS effectiveOn FROM asset_category_revisions r JOIN asset_categories c ON c.id=r.category_id AND c.organization_id=r.organization_id AND c.current_revision_id=r.id WHERE r.organization_id=? ORDER BY r.name`).bind(TECHFLEX_ORG_ID).all()).results:null;
  return Response.json({asset,current,history:history.results,options},{headers:privateNoStore});
 }catch(error){return apiError(error);}
}

export async function POST(request:Request){
 let parsed:Input|null=null,digest="";
 try{
  const identity=await requirePortalRole(request,[...assetManageRoles]);
  const input=schema.parse(await request.json());parsed=input;digest=await fingerprint(input);
  const replay=await env.DB.prepare("SELECT id,asset_id AS assetId,to_revision_id AS revisionId,asset_version AS assetVersion,request_fingerprint AS requestFingerprint FROM asset_category_events WHERE organization_id=? AND request_id=?").bind(TECHFLEX_ORG_ID,input.requestId).first<{id:string;assetId:string;revisionId:string;assetVersion:number;requestFingerprint:string}>();
  if(replay){if(replay.requestFingerprint!==digest||replay.assetId!==input.assetId||replay.revisionId!==input.revisionId)return Response.json({error:"This request identity was already used for different category details."},{status:409});return Response.json({assignment:replay,replayed:true});}
  const asset=await requireAssetIdentity(input.assetId,identity);
  if(asset.recordVersion!==input.expectedRecordVersion)return Response.json({error:"The asset changed in another tab. Refresh its lifetime record before assigning a category."},{status:409});
  if(asset.categoryRevisionId===input.revisionId)return Response.json({error:"Choose a different published category revision."},{status:400});
  const revision=await env.DB.prepare(`SELECT r.id,r.category_id AS categoryId,r.revision,r.name FROM asset_category_revisions r JOIN asset_categories c ON c.id=r.category_id AND c.organization_id=r.organization_id AND c.current_revision_id=r.id WHERE r.id=? AND r.organization_id=?`).bind(input.revisionId,TECHFLEX_ORG_ID).first<{id:string;categoryId:string;revision:number;name:string}>();
  if(!revision)return Response.json({error:"Choose the current published revision of an active category policy."},{status:409});
  const openWork=`EXISTS(SELECT 1 FROM work_orders w WHERE w.organization_id=? AND w.status NOT IN ('ready_to_invoice','completed','approved','invoiced','paid','cancelled','closed') AND (w.asset_id=? OR EXISTS(SELECT 1 FROM work_order_assets wa WHERE wa.work_order_id=w.id AND wa.asset_id=?)))`;
  const active=await env.DB.prepare(`SELECT CASE WHEN ${openWork} THEN 1 ELSE 0 END AS active`).bind(TECHFLEX_ORG_ID,input.assetId,input.assetId).first<{active:number}>();
  if(active?.active)return Response.json({error:"Finish or cancel the asset's open work before changing its category policy."},{status:409});
  const id=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM assets WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('asset_category_asset_stale') END").bind(input.assetId,TECHFLEX_ORG_ID,input.expectedRecordVersion),
   env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM asset_category_revisions r JOIN asset_categories c ON c.id=r.category_id AND c.organization_id=r.organization_id AND c.current_revision_id=r.id WHERE r.id=? AND r.organization_id=?) THEN 1 ELSE json('asset_category_revision_stale') END").bind(input.revisionId,TECHFLEX_ORG_ID),
   env.DB.prepare(`SELECT CASE WHEN NOT ${openWork} THEN 1 ELSE json('asset_category_open_work') END`).bind(TECHFLEX_ORG_ID,input.assetId,input.assetId),
   env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asset_category_events WHERE organization_id=? AND request_id=?) THEN 1 ELSE json('asset_category_request_conflict') END").bind(TECHFLEX_ORG_ID,input.requestId),
   env.DB.prepare(`INSERT INTO asset_category_events(id,organization_id,asset_id,request_id,request_fingerprint,from_category_id,from_revision_id,to_category_id,to_revision_id,reason,asset_version,changed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,TECHFLEX_ORG_ID,input.assetId,input.requestId,digest,asset.categoryId,asset.categoryRevisionId,revision.categoryId,revision.id,input.reason,input.expectedRecordVersion+1,identity.userId),
   env.DB.prepare("UPDATE assets SET category_id=?,category_revision_id=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?").bind(revision.categoryId,revision.id,input.assetId,TECHFLEX_ORG_ID,input.expectedRecordVersion),
   env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,'asset.category_changed','asset',?,?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.assetId,JSON.stringify({categoryId:asset.categoryId,categoryRevisionId:asset.categoryRevisionId}),JSON.stringify({categoryId:revision.categoryId,categoryRevisionId:revision.id,categoryRevision:revision.revision,reason:input.reason,requestId:input.requestId})),
  ]);
  return Response.json({assignment:{id,assetId:input.assetId,revisionId:revision.id,assetVersion:input.expectedRecordVersion+1},replayed:false},{status:201});
 }catch(error){
  if(error instanceof z.ZodError)return Response.json({error:"Review the asset category fields.",details:error.flatten()},{status:400});
  const message=error instanceof Error?error.message:"";
  if(/asset_category_open_work/.test(message))return Response.json({error:"Finish or cancel the asset's open work before changing its category policy."},{status:409});
  if(/asset_category_revision_stale/.test(message))return Response.json({error:"The category policy changed. Refresh before assigning it."},{status:409});
  if(/asset_category_asset_stale|asset_category_request_conflict|UNIQUE constraint failed: asset_category_events|malformed JSON/.test(message)){
   if(parsed){const replay=await env.DB.prepare("SELECT id,asset_id AS assetId,to_revision_id AS revisionId,asset_version AS assetVersion,request_fingerprint AS requestFingerprint FROM asset_category_events WHERE organization_id=? AND request_id=?").bind(TECHFLEX_ORG_ID,parsed.requestId).first<{id:string;assetId:string;revisionId:string;assetVersion:number;requestFingerprint:string}>();if(replay&&replay.requestFingerprint===digest&&replay.assetId===parsed.assetId&&replay.revisionId===parsed.revisionId)return Response.json({assignment:replay,replayed:true});}
   return Response.json({error:"The asset changed in another tab. Refresh before assigning a category."},{status:409});
  }
  return apiError(error);
 }
}
