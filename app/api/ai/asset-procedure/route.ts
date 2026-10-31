import { env } from "cloudflare:workers";
import { z } from "zod";
import { assignedGuideAsset } from "@/app/api/work-order-asset-guide/route";
import { apiError,TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { researchAssetProcedure } from "@/lib/asset-ai-research";
import { catalogingSnapshot } from "@/lib/biomedical-workflows";
import {governedProcedure} from "@/lib/technical-knowledge";
const headers={"Cache-Control":"private, no-store"};
export async function POST(request:Request) {
 try {
  const input=z.object({workOrderId:z.string().min(1).max(160),assetId:z.string().min(1).max(160)}).strict().parse(await request.json());
  const url=new URL(request.url);url.search=new URLSearchParams(input).toString();
  const {asset}=await assignedGuideAsset(new Request(url,{headers:request.headers}));
  if(!asset)return Response.json({error:"Choose an asset on your assigned biomedical work order."},{status:404,headers});
  if(asset.serviceType==="biomed_cataloging"){
    const snapshot=catalogingSnapshot({...asset,assetId:asset.id});
    return Response.json({id:snapshot.id,status:"candidate",document:snapshot.document,updatedAt:"",workflow:"cataloging"},{headers});
  }
  if(!asset.manufacturer?.trim()||!asset.model?.trim())return Response.json({status:"missing",error:"Record the exact manufacturer and model before automatic manual research. Your draft can still be saved."},{headers});
  const governed=await governedProcedure(asset.manufacturer.trim(),asset.model.trim(),"biomedical",asset.serviceType);if(governed)return Response.json({...governed,status:"approved"},{headers});
  const cacheKey=JSON.stringify([TECHFLEX_ORG_ID,asset.manufacturer.trim().toLowerCase(),asset.model.trim().toLowerCase(),asset.serviceType]);
  const existing=await env.DB.prepare("SELECT generation_id AS id,status,document_json AS documentJson,error_message AS error,expires_at AS expiresAt,updated_at AS updatedAt FROM asset_procedure_research WHERE cache_key=?").bind(cacheKey).first<{id:string;status:string;documentJson:string|null;error:string|null;expiresAt:string;updatedAt:string}>();
  if(existing&&existing.expiresAt>new Date().toISOString())return Response.json({...existing,document:existing.documentJson?JSON.parse(existing.documentJson):null,documentJson:undefined},{headers});
  const runtime=env as unknown as {OPENAI_API_KEY?:string};
  if(!runtime.OPENAI_API_KEY)return Response.json({status:"unavailable",error:"The AI connection is not configured. Continue with saved references and save your observations."},{headers});
  const id=crypto.randomUUID();
  const claim=await env.DB.prepare(`INSERT INTO asset_procedure_research(cache_key,organization_id,generation_id,status,expires_at) VALUES (?,?,?,'researching',?) ON CONFLICT(cache_key) DO UPDATE SET generation_id=excluded.generation_id,status='researching',document_json=NULL,error_message=NULL,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP WHERE asset_procedure_research.expires_at<=?`).bind(cacheKey,TECHFLEX_ORG_ID,id,new Date(Date.now()+150000).toISOString(),new Date().toISOString()).run();
  if(!claim.meta.changes)return Response.json({status:"researching"},{headers});
  try {
   const refs=await env.DB.prepare(`SELECT title,source_url AS sourceUrl,diagnostic_steps_json AS steps FROM equipment_knowledge_articles WHERE organization_id=? AND status='active' AND lower(trim(manufacturer))=lower(?) AND lower(trim(model_pattern))=lower(?) AND source_verified_on IS NOT NULL AND source_url LIKE 'https://%' ORDER BY updated_at DESC LIMIT 5`).bind(TECHFLEX_ORG_ID,asset.manufacturer.trim(),asset.model.trim()).all<{title:string;sourceUrl:string;steps:string}>();
   const document=await researchAssetProcedure(runtime.OPENAI_API_KEY,asset.manufacturer.trim(),asset.model.trim(),asset.serviceType,refs.results);
   const status=document.steps.length?"candidate":"missing",updatedAt=new Date().toISOString();
   const saved=await env.DB.prepare("UPDATE asset_procedure_research SET status=?,document_json=?,expires_at=?,updated_at=? WHERE cache_key=? AND generation_id=?").bind(status,JSON.stringify(document),new Date(Date.now()+(document.steps.length?30:1)*86400000).toISOString(),updatedAt,cacheKey,id).run();
   if(!saved.meta.changes)return Response.json({status:"researching"},{headers});
   return Response.json({id,status,document,updatedAt},{headers});
  }catch(error){
   const message=error instanceof Error?error.message:"Manufacturer research could not be completed.";
   await env.DB.prepare("UPDATE asset_procedure_research SET status='unavailable',error_message=?,expires_at=? WHERE cache_key=? AND generation_id=?").bind(message,new Date(Date.now()+60000).toISOString(),cacheKey,id).run();
   return Response.json({status:"unavailable",error:message},{headers});
  }
 }catch(error){if(error instanceof z.ZodError)return Response.json({error:"Choose the work order and equipment."},{status:400,headers});const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
