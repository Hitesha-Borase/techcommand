import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  procedureBranch,
  procedureDocument,
  type ProcedureDocument,
} from "@/lib/asset-ai-procedure";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";

export const technicalTrack = z.enum(["biomedical", "dme_mobility"]);
export const revisionImpact = z.enum([
  "routine",
  "review_open_work",
  "stop_and_review_open_work",
]);
export const measurement = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().max(160).default(""),
    unit: z.string().trim().max(60).default(""),
    expectedMin: z.string().trim().max(80).nullable().default(null),
    expectedMax: z.string().trim().max(80).nullable().default(null),
    expectedText: z.string().trim().max(500).nullable().default(null),
    conditions: z.string().trim().max(1000).default(""),
    sourceLocator: z.string().trim().max(300).default(""),
    required: z.boolean().default(true),
    instrumentType: z.string().trim().max(160).default(""),
    instrumentRequired: z.boolean().default(false),
    calibrationRequired: z.boolean().default(false),
  })
  .strict();
export const governedStep = z
  .object({
    id: z.string().max(100).default(""),
    instruction: z.string().trim().max(4000).default(""),
    locator: z.string().trim().max(300).default(""),
    conditions: z.string().trim().max(2000).default(""),
    expectedResult: z.string().trim().max(2000).default(""),
    photoGuidance: z.string().trim().max(1000).default(""),
    photoRequired: z.boolean().default(false),
    branches: z.array(procedureBranch).max(4).default([]),
    measurements: z.array(measurement).max(30).default([]),
  })
  .strict();
export const technicalDraft = z
  .object({
    track: technicalTrack,
    familyId: z.string().trim().max(180).nullable().default(null),
    manufacturer: z.string().trim().max(160).default(""),
    model: z.string().trim().max(160).default(""),
    serialRange: z.string().trim().max(240).default(""),
    documentType: z.enum([
      "service_manual",
      "pm_procedure",
      "technical_bulletin",
      "safety_notice",
      "manufacturer_documentation",
      "regulatory_standard",
      "techflex_internal",
    ]),
    title: z.string().trim().max(240).default(""),
    sourceName: z.string().trim().max(240).default(""),
    sourceUrl: z.string().trim().max(2000).default(""),
    sourceRevision: z.string().trim().max(160).default(""),
    effectiveOn: z.string().date().nullable().default(null),
    verifiedOn: z.string().date().nullable().default(null),
    applicability: z.string().trim().max(2000).default(""),
    limitations: z
      .array(z.string().trim().min(1).max(1000))
      .max(30)
      .default([]),
    reviewBasis: z.string().trim().max(4000).default(""),
    feedbackIds: z.array(z.string().uuid()).max(20).default([]),
    rollbackRevisionId: z.string().uuid().nullable().default(null),
    revisionImpact: revisionImpact.default("routine"),
    revisionImpactNote: z.string().trim().max(2000).default(""),
    serviceType: z.string().trim().max(100).default(""),
    steps: z.array(governedStep).max(100).default([]),
  })
  .strict();
export type TechnicalDraft = z.infer<typeof technicalDraft>;

export function publicationProblems(d: TechnicalDraft) {
  const problems: string[] = [];
  if (!d.manufacturer || !d.model)
    problems.push("Record the exact manufacturer and model.");
  if (!d.title || !d.sourceName)
    problems.push("Record the source title and source name.");
  try {
    const u = new URL(d.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password)
      problems.push("Use the exact public HTTPS source URL.");
  } catch {
    problems.push("Use the exact public HTTPS source URL.");
  }
  if (!d.verifiedOn)
    problems.push("Record when the source was actually verified.");
  if (((d.feedbackIds || []).length || d.rollbackRevisionId) && !d.effectiveOn)
    problems.push(
      d.rollbackRevisionId
        ? "Record the effective date for the new forward rollback revision."
        : "Record the effective date for a feedback-driven revision.",
    );
  if (!d.applicability || d.reviewBasis.length < 10)
    problems.push("Record applicability and the technical review basis.");
  if (
    (d.revisionImpact ?? "routine") !== "routine" &&
    (d.revisionImpactNote ?? "").length < 10
  )
    problems.push(
      "Explain the source-backed reason open work must be reviewed for this revision.",
    );
  if (!d.serviceType || !d.steps.length)
    problems.push(
      "Add an applicable service type and at least one sourced workflow step.",
    );
  if (new Set(d.steps.map((s) => s.id)).size !== d.steps.length)
    problems.push("Every workflow step needs a unique ID.");
  for (const [index, s] of d.steps.entries()) {
    const label = s.id || String(index + 1);
    if (!s.id || s.instruction.length < 3 || !s.locator || !s.expectedResult)
      problems.push(
        `Step ${label}: add the instruction, source locator and source acceptance criteria.`,
      );
    if (s.photoRequired && !s.photoGuidance)
      problems.push(
        `Step ${label}: describe the source-backed photo evidence that is required.`,
      );
    if (new Set(s.branches.map((b) => b.outcome)).size !== s.branches.length)
      problems.push(
        `Step ${label}: each branch outcome may be configured only once.`,
      );
    for (const branch of s.branches) {
      const target = d.steps.findIndex((item) => item.id === branch.nextStepId);
      if (target <= index)
        problems.push(
          `Step ${label}: every branch must point forward to a later step in this revision.`,
        );
    }
    if (
      new Set(s.measurements.map((m) => m.name.trim().toLowerCase())).size !==
      s.measurements.length
    )
      problems.push(`Step ${label}: measurement names must be unique.`);
    for (const m of s.measurements) {
      if (
        !m.name ||
        !m.unit ||
        !m.sourceLocator ||
        (m.expectedMin === null && m.expectedMax === null && !m.expectedText)
      )
        problems.push(
          `Step ${label}: every measurement needs a name, unit, source locator and source-backed acceptance criteria.`,
        );
      if ((m.instrumentRequired || m.calibrationRequired) && !m.instrumentType)
        problems.push(`Step ${label}: name the required test-instrument type.`);
      if (m.calibrationRequired && !m.instrumentRequired)
        problems.push(
          `Step ${label}: calibration evidence can only be required when an instrument is required.`,
        );
    }
  }
  return [...new Set(problems)];
}

