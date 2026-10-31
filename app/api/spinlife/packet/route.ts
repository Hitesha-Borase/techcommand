import {procedureText,procedureProblems,procedurePhotoEvidence} from "@/lib/asset-ai-procedure";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiError, requirePortalRole, TECHFLEX_ORG_ID, PortalHttpError } from "@/lib/portal-auth";
import { simpleChecks,spinlifePartNotes } from "@/lib/spinlife-simple";
import {spinlifeReviewedWording} from "@/lib/spinlife-writing";
import { dmePacketName,partnerCheckProblems } from "@/lib/spinlife-document-policy";
import { generateCompletionPacketPdf, generateServiceReportPdf, generateSpinLifeWorkOrderPdf } from "@/lib/techflex-pdfs";
import { privateHeaders, spinlifeRoles, spinlifeJob, versionGuard, spinlifeAudit } from "@/lib/spinlife-store";
import { safeServerLog } from "@/lib/server-observability";

type FileRow={id:string;storageKey:string;fileName:string;contentType:string;sizeBytes:number;category:string;createdAt:string};
const fileSql=`SELECT id,storage_key AS storageKey,file_name AS fileName,content_type AS contentType,size_bytes AS sizeBytes,category,created_at AS createdAt
  FROM attachments WHERE organization_id=? AND entity_type='work_order_intake' AND entity_id=? AND category IN ('before','after','serial','diagnosis','repair','packaging','test','signature') ORDER BY id`;
