import { z } from "zod";

export const wordingFields = [
  ["suggestedFindings", "findings", "Technical findings"],
  ["suggestedWorkPerformed", "workPerformed", "Work performed"],
  ["suggestedTestResults", "testResults", "Test results"],
  ["suggestedRecommendation", "recommendation", "Recommendations / follow-up"],
] as const;
export const writingReportSchema = z.object({
  fieldNotes: z.string().max(10000).optional(),
  customerComplaint: z.string().max(5000), equipmentType: z.string().max(240), manufacturer: z.string().max(160),
  model: z.string().max(160), serialNumber: z.string().max(160), findings: z.string().max(10000),
  workPerformed: z.string().max(10000), testResults: z.string().max(10000), recommendation: z.string().max(10000), assetDisposition: z.string().max(80),
  diagnosticSteps: z.array(z.object({ label: z.string().max(500), complete: z.boolean(), result: z.string().max(2000) })).max(50),
  partsUsed: z.array(z.object({ description: z.string().max(240), partNumber: z.string().max(120), quantity: z.number().int().min(1).max(100) })).max(100),
});
const sourceIds = z.array(z.string().max(100)).max(160);
export const writingReviewSchema = z.object({
  readyForSubmission: z.boolean(), summary: z.string().max(3000), missingFacts: z.array(z.string().max(500)).max(50), safetyFlags: z.array(z.string().max(500)).max(30),
  suggestedFindings: z.string().max(10000), suggestedWorkPerformed: z.string().max(10000), suggestedTestResults: z.string().max(10000), suggestedRecommendation: z.string().max(10000),
  sources: z.object({ suggestedFindings: sourceIds, suggestedWorkPerformed: sourceIds, suggestedTestResults: sourceIds, suggestedRecommendation: sourceIds }),
});
export type WritingReport = z.infer<typeof writingReportSchema>;
export type WritingReview = z.infer<typeof writingReviewSchema>;
export type RecordedFact = { id: string; label: string; text: string };

export function recordedReportFacts(report: WritingReport): RecordedFact[] {
  return [
    {id: "field-notes", label: "Original technician notes (only recorded observations are evidence)", text: report.fieldNotes || ""},
    {id: "complaint", label: "Reported complaint (not a confirmed finding)", text: report.customerComplaint},
    ...wordingFields.map(([, field, label]) => ({id: field, label, text: report[field]})),
    ...report.diagnosticSteps.flatMap((step, i) => step.complete && step.result.trim() ? [{id: `answer-${i + 1}`, label: `Answer ${i + 1}: ${step.label}`, text: step.result}] : []),
    ...report.partsUsed.map((part, i) => ({id: `part-${i + 1}`, label: `Recorded part ${i + 1}`, text: `${part.description} | Part number: ${part.partNumber || "not recorded"} | Quantity: ${part.quantity}`})),
  ].filter(item => item.text.trim());
}
export function reportWritingFingerprint(jobId: string, technicianId: string, report: WritingReport & {documentDetails?:{fieldNotes?:string}}) {
  const facts = Object.fromEntries(Object.keys(writingReportSchema.shape).map(key => [key, report[key as keyof WritingReport]]));
  return JSON.stringify({jobId, technicianId, report: {...facts,fieldNotes:report.fieldNotes || report.documentDetails?.fieldNotes || ""}});
}
export function validateWritingSources(review: WritingReview, facts: RecordedFact[]) {
  const available = new Set(facts.map(fact => fact.id));
  for (const [field] of wordingFields) {
    if ((review[field].trim() && !review.sources[field].length) || review.sources[field].some(id => !available.has(id))) {
      throw new Error("The draft cited an answer that is missing or unrecorded. Nothing was applied; review your answers and try again.");
    }
  }
}
