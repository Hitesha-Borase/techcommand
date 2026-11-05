import {procedureDocument,procedureAnswer} from "./asset-ai-procedure";
import { z } from "zod";
import { partnerChecks, type FieldCheck } from "./spinlife-document-policy";
import {dmeFamilies} from "./academy-catalog";

const text = (max = 5000) => z.string().max(max).default("");
export const spinlifeDataSchema = z.object({
  externalId: text(120), rawText: text(30000), summary: text(500),
  serviceType: z.enum(["", "wgd_basic", "wgd_complex", "bed_delivery", "repair_single", "repair_multi", "frame_repair", "evaluation", "hourly_service", "consumer_install", "preventive_maintenance"]).default(""),
  customerName: text(240), customerPhone: text(80), serviceAddress: text(1000),
  equipmentType: text(240), manufacturer: text(160), model: text(160), serialNumber: text(160),
  dmeFamilyId:text(80).refine(v=>!v||dmeFamilies.some(f=>f.id===v),"Choose a listed DME equipment family, or leave it unclassified."),
  customerComplaint: text(), workOrderDate: text(120), extraChecks: text(),
});
export const spinlifeVisitSchema = z.object({
  parts:z.array(z.object({id:z.string().max(160),description:text(240),partNumber:text(120),quantity:z.number().int().min(1).max(100).default(1),state:z.enum(["recommended","ordered","installed"]).default("recommended"),compatibilitySource:text(2000)})).max(100).default([]),
  reportWording:z.object({sourceFingerprint:z.string().max(200000),reviewedAt:z.string().max(80),fields:z.object({findings:z.string().max(10000).optional(),workPerformed:z.string().max(10000).optional(),testResults:z.string().max(10000).optional(),recommendation:z.string().max(10000).optional()})}).nullable().default(null),
  previousGuidance: text(100000),
  manufacturerGuide: z.object({id:z.string().max(160),document:procedureDocument,retrievedAt:z.string().max(80),reviewedAt:z.string().max(80).nullable(),reviewedBy:z.string().max(160).nullable()}).nullable().default(null),
  manufacturerAnswers:z.array(procedureAnswer).max(100).default([]),
  narrative: text(15000), findings: text(), testResults: text(), recommendation: text(),
  disposition: z.enum(["needs_review", "delivery_completed", "returned_to_service", "parts_required", "needs_resolution", "out_of_service", "incomplete"]).default("needs_review"),
  customerSignatureName: text(240), signatureAttachmentId: text(160), customerSignedAt: text(80),
  technicianAttestedAt: text(80),
  photoCaptions: z.record(z.string().max(160),z.string().max(1500)).default({}),
  checks: z.record(z.string().max(5010), z.object({
    state: z.enum(["pending", "done", "na", "not_done"]), note: text(2000),
  })).refine(value => Object.keys(value).length <= 100, "Keep up to 100 check responses per order.").default({}),
});
export type SpinLifeData = z.infer<typeof spinlifeDataSchema>;
export type SpinLifeVisit = z.infer<typeof spinlifeVisitSchema>;
export function spinlifePartNotes(visit:SpinLifeVisit){return (visit.parts||[]).map(p=>`Part ${p.state}: ${p.description.trim()||"Description not recorded"} | Quantity ${p.quantity} | Part number: ${p.partNumber||"not recorded"} | Compatibility: ${p.compatibilitySource||"PART VERIFICATION REQUIRED; no compatibility source recorded"}`).join("\n");}
export type SpinLifeJob = {
  id: string; version: number; status: string; data: SpinLifeData; visit: SpinLifeVisit;
  intakeVersion?: number;
  technicianId: string | null; technicianName: string | null; technicianPayCents: number | null;
  scheduledStart: string | null; startedAt: string | null; documentedAt: string | null;
  lastMutationId: string | null; packetAttachmentId: string | null; packetSourceVersion: number | null;
};
export type SpinLifeJobSummary = Pick<SpinLifeJob, "id" | "version" | "status" | "technicianId" | "technicianName" | "technicianPayCents" | "scheduledStart" | "startedAt" | "packetSourceVersion"> & {
  data: Pick<SpinLifeData, "externalId" | "customerName" | "serviceType" | "serviceAddress">;
};
// Older intake fields can be null. They remain missing, never manufactured.
export function spinlifeData(value: Record<string, unknown>): SpinLifeData {
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
  const valid = spinlifeDataSchema.shape.serviceType.safeParse(clean.serviceType);
  return spinlifeDataSchema.parse({ ...clean, serviceType: valid.success ? valid.data : "" });
}
export function simpleChecks(data: SpinLifeData, visit: SpinLifeVisit): FieldCheck[] {
  // Unknown job type must not silently select repair instructions.
  const standard = data.serviceType ? partnerChecks(data.serviceType) : [];
  const extras = [...new Set(data.extraChecks.split("\n").map(s => s.trim()).filter(Boolean))].slice(0,50);
  const allChecks = [...standard, ...extras.map(label => ({ key: `extra:${label}`, label, complete: false }))];

  // Dynamic complaint-based step prioritization for repair/diagnostic orders
  const complaint = `${data.customerComplaint || ""} ${data.summary || ""}`.toLowerCase();
  if (complaint.trim() && !data.serviceType.startsWith("wgd") && data.serviceType !== "bed_delivery" && data.serviceType !== "preventive_maintenance") {
    const isBatteryIssue = /battery|power|charg|dead|voltage|won'?t turn on/.test(complaint);
    const isMotorIssue = /motor|drive|stuck|slow|speed|brake|jerky|controller/.test(complaint);
    const isJoystickIssue = /joystick|pendant|error code|code|flash/.test(complaint);
    const isTireIssue = /tire|caster|wheel|flat|bearing|wobble/.test(complaint);
    const isSeatingIssue = /seat|recline|tilt|arm\s*pad|cushion|upholstery/.test(complaint);

    allChecks.sort((a, b) => {
      const score = (check: FieldCheck) => {
        const k = check.key || "";
        if (isBatteryIssue && (k.includes("battery") || k.includes("charging"))) return -3;
        if (isJoystickIssue && (k.includes("joystick") || k.includes("codes") || k.includes("pendant"))) return -3;
        if (isMotorIssue && (k.includes("motor") || k.includes("ohms") || k.includes("joystick"))) return -2;
        if (isTireIssue && (k.includes("tires") || k.includes("frame") || k.includes("hardware"))) return -2;
        if (isSeatingIssue && (k.includes("arm") || k.includes("upholstery") || k.includes("comfort"))) return -2;
        return 0;
      };
      return score(a) - score(b);
    });
  }

  return allChecks.map(item => {
    const saved = visit.checks[item.key!];
    return { ...item, complete: saved?.state === "done", notApplicable: saved?.state === "na",
      reason: saved?.note || "", result: saved?.note || "", outcome: saved?.state || "pending" };
  });
}
export const spinlifeServiceLabels: Record<SpinLifeData["serviceType"], string> = {
  "": "Choose later", wgd_basic: "White-glove delivery", wgd_complex: "White-glove delivery — complex",
  bed_delivery: "Bed delivery", repair_single: "Repair", repair_multi: "Repair — multiple parts",
  frame_repair: "Frame repair", evaluation: "Evaluation", hourly_service: "Hourly service", consumer_install: "Installation",
  preventive_maintenance: "Preventive maintenance (PM)",
};
