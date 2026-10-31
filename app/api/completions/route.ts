import { equipmentWorkflow } from "@/lib/equipment-workflow";
import { releasePendingSubmissionReviews } from "@/lib/submission-inbox";
import {dmeFamilies} from "@/lib/academy-catalog";
import {
  biomedicalBillingReview,
  type ContractSnapshot,
} from "@/lib/biomedical-billing-review";
import { isSpinLife, mergePartnerChecks, partnerCheckProblems, resolvedCheck, workOrderPacketName, dmePacketName, packetStatus } from "@/lib/spinlife-document-policy";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  completionChecklist,
  evidenceCounts,
  evidenceRequirements,
  missingEvidence,
} from "@/lib/completion-policy";
import { processGoogleSheetOutbox } from "@/lib/google-sheets-sync";
import {
  configuredReviewUrl,
  processGoogleWorkspaceEmailOutbox,
} from "@/lib/google-workspace-email";
import {
  TECHFLEX_ORG_ID,
  PortalHttpError,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";
import { safeServerLog } from "@/lib/server-observability";
import {
  PdfGenerationError,
  generateCompletionPacketPdf,
  generateSpinLifeWorkOrderPdf,
  generateInvoicePdf,
  generateServiceReportPdf,
} from "@/lib/techflex-pdfs";
import {
  multiAssetPmProblems,
  type WorkOrderAssetProgress,
} from "@/lib/work-order-asset-policy";
import {
  gradeTrainingLesson,
  publicTrainingLesson,
  trainingLesson,
} from "@/lib/training-mode";

const activeAssignmentStatuses = [
  "offered",
  "assigned",
  "accepted",
  "dispatched",
  "arrived",
  "in_progress",
  "submitted",
];

const checklistItem = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(2).max(500),
  complete: z.boolean(),
  notApplicable: z.boolean().optional(),
  reason: z.string().trim().max(2000).optional(),
  result: z.string().trim().max(2000).optional(),
});

const diagnosticStep = z.object({
  label: z.string().trim().min(2).max(500),
  complete: z.boolean(),
  result: z.string().trim().max(2000).optional().default(""),
});

const partUsed = z.object({
  description: z.string().trim().min(1).max(240),
  partNumber: z.string().trim().max(120).optional().default(""),
  quantity: z.number().int().min(1).max(100).default(1),
});

const documentDetails = z.object({
  fieldNotes: z.string().max(10000).default(""),
  dmeFamilyId:z.string().max(80).refine(v=>!v||dmeFamilies.some(f=>f.id===v),"Choose a listed DME equipment family, or leave it unclassified.").default(""),
  actualOnsiteMinutes: z.number().int().min(0).max(43200).nullable().optional().default(null),
  workOrderDate: z.string().trim().max(10).regex(/^(?:\d{4}-\d{2}-\d{2})?$/).default(''),
  photoLayout: z.enum(['detail','gallery']).default('detail'),
  photoCaptions: z.record(z.string().max(160),z.string().trim().max(240)).default({}),
}).default({});
const reportFields = z.object({
  documentDetails,
  customerComplaint: z.string().trim().max(5000).default(""),
  equipmentType: z.string().trim().max(240).default(""),
  manufacturer: z.string().trim().max(160).default(""),
  model: z.string().trim().max(160).default(""),
  serialNumber: z.string().trim().max(160).default(""),
  findings: z.string().trim().max(10000).default(""),
  workPerformed: z.string().trim().max(10000).default(""),
  testResults: z.string().trim().max(10000).default(""),
  recommendation: z.string().trim().max(10000).default(""),
  assetDisposition: z
    .enum([
      "passed",
      "returned_to_service",
      "parts_required",
      "follow_up_required",
      "quarantined",
      "retired",
      "needs_resolution",
      "needs_review",
      "delivery_completed",
      "cataloged",
    ])
    .default("needs_review"),
  checklist: z.array(checklistItem).max(50).default([]),
  diagnosticSteps: z.array(diagnosticStep).max(50).default([]),
  partsUsed: z.array(partUsed).max(100).default([]),
  customerSignatureName: z.string().trim().max(160).default(""),
  signatureAttachmentId: z.string().trim().optional().nullable(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_draft"),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1).optional().nullable(),
    expectedReportVersion: z.number().int().min(0),
    expectedWorkOrderVersion: z.number().int().min(1),
    report: reportFields,
  }),
  z.object({
    action: z.literal("submit"),
    requestId: z.string().uuid().optional(),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1).optional().nullable(),
    expectedReportVersion: z.number().int().min(0),
    expectedWorkOrderVersion: z.number().int().min(1),
    report: reportFields,
    trainingAttemptId: z.string().min(1).optional().nullable(),
  }),
  z.object({
    action: z.literal("training_check"),
    workOrderId: z.string().min(1),
    technicianId: z.string().min(1).optional().nullable(),
    answers: z.record(z.string(), z.number().int().min(0).max(20)),
  }),
  z.object({
    action: z.literal("review"),
    reportId: z.string().min(1),
    expectedReportVersion: z.number().int().min(1),
    expectedWorkOrderVersion: z.number().int().min(1),
    expectedReviewSnapshot: z.string().trim().max(100),
    documentationReviewed: z.boolean().default(false),
    decision: z.enum(["approve", "return"]),
    qaNotes: z.string().trim().max(5000).default(""),
  }),
  z.object({
    action: z.literal("inbox_review"),
    reportId: z.string().min(1),
    expectedReportVersion: z.number().int().min(1),
    expectedWorkOrderVersion: z.number().int().min(1),
    expectedReviewSnapshot: z.string().trim().max(100),
    decision: z.enum(["note", "reviewed"]),
    qaNotes: z.string().trim().max(5000).default(""),
  }),
  z.object({
    action: z.literal("refine_report"),
    reportId: z.string().min(1),
    expectedReportVersion: z.number().int().min(1),
    expectedWorkOrderVersion: z.number().int().min(1),
    expectedReviewSnapshot: z.string().trim().max(100),
    report: reportFields,
    assets: z.array(z.object({
      assetId: z.string().min(1).max(160), expectedRecordVersion: z.number().int().positive(),
      status: z.enum(["not_started","in_progress","completed","not_applicable"]),
      findings: z.string().max(10000).default(""), workPerformed: z.string().max(10000).default(""), testResults: z.string().max(10000).default(""),
      disposition: reportFields.shape.assetDisposition.nullable(), notApplicableReason: z.string().max(2000).default(""),
    })).max(1000).default([]),
  }),

]);

type WorkOrderRecord = {
  id: string;
  externalId: string;
  externalSource: string;
  accountId: string;
  accountName: string;
  billingEmail: string | null;
  paymentTermsDays: number;
  locationId: string;
  locationName: string;
  locationType: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  assetId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  assetTag: string | null;
  assetManufacturer: string | null;
  assetModel: string | null;
  assetSerialNumber: string | null;
  selectedAssetCount: number;
  serviceType: string;
  summary: string;
  description: string | null;
  requiredSkillsJson: string | null;
  status: string;
  acceptedPriceCents: number;
  estimatedCostCents: number;
  grossMarginBasisPoints: number;
  scheduledStart: string | null;
  completedAt: string | null;
  recordVersion: number;
};

