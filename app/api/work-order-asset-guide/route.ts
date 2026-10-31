import { env } from "cloudflare:workers";
import { requirePortalRole, TECHFLEX_ORG_ID, apiError } from "@/lib/portal-auth";
export async function assignedGuideAsset(request:Request) {
 const identity=await requirePortalRole(request,["technician"]);
 const params=new URL(request.url).searchParams;
 const assetId=params.get("assetId"),workOrderId=params.get("workOrderId");
 const asset=await env.DB.prepare(`SELECT a.id,a.manufacturer,a.model,a.serial_number AS serialNumber,w.service_type AS serviceType
 FROM assets a JOIN work_order_assets p ON p.asset_id=a.id AND p.organization_id=a.organization_id
 JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=a.organization_id AND w.account_id=a.account_id AND w.location_id=a.location_id
 JOIN work_order_assignments wa ON wa.work_order_id=w.id
 JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=w.organization_id AND t.user_id=? AND t.status='active'
 WHERE a.id=? AND w.id=? AND w.organization_id=? AND t.id=? AND w.service_type LIKE 'biomed_%' AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','in_progress','submitted') LIMIT 1`)
 .bind(identity.userId,assetId,workOrderId,TECHFLEX_ORG_ID,identity.technicianId).first<{id:string;manufacturer:string|null;model:string|null;serialNumber:string|null;serviceType:string}>();
 return {identity,asset,workOrderId,assetId};
}
export async function GET(request:Request) {
 try {
  const {asset,assetId}=await assignedGuideAsset(request);
  if(!asset)return Response.json({error:"Select an asset from your assigned PM round."},{status:404,headers:{"Cache-Control":"private, no-store"}});
  const references=asset.manufacturer?.trim()&&asset.model?.trim()?await env.DB.prepare(`SELECT id,title,diagnostic_steps_json AS steps,source_url AS sourceUrl,source_verified_on AS verifiedOn,support_phone AS phone,support_email AS email,support_hours AS hours
    FROM equipment_knowledge_articles WHERE organization_id=? AND status='active' AND lower(trim(manufacturer))=lower(?) AND lower(trim(model_pattern))=lower(?) AND source_verified_on IS NOT NULL AND source_url LIKE 'https://%' ORDER BY updated_at DESC LIMIT 5`).bind(TECHFLEX_ORG_ID,asset.manufacturer.trim(),asset.model.trim()).all():{results:[]};
  const history=await env.DB.prepare(`SELECT v.id,v.visited_at AS visitedAt,v.visit_type AS visitType,v.findings,v.work_performed AS workPerformed,CASE WHEN json_valid(v.test_results_json) THEN json_extract(v.test_results_json,'$.narrative') ELSE v.test_results_json END AS testResults,v.disposition FROM asset_visits v WHERE v.organization_id=? AND v.asset_id=? ORDER BY v.visited_at DESC LIMIT 30`).bind(TECHFLEX_ORG_ID,assetId).all();
  return Response.json({asset,references:references.results,history:history.results,referenceStatus:references.results.length?"available":"missing"},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
