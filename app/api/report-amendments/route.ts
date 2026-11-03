import { SupabaseBucket } from "@/lib/supabase-storage";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { generateSignedReportReplacementPdf } from "@/lib/techflex-pdfs";
import { safeServerLog } from "@/lib/server-observability";

import {
  TECHFLEX_ORG_ID,
  PortalHttpError,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";

const requestSchema = z.object({
  action: z.literal("request"),
  requestId: z.string().uuid(),
  reportId: z.string().min(1).max(180),
  expectedReportVersion: z.number().int().positive(),
  expectedReportRecordVersion: z.number().int().positive(),
  expectedReportPdfAttachmentId: z.string().min(1).max(180),
  reason: z.string().trim().min(10).max(2000),
  proposedCorrection: z.string().trim().min(10).max(5000),
});

const reviewSchema = z.object({
  action: z.literal("review"),
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  reviewNotes: z.string().trim().min(5).max(5000),
});

const prepareReplacementSchema = z.object({
  action: z.literal("prepare_replacement"),
  replacementId: z.string().uuid(),
  requestId: z.string().uuid(),
  attestationAccepted: z.literal(true),
});

const reviewReplacementSchema = z.object({
  action: z.literal("review_replacement"),
  replacementId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  reviewNotes: z.string().trim().min(5).max(5000),
});

const actionSchema = z.discriminatedUnion("action", [
  requestSchema,
  reviewSchema,
  prepareReplacementSchema,
  reviewReplacementSchema,
]);

type ReportSource = {
  reportId: string;
  workOrderId: string;
  workOrderNumber: string;
  serviceType: string;
  technicianId: string;
  technicianUserId: string | null;
  reportVersion: number;
  reportRecordVersion: number;
  qaStatus: string;
  reportPdfAttachmentId: string | null;
  pdfStorageKey: string | null;
  pdfFileName: string | null;
  pdfSizeBytes: number | null;
  pdfChecksum: string | null;
  pdfCreatedAt: string | null;
};

type RequestSnapshot = {
  requestId: string;
  reportId: string;
  workOrderId: string;
  workOrderNumber: string;
  reportVersion: number;
  reportRecordVersion: number;
  reportPdfAttachmentId: string;
  reportPdfSnapshot: {
    storageKey: string;
    fileName: string;
    sizeBytes: number;
    checksum: string | null;
    createdAt: string;
  };
  reason: string;
  proposedCorrection: string;
  requestedBy: string;
  financialEffect: "none";
  originalArtifactChanged: false;
};

type ReviewSnapshot = {
  requestId: string;
  reportId: string;
  decision: "approved" | "declined";
  reviewNotes: string;
  reviewedBy: string;
  reportVersion: number;
  reportPdfAttachmentId: string;
  originalArtifactChanged: false;
};

type ReplacementPrepareSnapshot = {
  replacementId: string;
  requestId: string;
  reportId: string;
  workOrderId: string;
  workOrderNumber: string;
  reportVersion: number;
  reportRecordVersion: number;
  reportPdfAttachmentId: string;
  reportPdfSnapshot: RequestSnapshot["reportPdfSnapshot"];
  reason: string;
  approvedCorrection: string;
  amendmentReviewNotes: string;
  amendmentReviewedBy: string;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  electronicAttestation: true;
  financialEffect: "none";
  originalArtifactChanged: false;
};

type ReplacementReviewSnapshot = {
  replacementId: string;
  requestId: string;
  reportId: string;
  decision: "approved" | "declined";
  reviewNotes: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
  replacementAttachmentId: string | null;
  replacementStorageKey: string | null;
  replacementFileName: string | null;
  replacementSizeBytes: number | null;
  replacementChecksum: string | null;
  financialEffect: "none";
  originalArtifactChanged: false;
};

function safeJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "report";
}

async function reportSource(reportId: string) {
  return env.DB.prepare(
    `SELECT sr.id AS reportId,sr.work_order_id AS workOrderId,w.external_id AS workOrderNumber,
            w.service_type AS serviceType,sr.technician_id AS technicianId,t.user_id AS technicianUserId,
            sr.report_version AS reportVersion,sr.record_version AS reportRecordVersion,
            sr.qa_status AS qaStatus,sr.report_pdf_attachment_id AS reportPdfAttachmentId,
            pdf.storage_key AS pdfStorageKey,pdf.file_name AS pdfFileName,
            pdf.size_bytes AS pdfSizeBytes,pdf.checksum AS pdfChecksum,pdf.created_at AS pdfCreatedAt
       FROM service_reports sr
       JOIN work_orders w ON w.id=sr.work_order_id AND w.organization_id=?
       JOIN technicians t ON t.id=sr.technician_id AND t.organization_id=w.organization_id
       LEFT JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id
        AND pdf.organization_id=w.organization_id AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
      WHERE sr.id=?`,
  ).bind(TECHFLEX_ORG_ID, reportId).first<ReportSource>();
}