type ReportRecord = {
  id: string;
  workOrderId: string;
  technicianId: string;
  technicianName: string;
  technicianCode: string;
  reportVersion: number;
  findings: string | null;
  workPerformed: string | null;
  recommendation: string | null;
  customerComplaint: string | null;
  equipmentType: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  diagnosticStepsJson: string;
  testResults: string | null;
  partsUsedJson: string;
  documentDetailsJson: string;
  assetDisposition: string | null;
  checklistJson: string | null;
  customerSignatureName: string | null;
  customerSignedAt: string | null;
  signatureAttachmentId: string | null;
  reportPdfAttachmentId: string | null;
  submittedAt: string | null;
  qaStatus: string;
  qaNotes: string | null;
  qaReviewedAt: string | null;
  recordVersion: number;
};

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function locationAddress(workOrder: WorkOrderRecord) {
  return [
    workOrder.address1,
    workOrder.address2,
    workOrder.city,
    workOrder.state,
    workOrder.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function safeFileToken(value: string) {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "Unknown";
}

const completionStatus = packetStatus;
const spinlifeWorkOrder=(workOrder:WorkOrderRecord)=>isSpinLife(workOrder.accountName)||isSpinLife(workOrder.externalSource);

async function getWorkOrder(workOrderId: string) {
  return env.DB.prepare(
    `SELECT w.id, w.external_id AS externalId, COALESCE(w.external_source, 'manual') AS externalSource,
            w.account_id AS accountId, a.name AS accountName, a.billing_email AS billingEmail,
            a.payment_terms_days AS paymentTermsDays, w.location_id AS locationId,
            l.name AS locationName, l.location_type AS locationType, l.address_1 AS address1, l.address_2 AS address2,
            l.city, l.state, l.postal_code AS postalCode, w.asset_id AS assetId,
            w.customer_id AS customerId, COALESCE(c.name,CASE WHEN json_valid(w.required_skills_json) AND json_extract(w.required_skills_json,'$.simpleSpinlifeHandoff') IS NOT NULL THEN json_extract(w.required_skills_json,'$.customerName') END) AS customerName,
            c.email AS customerEmail, COALESCE(c.phone,CASE WHEN json_valid(w.required_skills_json) AND json_extract(w.required_skills_json,'$.simpleSpinlifeHandoff') IS NOT NULL THEN json_extract(w.required_skills_json,'$.customerPhone') END) AS customerPhone,
            s.asset_tag AS assetTag, s.manufacturer AS assetManufacturer,
            s.model AS assetModel, s.serial_number AS assetSerialNumber,
            (SELECT COUNT(*) FROM work_order_assets wa
              WHERE wa.organization_id=w.organization_id AND wa.work_order_id=w.id) AS selectedAssetCount,
            w.service_type AS serviceType, w.summary, w.description,
            w.required_skills_json AS requiredSkillsJson, w.status,
            COALESCE(w.accepted_price_cents, 0) AS acceptedPriceCents,
            COALESCE(w.estimated_cost_cents, 0) AS estimatedCostCents,
            COALESCE(w.gross_margin_basis_points, 0) AS grossMarginBasisPoints,
            w.scheduled_start AS scheduledStart, w.completed_at AS completedAt,
            w.record_version AS recordVersion
       FROM work_orders w JOIN accounts a ON a.id = w.account_id
       JOIN locations l ON l.id = w.location_id LEFT JOIN assets s ON s.id = w.asset_id
       LEFT JOIN customers c ON c.id = w.customer_id
      WHERE w.id = ? AND w.organization_id = ?`,
  )
    .bind(workOrderId, TECHFLEX_ORG_ID)
    .first<WorkOrderRecord>();
}

async function assignedTechnician(
  workOrderId: string,
  identity: PortalIdentity,
  requestedTechnicianId?: string | null,
) {
  const scopedId =
    identity.role === "technician"
      ? identity.technicianId
      : requestedTechnicianId || null;
  if (identity.role === "technician" && !scopedId) return null;
  return env.DB.prepare(
    `SELECT t.id, t.technician_code AS technicianCode,
            COALESCE(u.display_name, t.technician_code) AS technicianName,
            wa.role, wa.status, t.training_mode AS trainingMode,
            t.proficiency_level AS proficiencyLevel,
            t.guided_jobs_completed AS guidedJobsCompleted,
            t.qa_pass_streak AS qaPassStreak,
            t.competency_score AS competencyScore
       FROM work_order_assignments wa JOIN technicians t ON t.id = wa.technician_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE wa.work_order_id = ?
        AND wa.status IN (${activeAssignmentStatuses.map(() => "?").join(",")})
        AND (? IS NULL OR wa.technician_id = ?)
      ORDER BY CASE wa.role WHEN 'primary' THEN 1 ELSE 2 END LIMIT 1`,
  )
    .bind(workOrderId, ...activeAssignmentStatuses, scopedId, scopedId)
    .first<{
      id: string;
      technicianCode: string;
      technicianName: string;
      role: string;
      status: string;
      trainingMode: boolean;
      proficiencyLevel: string;
      guidedJobsCompleted: number;
      qaPassStreak: number;
      competencyScore: number;
    }>();
}

async function latestReport(workOrderId: string, technicianId: string) {
  return env.DB.prepare(
    `SELECT sr.id, sr.work_order_id AS workOrderId, sr.technician_id AS technicianId,
            COALESCE(u.display_name, t.technician_code) AS technicianName,
            t.technician_code AS technicianCode, sr.report_version AS reportVersion,
            sr.findings, sr.work_performed AS workPerformed, sr.recommendation,
            sr.customer_complaint AS customerComplaint, sr.equipment_type AS equipmentType,
            sr.manufacturer, sr.model, sr.serial_number AS serialNumber,
            sr.diagnostic_steps_json AS diagnosticStepsJson, sr.test_results AS testResults,
            sr.parts_used_json AS partsUsedJson, sr.document_details_json AS documentDetailsJson, sr.asset_disposition AS assetDisposition,
            sr.checklist_json AS checklistJson, sr.customer_signature_name AS customerSignatureName,
            sr.customer_signed_at AS customerSignedAt,
            sr.signature_attachment_id AS signatureAttachmentId,
            sr.report_pdf_attachment_id AS reportPdfAttachmentId,
            sr.submitted_at AS submittedAt, sr.qa_status AS qaStatus,
            sr.qa_notes AS qaNotes, sr.qa_reviewed_at AS qaReviewedAt,
            sr.record_version AS recordVersion
       FROM service_reports sr JOIN technicians t ON t.id = sr.technician_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE sr.work_order_id = ? AND sr.technician_id = ?
      ORDER BY sr.report_version DESC LIMIT 1`,
  )
    .bind(workOrderId, technicianId)
    .first<ReportRecord>();
}

async function approvedReportTechnician(
  workOrderId: string,
  identity: PortalIdentity,
  requestedTechnicianId: string | null,
) {
  const scopedId = identity.role === "technician" ? identity.technicianId : requestedTechnicianId;
  if (!scopedId) return null;
  return env.DB.prepare(
    `SELECT t.id,t.technician_code AS technicianCode,
            COALESCE(u.display_name,t.technician_code) AS technicianName,
            'primary' AS role,'completed' AS status,t.training_mode AS trainingMode,
            t.proficiency_level AS proficiencyLevel,t.guided_jobs_completed AS guidedJobsCompleted,
            t.qa_pass_streak AS qaPassStreak,t.competency_score AS competencyScore
       FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id AND w.organization_id=?
       JOIN technicians t ON t.id=sr.technician_id AND t.organization_id=w.organization_id
       LEFT JOIN users u ON u.id=t.user_id
      WHERE sr.work_order_id=? AND sr.technician_id=? AND sr.qa_status='approved'
      ORDER BY sr.report_version DESC LIMIT 1`,
  ).bind(TECHFLEX_ORG_ID, workOrderId, scopedId).first<{
    id: string;
    technicianCode: string;
    technicianName: string;
    role: string;
    status: string;
    trainingMode: boolean;
    proficiencyLevel: string;
    guidedJobsCompleted: number;
    qaPassStreak: number;
    competencyScore: number;
  }>();
}

const availableWorkOrderEvidence = `organization_id = ? AND entity_type = 'work_order'
  AND entity_id = ? AND NOT EXISTS (
    SELECT 1 FROM document_records d WHERE d.attachment_id = attachments.id
      AND d.organization_id = attachments.organization_id AND d.status = 'deleted'
  )`;

// Compare the same ordered metadata inside the approval transaction. File changes
// do not necessarily increment the work-order/report versions.
const evidenceSnapshotSql = `SELECT json_group_array(json_array(
  id, file_name, content_type, size_bytes, category, created_at, storage_key
)) AS snapshot FROM (
  SELECT id, file_name, content_type, size_bytes, category, created_at, storage_key
  FROM attachments WHERE ${availableWorkOrderEvidence} ORDER BY id
)`;

// A submission snapshot also pins the exact selected-equipment facts and the
// governed procedure answers that QA received. The ordering is deliberately
// stable so a change between validation and the atomic save aborts the batch.
const assetEvidenceSnapshotSql = `SELECT json_group_array(json_array(
  assetId, assetTag, manufacturer, model, serialNumber, registryVersion,
  progressVersion, status, findings, workPerformed, testResults, disposition,
  notApplicableReason, procedureSnapshotJson, procedureAnswersJson, notes
)) AS snapshot FROM (
  SELECT a.id AS assetId, a.asset_tag AS assetTag, a.manufacturer, a.model,
         a.serial_number AS serialNumber, a.record_version AS registryVersion,
         wa.record_version AS progressVersion, wa.status, wa.findings,
         wa.work_performed AS workPerformed, wa.test_results AS testResults,
         wa.disposition, wa.not_applicable_reason AS notApplicableReason,
         wa.procedure_snapshot_json AS procedureSnapshotJson,
         wa.procedure_answers_json AS procedureAnswersJson, wa.notes
    FROM work_order_assets wa
    JOIN work_orders w ON w.id=wa.work_order_id
      AND w.organization_id=wa.organization_id
    JOIN assets a ON a.id=wa.asset_id
      AND a.organization_id=wa.organization_id
      AND a.account_id=w.account_id AND a.location_id=w.location_id
   WHERE wa.organization_id=? AND wa.work_order_id=?
   ORDER BY a.asset_tag,a.id
)`;

type SubmissionSnapshot = { evidence: string; assets: string };

type SubmissionReplay = {
  reportId: string;
  reportVersion: number;
  recordVersion: number;
  workOrderRecordVersion: number;
};

async function submissionRequestDigest(input: Extract<z.infer<typeof actionSchema>, { action: "submit" }>) {
  // Empty new notes are equivalent to an omitted field in an older pending request.
  // Keep that request's digest stable so pre-update submissions can still be resumed.
  const {fieldNotes,...legacyDetails} = input.report.documentDetails;
  const digestReport = fieldNotes ? input.report : {...input.report,documentDetails:legacyDetails};
  const serialized = JSON.stringify({
    workOrderId: input.workOrderId,
    technicianId: input.technicianId || null,
    expectedReportVersion: input.expectedReportVersion,
    expectedWorkOrderVersion: input.expectedWorkOrderVersion,
    report: digestReport,
    trainingAttemptId: input.trainingAttemptId || null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function submissionReplay(
  requestId: string,
  actorUserId: string,
  workOrderId: string,
  technicianId: string,
  requestDigest: string,
): Promise<SubmissionReplay | null> {
  const row = await env.DB.prepare(
    `SELECT actor_user_id AS actorUserId,after_json AS afterJson
       FROM audit_logs
      WHERE organization_id=? AND action='service_report.submission_snapshot'
        AND entity_type='service_report_revision'
        AND json_extract(after_json,'$.requestId')=?
      ORDER BY occurred_at,id LIMIT 1`,
  ).bind(TECHFLEX_ORG_ID, requestId).first<{ actorUserId: string; afterJson: string }>();
  if (!row) return null;
  const snapshot = safeJson<Record<string, unknown>>(row.afterJson, {});
  if (
    row.actorUserId !== actorUserId ||
    snapshot.workOrderId !== workOrderId ||
    snapshot.technicianId !== technicianId ||
    snapshot.requestDigest !== requestDigest
  )
    throw new PortalHttpError(409, "This submission recovery key is already bound to different saved work. Reload the work order and submit the current evidence as a new request.");
  const replay = {
    reportId: String(snapshot.reportId || ""),
    reportVersion: Number(snapshot.reportVersion),
    recordVersion: Number(snapshot.sourceReportRecordVersion),
    workOrderRecordVersion: Number(snapshot.sourceWorkOrderRecordVersion),
  };
  if (!replay.reportId || !Number.isInteger(replay.reportVersion) || !Number.isInteger(replay.recordVersion) || !Number.isInteger(replay.workOrderRecordVersion))
    throw new PortalHttpError(409, "The prior submission exists but its confirmation is incomplete. Open the current saved record before trying again.");
  return replay;
}

async function submissionSnapshot(workOrderId: string): Promise<SubmissionSnapshot> {
  const [evidenceRow, assetRow] = await Promise.all([
    env.DB.prepare(evidenceSnapshotSql)
      .bind(TECHFLEX_ORG_ID, workOrderId)
      .first<{ snapshot: string }>(),
    env.DB.prepare(assetEvidenceSnapshotSql)
      .bind(TECHFLEX_ORG_ID, workOrderId)
      .first<{ snapshot: string }>(),
  ]);
  return {
    evidence: evidenceRow?.snapshot || "[]",
    assets: assetRow?.snapshot || "[]",
  };
}

async function inboxSnapshot(workOrderId: string) {
  const snapshot = await submissionSnapshot(workOrderId);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(snapshot)));
  return { ...snapshot, token: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") };
}

function submissionSnapshotGuards(workOrderId: string, snapshot: SubmissionSnapshot) {
  return [
    env.DB.prepare(`SELECT CASE WHEN (${evidenceSnapshotSql}) = ?
      THEN 1 ELSE json('completion_submission_snapshot_changed') END`)
      .bind(TECHFLEX_ORG_ID, workOrderId, snapshot.evidence),
    env.DB.prepare(`SELECT CASE WHEN (${assetEvidenceSnapshotSql}) = ?
      THEN 1 ELSE json('completion_submission_snapshot_changed') END`)
      .bind(TECHFLEX_ORG_ID, workOrderId, snapshot.assets),
  ];
}

// These are the exact crew and compensation inputs used during approval. Keep
// the ordering stable so the review screen can detect a change after it opens.
const compensationSnapshotSql = `SELECT json_group_array(json_array(
  assignmentId, technicianId, technicianName, assignmentRole, assignmentStatus,
  employmentType, payoutRate, hourlyRateCents, approvedEntryCount, paidHours,
  dispatchedAt, departedAt
)) AS snapshot FROM (
  SELECT wa.id AS assignmentId, wa.technician_id AS technicianId,
         COALESCE(u.display_name, t.technician_code) AS technicianName,
         wa.role AS assignmentRole, wa.status AS assignmentStatus,
         t.employment_type AS employmentType, t.payout_rate AS payoutRate,
         t.current_hourly_rate_cents AS hourlyRateCents,
         (SELECT COUNT(*) FROM technician_time_entries te
           WHERE te.technician_id=t.id AND te.work_order_id=wa.work_order_id
             AND te.status='approved') AS approvedEntryCount,
         COALESCE((SELECT SUM(te.hours) FROM technician_time_entries te
           WHERE te.technician_id=t.id AND te.work_order_id=wa.work_order_id
             AND te.status='approved'),
           CASE WHEN wa.departed_at IS NOT NULL AND wa.dispatched_at IS NOT NULL
             THEN MAX(0.25,(julianday(wa.departed_at)-julianday(wa.dispatched_at))*24)
             ELSE 0 END) AS paidHours,
         wa.dispatched_at AS dispatchedAt, wa.departed_at AS departedAt
    FROM work_order_assignments wa JOIN technicians t ON t.id=wa.technician_id
    LEFT JOIN users u ON u.id=t.user_id
   WHERE wa.work_order_id=?
     AND wa.status IN ('assigned','accepted','dispatched','arrived','submitted')
   ORDER BY CASE wa.role WHEN 'primary' THEN 1 ELSE 2 END, wa.id
)`;

const pricingSnapshotSql = `SELECT json_array(id,pricing_snapshot_json) AS snapshot
  FROM estimates WHERE work_order_id=? ORDER BY created_at DESC,id DESC LIMIT 1`;

// Agreement terms and the exact linked asset coverage are financial approval
// inputs. Bind them to the review checkpoint just like pricing and technician pay.
const biomedicalBillingSnapshotSql = `SELECT json_group_array(json_array(
  id, contractNumber, contractName, startsOn, endsOn, contractStatus,
  recordVersion, termsJson, sourceJson, assetMetadataJson
)) AS snapshot FROM (
  SELECT c.id, c.contract_number AS contractNumber, c.name AS contractName,
         c.starts_on AS startsOn, c.ends_on AS endsOn, c.status AS contractStatus,
         c.record_version AS recordVersion, c.covered_services_json AS termsJson,
         c.service_level_json AS sourceJson, s.metadata_json AS assetMetadataJson
    FROM work_orders w
    JOIN service_contracts c ON c.organization_id=w.organization_id
      AND c.account_id=w.account_id AND c.contract_type='biomedical_pm'
    LEFT JOIN assets s ON s.id=w.asset_id AND s.organization_id=w.organization_id
   WHERE w.id=? AND w.organization_id=?
   ORDER BY c.starts_on DESC,c.id
)`;

type ApprovalSnapshot = {
  token: string;
  evidence: string;
  compensation: string;
  pricing: string;
  billing: string;
  assets: string;
  crewCount: number;
  approvedTimeEntryCount: number;
  technicianPayPoolCents: number;
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function approvalSnapshot(workOrderId: string): Promise<ApprovalSnapshot> {
  const [evidenceRow, compensationRow, pricingRow, billingRow, assetsRow] = await Promise.all([
    env.DB.prepare(evidenceSnapshotSql).bind(TECHFLEX_ORG_ID, workOrderId).first<{ snapshot: string }>(),
    env.DB.prepare(compensationSnapshotSql).bind(workOrderId).first<{ snapshot: string }>(),
    env.DB.prepare(pricingSnapshotSql).bind(workOrderId).first<{ snapshot: string }>(),
    env.DB.prepare(biomedicalBillingSnapshotSql).bind(workOrderId, TECHFLEX_ORG_ID).first<{ snapshot: string }>(),
    env.DB.prepare(assetEvidenceSnapshotSql).bind(TECHFLEX_ORG_ID, workOrderId).first<{ snapshot: string }>(),
  ]);
  const evidence = evidenceRow?.snapshot || "[]";
  const compensation = compensationRow?.snapshot || "[]";
  const pricing = pricingRow?.snapshot || "null";
  const billing = billingRow?.snapshot || "[]";
  const assets = assetsRow?.snapshot || "[]";
  const compensationRows = safeJson<unknown[][]>(compensation, []);
  const parsedPricing = safeJson<unknown>(pricing, []);
  const pricingValues = Array.isArray(parsedPricing) ? parsedPricing : [];
  const pricingDetails = safeJson<{ calculation?: { technicianPay?: number } }>(
    typeof pricingValues[1] === "string" ? pricingValues[1] : null,
    {},
  );
  return {
    token: `v3:${await sha256(JSON.stringify([evidence, compensation, pricing, billing, assets]))}`,
    evidence,
    compensation,
    pricing,
    billing,
    assets,
    crewCount: compensationRows.length,
    approvedTimeEntryCount: compensationRows.reduce(
      (total, row) => total + Number(row[8] || 0),
      0,
    ),
    technicianPayPoolCents: Math.floor(
      Number(pricingDetails.calculation?.technicianPay || 0) * 100 + 0.001,
    ),
  };
}

function billingContracts(snapshot: string): ContractSnapshot[] {
  return safeJson<unknown[][]>(snapshot, []).map((row) => ({
    id: String(row[0] || ""),
    contractNumber: row[1] ? String(row[1]) : null,
    name: String(row[2] || "Biomedical/PM agreement"),
    startsOn: String(row[3] || ""),
    endsOn: row[4] ? String(row[4]) : null,
    status: String(row[5] || ""),
    termsJson: row[7] ? String(row[7]) : null,
    sourceJson: row[8] ? String(row[8]) : null,
    assetMetadataJson: row[9] ? String(row[9]) : null,
  }));
}

async function workOrderAttachments(workOrderId: string) {
  const result = await env.DB.prepare(
    `SELECT id, file_name AS fileName, content_type AS contentType,
            size_bytes AS sizeBytes, category, created_at AS createdAt
       FROM attachments WHERE ${availableWorkOrderEvidence} ORDER BY created_at, id`,
  )
    .bind(TECHFLEX_ORG_ID, workOrderId)
    .all<{
      id: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      category: string;
      createdAt: string;
    }>();
  return result.results;
}

async function workOrderAssetProgress(workOrderId: string) {
  const result = await env.DB.prepare(
    `SELECT wa.asset_id AS assetId, a.asset_tag AS assetTag,
            a.manufacturer, a.model, a.serial_number AS serialNumber,
            wa.status, wa.notes, wa.record_version AS recordVersion, wa.findings, wa.work_performed AS workPerformed,
            wa.test_results AS testResults, wa.disposition,
            wa.not_applicable_reason AS notApplicableReason,wa.procedure_snapshot_json AS procedureSnapshotJson,wa.procedure_answers_json AS procedureAnswersJson
       FROM work_order_assets wa
       JOIN work_orders w ON w.id=wa.work_order_id
        AND w.organization_id=wa.organization_id
       JOIN assets a ON a.id=wa.asset_id
        AND a.organization_id=wa.organization_id
        AND a.account_id=w.account_id AND a.location_id=w.location_id
      WHERE wa.organization_id=? AND wa.work_order_id=?
      ORDER BY a.asset_tag,a.id`,
  ).bind(TECHFLEX_ORG_ID, workOrderId).all<WorkOrderAssetProgress>();
  return result.results;
}

function reportView(report: ReportRecord | null, workOrder: WorkOrderRecord) {
  const skills = safeJson<{
    instructions?: string[];
    equipmentType?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
  }>(workOrder.requiredSkillsJson, {});
  return {
    id: report?.id || null,
    reportVersion: report?.reportVersion || 1,
    recordVersion: report?.recordVersion || 0,
    workOrderRecordVersion: workOrder.recordVersion,
    qaStatus: report?.qaStatus || "draft",
    qaNotes: report?.qaNotes || "",
    submittedAt: report?.submittedAt || null,
    reportPdfAttachmentId: report?.reportPdfAttachmentId || null,
    customerComplaint: report?.customerComplaint || workOrder.description || "",
    equipmentType: report?.equipmentType || skills.equipmentType || "",
    manufacturer:
      report?.manufacturer ||
      workOrder.assetManufacturer ||
      skills.manufacturer ||
      "",
    model: report?.model || workOrder.assetModel || skills.model || "",
    serialNumber:
      report?.serialNumber ||
      workOrder.assetSerialNumber ||
      skills.serialNumber ||
      "",
    findings: report?.findings || "",
    workPerformed: report?.workPerformed || "",
    testResults: report?.testResults || "",
    recommendation: report?.recommendation || "",
    assetDisposition: report?.assetDisposition || "needs_review",
    checklist: spinlifeWorkOrder(workOrder)
      ? mergePartnerChecks(safeJson(report?.checklistJson, completionChecklist(workOrder.serviceType)), workOrder.serviceType)
      : safeJson(report?.checklistJson, completionChecklist(workOrder.serviceType)),
    diagnosticSteps: safeJson(
      report?.diagnosticStepsJson,
      equipmentWorkflow({ serviceType: workOrder.serviceType, equipmentType: report?.equipmentType || skills.equipmentType,
        manufacturer: report?.manufacturer || workOrder.assetManufacturer || skills.manufacturer,
        model: report?.model || workOrder.assetModel || skills.model, summary: workOrder.summary,
        instructions: skills.instructions }),
    ),
    partsUsed: safeJson(report?.partsUsedJson, []),
    documentDetails: documentDetails.parse(safeJson(report?.documentDetailsJson, {})),
    customerSignatureName: report?.customerSignatureName || "",
    signatureAttachmentId: report?.signatureAttachmentId || null,
    customerSignedAt: report?.customerSignedAt || null,
  };
}

async function reportRevisionHistory(reportId: string | null) {
  if (!reportId) return [];
  const result = await env.DB.prepare(
    `SELECT CAST(json_extract(after_json,'$.reportVersion') AS INTEGER) AS reportVersion,
            CAST(json_extract(after_json,'$.sourceReportRecordVersion') AS INTEGER) AS sourceReportRecordVersion,
            occurred_at AS submittedAt,
            json_array_length(after_json,'$.evidence') AS evidenceFileCount,
            json_array_length(after_json,'$.assets') AS assetCount,
            CASE WHEN json_extract(after_json,'$.fields.signatureAttachmentId') IS NOT NULL
              THEN 1 ELSE 0 END AS customerSignatureRecorded
       FROM audit_logs
      WHERE organization_id=? AND action='service_report.submission_snapshot'
        AND entity_type='service_report_revision'
        AND json_extract(after_json,'$.reportId')=?
      ORDER BY reportVersion,occurred_at,id`,
  ).bind(TECHFLEX_ORG_ID, reportId).all<{
    reportVersion: number;
    sourceReportRecordVersion: number;
    submittedAt: string;
    evidenceFileCount: number;
    assetCount: number;
    customerSignatureRecorded: number;
  }>();
  return result.results.map((item) => ({
    ...item,
    customerSignatureRecorded: Boolean(item.customerSignatureRecorded),
  }));
}

function submissionProblems(
  report: z.infer<typeof reportFields>,
  workOrder: WorkOrderRecord,
  attachments: Awaited<ReturnType<typeof workOrderAttachments>>,
  multiAssetPm = false,
) {
  const problems: string[] = [];
  if(workOrder.serviceType!=="biomed_cataloging"&&report.assetDisposition==="cataloged")problems.push("Cataloged is an inventory outcome, not a PM or repair disposition");
  if(workOrder.serviceType==="biomed_cataloging"&&["passed","returned_to_service","delivery_completed"].includes(report.assetDisposition))problems.push("Choose an inventory disposition; cataloging does not establish passing tests or return to service");
  const cataloging = workOrder.serviceType === "biomed_cataloging";
  const narrative = report.documentDetails.fieldNotes.trim();
  if (!cataloging && (!report.customerComplaint || report.customerComplaint.length < 3)) problems.push("Customer complaint");
  if (!multiAssetPm && !cataloging) {
    if (!report.equipmentType) problems.push("Equipment type");
    if (!report.manufacturer) problems.push("Manufacturer");
    if (!report.model) problems.push("Model");
    if (!report.serialNumber) problems.push("Serial number");
  }
  if (!narrative && !multiAssetPm) {
    if (report.findings.length < 3) problems.push("Recorded findings or technician notes");
    if (!cataloging && report.workPerformed.length < 3) problems.push("Work performed");
  }
  if (!cataloging && !multiAssetPm && ["passed","returned_to_service"].includes(report.assetDisposition) && report.testResults.trim().length < 3)
    problems.push("Actual verification results for the passing / return-to-service outcome");
  if (!cataloging && (!report.customerSignatureName || !report.signatureAttachmentId)) problems.push("Customer signature");
  // Guided questions are references. QA reviews the narrative and recorded evidence.
  if (spinlifeWorkOrder(workOrder)) {
    problems.push(...partnerCheckProblems(report.checklist, workOrder.serviceType));
    for (const photo of attachments.filter(x => !['client_work_order','signature','service_report','invoice','pay_stub'].includes(x.category) && x.contentType.startsWith('image/'))) {
      if (!report.documentDetails.photoCaptions[photo.id]?.trim()) problems.push(`Photo caption: ${photo.fileName}`);
    }
    if (!report.partsUsed.length && report.checklist.some(x => x.key === 'sl_installed' && x.complete && !x.notApplicable))
      problems.push('Installed parts must be listed, or mark installed-parts testing not applicable with a reason');
    if (['parts_required','needs_resolution','needs_review','follow_up_required'].includes(report.assetDisposition) && report.recommendation.trim().length < 10)
      problems.push("Parts needed or resolution request with next responsible party");
  }
  const counts = evidenceCounts(attachments);
  problems.push(
    ...missingEvidence(cataloging ? [] : evidenceRequirements(workOrder.serviceType), counts).map(
      (item) => item.label,
    ),
  );
  const signature = attachments.some(
    (item) =>
      item.id === report.signatureAttachmentId && item.category === "signature",
  );
  if (report.signatureAttachmentId && !signature)
    problems.push("Valid signature file");
  return [...new Set(problems)];
}

async function saveReport(
  workOrder: WorkOrderRecord,
  technicianId: string,
  fields: z.infer<typeof reportFields>,
  status: "draft" | "submitted",
  actorUserId: string,
  expectedReportVersion: number,
  expectedWorkOrderVersion: number,
  immutableSubmissionSnapshot: SubmissionSnapshot | null = null,
  submissionRequest?: { requestId: string; requestDigest: string } | null,
) {
  const existing = await latestReport(workOrder.id, technicianId);
  const reportId = existing?.id || `report-${workOrder.id}-${technicianId}`;
  // Editing a previously submitted record opens a revision, without approval.
  // Its immutable submission and any earlier PDF remain in the history.
  const version = existing
    ? existing.reportVersion + (existing.qaStatus !== "draft" ? 1 : 0)
    : 1;
  const savedReportVersion = expectedReportVersion + 1;
  const savedWorkOrderVersion = expectedWorkOrderVersion + 1;
  const conflictMessage = "A newer version of this completion or assignment was saved in another tab or device. Your entries are still on this device. Open this work order in another tab to compare the newer saved version before retrying.";
  // Guard and all submission effects share one D1 transaction. A stale request
  // must abort, not merely skip the report while creating a review task.
  const statements = [
    ...(immutableSubmissionSnapshot
      ? submissionSnapshotGuards(workOrder.id, immutableSubmissionSnapshot)
      : []),
    env.DB.prepare(`SELECT CASE WHEN
      EXISTS (SELECT 1 FROM work_orders WHERE id=? AND organization_id=? AND record_version=?
        AND status != 'cancelled')
      AND EXISTS (SELECT 1 FROM work_order_assignments WHERE work_order_id=? AND technician_id=?
        AND status IN (${activeAssignmentStatuses.map(() => "?").join(",")}))
      AND ((?=0 AND NOT EXISTS (SELECT 1 FROM service_reports WHERE work_order_id=? AND technician_id=?))
        OR EXISTS (SELECT 1 FROM service_reports WHERE id=? AND record_version=?))
      THEN 1 ELSE json('completion_save_conflict') END`).bind(
        workOrder.id, TECHFLEX_ORG_ID, expectedWorkOrderVersion,
        workOrder.id, technicianId, ...activeAssignmentStatuses,
        expectedReportVersion, workOrder.id, technicianId, reportId, expectedReportVersion,
      ),
    env.DB.prepare(
      `INSERT INTO service_reports
        (id, work_order_id, technician_id, report_version, findings, work_performed,
         recommendation, customer_complaint, equipment_type, manufacturer, model,
         serial_number, diagnostic_steps_json, test_results, parts_used_json,
         asset_disposition, checklist_json, customer_signature_name, customer_signed_at,
         signature_attachment_id, submitted_at, qa_status, qa_notes, document_details_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END, ?,
         CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE NULL END, ?, NULL, ?
       WHERE EXISTS (SELECT 1 FROM work_orders
         WHERE id = ? AND organization_id = ? AND record_version = ?)
       ON CONFLICT(id) DO UPDATE SET
         report_version = excluded.report_version,
         findings = excluded.findings, work_performed = excluded.work_performed,
         recommendation = excluded.recommendation, customer_complaint = excluded.customer_complaint,
         equipment_type = excluded.equipment_type, manufacturer = excluded.manufacturer,
         model = excluded.model, serial_number = excluded.serial_number,
         diagnostic_steps_json = excluded.diagnostic_steps_json,
         test_results = excluded.test_results, parts_used_json = excluded.parts_used_json,
         asset_disposition = excluded.asset_disposition, checklist_json = excluded.checklist_json,
         customer_signature_name = excluded.customer_signature_name,
         customer_signed_at = CASE WHEN excluded.signature_attachment_id IS NOT NULL THEN COALESCE(service_reports.customer_signed_at, CURRENT_TIMESTAMP) ELSE service_reports.customer_signed_at END,
         signature_attachment_id = excluded.signature_attachment_id,
         submitted_at = CASE WHEN excluded.qa_status = 'submitted' THEN CURRENT_TIMESTAMP ELSE service_reports.submitted_at END,
         qa_status = excluded.qa_status,
         qa_reviewed_by = NULL, qa_reviewed_at = NULL,
         report_pdf_attachment_id = NULL,
         document_details_json = excluded.document_details_json,
         record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE service_reports.record_version = ?
         AND EXISTS (SELECT 1 FROM work_orders
           WHERE id = ? AND organization_id = ? AND record_version = ?)`,
    ).bind(
      reportId,
      workOrder.id,
      technicianId,
      version,
      fields.findings || null,
      fields.workPerformed || null,
      fields.recommendation || null,
      fields.customerComplaint || null,
      fields.equipmentType || null,
      fields.manufacturer || null,
      fields.model || null,
      fields.serialNumber || null,
      JSON.stringify(fields.diagnosticSteps),
      fields.testResults || null,
      JSON.stringify(fields.partsUsed),
      fields.assetDisposition,
      JSON.stringify(fields.checklist),
      fields.customerSignatureName || null,
      fields.signatureAttachmentId || null,
      fields.signatureAttachmentId || null,
      status,
      status,
      JSON.stringify(fields.documentDetails),
      workOrder.id,
      TECHFLEX_ORG_ID,
      expectedWorkOrderVersion,
      expectedReportVersion,
      workOrder.id,
      TECHFLEX_ORG_ID,
      expectedWorkOrderVersion,
    ),
    env.DB.prepare(
      `UPDATE work_orders SET status = CASE
           WHEN status IN ('ready_to_invoice','invoiced','paid') THEN status
           WHEN ? = 'submitted' OR completed_at IS NOT NULL OR status = 'technician_submitted' THEN 'completed'
           ELSE 'in_progress' END,
         completed_at = CASE WHEN ? = 'submitted' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
         record_version = record_version + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?
         AND record_version = ?
         AND EXISTS (SELECT 1 FROM service_reports WHERE id = ? AND record_version = ?)`,
    ).bind(
      status,
      status,
      workOrder.id,
      TECHFLEX_ORG_ID,
      expectedWorkOrderVersion,
      reportId,
      savedReportVersion,
    ),
    env.DB.prepare(
      `INSERT INTO work_order_events
        (id, work_order_id, event_type, actor_user_id, source, payload_json)
       SELECT ?, ?, ?, ?, 'portal', ?
       WHERE changes() = 1
         AND EXISTS (SELECT 1 FROM service_reports WHERE id = ? AND record_version = ?)
         AND EXISTS (SELECT 1 FROM work_orders
           WHERE id = ? AND organization_id = ? AND record_version = ?)`,
    ).bind(
      crypto.randomUUID(),
      workOrder.id,
      status === "submitted"
        ? "service_report.submitted"
        : "service_report.draft_saved",
      actorUserId,
      JSON.stringify({ reportId, technicianId, reportVersion: version }),
      reportId,
      savedReportVersion,
      workOrder.id,
      TECHFLEX_ORG_ID,
      savedWorkOrderVersion,
    ),
    // Assert the report/work-order/event writes succeeded before committing.
    env.DB.prepare(`SELECT CASE WHEN changes()=1
      AND EXISTS (SELECT 1 FROM service_reports WHERE id=? AND record_version=?)
      AND EXISTS (SELECT 1 FROM work_orders WHERE id=? AND record_version=?)
      THEN 1 ELSE json('completion_save_conflict') END`).bind(
        reportId, savedReportVersion, workOrder.id, savedWorkOrderVersion,
      ),
  ];
  if (existing && existing.qaStatus !== "draft") statements.push(
    env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
      VALUES (?,?,?,'service_report.revision_opened','service_report',?,?,?)`).bind(
        crypto.randomUUID(),TECHFLEX_ORG_ID,actorUserId,reportId,JSON.stringify(existing),JSON.stringify({reportVersion:version,approvalRequired:false})),
  );
  if (status === "submitted") {
    if (!immutableSubmissionSnapshot)
      throw new Error("A submitted report requires an immutable evidence snapshot.");
    const revisionEntityId = `${reportId}:r${version}`;
    const revisionPayload = JSON.stringify({
      requestId: submissionRequest?.requestId || null,
      requestDigest: submissionRequest?.requestDigest || null,
      reportId,
      workOrderId: workOrder.id,
      technicianId,
      reportVersion: version,
      sourceReportRecordVersion: savedReportVersion,
      sourceWorkOrderRecordVersion: savedWorkOrderVersion,
      fields,
      reviewRequired: false,
      evidence: safeJson<unknown[]>(immutableSubmissionSnapshot.evidence, []),
      assets: safeJson<unknown[]>(immutableSubmissionSnapshot.assets, []),
    });
    statements.push(
      env.DB.prepare(
        `UPDATE work_order_assignments SET status = 'submitted', departed_at = COALESCE(departed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ? AND technician_id = ?`,
      ).bind(workOrder.id, technicianId),
      env.DB.prepare(
        `INSERT INTO admin_tasks
          (id, organization_id, account_id, work_order_id, assigned_role, category,
           title, instructions, priority, status, source, source_record_id)
         VALUES (?, ?, ?, ?, 'operations_administrator', 'Submissions', ?, ?, 'normal', 'open', 'service_report', ?)
         ON CONFLICT(source, source_record_id) DO UPDATE SET
           title = excluded.title, instructions = excluded.instructions,
           assigned_role = excluded.assigned_role, category = excluded.category,
           status = 'open', priority = 'normal', completed_at = NULL, completed_by = NULL,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        workOrder.accountId,
        workOrder.id,
        `Submission inbox: ${workOrder.externalId}`,
        "Informational copy of the technician submission. Field work is complete; administrator approval is not required. Review, add comments, or refine report wording when useful. Missing information can be added later without reopening or blocking the job.",
        `report:${reportId}`,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
         SELECT ?,?,?,'service_report.submission_snapshot','service_report_revision',?,?
          WHERE EXISTS (SELECT 1 FROM service_reports
            WHERE id=? AND report_version=? AND record_version=? AND qa_status='submitted')
            AND EXISTS (SELECT 1 FROM work_orders
              WHERE id=? AND organization_id=? AND record_version=? AND completed_at IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM audit_logs
              WHERE organization_id=? AND action='service_report.submission_snapshot'
                AND entity_type='service_report_revision' AND entity_id=?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        actorUserId,
        revisionEntityId,
        revisionPayload,
        reportId,
        version,
        savedReportVersion,
        workOrder.id,
        TECHFLEX_ORG_ID,
        savedWorkOrderVersion,
        TECHFLEX_ORG_ID,
        revisionEntityId,
      ),
      env.DB.prepare(`SELECT CASE WHEN changes()=1
        AND EXISTS (SELECT 1 FROM audit_logs
          WHERE organization_id=? AND action='service_report.submission_snapshot'
            AND entity_type='service_report_revision' AND entity_id=?)
        THEN 1 ELSE json('completion_save_conflict') END`).bind(
        TECHFLEX_ORG_ID,
        revisionEntityId,
      ),
    );
    statements.push(env.DB.prepare(`UPDATE route_stops SET status='completed',updated_at=CURRENT_TIMESTAMP
      WHERE work_order_id=? AND route_id IN (SELECT id FROM routes WHERE technician_id=? AND organization_id=?)`).bind(workOrder.id,technicianId,TECHFLEX_ORG_ID));
    const assetRows = safeJson<unknown[][]>(immutableSubmissionSnapshot.assets, []);
    for (const row of assetRows) {
      const [assetId,,,,,,, progressStatus, findings, workPerformed, testResults, disposition, notApplicableReason, procedureSnapshotJson, procedureAnswersJson, notes] = row;
      if (![notes,findings,workPerformed,testResults,notApplicableReason].some(value=>typeof value === "string" && value.trim())) continue;
      const recordedPositivePm = workOrder.serviceType.startsWith("biomed_pm") && ["passed","returned_to_service"].includes(String(disposition)) && typeof testResults === "string" && Boolean(testResults.trim());
      if (progressStatus === "completed" && (["quarantined","retired"].includes(String(disposition)) || recordedPositivePm)) statements.push(
        env.DB.prepare(`UPDATE assets SET status=CASE WHEN ? IN ('quarantined','retired') THEN ? ELSE status END,
          last_pm_on=CASE WHEN ? THEN date('now') ELSE last_pm_on END,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND organization_id=? AND account_id=? AND location_id=?`).bind(disposition,disposition,Number(recordedPositivePm),assetId,TECHFLEX_ORG_ID,workOrder.accountId,workOrder.locationId),
      );
      statements.push(env.DB.prepare(`INSERT INTO asset_visits
        (id,organization_id,asset_id,work_order_id,technician_id,visit_type,visited_at,complaint,findings,work_performed,parts_json,test_results_json,disposition,next_action,created_by)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,'[]',?,?,?,?)`).bind(
          `report:${reportId}:r${version}:asset:${assetId}`,TECHFLEX_ORG_ID,String(assetId),workOrder.id,technicianId,
          workOrder.serviceType === "biomed_cataloging" ? "cataloging" : workOrder.serviceType.startsWith("biomed_pm") ? "preventive_maintenance" : workOrder.serviceType === "biomed_repair" ? "corrective_repair" : "diagnostic",
          fields.customerComplaint,String(findings || notes || notApplicableReason || ""),String(workPerformed || ""),
          JSON.stringify({narrative:testResults || "",fieldNotes:notes || "",progressStatus,notApplicableReason: notApplicableReason || "",procedureSnapshot:safeJson(String(procedureSnapshotJson || ""),null),procedureAnswers:safeJson(String(procedureAnswersJson || ""),[])}),
          disposition || "needs_review",fields.recommendation || null,actorUserId));
    }
    if (workOrder.assetId && !assetRows.some(row=>row[0]===workOrder.assetId)) statements.push(
      env.DB.prepare(`INSERT INTO asset_visits
        (id,organization_id,asset_id,work_order_id,technician_id,visit_type,visited_at,complaint,findings,work_performed,parts_json,test_results_json,disposition,next_action,created_by)
        SELECT ?,organization_id,id,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?
          FROM assets WHERE id=? AND organization_id=? AND account_id=? AND location_id=?`).bind(
            `report:${reportId}:r${version}:asset:${workOrder.assetId}`,workOrder.id,technicianId,
            workOrder.serviceType === "biomed_cataloging" ? "cataloging" : "diagnostic",
            fields.customerComplaint,fields.findings || fields.documentDetails.fieldNotes,fields.workPerformed,JSON.stringify(fields.partsUsed),
            JSON.stringify({narrative:fields.testResults,fieldNotes:fields.documentDetails.fieldNotes}),fields.assetDisposition,fields.recommendation || null,actorUserId,
            workOrder.assetId,TECHFLEX_ORG_ID,workOrder.accountId,workOrder.locationId),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("malformed JSON")) throw new PortalHttpError(409, conflictMessage);
    throw error;
  }
  return {
    reportId,
    reportVersion: version,
    recordVersion: savedReportVersion,
    workOrderRecordVersion: savedWorkOrderVersion,
  };
}

function datePlusDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const reviewConflictMessage = "This report or work order changed while you were reviewing it. Your notes are still here. Refresh the review and compare the latest information before deciding again.";

// D1 batches are atomic. Abort before any review side effects if either snapshot changed.
function reviewGuard(report: ReportRecord, workOrder: WorkOrderRecord) {
  return env.DB.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
    WHERE sr.id=? AND sr.record_version=? AND sr.submitted_at IS NOT NULL
      AND w.id=? AND w.organization_id=? AND w.record_version=?
      AND w.status != 'cancelled'
  ) THEN 1 ELSE json('qa_review_conflict') END`).bind(
    report.id, report.recordVersion, workOrder.id, TECHFLEX_ORG_ID, workOrder.recordVersion,
  );
}

function approvalSnapshotGuards(workOrderId: string, snapshot: ApprovalSnapshot) {
  return [
    env.DB.prepare(`SELECT CASE WHEN (${evidenceSnapshotSql}) = ?
      THEN 1 ELSE json('qa_evidence_conflict') END`)
      .bind(TECHFLEX_ORG_ID, workOrderId, snapshot.evidence),
    env.DB.prepare(`SELECT CASE WHEN (${compensationSnapshotSql}) = ?
      THEN 1 ELSE json('qa_compensation_conflict') END`)
      .bind(workOrderId, snapshot.compensation),
    env.DB.prepare(`SELECT CASE WHEN COALESCE((${pricingSnapshotSql}),'null') = ?
      THEN 1 ELSE json('qa_pricing_conflict') END`)
      .bind(workOrderId, snapshot.pricing),
    env.DB.prepare(`SELECT CASE WHEN (${assetEvidenceSnapshotSql}) = ?
      THEN 1 ELSE json('qa_asset_conflict') END`)
      .bind(TECHFLEX_ORG_ID, workOrderId, snapshot.assets),
    env.DB.prepare(`SELECT CASE WHEN (${biomedicalBillingSnapshotSql}) = ?
      THEN 1 ELSE json('qa_billing_conflict') END`)
      .bind(workOrderId, TECHFLEX_ORG_ID, snapshot.billing),
  ];
}

async function reviewBatch(
  report: ReportRecord,
  workOrder: WorkOrderRecord,
  statements: D1PreparedStatement[],
  snapshot?: SubmissionSnapshot | ApprovalSnapshot,
) {
  try {
    await env.DB.batch([
      reviewGuard(report, workOrder),
      ...(snapshot ? "pricing" in snapshot ? approvalSnapshotGuards(workOrder.id, snapshot) : submissionSnapshotGuards(workOrder.id,snapshot) : []),
      ...statements,
    ]);
  } catch (error) {
    if (String(error).includes("malformed JSON")) throw new PortalHttpError(409, reviewConflictMessage);
    throw error;
  }
}

type GeneratedAttachmentCleanup = {
  pendingId: string;
  attachmentId: string;
  storageKey: string;
};

async function completeGeneratedAttachmentCleanup(item: GeneratedAttachmentCleanup) {
  try {
    const referenced = await env.DB.prepare(
      "SELECT id FROM attachments WHERE organization_id=? AND storage_key=? LIMIT 1",
    ).bind(TECHFLEX_ORG_ID, item.storageKey).first<{ id: string }>();
    if (referenced) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
      ).bind(
        `${item.pendingId}:completed`,
        TECHFLEX_ORG_ID,
        item.attachmentId,
        JSON.stringify({ storageKey: item.storageKey }),
        JSON.stringify({ storageRemoved: false, retainedBecauseReferenced: true }),
      ).run();
      return;
    }
    await env.BUCKET.delete(item.storageKey);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
    ).bind(
      `${item.pendingId}:completed`,
      TECHFLEX_ORG_ID,
      item.attachmentId,
      JSON.stringify({ storageKey: item.storageKey }),
      JSON.stringify({ storageRemoved: true }),
    ).run();
  } catch (error) {
    safeServerLog("completion_cleanup", error);
  }
}

async function queueGeneratedAttachmentCleanup(
  attachmentId: string,
  storageKey: string,
) {
  const pendingId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_pending', 'attachment', ?, ?, ?)",
    ).bind(
      pendingId,
      TECHFLEX_ORG_ID,
      attachmentId,
      JSON.stringify({ storageKey }),
      JSON.stringify({ metadataSaved: false, storageRemoved: false, source: "completion_approval" }),
    ).run();
  } catch (error) {
    safeServerLog("completion_cleanup", error);
  }
  await completeGeneratedAttachmentCleanup({ pendingId, attachmentId, storageKey });
}

async function cleanupGeneratedAttachments(
  items: Array<{ attachmentId: string; storageKey: string }>,
) {
  for (const item of items)
    await queueGeneratedAttachmentCleanup(item.attachmentId, item.storageKey);
}

async function approvalCommitState(input: {
  reportId: string;
  workOrderId: string;
  reportAttachmentId: string;
  reportStorageKey: string;
  invoiceAttachmentId: string;
  invoiceStorageKey: string;
  invoiceId: string;
  payoutCount: number;
}) {
  const row = await env.DB.prepare(
    `SELECT
      EXISTS (SELECT 1 FROM service_reports WHERE id=? AND qa_status='approved' AND report_pdf_attachment_id=?) AS reportSaved,
      EXISTS (SELECT 1 FROM attachments WHERE id=? AND organization_id=? AND entity_type='work_order' AND entity_id=? AND storage_key=? AND category='service_report') AS packetSaved,
      EXISTS (SELECT 1 FROM document_records WHERE organization_id=? AND scope_type='work_order' AND scope_id=? AND attachment_id=? AND category='completed_work_order') AS packetDocumentSaved,
      EXISTS (SELECT 1 FROM attachments WHERE id=? AND organization_id=? AND entity_type='work_order' AND entity_id=? AND storage_key=? AND category='invoice') AS invoiceFileSaved,
      EXISTS (SELECT 1 FROM invoices WHERE id=? AND organization_id=? AND work_order_id=? AND pdf_attachment_id=?) AS invoiceSaved,
      EXISTS (SELECT 1 FROM work_orders WHERE id=? AND organization_id=? AND status='ready_to_invoice') AS workOrderSaved,
      ((SELECT COUNT(*) FROM technician_payouts WHERE work_order_id=? AND invoice_id=?)=?) AS payoutsSaved,
      EXISTS (SELECT 1 FROM audit_logs WHERE organization_id=? AND action='service_report.approved' AND entity_type='service_report' AND entity_id=? AND json_extract(after_json,'$.reportAttachmentId')=? AND json_extract(after_json,'$.invoiceAttachmentId')=?) AS auditSaved`,
  ).bind(
    input.reportId,
    input.reportAttachmentId,
    input.reportAttachmentId,
    TECHFLEX_ORG_ID,
    input.workOrderId,
    input.reportStorageKey,
    TECHFLEX_ORG_ID,
    input.workOrderId,
    input.reportAttachmentId,
    input.invoiceAttachmentId,
    TECHFLEX_ORG_ID,
    input.workOrderId,
    input.invoiceStorageKey,
    input.invoiceId,
    TECHFLEX_ORG_ID,
    input.workOrderId,
    input.invoiceAttachmentId,
    input.workOrderId,
    TECHFLEX_ORG_ID,
    input.workOrderId,
    input.invoiceId,
    input.payoutCount,
    TECHFLEX_ORG_ID,
    input.reportId,
    input.reportAttachmentId,
    input.invoiceAttachmentId,
  ).first<Record<string, number>>();
  const values = Object.values(row || {}).map(Number);
  if (values.length === 8 && values.every((value) => value === 1)) return "saved" as const;
  if (values.length === 8 && values.every((value) => value === 0)) return "absent" as const;
  return "unconfirmed" as const;
}

async function approveReport(
  report: ReportRecord,
  workOrder: WorkOrderRecord,
  qaNotes: string,
  identity: PortalIdentity,
  reviewSnapshot: ApprovalSnapshot,
) {
  const attachments = await workOrderAttachments(workOrder.id);
  const fields = reportView(report, workOrder);
  const parsed = reportFields.parse(fields);
  const billingReview = biomedicalBillingReview(
    workOrder,
    billingContracts(reviewSnapshot.billing),
    (report.customerSignedAt || report.submittedAt || new Date().toISOString()).slice(0, 10),
  );
  if (billingReview.approvalBlocked)
    return {
      error: `${billingReview.title}: ${billingReview.explanation}`,
      status: 409,
    } as const;
  const invoiceTotalCents = billingReview.invoiceTotalCents;
  const contractCovered = billingReview.mode === "covered";
  const selectedAssetProgress = await workOrderAssetProgress(workOrder.id);
  const problems = [
    ...submissionProblems(parsed, workOrder, attachments, selectedAssetProgress.length > 0),
    ...multiAssetPmProblems(workOrder.serviceType, selectedAssetProgress),
  ];
  if (problems.length)
    return {
      error: `Approval is blocked until these items are complete: ${problems.join(", ")}.`,
      status: 409,
    } as const;
  if (!contractCovered && workOrder.grossMarginBasisPoints < 4000)
    return {
      error:
        "Approval is blocked because the work order is below the 40% gross-margin floor.",
      status: 409,
    } as const;
  const assignments = await env.DB.prepare(
    `SELECT wa.technician_id AS technicianId, COALESCE(u.display_name, t.technician_code) AS technicianName,
            t.technician_code AS technicianCode,
            CASE WHEN t.employment_type='contractor' THEN 'percentage' ELSE 'hourly' END AS payoutType,
            t.payout_rate AS payoutRate,
            t.current_hourly_rate_cents AS currentHourlyRateCents,
            COALESCE((SELECT SUM(te.hours) FROM technician_time_entries te WHERE te.technician_id=t.id AND te.work_order_id=wa.work_order_id AND te.status='approved'),
              CASE WHEN wa.departed_at IS NOT NULL AND wa.dispatched_at IS NOT NULL THEN MAX(0.25,(julianday(wa.departed_at)-julianday(wa.dispatched_at))*24) ELSE 0 END) AS paidHours
       FROM work_order_assignments wa JOIN technicians t ON t.id = wa.technician_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE wa.work_order_id = ? AND wa.status IN ('assigned','accepted','dispatched','arrived','submitted')
      ORDER BY CASE wa.role WHEN 'primary' THEN 1 ELSE 2 END, technicianName`,
  )
    .bind(workOrder.id)
    .all<{
      technicianId: string;
      technicianName: string;
      technicianCode: string;
      payoutType: string;
      payoutRate: number;
      currentHourlyRateCents: number;
      paidHours: number;
    }>();
  if (!assignments.results.length)
    return {
      error: "No active technician assignment was found.",
      status: 409,
    } as const;
  const estimate = await env.DB.prepare(
    `SELECT id, pricing_snapshot_json AS pricingSnapshotJson FROM estimates
      WHERE work_order_id = ? ORDER BY created_at DESC,id DESC LIMIT 1`,
  )
    .bind(workOrder.id)
    .first<{ id: string; pricingSnapshotJson: string }>();
  const snapshot = safeJson<{
    calculation?: { technicianPay?: number; fixedDirectCosts?: number };
  }>(estimate?.pricingSnapshotJson, {});
  const payoutPoolCents = Math.floor(
    Number(snapshot.calculation?.technicianPay || 0) * 100 + 0.001,
  );
  if (payoutPoolCents <= 0)
    return {
      error:
        "The pricing snapshot does not contain an approved technician-pay allocation. Finance must correct pricing before QA approval.",
      status: 409,
    } as const;
  const fixedDirectCostsCents = Math.round(
    Number(snapshot.calculation?.fixedDirectCosts || 0) * 100,
  );
  const hourlyAssignments = assignments.results.filter(
    (assignment) => assignment.payoutType === "hourly",
  );
  const percentageAssignments = assignments.results.filter(
    (assignment) => assignment.payoutType !== "hourly",
  );
  const hourlyPayouts = new Map<string, number>();
  for (const assignment of hourlyAssignments) {
    if (Number(assignment.paidHours) <= 0)
      return {
        error: `Approval is blocked until paid hours are recorded for ${assignment.technicianName}.`,
        status: 409,
      } as const;
    hourlyPayouts.set(
      assignment.technicianId,
      Math.floor(
        Number(assignment.paidHours) *
          Number(assignment.currentHourlyRateCents),
      ),
    );
  }
  const hourlyTotalCents = [...hourlyPayouts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  if (hourlyTotalCents > payoutPoolCents) {
    if (contractCovered)
      return {
        error: "Approval is blocked because earned hourly pay exceeds the approved technician-pay allocation for this covered visit. Finance must correct the allocation; the agreement charge will remain $0.",
        status: 409,
      } as const;
    const requiredBidCents = Math.ceil(
      (fixedDirectCostsCents + hourlyTotalCents) / 0.6,
    );
    return {
      error: `Approval is held because earned hourly pay would reduce gross margin below 40%. Increase authorization to at least $${(requiredBidCents / 100).toFixed(2)}.`,
      status: 409,
    } as const;
  }
  const remainingPoolCents = payoutPoolCents - hourlyTotalCents;
  const percentageWeight = percentageAssignments.reduce(
    (sum, assignment) => sum + Math.max(0, Number(assignment.payoutRate || 0)),
    0,
  );
  let percentageAllocated = 0;
  const plannedPayouts = assignments.results.map((assignment) => {
    if (assignment.payoutType === "hourly")
      return {
        ...assignment,
        payoutCents: hourlyPayouts.get(assignment.technicianId) || 0,
        basisType: "hourly",
        basisRate: Number(assignment.currentHourlyRateCents) / 100,
      };
    const index = percentageAssignments.findIndex(
      (row) => row.technicianId === assignment.technicianId,
    );
    const payoutCents =
      index === percentageAssignments.length - 1
        ? remainingPoolCents - percentageAllocated
        : Math.floor(
            remainingPoolCents *
              (percentageWeight
                ? Number(assignment.payoutRate) / percentageWeight
                : 1 / Math.max(percentageAssignments.length, 1)),
          );
    percentageAllocated += payoutCents;
    return {
      ...assignment,
      payoutCents,
      basisType: "margin_remainder_split",
      basisRate: contractCovered
        ? payoutCents / 100
        : payoutCents / Math.max(workOrder.acceptedPriceCents, 1),
    };
  });
  const actualPayoutCents = plannedPayouts.reduce(
    (sum, assignment) => sum + assignment.payoutCents,
    0,
  );
  const realizedMarginBasisPoints = contractCovered ? null : Math.floor(
    ((invoiceTotalCents - fixedDirectCostsCents - actualPayoutCents) /
      Math.max(invoiceTotalCents, 1)) *
      10000,
  );
  if (realizedMarginBasisPoints !== null && realizedMarginBasisPoints < 4000)
    return {
      error:
        "Approval is blocked because the invoice, fixed direct costs, and technician-pay allocation would produce less than a 40% gross margin.",
      status: 409,
    } as const;
  const invoiceNumber = `INV-${workOrder.externalId}`;
  const existingInvoice = await env.DB.prepare(
    "SELECT id FROM invoices WHERE organization_id = ? AND invoice_number = ? LIMIT 1",
  )
    .bind(TECHFLEX_ORG_ID, invoiceNumber)
    .first<{ id: string }>();
  const invoiceId = existingInvoice?.id || crypto.randomUUID();
  const issuedOn = new Date().toISOString().slice(0, 10);
  const dueOn = datePlusDays(
    issuedOn,
    Number(workOrder.paymentTermsDays ?? 30),
  );
  const signatureRecord = attachments.find(
    (item) => item.id === report.signatureAttachmentId,
  );
  let signature: { bytes: ArrayBuffer; contentType: string } | null = null;
  if (signatureRecord) {
    const stored = await env.DB.prepare(
      "SELECT storage_key AS storageKey, content_type AS contentType FROM attachments WHERE id = ?",
    )
      .bind(signatureRecord.id)
      .first<{ storageKey: string; contentType: string }>();
    const object = stored ? await env.BUCKET.get(stored.storageKey) : null;
    if (!object)
      throw new PortalHttpError(409, "The saved signature file is unavailable. Approval has not been completed. Restore or upload the signature, then refresh this review.");
    if (object)
      signature = {
        bytes: await object.arrayBuffer(),
        contentType: stored!.contentType,
      };
  }
  const counts = evidenceCounts(attachments);
  const serviceReportPdf = await generateServiceReportPdf({
    workOrderNumber: workOrder.externalId,
    accountName: workOrder.accountName,
    locationName: workOrder.locationName,
    locationAddress: locationAddress(workOrder),
    technicianName: report.technicianName,
    serviceType: workOrder.serviceType,
    summary: workOrder.summary,
    customerComplaint: parsed.customerComplaint,
    equipmentType: selectedAssetProgress.length > 1 ? "Multiple equipment items" : parsed.equipmentType,
    manufacturer: selectedAssetProgress.length > 1 ? "See per-equipment PM record" : parsed.manufacturer,
    model: selectedAssetProgress.length > 1 ? "See per-equipment PM record" : parsed.model,
    serialNumber: selectedAssetProgress.length > 1 ? "See per-equipment PM record" : parsed.serialNumber,
    findings: parsed.findings,
    fieldNotes: parsed.documentDetails.fieldNotes,
    diagnosticSteps: parsed.diagnosticSteps,
    workPerformed: parsed.workPerformed,
    partsUsed: parsed.partsUsed,
    testResults: parsed.testResults,
    recommendation: parsed.recommendation,
    assetDisposition: parsed.assetDisposition,
    checklist: parsed.checklist,
    customerSignatureName: parsed.customerSignatureName,
    customerSignedAt: report.customerSignedAt || "",
    evidenceCounts: counts,
    signature,
    customerName: workOrder.customerName || workOrder.locationName,
    serviceDate: report.customerSignedAt || report.submittedAt || "",
    actualOnsiteMinutes: parsed.documentDetails.actualOnsiteMinutes,
    equipmentProgress: selectedAssetProgress,
  });
  const packetRows = await env.DB.prepare(
    `SELECT id, file_name AS fileName, content_type AS contentType, storage_key AS storageKey,
            category, created_at AS createdAt, size_bytes AS sizeBytes
       FROM attachments
      WHERE ${availableWorkOrderEvidence}
        AND category NOT IN ('signature','service_report','service_report_replacement','invoice','pay_stub')
      ORDER BY created_at`,
  ).bind(TECHFLEX_ORG_ID, workOrder.id).all<{
    id: string; fileName: string; contentType: string; storageKey: string; category: string; createdAt: string; sizeBytes: number;
  }>();
  const packetFiles: Array<{ caption?: string; fileName: string; contentType: string; bytes: ArrayBuffer; category: string; createdAt: string }> = [];
  let packetInputBytes = 0;
  for (const row of packetRows.results) {
    const object = await env.BUCKET.get(row.storageKey);
    if (!object)
      throw new PortalHttpError(409, `The saved file "${row.fileName}" is unavailable. Approval has not been completed. Restore or upload the file, then refresh this review.`);
    if (spinlifeWorkOrder(workOrder) && row.category === 'client_work_order') continue;
    if (packetInputBytes + row.sizeBytes > 24 * 1024 * 1024) throw new PortalHttpError(409, "Evidence is too large to render safely. Keep originals and upload smaller readable photo copies before approval.");
    const bytes = await object.arrayBuffer();
    packetInputBytes += bytes.byteLength;
    if (packetInputBytes > 24 * 1024 * 1024) throw new PortalHttpError(409, "Selected evidence exceeds the document renderer’s 24 MB processing budget. Keep the originals and upload smaller readable photo copies before approval.");
    packetFiles.push({ ...row, bytes, caption: parsed.documentDetails.photoCaptions[row.id] || undefined });
  }
  const packetFileName = safeJson<{simpleSpinlifeHandoff?:string}>(workOrder.requiredSkillsJson,{}).simpleSpinlifeHandoff
    ?dmePacketName(report.technicianName,workOrder.externalId,parsed.assetDisposition):workOrderPacketName(workOrder, parsed.assetDisposition);
  const completionPacketPdf = await generateCompletionPacketPdf({
    title: packetFileName.replace(/\.pdf$/i, ""),
    sourceDocuments: spinlifeWorkOrder(workOrder) ? [] : packetFiles.filter((file) => file.category === "client_work_order"),
    partnerDocument: spinlifeWorkOrder(workOrder) ? await generateSpinLifeWorkOrderPdf({
      ...parsed, workOrderNumber: workOrder.externalId, customerName: workOrder.customerName || workOrder.locationName,
      customerPhone: workOrder.customerPhone || "", address: locationAddress(workOrder),
      serviceType: workOrder.serviceType, serviceDate: report.customerSignedAt || report.submittedAt || "",
      workOrderDate: parsed.documentDetails.workOrderDate,
      technicianName: report.technicianName, technicianAttestedAt: report.submittedAt || "", signature,
    }) : undefined,
    serviceReport: serviceReportPdf,
    evidenceLayout: parsed.documentDetails.photoLayout,
    evidenceImages: packetFiles.filter((file) => file.category !== "client_work_order" && file.contentType.startsWith("image/")),
  });
  const invoicePdf = await generateInvoicePdf({
    invoiceNumber,
    issuedOn,
    dueOn,
    workOrderNumber: workOrder.externalId,
    serviceDate: report.customerSignedAt || report.submittedAt || "",
    jobStatus: completionStatus(parsed.assetDisposition),
    serviceType: workOrder.serviceType,
    workPerformed: parsed.workPerformed,
    paymentTermsDays: workOrder.paymentTermsDays ?? 30,
    equipment: {type: parsed.equipmentType, manufacturer: parsed.manufacturer, model: parsed.model, serialNumber: parsed.serialNumber, assetTag: workOrder.assetTag},
    accountName: workOrder.accountName,
    billingEmail: workOrder.billingEmail || "",
    serviceLocation: `${workOrder.locationName} - ${locationAddress(workOrder)}`,
    description: billingReview.invoiceDescription,
    subtotalCents: invoiceTotalCents,
    taxCents: 0,
    totalCents: invoiceTotalCents,
  });
  const invoiceFileName = `${packetFileName.replace(/\.pdf$/i, "")} - INVOICE ${invoiceNumber}.pdf`;
  const reportAttachmentId = crypto.randomUUID();
  const invoiceAttachmentId = crypto.randomUUID();
  const reportStorageKey = `techflex/work_orders/${safeFileToken(workOrder.externalId)}/completion_packet/${reportAttachmentId}/${packetFileName}`;
  const invoiceStorageKey = `techflex/work_orders/${safeFileToken(workOrder.externalId)}/invoice/${invoiceAttachmentId}/${invoiceFileName}`;
  const generatedAttachments = [
    { attachmentId: reportAttachmentId, storageKey: reportStorageKey },
    { attachmentId: invoiceAttachmentId, storageKey: invoiceStorageKey },
  ];
  const storageResults = await Promise.allSettled([
    env.BUCKET.put(reportStorageKey, completionPacketPdf, {
      httpMetadata: { contentType: "application/pdf" },
    }),
    env.BUCKET.put(invoiceStorageKey, invoicePdf, {
      httpMetadata: { contentType: "application/pdf" },
    }),
  ]);
  const storageFailure = storageResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (storageFailure) {
    safeServerLog("completion_commit", storageFailure.reason);
    await cleanupGeneratedAttachments(generatedAttachments);
    throw new PortalHttpError(
      503,
      "Approval files could not be saved. The report remains submitted and no invoice or technician pay was created. Refresh the review, then try again.",
    );
  }
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO attachments
        (id, organization_id, entity_type, entity_id, storage_key, file_name,
         content_type, size_bytes, category, uploaded_by)
       VALUES (?, ?, 'work_order', ?, ?, ?, 'application/pdf', ?, 'service_report', ?)`,
    ).bind(
      reportAttachmentId,
      TECHFLEX_ORG_ID,
      workOrder.id,
      reportStorageKey,
      packetFileName,
      completionPacketPdf.length,
      identity.userId,
    ),
    env.DB.prepare(
      `INSERT INTO document_records
        (id, organization_id, scope_type, scope_id, attachment_id, category, title, searchable_text, uploaded_by)
       VALUES (?, ?, 'work_order', ?, ?, 'completed_work_order', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      workOrder.id,
      reportAttachmentId,
      `Completion packet ${workOrder.externalId}`,
      `${packetFileName} ${workOrder.accountName} ${workOrder.customerName || workOrder.locationName} ${completionStatus(parsed.assetDisposition)}`,
      identity.userId,
    ),
    env.DB.prepare(
      `INSERT INTO attachments
        (id, organization_id, entity_type, entity_id, storage_key, file_name,
         content_type, size_bytes, category, uploaded_by)
       VALUES (?, ?, 'work_order', ?, ?, ?, 'application/pdf', ?, 'invoice', ?)`,
    ).bind(
      invoiceAttachmentId,
      TECHFLEX_ORG_ID,
      workOrder.id,
      invoiceStorageKey,
      invoiceFileName,
      invoicePdf.length,
      identity.userId,
    ),
    env.DB.prepare(
      `UPDATE service_reports SET qa_status = 'approved', qa_notes = ?,
         qa_reviewed_by = ?, qa_reviewed_at = CURRENT_TIMESTAMP,
         report_pdf_attachment_id = ?, record_version = record_version + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND qa_status = 'submitted'`,
    ).bind(qaNotes || null, identity.userId, reportAttachmentId, report.id),
    env.DB.prepare(
      `INSERT INTO invoices
        (id, organization_id, account_id, work_order_id, estimate_id, invoice_number,
         status, issued_on, due_on, subtotal_cents, tax_cents, total_cents,
         balance_cents, pdf_attachment_id, template_version)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, ?, ?, 'techflex-digital-v3')
       ON CONFLICT(invoice_number) DO UPDATE SET
         issued_on = excluded.issued_on, due_on = excluded.due_on,
         subtotal_cents = excluded.subtotal_cents, total_cents = excluded.total_cents,
         balance_cents = CASE WHEN invoices.status = 'paid' THEN 0 ELSE excluded.balance_cents END,
         pdf_attachment_id = excluded.pdf_attachment_id, template_version = excluded.template_version,
         record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      invoiceId,
      TECHFLEX_ORG_ID,
      workOrder.accountId,
      workOrder.id,
      estimate?.id || null,
      invoiceNumber,
      issuedOn,
      dueOn,
      invoiceTotalCents,
      invoiceTotalCents,
      invoiceTotalCents,
      invoiceAttachmentId,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO invoice_items
        (id, invoice_id, sort_order, description, quantity, unit_price_cents,
         total_cents, source_type, source_id)
       VALUES (?, ?, 1, ?, 1, ?, ?, 'work_order', ?)`,
    ).bind(
      `item-${workOrder.id}`,
      invoiceId,
      billingReview.invoiceDescription,
      invoiceTotalCents,
      invoiceTotalCents,
      workOrder.id,
    ),
    env.DB.prepare(
      `UPDATE work_orders SET status = 'ready_to_invoice', completed_at = CURRENT_TIMESTAMP,
         invoice_ready_at = CURRENT_TIMESTAMP, record_version = record_version + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?`,
    ).bind(workOrder.id, TECHFLEX_ORG_ID),
    env.DB.prepare(
      `UPDATE admin_tasks SET status = 'complete', completed_at = CURRENT_TIMESTAMP,
         completed_by = ?, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE source = 'service_report' AND source_record_id = ?`,
    ).bind(identity.userId, `report:${report.id}`),
  ];
  const payoutRows: Array<{
    payoutId: string;
    technicianId: string;
    technicianName: string;
    payoutCents: number;
  }> = [];
  plannedPayouts.forEach((assignment) => {
    const payoutCents = assignment.payoutCents;
    const payoutId = crypto.randomUUID();
    payoutRows.push({ ...assignment, payoutId, payoutCents });
    statements.push(
      env.DB.prepare(
        `INSERT INTO technician_payouts
          (id, technician_id, work_order_id, invoice_id, status, basis_type,
           basis_rate, gross_revenue_cents, payout_cents, collection_status,
           approved_by, approved_at)
         VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?,
           ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(technician_id, work_order_id) DO UPDATE SET
           invoice_id = excluded.invoice_id, status = CASE WHEN technician_payouts.status = 'paid' THEN 'paid' ELSE 'approved' END,
           basis_type = excluded.basis_type, basis_rate = excluded.basis_rate,
           gross_revenue_cents = excluded.gross_revenue_cents,
           payout_cents = excluded.payout_cents, approved_by = excluded.approved_by,
           approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        payoutId,
        assignment.technicianId,
        workOrder.id,
        invoiceId,
        assignment.basisType,
        assignment.basisRate,
        invoiceTotalCents,
        payoutCents,
        contractCovered ? "covered_by_contract" : "awaiting_customer_payment",
        identity.userId,
      ),
    );
  });
  const completedHeaders = [
    "Sync Key",
    "Completed At",
    "Work Order",
    "Account",
    "Location",
    "Service Type",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Invoice",
    "Revenue",
    "Gross Margin",
    "QA Status",
  ];
  const reviewUrl = configuredReviewUrl();
  const feedbackEmailId = crypto.randomUUID();
  const feedbackSmsId = crypto.randomUUID();
  const customerName = workOrder.customerName || "Customer";
  const firstName = customerName.split(/\s+/)[0] || "there";
  const feedbackSubject = `How did we do on work order ${workOrder.externalId}?`;
  const feedbackBody = [
    `Hi ${firstName},`,
    "",
    `Thank you for choosing TechFlex Mobility Solutions for ${workOrder.summary}. We would appreciate your honest feedback about the service you received.`,
    "",
    reviewUrl
      ? `Share your feedback: ${reviewUrl}`
      : "Review link configuration is pending.",
    "",
    "Thank you,",
    "TechFlex Mobility Solutions",
  ].join("\n");
  statements.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO integration_events
        (id, organization_id, integration_key, external_event_id, direction,
         event_type, entity_type, entity_id, status, payload_json)
       VALUES (?, ?, 'google_sheets', ?, 'outbound', 'completed_order.upsert',
         'work_order', ?, 'pending', ?)`,
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      `completed_order:${workOrder.id}:1`,
      workOrder.id,
      JSON.stringify({
        sheetName: "Completed Orders",
        headers: completedHeaders,
        values: [
          `work_order:${workOrder.id}`,
          new Date().toISOString(),
          workOrder.externalId,
          workOrder.accountName,
          workOrder.locationName,
          workOrder.serviceType,
          parsed.manufacturer,
          parsed.model,
          parsed.serialNumber,
          invoiceNumber,
          invoiceTotalCents / 100,
          realizedMarginBasisPoints === null ? "Covered by agreement" : realizedMarginBasisPoints / 10000,
          "approved",
        ],
      }),
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO integration_events
        (id, organization_id, integration_key, external_event_id, direction,
         event_type, entity_type, entity_id, status, payload_json)
       VALUES (?, ?, 'quickbooks', ?, 'outbound', 'invoice.upsert',
         'invoice', ?, 'pending', ?)`,
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      `invoice:${invoiceId}:1`,
      invoiceId,
      JSON.stringify({
        invoiceId,
        invoiceNumber,
        accountId: workOrder.accountId,
        accountName: workOrder.accountName,
        issuedOn,
        dueOn,
        totalCents: invoiceTotalCents,
        billingMode: billingReview.mode,
        contractNumber: billingReview.contractNumber,
      }),
    ),
    env.DB.prepare(
      `INSERT INTO customer_feedback_requests
        (id, organization_id, work_order_id, customer_id, channel, destination,
         campaign_name, status, message_subject, message_body, review_url)
       VALUES (?, ?, ?, ?, 'email', ?, 'Post-Service Satisfaction', ?, ?, ?, ?)
       ON CONFLICT(work_order_id, channel) DO UPDATE SET
         destination = excluded.destination, status = CASE WHEN customer_feedback_requests.status = 'sent' THEN 'sent' ELSE excluded.status END,
         message_subject = excluded.message_subject, message_body = excluded.message_body,
         review_url = excluded.review_url, record_version = record_version + 1,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      feedbackEmailId,
      TECHFLEX_ORG_ID,
      workOrder.id,
      workOrder.customerId,
      workOrder.customerEmail,
      workOrder.customerEmail && reviewUrl
        ? "queued"
        : "blocked_missing_information",
      feedbackSubject,
      feedbackBody,
      reviewUrl,
    ),
    env.DB.prepare(
      `INSERT INTO customer_feedback_requests
        (id, organization_id, work_order_id, customer_id, channel, destination,
         campaign_name, status, message_body, review_url)
       VALUES (?, ?, ?, ?, 'sms', ?, 'Post-Service Satisfaction', ?, ?, ?)
       ON CONFLICT(work_order_id, channel) DO UPDATE SET
         destination = excluded.destination,
         status = CASE WHEN customer_feedback_requests.status IN ('sent','enrolled') THEN customer_feedback_requests.status ELSE excluded.status END,
         message_body = excluded.message_body, review_url = excluded.review_url,
         record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      feedbackSmsId,
      TECHFLEX_ORG_ID,
      workOrder.id,
      workOrder.customerId,
      workOrder.customerPhone,
      workOrder.customerPhone && reviewUrl
        ? "admin_action_required"
        : "blocked_missing_information",
      `TechFlex follow-up for ${customerName}, work order ${workOrder.externalId}. Confirm documented SMS consent before adding ${workOrder.customerPhone || "[mobile number needed]"} to the 800.com Post-Service Satisfaction campaign. Campaign message must include the neutral satisfaction request and Google review link: ${reviewUrl || "[Google review URL needed]"}.`,
      reviewUrl,
    ),
    env.DB.prepare(
      `INSERT INTO admin_tasks
        (id, organization_id, account_id, work_order_id, assigned_role, category,
         title, instructions, priority, status, source, source_record_id)
       VALUES (?, ?, ?, ?, 'operations_administrator', 'Customer Care', ?, ?, 'normal', 'open', 'customer_feedback', ?)
       ON CONFLICT(source, source_record_id) DO UPDATE SET
         title = excluded.title, instructions = excluded.instructions,
         status = CASE WHEN admin_tasks.status = 'complete' THEN 'complete' ELSE 'open' END,
         record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      workOrder.accountId,
      workOrder.id,
      `Enroll ${customerName} in 800.com satisfaction follow-up`,
      `Customer: ${customerName}\nPhone: ${workOrder.customerPhone || "MISSING"}\nEmail: ${workOrder.customerEmail || "MISSING"}\nWork order: ${workOrder.externalId}\n\n1. Verify the customer has documented consent to receive service-related SMS.\n2. Add the name and mobile number to the 800.com Post-Service Satisfaction campaign.\n3. Confirm the campaign contains the neutral satisfaction survey and Google review link: ${reviewUrl || "MISSING - configure GOOGLE_REVIEW_URL"}.\n4. Mark the SMS follow-up enrolled in TechFlex.`,
      `feedback_sms:${workOrder.id}`,
    ),
  );
  if (workOrder.customerEmail && reviewUrl)
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO integration_events
          (id, organization_id, integration_key, external_event_id, direction,
           event_type, entity_type, entity_id, status, payload_json)
         VALUES (?, ?, 'google_workspace_email', ?, 'outbound', 'review_request.send',
           'customer_feedback', ?, 'pending', ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        `review_email:${workOrder.id}:1`,
        feedbackEmailId,
        JSON.stringify({
          feedbackRequestId: feedbackEmailId,
          to: workOrder.customerEmail,
          subject: feedbackSubject,
          body: feedbackBody,
        }),
      ),
    );
  for (const payout of payoutRows)
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO integration_events
          (id, organization_id, integration_key, external_event_id, direction,
           event_type, entity_type, entity_id, status, payload_json)
         VALUES (?, ?, 'google_sheets', ?, 'outbound', 'technician_pay.upsert',
           'technician_payout', ?, 'pending', ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        `technician_pay:${workOrder.id}:${payout.technicianId}:1`,
        payout.payoutId,
        JSON.stringify({
          sheetName: "Technician Pay",
          headers: [
            "Sync Key",
            "Approved At",
            "Technician",
            "Work Order",
            "Account",
            "Invoice",
            "Job Revenue",
            "Technician Pay",
            "Collection Status",
            "Payroll Status",
          ],
          values: [
            `payout:${workOrder.id}:${payout.technicianId}`,
            new Date().toISOString(),
            payout.technicianName,
            workOrder.externalId,
            workOrder.accountName,
            invoiceNumber,
            workOrder.acceptedPriceCents / 100,
            payout.payoutCents / 100,
            "awaiting_customer_payment",
            "approved",
          ],
        }),
      ),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO work_order_events
        (id, work_order_id, event_type, actor_user_id, source, payload_json)
       VALUES (?, ?, 'service_report.approved', ?, 'portal', ?)`,
    ).bind(
      crypto.randomUUID(),
      workOrder.id,
      identity.userId,
      JSON.stringify({
        reportId: report.id,
        reportVersion: report.reportVersion,
        invoiceId,
        invoiceNumber,
        payoutPoolCents,
        fixedDirectCostsCents,
        realizedMarginBasisPoints,
        billingMode: billingReview.mode,
        contractId: billingReview.contractId,
        invoiceTotalCents,
        technicianCount: payoutRows.length,
      }),
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES (?, ?, ?, 'service_report.approved', 'service_report', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      identity.userId,
      report.id,
      JSON.stringify({
        reportVersion: report.reportVersion,
        invoiceId,
        invoiceNumber,
        payoutPoolCents,
        reportAttachmentId,
        packetFileName,
        invoiceAttachmentId,
        billingMode: billingReview.mode,
        contractId: billingReview.contractId,
        invoiceTotalCents,
      }),
    ),
    env.DB.prepare(
      `UPDATE technicians SET
         guided_jobs_completed=guided_jobs_completed+1,
         qa_pass_streak=qa_pass_streak+1,
         competency_score=min(100,competency_score+5),
         proficiency_level=CASE
           WHEN proficiency_level='trainee' AND guided_jobs_completed+1>=3 THEN 'guided'
           ELSE proficiency_level END,
         record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND ? NOT LIKE 'biomed_%'`,
    ).bind(report.technicianId,workOrder.serviceType),
  );
  for(const item of selectedAssetProgress.filter(item=>item.status==="completed")) {
    statements.push(
      env.DB.prepare(`UPDATE assets SET status=CASE WHEN ? IN ('quarantined','retired') THEN ? ELSE status END,last_pm_on=CASE WHEN ? LIKE 'biomed_pm_%' AND ? IN ('passed','returned_to_service') THEN date('now') ELSE last_pm_on END,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(item.disposition,item.disposition,workOrder.serviceType,item.disposition,item.assetId,TECHFLEX_ORG_ID),
      env.DB.prepare(`INSERT INTO asset_visits(id,organization_id,asset_id,work_order_id,technician_id,visit_type,visited_at,complaint,findings,work_performed,parts_json,test_results_json,disposition,next_action,created_by) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,'[]',?,?,?,?)`).bind(`report:${report.id}:asset:${item.assetId}`,TECHFLEX_ORG_ID,item.assetId,workOrder.id,report.technicianId,workOrder.serviceType==="biomed_cataloging"?"cataloging":workOrder.serviceType.startsWith("biomed_pm")?"preventive_maintenance":workOrder.serviceType==="biomed_repair"?"corrective_repair":"diagnostic",parsed.customerComplaint,item.findings || item.notes,item.workPerformed,JSON.stringify({narrative:item.testResults,fieldNotes:item.notes,procedureSnapshot:item.procedureSnapshotJson?JSON.parse(item.procedureSnapshotJson):null,procedureAnswers:item.procedureAnswersJson?JSON.parse(item.procedureAnswersJson):[]}),item.disposition,["parts_required","follow_up_required","quarantined","needs_resolution","needs_review"].includes(item.disposition||"")?"See per-asset follow-up and administrator task.":null,identity.userId),
    );
  }
  if (workOrder.assetId && !selectedAssetProgress.some(item=>item.assetId===workOrder.assetId))
    statements.push(
      env.DB.prepare(
        `UPDATE assets SET manufacturer = ?, model = ?, serial_number = ?,
           status = CASE WHEN ? IN ('quarantined','retired') THEN ? ELSE status END,
           last_pm_on = CASE WHEN ? LIKE 'biomed_pm_%' AND ? IN ('passed','returned_to_service') THEN date('now') ELSE last_pm_on END,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      ).bind(
        parsed.manufacturer,
        parsed.model,
        parsed.serialNumber,
        parsed.assetDisposition,
        parsed.assetDisposition,
        workOrder.serviceType,
        parsed.assetDisposition,
        workOrder.assetId,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `INSERT INTO asset_visits
          (id, organization_id, asset_id, work_order_id, technician_id, visit_type,
           visited_at, complaint, findings, work_performed, parts_json,
           test_results_json, disposition, next_action, created_by)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        workOrder.assetId,
        workOrder.id,
        report.technicianId,
        workOrder.serviceType === "biomed_cataloging" ? "cataloging" : workOrder.serviceType.startsWith("biomed_pm")
          ? "preventive_maintenance"
          : workOrder.serviceType.includes("delivery") ||
              workOrder.serviceType.includes("install")
            ? "installation"
            : workOrder.serviceType.includes("repair")
              ? "repair"
              : "diagnostic",
        parsed.customerComplaint,
        parsed.findings || parsed.documentDetails.fieldNotes,
        parsed.workPerformed,
        JSON.stringify(parsed.partsUsed),
        JSON.stringify({ narrative: parsed.testResults, fieldNotes: parsed.documentDetails.fieldNotes }),
        parsed.assetDisposition,
        parsed.recommendation || null,
        identity.userId,
      ),
    );
  try {
    await reviewBatch(report, workOrder, statements, reviewSnapshot);
  } catch (error) {
    safeServerLog("completion_commit", error);
    try {
      const state = await approvalCommitState({
        reportId: report.id,
        workOrderId: workOrder.id,
        reportAttachmentId,
        reportStorageKey,
        invoiceAttachmentId,
        invoiceStorageKey,
        invoiceId,
        payoutCount: payoutRows.length,
      });
      if (state === "saved") {
        // D1 committed the complete guarded approval before the response was lost.
      } else if (state === "absent") {
        await cleanupGeneratedAttachments(generatedAttachments);
        if (error instanceof PortalHttpError) throw error;
        throw new PortalHttpError(
          503,
          "Approval was not saved. The report remains submitted and no invoice or technician pay was created. Refresh the review, then try again.",
        );
      } else {
        throw new PortalHttpError(
          409,
          "Approval could not be confirmed. Refresh the work order and review its files, invoice, and technician pay before trying again.",
        );
      }
    } catch (verificationError) {
      if (verificationError === error || verificationError instanceof PortalHttpError)
        throw verificationError;
      safeServerLog("completion_commit", verificationError);
      throw new PortalHttpError(
        409,
        "Approval could not be confirmed. Refresh the work order and review its files, invoice, and technician pay before trying again.",
      );
    }
  }
  try {
    await processGoogleSheetOutbox(10);
  } catch (error) {
    safeServerLog("google_sheets_outbox", error);
  }
  try {
    await processGoogleWorkspaceEmailOutbox(5);
  } catch (error) {
    safeServerLog("google_email_outbox", error);
  }
  return {
    reportId: report.id,
    invoiceId,
    invoiceNumber,
    reportAttachmentId,
    invoiceAttachmentId,
    payoutCount: payoutRows.length,
    payoutPoolCents,
    billingMode: billingReview.mode,
    invoiceTotalCents,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    const url = new URL(request.url);
    await releasePendingSubmissionReviews();
    if (url.searchParams.get("queue") === "review") {
      if (identity.role === "technician")
        return Response.json(
          { error: "Review access is required." },
          { status: 403 },
        );
      const result = await env.DB.prepare(
        `SELECT sr.id AS reportId, sr.work_order_id AS workOrderId,
                sr.technician_id AS technicianId, sr.submitted_at AS submittedAt,
                sr.qa_status AS qaStatus, sr.qa_reviewed_at AS reviewedAt, w.external_id AS externalId,
                w.service_type AS serviceType, w.summary, w.status,
                w.accepted_price_cents AS acceptedPriceCents,
                w.gross_margin_basis_points AS grossMarginBasisPoints,
                a.name AS accountName, l.name AS locationName,
                COALESCE(u.display_name, t.technician_code) AS technicianName
           FROM service_reports sr JOIN work_orders w ON w.id = sr.work_order_id
           JOIN accounts a ON a.id = w.account_id JOIN locations l ON l.id = w.location_id
           JOIN technicians t ON t.id = sr.technician_id LEFT JOIN users u ON u.id = t.user_id
          WHERE w.organization_id = ? AND (sr.submitted_at IS NOT NULL OR
            sr.qa_status IN ('submitted','returned') OR
            (sr.qa_status='approved' AND (
              EXISTS(
                SELECT 1 FROM audit_logs requested
                 WHERE requested.organization_id=w.organization_id
                   AND requested.action='service_report.amendment_requested'
                   AND requested.entity_type='service_report_amendment'
                   AND json_extract(requested.after_json,'$.reportId')=sr.id
                   AND NOT EXISTS(
                     SELECT 1 FROM audit_logs reviewed
                      WHERE reviewed.organization_id=requested.organization_id
                        AND reviewed.action='service_report.amendment_reviewed'
                        AND reviewed.entity_type='service_report_amendment'
                        AND reviewed.entity_id=requested.entity_id
                   )
              ) OR EXISTS(
                SELECT 1 FROM audit_logs prepared
                 WHERE prepared.organization_id=w.organization_id
                   AND prepared.action='service_report.replacement_prepared'
                   AND prepared.entity_type='service_report_replacement'
                   AND json_extract(prepared.after_json,'$.reportId')=sr.id
                   AND NOT EXISTS(
                     SELECT 1 FROM audit_logs decided
                      WHERE decided.organization_id=prepared.organization_id
                        AND decided.action='service_report.replacement_reviewed'
                        AND decided.entity_type='service_report_replacement'
                        AND decided.entity_id=prepared.entity_id
                   )
              )
            ))
          )
          ORDER BY CASE WHEN sr.qa_reviewed_at IS NULL THEN 1 ELSE 2 END, sr.submitted_at DESC`,
      )
        .bind(TECHFLEX_ORG_ID)
        .all();
      return Response.json({ submissions: result.results, reviewRequired: false });
    }
    const workOrderId = url.searchParams.get("workOrderId");
    const requestedTechnicianId = url.searchParams.get("technicianId");
    if (!workOrderId)
      return Response.json({ error: "Select a work order." }, { status: 400 });
    const workOrder = await getWorkOrder(workOrderId);
    if (!workOrder)
      return Response.json({ error: "Work order not found." }, { status: 404 });
    const technician = await assignedTechnician(
      workOrder.id,
      identity,
      requestedTechnicianId,
    ) || await approvedReportTechnician(workOrder.id, identity, requestedTechnicianId);
    if (!technician)
      return Response.json(
        { error: "This work order is not assigned to this technician." },
        { status: 403 },
      );
    const [report, attachments] = await Promise.all([
      latestReport(workOrder.id, technician.id),
      workOrderAttachments(workOrder.id),
    ]);
    if (url.searchParams.get("format") === "pdf") {
      if (!report) throw new PortalHttpError(404, "Save this report before downloading it.");
      const fields = reportView(report,workOrder);
      const assets = await workOrderAssetProgress(workOrder.id);
      const bytes = await generateServiceReportPdf({
        ...fields,documentStatus:`Saved field record | R${report.reportVersion}`,
        workOrderNumber:workOrder.externalId,
        accountName:workOrder.accountName,locationName:workOrder.locationName,locationAddress:locationAddress(workOrder),
        technicianName:technician.technicianName,serviceType:workOrder.serviceType,summary:workOrder.summary,
        fieldNotes:fields.documentDetails.fieldNotes,customerName:workOrder.customerName || workOrder.locationName,
        serviceDate:report.submittedAt || "",actualOnsiteMinutes:fields.documentDetails.actualOnsiteMinutes,
        customerSignedAt:report.customerSignedAt || "",evidenceCounts:evidenceCounts(attachments),signature:null,equipmentProgress:assets,
      });
      const current = await latestReport(workOrder.id,technician.id);
      const currentAssets = await workOrderAssetProgress(workOrder.id);
      const currentWorkOrder = await getWorkOrder(workOrder.id);
      if (current?.recordVersion !== report.recordVersion || currentWorkOrder?.recordVersion !== workOrder.recordVersion || JSON.stringify(currentAssets) !== JSON.stringify(assets))
        throw new PortalHttpError(409,"The notes changed while the report was being prepared. Download the latest saved report again.");
      return new Response(bytes as BodyInit,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="TechFlex-${safeFileToken(workOrder.externalId)}-R${report.reportVersion}-service-report.pdf"`,"Cache-Control":"private, no-store"}});
    }
    const reportRevisions = await reportRevisionHistory(report?.id || null);
    const reviewCheckpoint =
      identity.role !== "technician" && report?.submittedAt
        ? await inboxSnapshot(workOrder.id)
        : null;
    const requirements = evidenceRequirements(workOrder.serviceType);
    const counts = evidenceCounts(attachments);
    const lesson = trainingLesson(workOrder.serviceType);
    const includeGuidance = url.searchParams.get("guidance") === "1";
    const latestAttempt = includeGuidance ? await env.DB.prepare(
      `SELECT id,score_percent AS scorePercent,passed,created_at AS createdAt
         FROM technician_training_attempts
        WHERE technician_id=? AND work_order_id=? AND module_key=? AND module_version=?
        ORDER BY created_at DESC LIMIT 1`,
    ).bind(technician.id, workOrder.id, lesson.moduleKey, lesson.version).first() : null;
    const currentReport = reportView(report, workOrder);
    const equipmentGuidance = includeGuidance ? await env.DB.prepare(
      `SELECT id,title,diagnostic_steps_json AS diagnosticStepsJson,
              support_phone AS supportPhone,support_email AS supportEmail,
              source_url AS sourceUrl,source_verified_on AS sourceVerifiedOn
         FROM equipment_knowledge_articles
        WHERE organization_id=? AND status='active'
          AND (manufacturer IS NULL OR lower(manufacturer)=lower(?))
          AND (model_pattern IS NULL OR ? LIKE '%' || model_pattern || '%')
        ORDER BY CASE WHEN model_pattern IS NULL THEN 2 ELSE 1 END,updated_at DESC LIMIT 5`,
    ).bind(
      TECHFLEX_ORG_ID,
      currentReport.manufacturer,
      currentReport.model,
    ).all() : { results: [] };
    return Response.json({
      workOrder: {
        ...workOrder,
        locationAddress: locationAddress(workOrder),
        instructions:
          safeJson<{ instructions?: string[] }>(
            workOrder.requiredSkillsJson,
            {},
          ).instructions || [],
      },
      technician,
      report: reportView(report, workOrder),
      reportRevisions,
      assets: identity.role !== "technician" ? await workOrderAssetProgress(workOrder.id) : [],
      attachments,
      evidenceRequirements: requirements,
      evidenceCounts: counts,
      missingEvidence: workOrder.serviceType === "biomed_cataloging" ? [] : missingEvidence(requirements, counts),
      reviewCheckpoint: reviewCheckpoint
        ? {
            token: reviewCheckpoint.token,
            evidenceFileCount: attachments.length,
          }
        : null,
      billingReview: null,
      reviewRequired: false,
      training: {
        enabled: includeGuidance && Boolean(technician.trainingMode),
        proficiencyLevel: technician.proficiencyLevel,
        guidedJobsCompleted: technician.guidedJobsCompleted,
        qaPassStreak: technician.qaPassStreak,
        competencyScore: technician.competencyScore,
        lesson: publicTrainingLesson(lesson),
        latestAttempt,
        equipmentGuidance: equipmentGuidance.results.map((item: Record<string, unknown>) => ({
          ...item,
          diagnosticSteps: safeJson(String(item.diagnosticStepsJson || "[]"), []),
        })),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "technician",
    ]);
    const input = actionSchema.parse(await request.json());
    if (input.action === "review" || input.action === "refine_report" || input.action === "inbox_review") {
      if (identity.role === "technician")
        return Response.json(
          { error: "Administrator inbox access is required." },
          { status: 403 },
        );
      const report = await env.DB.prepare(
        `SELECT sr.id, sr.work_order_id AS workOrderId, sr.technician_id AS technicianId,
                COALESCE(u.display_name, t.technician_code) AS technicianName,
                t.technician_code AS technicianCode, sr.report_version AS reportVersion,
                sr.findings, sr.work_performed AS workPerformed, sr.recommendation,
                sr.customer_complaint AS customerComplaint, sr.equipment_type AS equipmentType,
                sr.manufacturer, sr.model, sr.serial_number AS serialNumber,
                sr.diagnostic_steps_json AS diagnosticStepsJson, sr.test_results AS testResults,
                sr.parts_used_json AS partsUsedJson, sr.document_details_json AS documentDetailsJson, sr.asset_disposition AS assetDisposition,
                sr.checklist_json AS checklistJson, sr.customer_signature_name AS customerSignatureName,
                sr.customer_signed_at AS customerSignedAt,
                sr.signature_attachment_id AS signatureAttachmentId,
                sr.report_pdf_attachment_id AS reportPdfAttachmentId,
                sr.submitted_at AS submittedAt, sr.qa_status AS qaStatus,
                sr.qa_notes AS qaNotes, sr.qa_reviewed_at AS qaReviewedAt,
                sr.record_version AS recordVersion
           FROM service_reports sr JOIN technicians t ON t.id = sr.technician_id
           LEFT JOIN users u ON u.id = t.user_id
          WHERE sr.id = ?`,
      )
        .bind(input.reportId)
        .first<ReportRecord>();
      if (!report)
        return Response.json(
          { error: "Service report not found." },
          { status: 404 },
        );
      const workOrder = await getWorkOrder(report.workOrderId);
      if (!workOrder)
        return Response.json(
          { error: "Work order not found." },
          { status: 404 },
        );
      if (report.recordVersion !== input.expectedReportVersion ||
          workOrder.recordVersion !== input.expectedWorkOrderVersion ||
          workOrder.status === "cancelled")
        throw new PortalHttpError(409, reviewConflictMessage);
      if (!report.submittedAt)
        return Response.json(
          { error: "This report has not been submitted yet." },
          { status: 409 },
        );
      const reviewSnapshot = await inboxSnapshot(workOrder.id);
      if (reviewSnapshot.token !== input.expectedReviewSnapshot)
        throw new PortalHttpError(409, reviewConflictMessage);
      if (input.action === "inbox_review" || (input.action === "review" && input.decision === "return")) {
        const markReviewed = input.decision === "reviewed";
        await reviewBatch(report,workOrder,[
          env.DB.prepare(`UPDATE service_reports SET qa_notes=CASE WHEN ? != '' THEN substr(COALESCE(qa_notes || char(10) || char(10),'') || ?, -5000) ELSE qa_notes END,
            qa_reviewed_by=CASE WHEN ? THEN ? ELSE qa_reviewed_by END,
            qa_reviewed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE qa_reviewed_at END,
            updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(input.qaNotes,input.qaNotes,Number(markReviewed),identity.userId,Number(markReviewed),report.id),
          env.DB.prepare(`UPDATE admin_tasks SET status=CASE WHEN ? THEN 'complete' ELSE status END,
            completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END,
            completed_by=CASE WHEN ? THEN ? ELSE completed_by END,
            instructions='Informational submission. No administrator approval is required. ' || (SELECT COALESCE(qa_notes,'') FROM service_reports WHERE id=?),
            record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
            WHERE organization_id=? AND source='service_report' AND source_record_id=?`).bind(Number(markReviewed),Number(markReviewed),Number(markReviewed),identity.userId,report.id,TECHFLEX_ORG_ID,`report:${report.id}`),
          env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
            VALUES(?,?,?,'service_report.inbox_reviewed','service_report',?,?,?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,report.id,
              JSON.stringify({qaNotes:report.qaNotes}),JSON.stringify({comment:input.qaNotes,markedReviewed:markReviewed,reviewRequired:false})),
        ],reviewSnapshot);
        return Response.json({reportId:report.id,status:markReviewed?"reviewed":"comment_saved",reviewRequired:false});
      }
      if (input.action === "refine_report") {
        const current = reportFields.parse(reportView(report, workOrder));
        const fields = { ...input.report,
          customerSignatureName: current.customerSignatureName, signatureAttachmentId: current.signatureAttachmentId,
          documentDetails: { ...input.report.documentDetails, fieldNotes: current.documentDetails.fieldNotes },
        };
        const assets = await workOrderAssetProgress(workOrder.id);
        if (new Set(input.assets.map(item=>item.assetId)).size !== input.assets.length)
          throw new PortalHttpError(400, "Each equipment record can be edited once per save.");
        for (const item of input.assets) {
          const saved = assets.find(asset=>asset.assetId===item.assetId);
          if (!saved || saved.recordVersion !== item.expectedRecordVersion) throw new PortalHttpError(409, reviewConflictMessage);
          if (item.disposition === "delivery_completed") throw new PortalHttpError(400,"Choose an equipment disposition for this unit.");
          if (workOrder.serviceType === "biomed_cataloging" && ["passed","returned_to_service","delivery_completed"].includes(item.disposition || ""))
            throw new PortalHttpError(400, "Cataloging cannot establish a passing test or return to service.");
          if (workOrder.serviceType !== "biomed_cataloging" && item.disposition === "cataloged")
            throw new PortalHttpError(400, "Cataloged is only an inventory outcome.");
        }
        if (workOrder.serviceType === "biomed_cataloging" && ["passed","returned_to_service","delivery_completed"].includes(fields.assetDisposition))
          throw new PortalHttpError(400, "Choose an inventory outcome for cataloging.");
        const statements: D1PreparedStatement[] = [
          env.DB.prepare(`UPDATE service_reports SET customer_complaint=?,equipment_type=?,manufacturer=?,model=?,serial_number=?,
            findings=?,work_performed=?,test_results=?,recommendation=?,asset_disposition=?,checklist_json=?,diagnostic_steps_json=?,parts_used_json=?,document_details_json=?,
            report_pdf_attachment_id=NULL,qa_status='submitted',qa_reviewed_at=NULL,qa_reviewed_by=NULL,
            record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
              fields.customerComplaint,fields.equipmentType,fields.manufacturer,fields.model,fields.serialNumber,
              fields.findings,fields.workPerformed,fields.testResults,fields.recommendation,fields.assetDisposition,
              JSON.stringify(fields.checklist),JSON.stringify(fields.diagnosticSteps),JSON.stringify(fields.partsUsed),JSON.stringify(fields.documentDetails),report.id),
          env.DB.prepare(`UPDATE work_orders SET record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(workOrder.id,TECHFLEX_ORG_ID),
        ];
        for (const item of input.assets) statements.push(
          env.DB.prepare(`UPDATE work_order_assets SET status=?,findings=?,work_performed=?,test_results=?,disposition=?,not_applicable_reason=?,
            record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND work_order_id=? AND asset_id=? AND record_version=?`).bind(
              item.status,item.findings,item.workPerformed,item.testResults,item.disposition,item.notApplicableReason,TECHFLEX_ORG_ID,workOrder.id,item.assetId,item.expectedRecordVersion));
        statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
          VALUES(?,?,?,'service_report.administrator_refined','service_report',?,?,?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,report.id,
            JSON.stringify({recordVersion:report.recordVersion,fields:current,assets}),
            JSON.stringify({recordVersion:report.recordVersion+1,fields,assets:input.assets,originalTechnicianNotesPreserved:true})));
        await reviewBatch(report,workOrder,statements,reviewSnapshot);
        return Response.json({status:"refined",reportId:report.id,recordVersion:report.recordVersion+1,workOrderRecordVersion:workOrder.recordVersion+1});
      }
      if (report.qaStatus !== "submitted")
        throw new PortalHttpError(409,"Submit the current saved report before preparing billing documents. Administrator review is optional for field completion.");
      const approved = await approveReport(
        report,
        workOrder,
        input.qaNotes,
        identity,
        await approvalSnapshot(workOrder.id),
      );
      if ("error" in approved)
        return Response.json(
          { error: approved.error },
          { status: approved.status },
        );
      return Response.json({ status: "approved", ...approved });
    }

    const workOrder = await getWorkOrder(input.workOrderId);
    if (!workOrder)
      return Response.json({ error: "Work order not found." }, { status: 404 });
    const technician = await assignedTechnician(
      workOrder.id,
      identity,
      input.technicianId,
    );
    if (!technician)
      return Response.json(
        { error: "This work order is not assigned to this technician." },
        { status: 403 },
      );
    let submissionRequest: { requestId: string; requestDigest: string } | null = null;
    if (input.action === "submit" && input.requestId) {
      const requestDigest = await submissionRequestDigest(input);
      const replay = await submissionReplay(
        input.requestId,
        identity.userId,
        workOrder.id,
        technician.id,
        requestDigest,
      );
      if (replay)
        return Response.json({ ...replay, status: "submitted", reconciled: true });
      submissionRequest = { requestId: input.requestId, requestDigest };
    }
    if (
      workOrder.status === "cancelled"
    )
      return Response.json(
        { error: "This work order was cancelled. Your existing notes are retained." },
        { status: 409 },
      );
    if (input.action === "training_check") {
      if (!technician.trainingMode)
        return Response.json({ error: "Training mode is not active for this technician." }, { status: 409 });
      const lesson = trainingLesson(workOrder.serviceType);
      const grade = gradeTrainingLesson(lesson, input.answers);
      const attemptId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO technician_training_attempts
            (id,organization_id,technician_id,work_order_id,module_key,module_version,answers_json,score_percent,passed)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(attemptId, TECHFLEX_ORG_ID, technician.id, workOrder.id, lesson.moduleKey, lesson.version, JSON.stringify(input.answers), grade.scorePercent, grade.passed ? 1 : 0),
        env.DB.prepare(
          `UPDATE technicians SET competency_score=CASE
             WHEN ?=1 THEN max(competency_score,?) ELSE max(0,competency_score-2) END,
             record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        ).bind(grade.passed ? 1 : 0, Math.min(90, grade.scorePercent), technician.id),
        env.DB.prepare(
          `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
           VALUES (?,?,?,'technician.training_attempted','technician_training_attempt',?,?)`,
        ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, attemptId, JSON.stringify({ moduleKey: lesson.moduleKey, scorePercent: grade.scorePercent, passed: grade.passed, workOrderId: workOrder.id })),
      ]);
      return Response.json({ attemptId, ...grade });
    }
    let immutableSubmissionSnapshot: SubmissionSnapshot | null = null;
    if (input.action === "submit") {
      const selectedAssetProgress = await workOrderAssetProgress(workOrder.id);
      const hasRecordedWork = [input.report.documentDetails.fieldNotes,input.report.findings,input.report.workPerformed,input.report.testResults].some(value=>value.trim())
        || selectedAssetProgress.some(item=>[item.notes,item.findings,item.workPerformed,item.testResults,item.notApplicableReason].some(value=>value?.trim()));
      if (!hasRecordedWork) return Response.json({error:"Type a note about this visit or unit, then submit the completed visit. Save draft is available at any time."},{status:409});
      if (workOrder.serviceType === "biomed_cataloging" && ["passed","returned_to_service","delivery_completed"].includes(input.report.assetDisposition))
        return Response.json({error:"Choose an inventory outcome; cataloging does not establish a passing test or return to service."},{status:409});
      immutableSubmissionSnapshot = await submissionSnapshot(workOrder.id);
    }
    let saved;
    try {
      saved = await saveReport(
        workOrder,
        technician.id,
        input.report,
        input.action === "submit" ? "submitted" : "draft",
        identity.userId,
        input.expectedReportVersion,
        input.expectedWorkOrderVersion,
        immutableSubmissionSnapshot,
        submissionRequest,
      );
    } catch (error) {
      // A connection can disappear after D1 commits but before the response
      // reaches the device. Reconcile only the same actor's exact request;
      // changed evidence or a reused key remains a conflict.
      if (input.action === "submit" && submissionRequest) {
        const replay = await submissionReplay(
          submissionRequest.requestId,
          identity.userId,
          workOrder.id,
          technician.id,
          submissionRequest.requestDigest,
        );
        if (replay)
          return Response.json({ ...replay, status: "submitted", reconciled: true });
      }
      throw error;
    }
    return Response.json({
      reportId: saved.reportId,
      reportVersion: saved.reportVersion,
      recordVersion: saved.recordVersion,
      workOrderRecordVersion: saved.workOrderRecordVersion,
      status: input.action === "submit" ? "submitted" : "draft",
      fieldComplete: input.action === "submit" || Boolean(workOrder.completedAt),
      reviewRequired: false,
    });
  } catch (error) {
    if (error instanceof PdfGenerationError) return Response.json({error:error.message},{status:409});
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the completion fields.", details: error.flatten() },
        { status: 400 },
      );
    return apiError(error);
  }
}
