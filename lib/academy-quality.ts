import {env} from "cloudflare:workers";
import {TECHFLEX_ORG_ID} from "@/lib/portal-auth";
import type {AcademyTrack} from "@/lib/academy-catalog";

export const diagnosticOutcomes=["not_reviewed","not_applicable","resolved_or_supported","inconclusive"] as const;
export const firstRepairOutcomes=["not_reviewed","not_applicable","resolved_first_approved_repair","technician_rework_required","excluded_parts_unavailable","excluded_authorization_delay","excluded_scope_evaluation_only","excluded_additional_hidden_failure"] as const;
export const callbackOutcomes=["not_reviewed","no_same_issue_callback_through_review_date","technician_related_same_issue_callback","unrelated_or_external_repeat_service"] as const;
export const documentationOutcomes=["not_reviewed","accepted_first_review","accepted_after_correction"] as const;

export type QualityRow={id:string;reportId:string;workOrderId:string;reportVersion:number;revision:number;diagnosticOutcome:string;firstRepairOutcome:string;callbackOutcome:string;documentationOutcome:string;reviewedThroughOn:string;evidence:string;createdAt:string};
export type Rate={numerator:number;denominator:number;percent:number|null};
export type QualitySummary={reviewedReports:number;diagnosticResolution:Rate;firstRepairSuccess:Rate;callbackFree:Rate;documentationFirstPass:Rate;excludedFirstRepair:number;unreviewedApprovedReports:number};

const rate=(numerator:number,denominator:number):Rate=>({numerator,denominator,percent:denominator?Math.round(numerator/denominator*100):null});
export function summarizeQuality(rows:Pick<QualityRow,"reportId"|"diagnosticOutcome"|"firstRepairOutcome"|"callbackOutcome"|"documentationOutcome">[],approvedReports=rows.length):QualitySummary{
 const diagnostic=rows.filter(r=>["resolved_or_supported","inconclusive"].includes(r.diagnosticOutcome));
 const repair=rows.filter(r=>["resolved_first_approved_repair","technician_rework_required"].includes(r.firstRepairOutcome));
 const callbacks=rows.filter(r=>["no_same_issue_callback_through_review_date","technician_related_same_issue_callback"].includes(r.callbackOutcome));
 const documentation=rows.filter(r=>["accepted_first_review","accepted_after_correction"].includes(r.documentationOutcome));
 return {
  reviewedReports:new Set(rows.map(r=>r.reportId)).size,
  diagnosticResolution:rate(diagnostic.filter(r=>r.diagnosticOutcome==="resolved_or_supported").length,diagnostic.length),
  firstRepairSuccess:rate(repair.filter(r=>r.firstRepairOutcome==="resolved_first_approved_repair").length,repair.length),
  callbackFree:rate(callbacks.filter(r=>r.callbackOutcome==="no_same_issue_callback_through_review_date").length,callbacks.length),
  documentationFirstPass:rate(documentation.filter(r=>r.documentationOutcome==="accepted_first_review").length,documentation.length),
  excludedFirstRepair:rows.filter(r=>r.firstRepairOutcome.startsWith("excluded_")).length,
  unreviewedApprovedReports:Math.max(approvedReports-new Set(rows.map(r=>r.reportId)).size,0),
 };
}

export const latestQualitySql=`SELECT q.id,q.report_id AS reportId,q.work_order_id AS workOrderId,q.report_version AS reportVersion,q.revision,q.diagnostic_outcome AS diagnosticOutcome,q.first_repair_outcome AS firstRepairOutcome,q.callback_outcome AS callbackOutcome,q.documentation_outcome AS documentationOutcome,q.reviewed_through_on AS reviewedThroughOn,q.evidence,q.created_at AS createdAt FROM academy_quality_reviews q WHERE q.organization_id='techflex' AND q.technician_id=?1 AND q.track=?2 AND q.revision=(SELECT MAX(n.revision) FROM academy_quality_reviews n WHERE n.organization_id=q.organization_id AND n.track=q.track AND n.report_id=q.report_id AND n.technician_id=q.technician_id) ORDER BY q.report_id`;
export async function latestQuality(technicianId:string,track:AcademyTrack="dme_mobility"){
 return (await env.DB.prepare(latestQualitySql).bind(technicianId,track).all<QualityRow>()).results;
}
export async function approvedDmeReportCount(technicianId:string){
 const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id WHERE w.organization_id=? AND sr.technician_id=? AND sr.qa_status='approved' AND w.service_type NOT LIKE 'biomed_%'").bind(TECHFLEX_ORG_ID,technicianId).first<{n:number}>();return Number(row?.n||0);
}
