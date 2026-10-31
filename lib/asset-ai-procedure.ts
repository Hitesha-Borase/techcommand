import { z } from "zod";
export const procedureMeasurementRequirement = z
  .object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    unit: z.string().min(1).max(60),
    expectedMin: z.string().max(80).nullable().default(null),
    expectedMax: z.string().max(80).nullable().default(null),
    expectedText: z.string().max(500).nullable().default(null),
    conditions: z.string().max(1000).default(""),
    sourceLocator: z.string().min(1).max(300),
    required: z.boolean().default(true),
    instrumentType: z.string().max(160).default(""),
    instrumentRequired: z.boolean().default(false),
    calibrationRequired: z.boolean().default(false),
  })
  .strict();
export const procedureOutcome = z.enum([
  "not_evaluated",
  "meets_reference",
  "outside_reference",
  "not_applicable",
  "deferred",
]);
export const procedureBranch = z
  .object({
    outcome: procedureOutcome.exclude(["not_evaluated"]),
    nextStepId: z.string().min(1).max(100),
    instruction: z.string().min(3).max(1000),
    sourceLocator: z.string().min(1).max(300),
  })
  .strict();
export const procedureStep = z
  .object({
    id: z.string().min(1).max(100),
    instruction: z.string().min(1).max(4000),
    sourceUrl: z.string().url(),
    locator: z.string().min(1).max(300),
    conditions: z.string().max(2000),
    expectedResult: z.string().max(2000),
    photoGuidance: z.string().max(1000).default(""),
    photoRequired: z.boolean().default(false),
    branches: z.array(procedureBranch).max(4).default([]),
    measurements: z.array(procedureMeasurementRequirement).max(30).default([]),
  })
  .strict();
export const procedureDocument = z
  .object({
    manufacturer: z.string(),
    model: z.string(),
    title: z.string(),
    sourceUrl: z.string(),
    support: z
      .object({
        phone: z.string().max(60),
        sourceUrl: z.string().url(),
        label: z.string().max(240),
      })
      .nullable()
      .optional(),
    revision: z.string(),
    applicability: z.string(),
    limitations: z.array(z.string()),
    steps: z.array(procedureStep).max(100),
  })
  .strict();
export type ProcedureDocument = z.infer<typeof procedureDocument>;
export const procedureInstrument = z
  .object({
    type: z.string().trim().max(160).default(""),
    manufacturer: z.string().trim().max(160).default(""),
    model: z.string().trim().max(160).default(""),
    serialNumber: z.string().trim().max(160).default(""),
    calibrationStatus: z
      .enum(["current", "expired", "unknown", "not_required"])
      .default("unknown"),
    calibrationCheckedOn: z.string().date().nullable().default(null),
    calibrationDueOn: z.string().date().nullable().default(null),
    certificateReference: z.string().trim().max(300).default(""),
  })
  .strict();
export const procedureMeasurementEvidence = z
  .object({
    requirementId: z.string().min(1).max(160),
    recordedValue: z.string().trim().max(240).default(""),
    unit: z.string().trim().max(60).default(""),
    conditions: z.string().trim().max(1000).default(""),
    assessment: z
      .enum([
        "not_evaluated",
        "meets_reference",
        "outside_reference",
        "not_applicable",
      ])
      .default("not_evaluated"),
    notes: z.string().trim().max(1000).default(""),
    instrument: procedureInstrument.nullable().default(null),
    recordedAt: z.string().datetime().nullable().optional(),
    recordedBy: z.string().trim().max(160).nullable().optional(),
  })
  .strict();
export const procedureAnswer = z
  .object({
    stepId: z.string().min(1).max(100),
    status: z.enum(["not_started", "done", "not_applicable", "deferred"]),
    outcome: procedureOutcome.default("not_evaluated"),
    result: z.string().max(5000),
    photoAttachmentIds: z.array(z.string().uuid()).max(20).default([]),
    photoCaptions: z
      .record(z.string().uuid(), z.string().trim().max(240))
      .default({}),
    measurements: z.array(procedureMeasurementEvidence).max(30).default([]),
  })
  .strict();