type GovernedRow = {
  revisionId: string;
  currentRevisionId: string;
  publishedAt: string;
  documentSnapshotJson: string;
  sourceUrl: string;
  sourceRevision: string;
  applicability: string;
  limitationsJson: string;
  stepsJson: string;
};
function procedureFromRow(row: GovernedRow) {
  const identity = JSON.parse(row.documentSnapshotJson) as Pick<
    TechnicalDraft,
    "manufacturer" | "model" | "title"
  >;
  const steps = (JSON.parse(row.stepsJson) as TechnicalDraft["steps"]).map(
    (s) => ({ ...s, sourceUrl: row.sourceUrl }),
  );
  return procedureDocument.parse({
    manufacturer: identity.manufacturer,
    model: identity.model,
    title: identity.title,
    sourceUrl: row.sourceUrl,
    support: null,
    revision: row.sourceRevision,
    applicability: row.applicability,
    limitations: JSON.parse(row.limitationsJson),
    steps,
  });
}
export async function governedProcedure(
  manufacturer: string,
  model: string,
  track: "biomedical" | "dme_mobility",
  serviceType: string,
): Promise<{
  id: string;
  isCurrent: boolean;
  document: ProcedureDocument;
  updatedAt: string;
} | null> {
  const row = await env.DB.prepare(
    `SELECT r.id AS revisionId,d.current_revision_id AS currentRevisionId,r.published_at AS publishedAt,r.document_snapshot_json AS documentSnapshotJson,r.source_url AS sourceUrl,r.source_revision AS sourceRevision,r.applicability,r.limitations_json AS limitationsJson,t.steps_json AS stepsJson FROM technical_documents d JOIN technical_document_revisions r ON r.id=d.current_revision_id JOIN technical_workflow_templates t ON t.revision_id=r.id WHERE d.organization_id=? AND d.track=? AND d.status='published' AND lower(trim(d.manufacturer))=lower(trim(?)) AND lower(trim(d.model))=lower(trim(?)) AND t.service_type=? ORDER BY r.revision_number DESC LIMIT 1`,
  )
    .bind(TECHFLEX_ORG_ID, track, manufacturer, model, serviceType)
    .first<GovernedRow>();
  return row
    ? {
        id: row.revisionId,
        isCurrent: row.currentRevisionId === row.revisionId,
        document: procedureFromRow(row),
        updatedAt: row.publishedAt,
      }
    : null;
}

export async function governedProcedureByRevision(revisionId: string) {
  const row = await env.DB.prepare(
    `SELECT r.id AS revisionId,d.current_revision_id AS currentRevisionId,r.published_at AS publishedAt,r.document_snapshot_json AS documentSnapshotJson,r.source_url AS sourceUrl,r.source_revision AS sourceRevision,r.applicability,r.limitations_json AS limitationsJson,t.steps_json AS stepsJson FROM technical_document_revisions r JOIN technical_documents d ON d.id=r.document_id JOIN technical_workflow_templates t ON t.revision_id=r.id WHERE d.organization_id=? AND r.id=? LIMIT 1`,
  )
    .bind(TECHFLEX_ORG_ID, revisionId)
    .first<GovernedRow>();
  return row
    ? {
        id: row.revisionId,
        isCurrent: row.currentRevisionId === row.revisionId,
        updatedAt: row.publishedAt,
        document: procedureFromRow(row),
      }
    : null;
}

export async function governedReferenceCandidates(
  manufacturer: string,
  model: string,
  track: "biomedical" | "dme_mobility",
  serviceType: string,
) {
  const found = await governedProcedure(
    manufacturer,
    model,
    track,
    serviceType,
  );
  return found
    ? [
        {
          title: found.document.title,
          sourceUrl: found.document.sourceUrl,
          steps: JSON.stringify(found.document.steps),
        },
      ]
    : [];
}
