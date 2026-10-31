export const PROBLEM_REPORT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type ProblemReportDraft = {
  id: string;
  module: string;
  category: string;
  referenceId: string;
  summary: string;
  steps: string;
  expected: string;
  actual: string;
  errorMessage: string;
  privacyConfirmed: boolean;
  savedAt: number;
};

export function problemReportStorageKey(reporterId: string) {
  return `techcommand:problem-report:${reporterId}`;
}

export function readProblemReportDraft(raw: string | null, now = Date.now()): ProblemReportDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProblemReportDraft>;
    if (typeof value.id !== "string" || typeof value.module !== "string" || typeof value.savedAt !== "number") return null;
    if (now - value.savedAt >= PROBLEM_REPORT_DRAFT_TTL_MS || value.savedAt > now + 5 * 60 * 1000) return null;
    const strings = ["category", "summary", "steps", "expected", "actual", "errorMessage"] as const;
    if (strings.some((field) => typeof value[field] !== "string") || typeof value.privacyConfirmed !== "boolean") return null;
    if (value.referenceId !== undefined && typeof value.referenceId !== "string") return null;
    return { ...value, referenceId: value.referenceId || "" } as ProblemReportDraft;
  } catch { return null; }
}

export function problemReportHasContent(draft: ProblemReportDraft) {
  return Boolean(draft.referenceId || draft.summary || draft.steps || draft.expected || draft.actual || draft.errorMessage);
}