export type ProcedureAnswer = z.infer<typeof procedureAnswer>;
type MeasurementEvidence = ProcedureAnswer["measurements"][number];
export type ProcedureSnapshot = {
  id: string;
  document: ProcedureDocument;
  retrievedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
const procedureSnapshot = z
  .object({
    id: z.string(),
    document: procedureDocument,
    retrievedAt: z.string(),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
  })
  .strict();
export function readProcedure(
  value: string | null | undefined,
): ProcedureSnapshot | null {
  if (!value) return null;
  try {
    return procedureSnapshot.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
export function readAnswers(
  value: string | null | undefined,
): ProcedureAnswer[] {
  if (!value) return [];
  try {
    return z.array(procedureAnswer).parse(JSON.parse(value));
  } catch {
    return [];
  }
}
export function procedurePath(
  snapshot: ProcedureSnapshot | null,
  answers: ProcedureAnswer[],
) {
  if (!snapshot) return [];
  const steps = snapshot.document.steps,
    path: typeof steps = [];
  let index = 0;
  const visited = new Set<string>();
  while (index < steps.length) {
    const step = steps[index];
    if (visited.has(step.id)) break;
    visited.add(step.id);
    path.push(step);
    const answer = answers.find((a) => a.stepId === step.id);
    const branch =
      answer && answer.outcome !== "not_evaluated"
        ? step.branches.find((b) => b.outcome === answer.outcome)
        : null;
    if (branch) {
      const target = steps.findIndex((s) => s.id === branch.nextStepId);
      if (target > index) {
        index = target;
        continue;
      }
    }
    index += 1;
  }
  return path;
}
const measurementFacts = (evidence: MeasurementEvidence) => ({
  requirementId: evidence.requirementId,
  recordedValue: evidence.recordedValue,
  unit: evidence.unit,
  conditions: evidence.conditions,
  assessment: evidence.assessment,
  notes: evidence.notes,
  instrument: evidence.instrument,
});
const hasMeasurementFacts = (evidence: MeasurementEvidence) =>
  Boolean(
    evidence.recordedValue ||
      evidence.conditions ||
      evidence.notes ||
      evidence.assessment !== "not_evaluated" ||
      (evidence.instrument &&
        Object.values(evidence.instrument).some(
          (value) => value !== "" && value !== null && value !== "unknown",
        )),
  );
export function stampProcedureMeasurements(
  previous: ProcedureAnswer[],
  next: ProcedureAnswer[],
  actorUserId: string,
  recordedAt: string,
): ProcedureAnswer[] {
  const exactTime = z.string().datetime().parse(recordedAt);
  return next.map((answer) => {
    const previousAnswer = previous.find((item) => item.stepId === answer.stepId);
    return {
      ...answer,
      measurements: answer.measurements.map((evidence) => {
        const old = previousAnswer?.measurements.find(
          (item) => item.requirementId === evidence.requirementId,
        );
        if (!hasMeasurementFacts(evidence))
          return { ...evidence, recordedAt: null, recordedBy: null };
        if (
          old &&
          JSON.stringify(measurementFacts(old)) ===
            JSON.stringify(measurementFacts(evidence)) &&
          old.recordedAt &&
          old.recordedBy
        )
          return {
            ...evidence,
            recordedAt: old.recordedAt,
            recordedBy: old.recordedBy,
          };
        return { ...evidence, recordedAt: exactTime, recordedBy: actorUserId };
      }),
    };
  });
}
const numericValue = (value: string | null) => {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export function procedureMeasurementContradiction(
  requirement: z.infer<typeof procedureMeasurementRequirement>,
  evidence: MeasurementEvidence | undefined,
): string | null {
  if (
    !evidence ||
    !["meets_reference", "outside_reference"].includes(evidence.assessment)
  )
    return null;
  const actual = numericValue(evidence.recordedValue),
    minimum = numericValue(requirement.expectedMin),
    maximum = numericValue(requirement.expectedMax);
  if (actual === null || (minimum === null && maximum === null)) return null;
  const within =
    (minimum === null || actual >= minimum) &&
    (maximum === null || actual <= maximum);
  if (
    (within && evidence.assessment === "outside_reference") ||
    (!within && evidence.assessment === "meets_reference")
  )
    return `Review needed: the actual ${requirement.name} reading conflicts with the selected comparison. TechCommand did not change the technician's selection.`;
  return null;
}
export function procedureContradictions(
  snapshot: ProcedureSnapshot | null,
  answers: ProcedureAnswer[],
) {
  if (!snapshot) return [];
  return procedurePath(snapshot, answers).flatMap((step) => {
    const answer = answers.find((item) => item.stepId === step.id);
    return step.measurements.flatMap((requirement) => {
      const problem = procedureMeasurementContradiction(
        requirement,
        answer?.measurements.find(
          (evidence) => evidence.requirementId === requirement.id,
        ),
      );
      return problem ? [`Step ${step.id}: ${problem}`] : [];
    });
  });
}
export function procedureProblems(
  snapshot: ProcedureSnapshot | null,
  answers: ProcedureAnswer[],
): string[] {
  if (!snapshot) return [];
  const problems: string[] = [];
  if (!snapshot.id.startsWith("cataloging-v1:") && !snapshot.reviewedAt)
    problems.push(
      "Review the source and confirm this procedure applies to the unit.",
    );
  for (const step of procedurePath(snapshot, answers)) {
    const answer = answers.find((a) => a.stepId === step.id);
    if (
      !answer ||
      !["done", "not_applicable"].includes(answer.status) ||
      answer.result.trim().length < 3
    ) {
      problems.push(
        `Step ${step.id}: record the result or explain N/A. Save for later if unfinished.`,
      );
      continue;
    }
    if (step.branches.length && answer.outcome === "not_evaluated")
      problems.push(
        `Step ${step.id}: choose the actual outcome so the reviewed procedure can select the next step.`,
      );
    if (step.photoRequired && !answer.photoAttachmentIds.length)
      problems.push(
        `Step ${step.id}: attach the required photo evidence to this exact step.`,
      );
    if (
      answer.status === "done" &&
      (answer.photoAttachmentIds || []).some(
        (id) => !answer.photoCaptions?.[id]?.trim(),
      )
    )
      problems.push(
        `Step ${step.id}: caption each attached photo with the actual evidence shown for this asset.`,
      );
    if (answer.status === "not_applicable") continue;
    for (const requirement of step.measurements.filter(
      (item) => item.required,
    )) {
      const evidence = answer.measurements.find(
        (item) => item.requirementId === requirement.id,
      );
      if (
        !evidence?.recordedValue ||
        evidence.unit !== requirement.unit ||
        evidence.assessment === "not_evaluated" ||
        evidence.assessment === "not_applicable"
      ) {
        problems.push(
          `Step ${step.id}: record ${requirement.name} in ${requirement.unit} and compare it with the cited criteria.`,
        );
        continue;
      }
      if (
        requirement.instrumentRequired &&
        (!evidence.instrument?.type || !evidence.instrument.serialNumber)
      )
        problems.push(
          `Step ${step.id}: record the ${requirement.instrumentType || "test instrument"} identity and serial number for ${requirement.name}.`,
        );
      if (
        requirement.calibrationRequired &&
        (evidence.instrument?.calibrationStatus !== "current" ||
          !evidence.instrument.calibrationCheckedOn ||
          !evidence.instrument.calibrationDueOn ||
          evidence.instrument.calibrationDueOn <
            evidence.instrument.calibrationCheckedOn)
      )
        problems.push(
          `Step ${step.id}: record current calibration status, the date checked and a valid due date for ${requirement.name}.`,
        );
    }
  }
  problems.push(...procedureContradictions(snapshot, answers));
  return problems;
}
export function procedureText(
  snapshot: ProcedureSnapshot | null,
  answers: ProcedureAnswer[],
) {
  if (!snapshot)
    return "No manufacturer procedure attached. Model-specific protocol completion is not established.";
  return [
    `${snapshot.document.title} | ${snapshot.document.sourceUrl} | Revision: ${snapshot.document.revision || "not identified"}`,
    snapshot.id.startsWith("cataloging-v1:")
      ? "Inventory documentation checklist only. No manufacturer test or safety approval is implied."
      : `Retrieved ${snapshot.retrievedAt}. Applicability ${snapshot.reviewedAt ? `reviewed ${snapshot.reviewedAt}` : "NOT reviewed"}.`,
    ...snapshot.document.limitations.map((x) => `Limitation: ${x}`),
    ...procedurePath(snapshot, answers).map((s) => {
      const a = answers.find((a) => a.stepId === s.id);
      const measurements = s.measurements.map((m) => {
        const e = a?.measurements.find((x) => x.requirementId === m.id);
        const instrument = e?.instrument
          ? ` Instrument: ${[e.instrument.type, e.instrument.manufacturer, e.instrument.model, e.instrument.serialNumber].filter(Boolean).join(" / ")}; calibration ${e.instrument.calibrationStatus}, checked ${e.instrument.calibrationCheckedOn || "not recorded"}, due ${e.instrument.calibrationDueOn || "not recorded"}, certificate ${e.instrument.certificateReference || "not recorded"}.`
          : "";
        const provenance = ` Recorded ${e?.recordedAt || "time not recorded"} by ${e?.recordedBy || "recorder not recorded"}.`;
        const contradiction = procedureMeasurementContradiction(m, e);
        return `${m.name}: ${e?.recordedValue || "not recorded"} ${e?.unit || m.unit}; assessment ${e?.assessment.replaceAll("_", " ") || "not evaluated"}; conditions ${e?.conditions || "not recorded"}.${instrument}${provenance}${contradiction ? ` CONTRADICTION — ${contradiction}` : ""}`;
      });
      const photos =
        (a?.photoAttachmentIds || [])
          .map(
            (id) =>
              `${id}: ${a?.photoCaptions?.[id]?.trim() || "caption not recorded"}`,
          )
          .join("; ") || "none recorded";
      return `Step ${s.id}: ${s.instruction}\nReference: ${s.sourceUrl} (${s.locator})\nRequired conditions: ${s.conditions || "See source"}\nReference criteria (not an observed result): ${s.expectedResult || "See source"}\nRecorded: ${a?.status.replaceAll("_", " ") || "not started"}; outcome ${a?.outcome?.replaceAll("_", " ") || "not evaluated"} — ${a?.result || "No result recorded"}\nStep photo evidence: ${photos}${measurements.length ? `\nMeasurements:\n${measurements.join("\n")}` : ""}`;
    }),
  ].join("\n\n");
}

export function procedurePhotoEvidence(
  snapshot: ProcedureSnapshot | null,
  answers: ProcedureAnswer[],
) {
  if (!snapshot) return [];
  const found = new Set<string>();
  return procedurePath(snapshot, answers).flatMap((step) => {
    const answer = answers.find((item) => item.stepId === step.id);
    return (answer?.photoAttachmentIds || []).flatMap((id) => {
      if (found.has(id)) return [];
      found.add(id);
      return [{
        id,
        stepId: step.id,
        caption: answer?.photoCaptions?.[id]?.trim() || "Caption not recorded",
      }];
    });
  });
}
export function checkedResearch(
  document: ProcedureDocument,
  manufacturer: string,
  model: string,
  sources: string[],
) {
  document = procedureDocument.parse(document);
  const normalize = (s: string) => s.trim().toLowerCase();
  if (
    normalize(document.manufacturer) !== normalize(manufacturer) ||
    normalize(document.model) !== normalize(model)
  )
    throw new Error(
      "The retrieved manual did not match this unit. Continue saving observations while the reference is resolved.",
    );
  const allowed = new Set(
    sources.filter((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }),
  );
  if (
    document.steps.length &&
    (!allowed.has(document.sourceUrl) ||
      document.steps.some((s) => !allowed.has(s.sourceUrl)))
  )
    throw new Error(
      "The procedure cited a source that was not retrieved. No procedure was applied.",
    );
  if (
    document.support &&
    (!allowed.has(document.support.sourceUrl) ||
      !/^\+?[0-9 () .-]{7,60}$/.test(document.support.phone))
  )
    throw new Error(
      "Manufacturer support contact was not verified in the retrieved source.",
    );
  if (new Set(document.steps.map((s) => s.id)).size !== document.steps.length)
    throw new Error(
      "The procedure contained duplicate steps. No procedure was applied.",
    );
  for(const [index,step] of document.steps.entries()){
    if(new Set(step.branches.map(branch=>branch.outcome)).size!==step.branches.length)throw new Error("The procedure contained conflicting outcome branches. No procedure was applied.");
    if(step.branches.some(branch=>document.steps.findIndex(candidate=>candidate.id===branch.nextStepId)<=index))throw new Error("The procedure contained a backward or unknown outcome branch. No procedure was applied.");
  }
  return document;
}
