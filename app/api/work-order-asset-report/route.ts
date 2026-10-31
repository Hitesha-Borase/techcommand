import {env} from "cloudflare:workers";
import {assignedGuideAsset} from "@/app/api/work-order-asset-guide/route";
import {apiError,TECHFLEX_ORG_ID,PortalHttpError} from "@/lib/portal-auth";
import {generateAssetServiceReportPdf,generateCompletionPacketPdf,type PacketFile} from "@/lib/techflex-pdfs";
import {readProcedure,readAnswers,procedureText,procedurePhotoEvidence} from "@/lib/asset-ai-procedure";

type ReportImageBinding={input(stream:ReadableStream<Uint8Array>):{transform(options:{width:number;height:number;fit:"scale-down"}):{output(options:{format:"image/jpeg";quality:number}):Promise<{response():Response}>}}};
const OPTIMIZED_EDGE=1600,OPTIMIZED_QUALITY=78,MAX_OPTIMIZED_PHOTO_BYTES=8*1024*1024,MAX_OPTIMIZED_PACKET_BYTES=24*1024*1024;

async function optimizedReportPhoto(object:R2ObjectBody,fileName:string){
 const images=(env as typeof env&{IMAGES?:ReportImageBinding}).IMAGES;
 if(!images)throw new PortalHttpError(503,"Server photo optimization is temporarily unavailable. Your originals are saved; choose the full or compact report.");
 try{
  const result=await images.input(object.body).transform({width:OPTIMIZED_EDGE,height:OPTIMIZED_EDGE,fit:"scale-down"}).output({format:"image/jpeg",quality:OPTIMIZED_QUALITY});
  const response=result.response(),contentType=(response.headers.get("content-type")||"").split(";",1)[0].toLowerCase();
  if(!response.ok||contentType!=="image/jpeg")throw new Error("Unexpected image transformation response.");
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>MAX_OPTIMIZED_PHOTO_BYTES)throw new Error("Optimized image exceeded the safe report limit.");
  return bytes;
 }catch{
  throw new PortalHttpError(409,`Step photo "${fileName}" could not be optimized into a report copy. The original remains saved; choose the compact photo-reference report or upload a readable JPEG/PNG copy.`);
 }
}
export async function GET(request:Request){try{
 const requestedSize=new URL(request.url).searchParams.get("size")||"full";
 if(!["full","optimized","compact"].includes(requestedSize))throw new PortalHttpError(400,"Choose the full, optimized or compact photo report.");
 const reportSize=requestedSize as "full"|"optimized"|"compact";
 const {asset,workOrderId}=await assignedGuideAsset(request);
 if(!asset)return Response.json({error:"Choose an asset on your assigned work order."},{status:404,headers:{"Cache-Control":"private, no-store"}});
 const item=await env.DB.prepare(`SELECT w.external_id AS workOrderNumber,c.name AS accountName,a.asset_tag AS assetTag,a.manufacturer,a.model,a.serial_number AS serialNumber,p.status,p.notes,p.findings,p.work_performed AS workPerformed,p.test_results AS testResults,p.disposition,p.not_applicable_reason AS notApplicableReason,p.procedure_snapshot_json AS snapshot,p.procedure_answers_json AS answers,p.record_version AS recordVersion,p.updated_at AS updatedAt,EXISTS(SELECT 1 FROM service_reports sr WHERE sr.work_order_id=w.id AND sr.qa_status='approved') AS reviewed FROM work_order_assets p JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=p.organization_id JOIN accounts c ON c.id=w.account_id AND c.organization_id=w.organization_id JOIN assets a ON a.id=p.asset_id AND a.organization_id=p.organization_id WHERE p.work_order_id=? AND p.asset_id=? AND p.organization_id=?`).bind(workOrderId,asset.id,TECHFLEX_ORG_ID).first<Parameters<typeof generateAssetServiceReportPdf>[0]&{snapshot:string|null;answers:string|null;recordVersion:number}>();
 if(!item)throw new Error("The saved equipment record could not be loaded.");
 const snapshot=readProcedure(item.snapshot),answers=readAnswers(item.answers),associations=procedurePhotoEvidence(snapshot,answers);
 const photos:PacketFile[]=[];
 if(associations.length){
  const ids=associations.map(item=>item.id),rows=(await env.DB.prepare(`SELECT id,storage_key AS storageKey,file_name AS fileName,content_type AS contentType,size_bytes AS sizeBytes,category,created_at AS createdAt FROM attachments WHERE organization_id=? AND entity_type='work_order' AND entity_id=? AND content_type LIKE 'image/%' AND id IN (${ids.map(()=>"?").join(",")})`).bind(TECHFLEX_ORG_ID,workOrderId,...ids).all<{id:string;storageKey:string;fileName:string;contentType:string;sizeBytes:number;category:string;createdAt:string}>()).results;
  if(rows.length!==ids.length)throw new PortalHttpError(409,"A step-bound photo is no longer available on this work order. Restore it or update the saved step before generating this report.");
  if(reportSize==="full"&&rows.reduce((sum,row)=>sum+row.sizeBytes,0)>24*1024*1024)throw new PortalHttpError(413,"The selected step photos exceed the full report's 24 MB processing limit. Your work is saved; choose the optimized or compact report.");
  const byId=new Map(rows.map(row=>[row.id,row]));
  let optimizedBytes=0;
  for(const association of associations){const row=byId.get(association.id)!;const object=await env.BUCKET.get(row.storageKey);if(!object)throw new PortalHttpError(409,`Step photo "${row.fileName}" is unavailable in storage. Restore it before generating this report.`);if(reportSize==="full"){if(!["image/png","image/jpeg"].includes(row.contentType))throw new PortalHttpError(409,`Step photo "${row.fileName}" must be converted to PNG or JPEG before the full photo packet can be generated. The optimized or compact report remains available.`);photos.push({...row,bytes:await object.arrayBuffer(),caption:`Step ${association.stepId} - ${row.fileName}: ${association.caption}`});}else if(reportSize==="optimized"){const bytes=await optimizedReportPhoto(object,row.fileName);optimizedBytes+=bytes.byteLength;if(optimizedBytes>MAX_OPTIMIZED_PACKET_BYTES)throw new PortalHttpError(413,"The optimized report copies exceed the 24 MB packet limit. Your original evidence is unchanged; choose the compact photo-reference report.");photos.push({...row,contentType:"image/jpeg",bytes,caption:`Step ${association.stepId} - ${row.fileName}: ${association.caption}`});}}
 }
 const releaseStatus=item.reviewed?"Reviewed":"Saved";
 const serviceReport=await generateAssetServiceReportPdf({...item,workOrderNumber:item.workOrderNumber||workOrderId!,procedureText:procedureText(snapshot,answers),reviewed:!!item.reviewed,photoEvidenceMode:reportSize,photoEvidenceCount:associations.length});
 const current=await env.DB.prepare("SELECT record_version AS recordVersion FROM work_order_assets WHERE organization_id=? AND work_order_id=? AND asset_id=?").bind(TECHFLEX_ORG_ID,workOrderId,asset.id).first<{recordVersion:number}>();
 if(current?.recordVersion!==item.recordVersion)throw new PortalHttpError(409,"This asset changed while its report was being generated. Review the latest saved record and generate again.");
 const bytes=reportSize!=="compact"&&photos.length?await generateCompletionPacketPdf({title:`WO ${item.workOrderNumber||workOrderId} | Asset ${item.assetTag} | exact step-bound evidence`,sourceDocuments:[],serviceReport,evidenceImages:photos,evidenceLayout:"gallery",packetFooter:`${releaseStatus} | Evidence R${item.recordVersion}`}):serviceReport;
 const sizeLabel=reportSize==="compact"?"Compact-":reportSize==="optimized"?"Optimized-":"";
 const filename=`TechFlex-WO-${item.workOrderNumber||workOrderId}-${item.assetTag}-R${item.recordVersion}-${releaseStatus}-${sizeLabel}service-report.pdf`.replace(/[^a-zA-Z0-9._-]/g,"_");
 return new Response(bytes as BodyInit,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"X-TechCommand-Report-Status":releaseStatus.toLowerCase(),"X-TechCommand-Evidence-Revision":String(item.recordVersion),"X-TechCommand-Report-Size":reportSize,...(reportSize==="optimized"?{"X-TechCommand-Photo-Optimization":`jpeg-q${OPTIMIZED_QUALITY}-max-${OPTIMIZED_EDGE}px`}:{}),"Cache-Control":"private, no-store"}});
}catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}}
