import {env} from "cloudflare:workers";
import {TECHFLEX_ORG_ID} from "./portal-auth";
import {researchAssetProcedure} from "./asset-ai-research";
import type {ProcedureDocument} from "./asset-ai-procedure";
import {governedProcedure} from "./technical-knowledge";
export async function cachedManufacturerResearch(manufacturer:string,model:string,serviceType:string){
 if(!manufacturer.trim()||!model.trim())return {status:"missing",error:"Manufacturer and exact model are still needed. Save your observations now."};
 const governed=await governedProcedure(manufacturer.trim(),model.trim(),"dme_mobility",serviceType);if(governed)return {...governed,status:"approved"};
 const cacheKey=JSON.stringify([TECHFLEX_ORG_ID,manufacturer.trim().toLowerCase(),model.trim().toLowerCase(),serviceType]);
 const existing=await env.DB.prepare("SELECT generation_id AS id,status,document_json AS documentJson,error_message AS error,expires_at AS expiresAt,updated_at AS updatedAt FROM asset_procedure_research WHERE cache_key=?").bind(cacheKey).first<{id:string;status:string;documentJson:string|null;error:string|null;expiresAt:string;updatedAt:string}>();
 if(existing&&existing.expiresAt>new Date().toISOString())return {...existing,document:existing.documentJson?JSON.parse(existing.documentJson) as ProcedureDocument:null,documentJson:undefined};
 const runtime=env as unknown as {OPENAI_API_KEY?:string; GEMINI_API_KEY?:string};
 const aiKey = runtime.GEMINI_API_KEY || runtime.OPENAI_API_KEY || (typeof process !== "undefined" && process.env ? (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) : "");
 if(!aiKey)return {status:"unavailable",error:"AI is not connected. Saved references and draft saving remain available."};
 const id=crypto.randomUUID();
 const claim=await env.DB.prepare(`INSERT INTO asset_procedure_research(cache_key,organization_id,generation_id,status,expires_at) VALUES (?,?,?,'researching',?) ON CONFLICT(cache_key) DO UPDATE SET generation_id=excluded.generation_id,status='researching',document_json=NULL,error_message=NULL,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP WHERE asset_procedure_research.expires_at<=?`).bind(cacheKey,TECHFLEX_ORG_ID,id,new Date(Date.now()+150000).toISOString(),new Date().toISOString()).run();
 if(!claim.meta.changes)return {status:"researching"};
 try{
  const refs=await env.DB.prepare("SELECT title,source_url AS sourceUrl,diagnostic_steps_json AS steps FROM equipment_knowledge_articles WHERE organization_id=? AND status='active' AND lower(trim(manufacturer))=lower(?) AND lower(trim(model_pattern))=lower(?) AND source_verified_on IS NOT NULL AND source_url LIKE 'https://%' ORDER BY updated_at DESC LIMIT 5").bind(TECHFLEX_ORG_ID,manufacturer.trim(),model.trim()).all<{title:string;sourceUrl:string;steps:string}>();
  const document=await researchAssetProcedure(aiKey,manufacturer.trim(),model.trim(),serviceType,refs.results);
  const status=document.steps.length?"candidate":"missing",updatedAt=new Date().toISOString();
  const result=await env.DB.prepare("UPDATE asset_procedure_research SET status=?,document_json=?,expires_at=?,updated_at=? WHERE cache_key=? AND generation_id=?").bind(status,JSON.stringify(document),new Date(Date.now()+(document.steps.length?30:1)*86400000).toISOString(),updatedAt,cacheKey,id).run();
  return result.meta.changes?{id,status,document,updatedAt}:{status:"researching"};
 }catch(error){const message=error instanceof Error?error.message:"Manufacturer lookup unavailable. Save your notes and retry later.";await env.DB.prepare("UPDATE asset_procedure_research SET status='unavailable',error_message=?,expires_at=? WHERE cache_key=? AND generation_id=?").bind(message,new Date(Date.now()+60000).toISOString(),cacheKey,id).run();return {status:"unavailable",error:message};}
}
