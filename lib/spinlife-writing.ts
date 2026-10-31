import {simpleChecks,type SpinLifeJob} from "./spinlife-simple";
import type {WritingReport} from "./report-writing";
export function spinlifeWritingReport(job:SpinLifeJob):WritingReport{
 return {customerComplaint:job.data.customerComplaint||job.data.summary,equipmentType:job.data.equipmentType,manufacturer:job.data.manufacturer,model:job.data.model,serialNumber:job.data.serialNumber,findings:job.visit.findings,workPerformed:job.visit.narrative,testResults:job.visit.testResults,recommendation:job.visit.recommendation,assetDisposition:job.visit.disposition,partsUsed:(job.visit.parts||[]).filter(p=>p.state==="installed"&&p.description.trim()).map(p=>({description:p.description,partNumber:p.partNumber,quantity:p.quantity})),diagnosticSteps:simpleChecks(job.data,job.visit).filter(check=>check.key!=="sl_attestation").map(check=>({label:check.label,complete:check.complete||!!check.notApplicable,result:check.notApplicable?`N/A: ${check.reason}`:check.result||""}))};
}
/** Reviewed prose is separate from raw entries and unusable after its evidence changes. */
export function spinlifeWritingFingerprint(job:SpinLifeJob){return JSON.stringify({serviceType:job.data.serviceType,report:spinlifeWritingReport(job),parts:job.visit.parts||[],procedureId:job.visit.manufacturerGuide?.id||null,procedureReviewed:job.visit.manufacturerGuide?.reviewedAt||null,procedureAnswers:job.visit.manufacturerAnswers});}
export function spinlifeReviewedWording(job:SpinLifeJob){
 const wording=job.visit.reportWording;
 return wording&&wording.sourceFingerprint===spinlifeWritingFingerprint(job)?wording.fields:null;
}