const missing=(s:string)=>s.trim() || "Not recorded";
export async function POST(request:Request) {
  let stagedKey:string|null=null;
  try {
    const identity=await requirePortalRole(request,[...spinlifeRoles]);
    const input=z.object({id:z.string().min(1).max(160),expectedVersion:z.number().int().min(1)}).parse(await request.json());
    const job=await spinlifeJob(identity,input.id);
    const existing=await env.DB.prepare("SELECT attachment_id AS attachmentId FROM spinlife_packets WHERE intake_id=? AND source_version=?").bind(input.id,input.expectedVersion).first<{attachmentId:string}>();
    if(existing) return Response.json(existing,{headers:privateHeaders});
    if(job.version!==input.expectedVersion) throw new PortalHttpError(409,"The work order changed. Save and review the latest answers before generating its PDF.");
    const files=(await env.DB.prepare(fileSql).bind(TECHFLEX_ORG_ID,input.id).all<FileRow>()).results;
    if(files.reduce((sum,f)=>sum+f.sizeBytes,0)>24*1024*1024) throw new PortalHttpError(413,"The selected photos exceed the report's 24 MB processing limit. Your work is saved; use smaller photo copies before generating the packet.");
    const stepCaptions=new Map(procedurePhotoEvidence(job.visit.manufacturerGuide,job.visit.manufacturerAnswers).map(item=>[item.id,`Step ${item.stepId}: ${item.caption}`]));
    const loaded=[];
    for(const file of files) {
      if(file.category==="signature" && file.id!==job.visit.signatureAttachmentId) continue;
      const object=await env.BUCKET.get(file.storageKey);
      if(!object) throw new PortalHttpError(409,`A saved ${file.category} file is unavailable. Restore the file and retry; your work order is saved.`);
      loaded.push({...file,bytes:await object.arrayBuffer(),caption:job.visit.photoCaptions[file.id]?.trim() || stepCaptions.get(file.id) || "Caption not recorded"});
    }
    const {data,visit:originalVisit}=job;
    const wording=spinlifeReviewedWording(job);
    const visit={...originalVisit,findings:wording?.findings??originalVisit.findings,narrative:wording?.workPerformed??originalVisit.narrative,testResults:wording?.testResults??originalVisit.testResults,recommendation:[wording?.recommendation??originalVisit.recommendation,spinlifePartNotes(originalVisit),originalVisit.previousGuidance,originalVisit.manufacturerGuide?procedureText(originalVisit.manufacturerGuide,originalVisit.manufacturerAnswers):""].filter(Boolean).join("\n\n")};
    const checks=simpleChecks(data,visit);
    const missingChecks=partnerCheckProblems(checks,data.serviceType);
    const missingProcedure=procedureProblems(visit.manufacturerGuide,visit.manufacturerAnswers);
    const needsReview=!data.serviceType||!data.externalId||!data.customerName||!data.serialNumber||!visit.technicianAttestedAt||missingChecks.length>0||missingProcedure.length>0||visit.parts.some(p=>p.state==="installed"&&!p.description.trim());
    const signature=loaded.find(f=>f.id===visit.signatureAttachmentId);
    if(visit.signatureAttachmentId && !signature) throw new PortalHttpError(409,"The selected customer signature is unavailable. Restore it or explicitly remove it from this version, then retry.");
    const now=new Date().toISOString();
    // Service date comes from actual Start Work Order, never the scheduled date
    // or a fabricated completion date. Documentation has its own timestamp.
    const organization=await env.DB.prepare("SELECT timezone FROM organizations WHERE id=?").bind(TECHFLEX_ORG_ID).first<{timezone:string}>();
    const serviceDate=job.startedAt ? new Intl.DateTimeFormat("en-CA",{timeZone:organization?.timezone || "UTC",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(job.startedAt)) : "Not recorded";
    const reference=data.externalId.trim() || "NUMBER MISSING";
    const technicianName=job.technicianName || "Technician not assigned";
    const common={workOrderNumber:reference,customerName:missing(data.customerName),serviceType:data.serviceType,
      serviceDate,manufacturer:missing(data.manufacturer),model:missing(data.model),serialNumber:missing(data.serialNumber),
      customerComplaint:missing(data.customerComplaint || data.summary),findings:missing(visit.findings),workPerformed:missing(visit.narrative),
      testResults:missing(visit.testResults),recommendation:missing(visit.recommendation),assetDisposition:visit.disposition,
      checklist:checks,customerSignatureName:missing(visit.customerSignatureName),technicianName,signature:signature || null};
    const partner=await generateSpinLifeWorkOrderPdf({...common,customerPhone:missing(data.customerPhone),address:missing(data.serviceAddress),
      workOrderDate:data.workOrderDate,technicianAttestedAt:visit.technicianAttestedAt,customerSignedAt:visit.customerSignedAt});
    const service=await generateServiceReportPdf({...common,accountName:"SpinLife",locationName:missing(data.customerName),
      documentStatus:needsReview?`DRAFT / INCOMPLETE - ${missingChecks.length} partner checks still require review. ${missingProcedure.length?'TECHNICAL INFORMATION REVIEW REQUIRED. ':''}Administrator review is optional. Recorded actions below are not a claim that every required procedure was completed.`:"TECHNICIAN FIELD RECORD - administrator review is optional; billing is separate.",
      technicianApproved:visit.checks.sl_attestation?.state==="done",
      locationAddress:missing(data.serviceAddress),summary:missing(data.summary),equipmentType:missing(data.equipmentType),
      diagnosticSteps:[],partsUsed:(visit.parts||[]).filter(p=>p.state==="installed").map(p=>({description:p.description||"Description not recorded",partNumber:p.partNumber,quantity:p.quantity})),customerSignedAt:visit.customerSignedAt,evidenceCounts:{},
      checklist:checks.map(c=>({...c,key:undefined}))});
    const photos=loaded.filter(f=>f.category!=="signature");
    const bytes=await generateCompletionPacketPdf({title:`SpinLife work order ${reference}`,partnerDocument:partner,serviceReport:service,sourceDocuments:[],evidenceImages:photos,evidenceLayout:"gallery"});
    const fileName=dmePacketName(job.technicianName,reference,needsReview&&["delivery_completed","returned_to_service"].includes(visit.disposition)?"needs_review":visit.disposition);
    const attachmentId=crypto.randomUUID();
    stagedKey=`techflex/spinlife/${input.id}/packets/${attachmentId}.pdf`;
    await env.BUCKET.put(stagedKey,bytes,{httpMetadata:{contentType:"application/pdf"}});
    const snapshot={data,visit,originalFieldData:originalVisit,reviewedWording:wording,technicianId:job.technicianId,technicianName,serviceDate,documentedAt:now,files:files.map(f=>({id:f.id,storageKey:f.storageKey,sizeBytes:f.sizeBytes})),sourceVersion:job.version};
    const statements=[versionGuard(input.id,input.expectedVersion,identity.technicianId,identity),
      // An upload finishing while the PDF is rendering must not disappear from
      // a supposedly current evidence snapshot.
      env.DB.prepare(`SELECT CASE WHEN COALESCE((SELECT json_group_array(id) FROM (${fileSql})), '[]')=? THEN 1 ELSE json('spinlife_evidence_conflict') END`)
        .bind(TECHFLEX_ORG_ID,input.id,JSON.stringify(files.map(f=>f.id))),
      env.DB.prepare(`INSERT INTO attachments (id,organization_id,entity_type,entity_id,storage_key,file_name,content_type,size_bytes,category,uploaded_by)
        VALUES (?,?,'work_order_intake',?,?,?,'application/pdf',?,'service_report',?)`).bind(attachmentId,TECHFLEX_ORG_ID,input.id,stagedKey,fileName,bytes.byteLength,identity.userId),
      env.DB.prepare(`INSERT INTO spinlife_packets (id,intake_id,source_version,attachment_id,snapshot_json,created_by) VALUES (?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(),input.id,input.expectedVersion,attachmentId,JSON.stringify(snapshot),identity.userId),
      env.DB.prepare("UPDATE spinlife_visits SET documented_at=? WHERE intake_id=?").bind(now,input.id),
      env.DB.prepare("UPDATE work_order_intakes SET status=CASE WHEN status IN ('spinlife_review','spinlife_completed') THEN 'spinlife_completed' ELSE 'spinlife_documented' END,updated_at=? WHERE id=? AND organization_id=?").bind(now,input.id,TECHFLEX_ORG_ID),
      spinlifeAudit(identity,input.id,"spinlife.packet_generated",null,{attachmentId,sourceVersion:job.version,disposition:visit.disposition,documentedAt:now})];
    try {await env.DB.batch(statements);} catch(error) {
      let committed:{attachmentId:string}|null;
      try {committed=await env.DB.prepare("SELECT attachment_id AS attachmentId FROM spinlife_packets WHERE intake_id=? AND source_version=?").bind(input.id,input.expectedVersion).first<{attachmentId:string}>();}
      catch {stagedKey=null;throw new PortalHttpError(503,"PDF save confirmation was interrupted. Keep the work order open and retry generation to recover the saved version.");}
      if(committed?.attachmentId===attachmentId) stagedKey=null;
      if(committed) {if(stagedKey) await env.BUCKET.delete(stagedKey);stagedKey=null;return Response.json(committed,{headers:privateHeaders});}
      if(/conflict|malformed JSON|UNIQUE/i.test(String(error))) throw new PortalHttpError(409,"The answers or photos changed while generating the PDF. Your work is saved; review and generate again.");
      throw error;
    }
    stagedKey=null;
    return Response.json({attachmentId,fileName,billingStatus:"separate",reviewRequired:false},{headers:privateHeaders});
  } catch(error) {
    if(stagedKey) {try{await env.BUCKET.delete(stagedKey);}catch(cleanup){safeServerLog("attachment_cleanup",cleanup);}}
    const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;
  }
}