function assertReportAccess(identity: PortalIdentity, report: ReportSource) {
  if (identity.role === "technician" && identity.technicianId !== report.technicianId)
    throw new PortalHttpError(403, "You can only request a correction for your own approved report.");
  if (identity.role === "biomedical_lead" && !report.serviceType.startsWith("biomed"))
    throw new PortalHttpError(403, "DME report amendments require owner or operations review.");
}

async function amendmentHistory(reportId: string) {
  const rows = await env.DB.prepare(
    `SELECT a.id,a.action,a.entity_id AS requestId,a.actor_user_id AS actorUserId,
            COALESCE(u.display_name,u.email,'Unknown user') AS actorName,
            a.after_json AS afterJson,a.occurred_at AS occurredAt
       FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
      WHERE a.organization_id=? AND a.entity_type IN ('service_report_amendment','service_report_replacement')
        AND json_extract(a.after_json,'$.reportId')=?
        AND a.action IN ('service_report.amendment_requested','service_report.amendment_reviewed',
          'service_report.replacement_prepared','service_report.replacement_reviewed')
      ORDER BY a.occurred_at,a.id LIMIT 200`,
  ).bind(TECHFLEX_ORG_ID, reportId).all<{
    id: string;
    action: string;
    requestId: string;
    actorUserId: string | null;
    actorName: string;
    afterJson: string;
    occurredAt: string;
  }>();
  const requests = new Map<string, {
    request: RequestSnapshot;
    requestedAt: string;
    requestedByName: string;
    review: ReviewSnapshot | null;
    reviewedAt: string | null;
    reviewedByName: string | null;
    replacement: {
      prepared: ReplacementPrepareSnapshot;
      preparedAt: string;
      review: ReplacementReviewSnapshot | null;
    } | null;
  }>();
  const replacements = new Map<string, {
    prepared: ReplacementPrepareSnapshot;
    preparedAt: string;
    review: ReplacementReviewSnapshot | null;
  }>();
  for (const row of rows.results) {
    if (row.action !== "service_report.amendment_requested") continue;
    const snapshot = safeJson<RequestSnapshot>(row.afterJson);
    if (!snapshot) continue;
    requests.set(snapshot.requestId, {
      request: snapshot,
      requestedAt: row.occurredAt,
      requestedByName: row.actorName,
      review: null,
      reviewedAt: null,
      reviewedByName: null,
      replacement: null,
    });
  }
  for (const row of rows.results) {
    if (row.action !== "service_report.amendment_reviewed") continue;
    const review = safeJson<ReviewSnapshot>(row.afterJson);
    const current = review ? requests.get(review.requestId) : null;
    if (!review || !current) continue;
    current.review = review;
    current.reviewedAt = row.occurredAt;
    current.reviewedByName = row.actorName;
  }
  for (const row of rows.results) {
    if (row.action !== "service_report.replacement_prepared") continue;
    const prepared = safeJson<ReplacementPrepareSnapshot>(row.afterJson);
    if (!prepared) continue;
    replacements.set(prepared.replacementId, { prepared, preparedAt: row.occurredAt, review: null });
  }
  for (const row of rows.results) {
    if (row.action !== "service_report.replacement_reviewed") continue;
    const review = safeJson<ReplacementReviewSnapshot>(row.afterJson);
    const replacement = review ? replacements.get(review.replacementId) : null;
    if (review && replacement) replacement.review = review;
  }
  for (const replacement of replacements.values()) {
    const current = requests.get(replacement.prepared.requestId);
    if (!current) continue;
    if (!current.replacement || replacement.prepared.preparedAt > current.replacement.prepared.preparedAt)
      current.replacement = replacement;
  }
  return Array.from(requests.values()).map((item) => ({
    requestId: item.request.requestId,
    reportVersion: item.request.reportVersion,
    reportPdfAttachmentId: item.request.reportPdfAttachmentId,
    reason: item.request.reason,
    proposedCorrection: item.request.proposedCorrection,
    requestedAt: item.requestedAt,
    requestedBy: item.requestedByName,
    status: item.review?.decision || "pending",
    reviewNotes: item.review?.reviewNotes || null,
    reviewedAt: item.reviewedAt,
    reviewedBy: item.reviewedByName,
    replacement: item.replacement ? {
      replacementId: item.replacement.prepared.replacementId,
      status: item.replacement.review?.decision || "pending",
      preparedBy: item.replacement.prepared.preparedByName,
      preparedAt: item.replacement.preparedAt,
      reviewedBy: item.replacement.review?.reviewedByName || null,
      reviewedAt: item.replacement.review?.reviewedAt || null,
      reviewNotes: item.replacement.review?.reviewNotes || null,
      attachmentId: item.replacement.review?.replacementAttachmentId || null,
      fileName: item.replacement.review?.replacementFileName || null,
    } : null,
  })).reverse();
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "technician",
    ]);
    const reportId = new URL(request.url).searchParams.get("reportId")?.trim();
    if (!reportId) throw new PortalHttpError(400, "Select an approved service report.");
    const report = await reportSource(reportId);
    if (!report) throw new PortalHttpError(404, "Service report not found.");
    assertReportAccess(identity, report);
    return Response.json({
      report,
      amendments: await amendmentHistory(reportId),
      canRequest: report.qaStatus === "approved" && Boolean(report.reportPdfAttachmentId && report.pdfStorageKey),
      canReview: identity.role === "owner_administrator" || identity.role === "operations_administrator",
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
    if (input.action === "request") {
      const report = await reportSource(input.reportId);
      if (!report) throw new PortalHttpError(404, "Service report not found.");
      assertReportAccess(identity, report);
      if (!report.reportPdfAttachmentId || !report.pdfStorageKey || !report.pdfFileName || report.pdfSizeBytes === null || !report.pdfCreatedAt)
        throw new PortalHttpError(409, "The approved PDF is not available for an addendum. Restore the original artifact first.");
      const snapshot: RequestSnapshot = {
        requestId: input.requestId,
        reportId: report.reportId,
        workOrderId: report.workOrderId,
        workOrderNumber: report.workOrderNumber,
        reportVersion: input.expectedReportVersion,
        reportRecordVersion: input.expectedReportRecordVersion,
        reportPdfAttachmentId: input.expectedReportPdfAttachmentId,
        reportPdfSnapshot: {
          storageKey: report.pdfStorageKey,
          fileName: report.pdfFileName,
          sizeBytes: report.pdfSizeBytes,
          checksum: report.pdfChecksum,
          createdAt: report.pdfCreatedAt,
        },
        reason: input.reason,
        proposedCorrection: input.proposedCorrection,
        requestedBy: identity.userId,
        financialEffect: "none",
        originalArtifactChanged: false,
      };
      const auditId = `report-amendment-request:${input.requestId}`;
      const existing = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
      ).bind(auditId).first<{ actorUserId: string | null; afterJson: string }>();
      if (existing) {
        if (existing.actorUserId === identity.userId && existing.afterJson === JSON.stringify(snapshot))
          return Response.json({ requestId: input.requestId, status: "pending", replayed: true });
        throw new PortalHttpError(409, "That correction request ID was already used. Refresh the report history.");
      }
      if (report.qaStatus !== "approved" ||
          report.reportVersion !== input.expectedReportVersion ||
          report.reportRecordVersion !== input.expectedReportRecordVersion ||
          report.reportPdfAttachmentId !== input.expectedReportPdfAttachmentId)
        throw new PortalHttpError(409, "The approved report changed. Refresh it before requesting a correction.");
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO audit_logs
          (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json,request_id)
         SELECT ?,?,?,'service_report.amendment_requested','service_report_amendment',?,?,?
          WHERE EXISTS(
            SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
             JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id
              AND pdf.organization_id=w.organization_id AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
             WHERE sr.id=? AND w.organization_id=? AND sr.qa_status='approved'
               AND sr.report_version=? AND sr.record_version=? AND sr.report_pdf_attachment_id=?
               AND pdf.storage_key=? AND pdf.file_name=? AND pdf.size_bytes=?
               AND pdf.checksum IS ? AND pdf.created_at=?
          )`,
      ).bind(auditId, TECHFLEX_ORG_ID, identity.userId, input.requestId, JSON.stringify(snapshot), input.requestId,
        report.reportId, TECHFLEX_ORG_ID, report.reportVersion, report.reportRecordVersion, report.reportPdfAttachmentId,
        snapshot.reportPdfSnapshot.storageKey, snapshot.reportPdfSnapshot.fileName, snapshot.reportPdfSnapshot.sizeBytes,
        snapshot.reportPdfSnapshot.checksum, snapshot.reportPdfSnapshot.createdAt).run();
      if (!inserted.meta.changes) {
        const concurrent = await env.DB.prepare(
          "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
        ).bind(auditId).first<{ actorUserId: string | null; afterJson: string }>();
        if (concurrent?.actorUserId === identity.userId && concurrent.afterJson === JSON.stringify(snapshot))
          return Response.json({ requestId: input.requestId, status: "pending", replayed: true });
        throw new PortalHttpError(409, "The approved report changed. Refresh it before requesting a correction.");
      }
      return Response.json({ requestId: input.requestId, status: "pending" });
    }

    if (input.action === "prepare_replacement") {
      const requestAudit = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=? AND organization_id=?",
      ).bind(`report-amendment-request:${input.requestId}`, TECHFLEX_ORG_ID)
        .first<{ actorUserId: string | null; afterJson: string }>();
      const reviewAudit = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=? AND organization_id=?",
      ).bind(`report-amendment-review:${input.requestId}`, TECHFLEX_ORG_ID)
        .first<{ actorUserId: string | null; afterJson: string }>();
      const amendment = safeJson<RequestSnapshot>(requestAudit?.afterJson);
      const amendmentReview = safeJson<ReviewSnapshot>(reviewAudit?.afterJson);
      if (!requestAudit || !reviewAudit || !amendment || !amendmentReview || amendmentReview.decision !== "approved")
        throw new PortalHttpError(409, "Approve the factual addendum before preparing a replacement artifact.");
      const report = await reportSource(amendment.reportId);
      if (!report) throw new PortalHttpError(404, "Service report not found.");
      assertReportAccess(identity, report);
      const preparedAt = new Date().toISOString();
      const prepared: ReplacementPrepareSnapshot = {
        replacementId: input.replacementId,
        requestId: input.requestId,
        reportId: amendment.reportId,
        workOrderId: amendment.workOrderId,
        workOrderNumber: amendment.workOrderNumber,
        reportVersion: amendment.reportVersion,
        reportRecordVersion: amendment.reportRecordVersion,
        reportPdfAttachmentId: amendment.reportPdfAttachmentId,
        reportPdfSnapshot: amendment.reportPdfSnapshot,
        reason: amendment.reason,
        approvedCorrection: amendment.proposedCorrection,
        amendmentReviewNotes: amendmentReview.reviewNotes,
        amendmentReviewedBy: amendmentReview.reviewedBy,
        preparedBy: identity.userId,
        preparedByName: identity.displayName,
        preparedAt,
        electronicAttestation: true,
        financialEffect: "none",
        originalArtifactChanged: false,
      };
      const prepareId = `report-replacement-prepare:${input.replacementId}`;
      const existing = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
      ).bind(prepareId).first<{ actorUserId: string | null; afterJson: string }>();
      if (existing) {
        const prior = safeJson<ReplacementPrepareSnapshot>(existing.afterJson);
        if (existing.actorUserId === identity.userId && prior &&
            JSON.stringify({ ...prior, preparedAt: null }) === JSON.stringify({ ...prepared, preparedAt: null }))
          return Response.json({ replacementId: input.replacementId, status: "pending", replayed: true });
        throw new PortalHttpError(409, "That replacement request ID was already used. Refresh the amendment history.");
      }
      if (report.qaStatus !== "approved" || report.reportVersion !== amendment.reportVersion ||
          report.reportRecordVersion !== amendment.reportRecordVersion || report.reportPdfAttachmentId !== amendment.reportPdfAttachmentId ||
          JSON.stringify({ storageKey: report.pdfStorageKey, fileName: report.pdfFileName, sizeBytes: report.pdfSizeBytes,
            checksum: report.pdfChecksum, createdAt: report.pdfCreatedAt }) !== JSON.stringify(amendment.reportPdfSnapshot))
        throw new PortalHttpError(409, "The approved artifact changed. Refresh before preparing its replacement.");
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO audit_logs
          (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,request_id)
         SELECT ?,?,?,'service_report.replacement_prepared','service_report_replacement',?,?,?,?
          WHERE EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=? AND actor_user_id IS ?)
            AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=?)
            AND NOT EXISTS(
              SELECT 1 FROM audit_logs prior
               WHERE prior.organization_id=? AND prior.action='service_report.replacement_prepared'
                 AND json_extract(prior.after_json,'$.requestId')=? AND prior.id!=?
                 AND (NOT EXISTS(SELECT 1 FROM audit_logs decided WHERE decided.id=replace(prior.id,'prepare:','review:'))
                   OR EXISTS(SELECT 1 FROM audit_logs decided WHERE decided.id=replace(prior.id,'prepare:','review:')
                     AND json_extract(decided.after_json,'$.decision')='approved'))
            )
            AND EXISTS(
              SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
               JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id
                AND pdf.organization_id=w.organization_id AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
               WHERE sr.id=? AND w.organization_id=? AND sr.qa_status='approved'
                 AND sr.report_version=? AND sr.record_version=? AND sr.report_pdf_attachment_id=?
                 AND pdf.storage_key=? AND pdf.file_name=? AND pdf.size_bytes=?
                 AND pdf.checksum IS ? AND pdf.created_at=?
            )`,
      ).bind(prepareId, TECHFLEX_ORG_ID, identity.userId, input.replacementId, requestAudit.afterJson,
        JSON.stringify(prepared), input.replacementId,
        `report-amendment-request:${input.requestId}`, TECHFLEX_ORG_ID, requestAudit.afterJson, requestAudit.actorUserId,
        `report-amendment-review:${input.requestId}`, TECHFLEX_ORG_ID, reviewAudit.afterJson,
        TECHFLEX_ORG_ID, input.requestId, prepareId,
        amendment.reportId, TECHFLEX_ORG_ID, amendment.reportVersion, amendment.reportRecordVersion,
        amendment.reportPdfAttachmentId, amendment.reportPdfSnapshot.storageKey, amendment.reportPdfSnapshot.fileName,
        amendment.reportPdfSnapshot.sizeBytes, amendment.reportPdfSnapshot.checksum, amendment.reportPdfSnapshot.createdAt).run();
      if (!inserted.meta.changes) throw new PortalHttpError(409, "The addendum, artifact, or replacement workflow changed. Refresh before preparing a replacement.");
      return Response.json({ replacementId: input.replacementId, status: "pending" });
    }

    if (input.action === "review_replacement") {
      if (identity.role !== "owner_administrator" && identity.role !== "operations_administrator")
        throw new PortalHttpError(403, "Owner or operations approval is required to release a replacement artifact.");
      const prepareId = `report-replacement-prepare:${input.replacementId}`;
      const reviewId = `report-replacement-review:${input.replacementId}`;
      const prepareAudit = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=? AND organization_id=?",
      ).bind(prepareId, TECHFLEX_ORG_ID).first<{ actorUserId: string | null; afterJson: string }>();
      const prepared = safeJson<ReplacementPrepareSnapshot>(prepareAudit?.afterJson);
      if (!prepareAudit || !prepared) throw new PortalHttpError(404, "Prepared replacement not found.");
      if (prepareAudit.actorUserId === identity.userId)
        throw new PortalHttpError(403, "A different owner or operations administrator must release this replacement artifact.");
      const existingReview = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
      ).bind(reviewId).first<{ actorUserId: string | null; afterJson: string }>();
      if (existingReview) {
        const prior = safeJson<ReplacementReviewSnapshot>(existingReview.afterJson);
        if (existingReview.actorUserId === identity.userId && prior?.decision === input.decision && prior.reviewNotes === input.reviewNotes)
          return Response.json({ replacementId: input.replacementId, status: input.decision,
            attachmentId: prior.replacementAttachmentId, replayed: true });
        throw new PortalHttpError(409, "This replacement was already reviewed. Refresh the amendment history.");
      }
      const requestAudit = await env.DB.prepare("SELECT after_json AS afterJson FROM audit_logs WHERE id=? AND organization_id=?")
        .bind(`report-amendment-request:${prepared.requestId}`, TECHFLEX_ORG_ID).first<{ afterJson: string }>();
      const amendmentReviewAudit = await env.DB.prepare("SELECT after_json AS afterJson FROM audit_logs WHERE id=? AND organization_id=?")
        .bind(`report-amendment-review:${prepared.requestId}`, TECHFLEX_ORG_ID).first<{ afterJson: string }>();
      const amendment = safeJson<RequestSnapshot>(requestAudit?.afterJson);
      const amendmentReview = safeJson<ReviewSnapshot>(amendmentReviewAudit?.afterJson);
      if (!requestAudit || !amendmentReviewAudit || !amendment || !amendmentReview || amendmentReview.decision !== "approved" ||
          JSON.stringify(amendment.reportPdfSnapshot) !== JSON.stringify(prepared.reportPdfSnapshot))
        throw new PortalHttpError(409, "The approved addendum no longer matches this prepared replacement.");
      const report = await reportSource(prepared.reportId);
      if (!report || report.qaStatus !== "approved" || report.reportVersion !== prepared.reportVersion ||
          report.reportRecordVersion !== prepared.reportRecordVersion || report.reportPdfAttachmentId !== prepared.reportPdfAttachmentId ||
          JSON.stringify({ storageKey: report.pdfStorageKey, fileName: report.pdfFileName, sizeBytes: report.pdfSizeBytes,
            checksum: report.pdfChecksum, createdAt: report.pdfCreatedAt }) !== JSON.stringify(prepared.reportPdfSnapshot))
        throw new PortalHttpError(409, "The approved artifact changed. Refresh before reviewing its replacement.");
      const reviewedAt = new Date().toISOString();
      if (input.decision === "declined") {
        const declined: ReplacementReviewSnapshot = {
          replacementId: input.replacementId, requestId: prepared.requestId, reportId: prepared.reportId,
          decision: "declined", reviewNotes: input.reviewNotes, reviewedBy: identity.userId,
          reviewedByName: identity.displayName, reviewedAt, replacementAttachmentId: null,
          replacementStorageKey: null, replacementFileName: null, replacementSizeBytes: null,
          replacementChecksum: null, financialEffect: "none", originalArtifactChanged: false,
        };
        const inserted = await env.DB.prepare(
          `INSERT OR IGNORE INTO audit_logs
            (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,request_id)
           SELECT ?,?,?,'service_report.replacement_reviewed','service_report_replacement',?,?,?,?
            WHERE EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=?)
              AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=? AND json_extract(after_json,'$.decision')='approved')
              AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?)
              AND EXISTS(SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
                JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id AND pdf.organization_id=w.organization_id
                 AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
                WHERE sr.id=? AND w.organization_id=? AND sr.qa_status='approved'
                 AND sr.report_version=? AND sr.record_version=? AND sr.report_pdf_attachment_id=?
                 AND pdf.storage_key=? AND pdf.file_name=? AND pdf.size_bytes=? AND pdf.checksum IS ? AND pdf.created_at=?)`,
        ).bind(reviewId, TECHFLEX_ORG_ID, identity.userId, input.replacementId, prepareAudit.afterJson,
          JSON.stringify(declined), input.replacementId, prepareId, TECHFLEX_ORG_ID, prepareAudit.afterJson,
          `report-amendment-review:${prepared.requestId}`, TECHFLEX_ORG_ID, amendmentReviewAudit.afterJson, reviewId,
          prepared.reportId, TECHFLEX_ORG_ID, prepared.reportVersion, prepared.reportRecordVersion,
          prepared.reportPdfAttachmentId, prepared.reportPdfSnapshot.storageKey, prepared.reportPdfSnapshot.fileName,
          prepared.reportPdfSnapshot.sizeBytes, prepared.reportPdfSnapshot.checksum, prepared.reportPdfSnapshot.createdAt).run();
        if (!inserted.meta.changes) throw new PortalHttpError(409, "The replacement changed. Refresh before recording the decision.");
        return Response.json({ replacementId: input.replacementId, status: "declined" });
      }
      const original = await SupabaseBucket.get(prepared.reportPdfSnapshot.storageKey);
      if (!original) throw new PortalHttpError(409, "The exact original approved PDF is unavailable. Restore it before releasing a replacement.");
      const bytes = await generateSignedReportReplacementPdf({
        originalPdf: await original.arrayBuffer(), workOrderNumber: prepared.workOrderNumber,
        reportVersion: prepared.reportVersion, originalAttachmentId: prepared.reportPdfAttachmentId,
        amendmentRequestId: prepared.requestId, reason: prepared.reason,
        approvedCorrection: prepared.approvedCorrection, amendmentDecisionNotes: prepared.amendmentReviewNotes,
        preparedBy: prepared.preparedByName, preparedAt: prepared.preparedAt,
        releasedBy: identity.displayName, releasedAt: reviewedAt, releaseNotes: input.reviewNotes,
      });
      const replacementBytes = new Uint8Array(bytes);
      const checksum = await sha256(replacementBytes.buffer as ArrayBuffer);
      const attachmentId = `service-report-replacement:${input.replacementId}`;
      const storageKey = `techflex/work_orders/${safeFilePart(prepared.workOrderId)}/service_report_replacements/${input.replacementId}-${crypto.randomUUID()}.pdf`;
      const fileName = `TechFlex-WO-${safeFilePart(prepared.workOrderNumber)}-R${prepared.reportVersion}-Replacement-${input.replacementId.slice(0, 8)}.pdf`;
      const released: ReplacementReviewSnapshot = {
        replacementId: input.replacementId, requestId: prepared.requestId, reportId: prepared.reportId,
        decision: "approved", reviewNotes: input.reviewNotes, reviewedBy: identity.userId,
        reviewedByName: identity.displayName, reviewedAt, replacementAttachmentId: attachmentId,
        replacementStorageKey: storageKey, replacementFileName: fileName,
        replacementSizeBytes: replacementBytes.byteLength, replacementChecksum: checksum,
        financialEffect: "none", originalArtifactChanged: false,
      };
      await SupabaseBucket.put(storageKey, replacementBytes, { httpMetadata: { contentType: "application/pdf" } });
      try {
        await env.DB.batch([
          env.DB.prepare(
            `SELECT CASE WHEN
              EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=?)
              AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=?)
              AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=? AND json_extract(after_json,'$.decision')='approved')
              AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?)
              AND EXISTS(SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
                JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id AND pdf.organization_id=w.organization_id
                 AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
                WHERE sr.id=? AND w.organization_id=? AND sr.qa_status='approved'
                 AND sr.report_version=? AND sr.record_version=? AND sr.report_pdf_attachment_id=?
                 AND pdf.storage_key=? AND pdf.file_name=? AND pdf.size_bytes=? AND pdf.checksum IS ? AND pdf.created_at=?)
              THEN 1 ELSE json('replacement_release_conflict') END`,
          ).bind(prepareId, TECHFLEX_ORG_ID, prepareAudit.afterJson,
            `report-amendment-request:${prepared.requestId}`, TECHFLEX_ORG_ID, requestAudit.afterJson,
            `report-amendment-review:${prepared.requestId}`, TECHFLEX_ORG_ID, amendmentReviewAudit.afterJson, reviewId,
            prepared.reportId, TECHFLEX_ORG_ID, prepared.reportVersion, prepared.reportRecordVersion,
            prepared.reportPdfAttachmentId, prepared.reportPdfSnapshot.storageKey, prepared.reportPdfSnapshot.fileName,
            prepared.reportPdfSnapshot.sizeBytes, prepared.reportPdfSnapshot.checksum, prepared.reportPdfSnapshot.createdAt),
          env.DB.prepare(
            `INSERT INTO attachments
              (id,organization_id,entity_type,entity_id,storage_key,file_name,content_type,size_bytes,checksum,category,uploaded_by)
             VALUES (?,?,'work_order',?,?,?,'application/pdf',?,?,'service_report_replacement',?)`,
          ).bind(attachmentId, TECHFLEX_ORG_ID, prepared.workOrderId, storageKey, fileName,
            replacementBytes.byteLength, checksum, identity.userId),
          env.DB.prepare(
            `INSERT INTO audit_logs
              (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,request_id)
             VALUES (?,?,?,'service_report.replacement_reviewed','service_report_replacement',?,?,?,?)`,
          ).bind(reviewId, TECHFLEX_ORG_ID, identity.userId, input.replacementId,
            prepareAudit.afterJson, JSON.stringify(released), input.replacementId),
        ]);
      } catch (error) {
        const committed = await env.DB.prepare("SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?")
          .bind(reviewId).first<{ actorUserId: string | null; afterJson: string }>();
        const saved = safeJson<ReplacementReviewSnapshot>(committed?.afterJson);
        if (committed?.actorUserId === identity.userId && saved?.replacementStorageKey === storageKey)
          return Response.json({ replacementId: input.replacementId, status: "approved", attachmentId, replayed: true });
        try { await SupabaseBucket.delete(storageKey); } catch (cleanupError) { safeServerLog("attachment_cleanup", cleanupError); }
        safeServerLog("attachment_commit", error);
        throw new PortalHttpError(409, "The approved artifact or replacement decision changed. Refresh before releasing the replacement.");
      }
      return Response.json({ replacementId: input.replacementId, status: "approved", attachmentId });
    }

    if (identity.role !== "owner_administrator" && identity.role !== "operations_administrator")
      throw new PortalHttpError(403, "Owner or operations approval is required for a report addendum.");
    const requestId = input.requestId;
    const requestAudit = await env.DB.prepare(
      `SELECT actor_user_id AS actorUserId,after_json AS afterJson
         FROM audit_logs WHERE id=? AND organization_id=?
          AND action='service_report.amendment_requested'
          AND entity_type='service_report_amendment' AND entity_id=?`,
    ).bind(`report-amendment-request:${requestId}`, TECHFLEX_ORG_ID, requestId)
      .first<{ actorUserId: string | null; afterJson: string }>();
    const amendment = safeJson<RequestSnapshot>(requestAudit?.afterJson);
    if (!requestAudit || !amendment) throw new PortalHttpError(404, "Correction request not found.");
    if (requestAudit.actorUserId === identity.userId)
      throw new PortalHttpError(403, "A different owner or operations administrator must review this correction request.");
    const report = await reportSource(amendment.reportId);
    if (!report) throw new PortalHttpError(404, "Service report not found.");
    const review: ReviewSnapshot = {
      requestId,
      reportId: amendment.reportId,
      decision: input.decision,
      reviewNotes: input.reviewNotes,
      reviewedBy: identity.userId,
      reportVersion: amendment.reportVersion,
      reportPdfAttachmentId: amendment.reportPdfAttachmentId,
      originalArtifactChanged: false,
    };
    const reviewId = `report-amendment-review:${requestId}`;
    const existingReview = await env.DB.prepare(
      "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
    ).bind(reviewId).first<{ actorUserId: string | null; afterJson: string }>();
    if (existingReview) {
      if (existingReview.actorUserId === identity.userId && existingReview.afterJson === JSON.stringify(review))
        return Response.json({ requestId, status: input.decision, replayed: true });
      throw new PortalHttpError(409, "This correction request was already reviewed. Refresh the amendment history.");
    }
    if (report.qaStatus !== "approved" ||
        report.reportVersion !== amendment.reportVersion ||
        report.reportPdfAttachmentId !== amendment.reportPdfAttachmentId ||
        JSON.stringify({ storageKey: report.pdfStorageKey, fileName: report.pdfFileName, sizeBytes: report.pdfSizeBytes,
          checksum: report.pdfChecksum, createdAt: report.pdfCreatedAt }) !== JSON.stringify(amendment.reportPdfSnapshot))
      throw new PortalHttpError(409, "The approved artifact no longer matches this request. Refresh before reviewing it.");
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO audit_logs
        (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,request_id)
       SELECT ?,?,?,'service_report.amendment_reviewed','service_report_amendment',?,?,?,?
        WHERE EXISTS(
          SELECT 1 FROM audit_logs WHERE id=? AND organization_id=? AND after_json=?
        ) AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?)
          AND EXISTS(
            SELECT 1 FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id
             JOIN attachments pdf ON pdf.id=sr.report_pdf_attachment_id
              AND pdf.organization_id=w.organization_id AND pdf.entity_type='work_order' AND pdf.entity_id=w.id
             WHERE sr.id=? AND w.organization_id=? AND sr.qa_status='approved'
               AND sr.report_version=? AND sr.report_pdf_attachment_id=?
               AND pdf.storage_key=? AND pdf.file_name=? AND pdf.size_bytes=?
               AND pdf.checksum IS ? AND pdf.created_at=?
          )`,
    ).bind(reviewId, TECHFLEX_ORG_ID, identity.userId, requestId, requestAudit.afterJson, JSON.stringify(review), requestId,
      `report-amendment-request:${requestId}`, TECHFLEX_ORG_ID, requestAudit.afterJson, reviewId,
      amendment.reportId, TECHFLEX_ORG_ID, amendment.reportVersion, amendment.reportPdfAttachmentId,
      amendment.reportPdfSnapshot.storageKey, amendment.reportPdfSnapshot.fileName, amendment.reportPdfSnapshot.sizeBytes,
      amendment.reportPdfSnapshot.checksum, amendment.reportPdfSnapshot.createdAt).run();
    if (!inserted.meta.changes) {
      const concurrent = await env.DB.prepare(
        "SELECT actor_user_id AS actorUserId,after_json AS afterJson FROM audit_logs WHERE id=?",
      ).bind(reviewId).first<{ actorUserId: string | null; afterJson: string }>();
      if (concurrent?.actorUserId === identity.userId && concurrent.afterJson === JSON.stringify(review))
        return Response.json({ requestId, status: input.decision, replayed: true });
      throw new PortalHttpError(409, "The report amendment changed. Refresh the approved artifact and history.");
    }
    return Response.json({ requestId, status: input.decision });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Review the correction request details.", details: error.flatten() }, { status: 400 });
    return apiError(error);
  }
}
