import {z} from "zod";
import {simpleChecks,spinlifePartNotes,type SpinLifeJob} from "./spinlife-simple";
import {partnerCheckProblems,resolvedCheck} from "./spinlife-document-policy";
import {procedureProblems,procedureText} from "./asset-ai-procedure";
import {spinlifeReviewedWording} from "./spinlife-writing";
import {evidenceRequirements,evidenceCounts,missingEvidence} from "./completion-policy";

export const closeoutDataSchema=z.object({
 accountId:z.string().max(180).default(""),locationId:z.string().max(180).default(""),
 invoiceTotalCents:z.number().int().min(0).max(100000000).nullable().default(null),
 fixedDirectCostsCents:z.number().int().min(0).max(100000000).nullable().default(null),
 authorizationReference:z.string().trim().max(2000).default(""),
 confirmed:z.boolean().default(false),
});
export type SpinlifeCloseoutData=z.infer<typeof closeoutDataSchema>;
export function reconcileCloseoutDraft(base:SpinlifeCloseoutData,local:SpinlifeCloseoutData,server:SpinlifeCloseoutData){
 const merged={...local},conflicts:(keyof SpinlifeCloseoutData)[]=[];
 for(const key of Object.keys(base) as (keyof SpinlifeCloseoutData)[]){
  if(key==="confirmed")continue;
  if(local[key]===base[key])Object.assign(merged,{[key]:server[key]});
  else if(server[key]!==base[key]&&local[key]!==server[key])conflicts.push(key);
 }
 merged.confirmed=false;
 return {merged,conflicts};
}
export type CloseoutFile={id:string;category:string;contentType:string;fileName:string;storageKey:string;sizeBytes:number};

/** Reuse recorded answers only. N/A is kept on the checklist, not presented as a performed diagnostic. */
export function spinlifeCloseoutReport(job:SpinLifeJob){
 const v=job.visit,d=job.data,wording=spinlifeReviewedWording(job),checks=simpleChecks(d,v);
 const diagnosticSteps=checks.filter(c=>c.complete&&c.key!=="sl_attestation").map(c=>({label:c.label,complete:true,result:c.result?.trim()||"Recorded by the technician as performed; no additional result entered."}));
 return {customerComplaint:d.customerComplaint||d.summary,equipmentType:d.equipmentType,manufacturer:d.manufacturer,model:d.model,serialNumber:d.serialNumber,
  findings:wording?.findings??v.findings,workPerformed:wording?.workPerformed??v.narrative,testResults:wording?.testResults??v.testResults,
  recommendation:[wording?.recommendation??v.recommendation,spinlifePartNotes(v),v.previousGuidance,procedureText(v.manufacturerGuide,v.manufacturerAnswers)].filter(Boolean).join("\n\n"),
  assetDisposition:v.disposition==="out_of_service"?"quarantined":v.disposition==="incomplete"?"needs_review":v.disposition,
  checklist:checks.map(c=>({key:c.key!,label:c.label,complete:c.complete,notApplicable:!!c.notApplicable,reason:c.reason,result:c.result})),diagnosticSteps,partsUsed:(v.parts||[]).filter(p=>p.state==="installed").map(p=>({description:p.description,partNumber:p.partNumber,quantity:p.quantity})),
  customerSignatureName:v.customerSignatureName,customerSignedAt:v.customerSignedAt,signatureAttachmentId:v.signatureAttachmentId,
  documentDetails:{dmeFamilyId:d.dmeFamilyId,workOrderDate:d.workOrderDate,photoLayout:"gallery",photoCaptions:v.photoCaptions},
 };
}
export function spinlifeCloseoutProblems(job:SpinLifeJob,files:CloseoutFile[]){
 const r=spinlifeCloseoutReport(job),problems:string[]=[];
 if(job.status!=="spinlife_review")problems.push("Technician: Send for admin review");
 if(!job.technicianId)problems.push("Assigned technician");
 if(!job.startedAt)problems.push("Actual Start Work Order time");
 if(!job.data.externalId.trim())problems.push("Full work-order number");
 if(!job.data.customerName.trim())problems.push("Customer name");
 if(!job.data.serviceAddress.trim())problems.push("Service address");
 if(!job.data.serviceType)problems.push("Service type");
 if(job.visit.disposition==="incomplete")problems.push("Recorded final equipment disposition (unfinished work remains a draft)");
 if(!job.packetAttachmentId||job.packetSourceVersion!==job.version)problems.push("Generate the current service PDF");
 if(job.packetAttachmentId&&!files.some(f=>f.id===job.packetAttachmentId&&f.category==="service_report"))problems.push("Current service PDF attachment must be available");
 if(!job.visit.technicianAttestedAt||job.visit.checks.sl_attestation?.state!=="done")problems.push("Assigned technician attestation");
 for(const [key,label] of [["equipmentType","Equipment type"],["manufacturer","Manufacturer"],["model","Model"],["serialNumber","Serial number"]] as const)if(!r[key].trim())problems.push(label);
 if(r.customerComplaint.trim().length<3)problems.push("Customer-reported condition or delivery scope");
 if(r.findings.trim().length<10)problems.push("Technical findings");
 if(r.workPerformed.trim().length<10)problems.push("Work performed");
 if(r.testResults.trim().length<5)problems.push("Actual final test results");
 if(!r.customerSignatureName.trim()||!r.signatureAttachmentId||!files.some(f=>f.id===r.signatureAttachmentId&&f.category==="signature"))problems.push("Customer acknowledgment and its saved signature");
 if(!r.diagnosticSteps.length)problems.push("Recorded service activity");
 if(r.checklist.some(c=>!resolvedCheck(c)))problems.push("Resolve every partner or added check with an actual result or a documented N/A reason");
 if(r.checklist.length>50||r.checklist.some(c=>c.key.length>100||c.label.length>500))problems.push("Review unusually long or numerous partner checks with administration before closeout; all original answers remain saved");
 if(r.workPerformed.length>10000||r.recommendation.length>10000||r.findings.length>10000||r.testResults.length>10000)problems.push("Condense the reviewed report wording to the closeout limit without removing original field evidence");
 if(r.customerSignatureName.length>160)problems.push("Review the acknowledgment name length before closeout");
 if(r.documentDetails.workOrderDate&&!/^\d{4}-\d{2}-\d{2}$/.test(r.documentDetails.workOrderDate))problems.push("Work-order date in YYYY-MM-DD format");
 for(const f of files.filter(f=>f.contentType.startsWith("image/")&&!["client_work_order","signature","service_report","invoice","pay_stub"].includes(f.category))){const caption=job.visit.photoCaptions[f.id]?.trim();if(!caption)problems.push(`Photo caption: ${f.fileName}`);else if(caption.length>240)problems.push(`Shorten the report photo caption to 240 characters: ${f.fileName}`);}
 if(r.partsUsed.some(p=>!p.description.trim()))problems.push("Description of each installed part");
 if(!r.partsUsed.length&&r.checklist.some(c=>c.key==="sl_installed"&&c.complete&&!c.notApplicable))problems.push("List the installed parts, or record why parts installation was not applicable");
 if(["parts_required","needs_resolution","needs_review","follow_up_required"].includes(r.assetDisposition)&&job.visit.recommendation.trim().length<10)problems.push("Follow-up recommendation and responsible party");
 problems.push(...partnerCheckProblems(r.checklist,job.data.serviceType),...procedureProblems(job.visit.manufacturerGuide,job.visit.manufacturerAnswers));
 problems.push(...missingEvidence(evidenceRequirements(job.data.serviceType),evidenceCounts(files)).map(e=>e.label));
 return [...new Set(problems)];
}
