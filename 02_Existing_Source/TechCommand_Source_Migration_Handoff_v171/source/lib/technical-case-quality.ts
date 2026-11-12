export type CaseRate = {
  numerator: number;
  denominator: number;
  percent: number | null;
};

export type CaseQualityCounts = {
  totalCases: number;
  openCases: number;
  evaluatedCases: number;
  acceptedCases: number;
  implementedCases: number;
  declinedCases: number;
  decisionBasisCases: number;
  contradictionEvaluatedCases: number;
  contradictionAcceptedCases: number;
  workLinkedCases: number;
  sourceLinkedCases: number;
};

export type CaseModelGroup = {
  manufacturer: string;
  model: string;
  totalCases: number;
  openCases: number;
  evaluatedCases: number;
  acceptedCases: number;
  implementedCases: number;
};

const count = (value: unknown) => Number(value || 0);
const rate = (numerator: number, denominator: number): CaseRate => ({
  numerator,
  denominator,
  percent: denominator ? Math.round((numerator / denominator) * 100) : null,
});

export function technicalCaseQuality(
  raw: Partial<Record<keyof CaseQualityCounts, unknown>> | null,
  groups: Array<Partial<Record<keyof CaseModelGroup, unknown>>> = [],
) {
  const counts: CaseQualityCounts = {
    totalCases: count(raw?.totalCases),
    openCases: count(raw?.openCases),
    evaluatedCases: count(raw?.evaluatedCases),
    acceptedCases: count(raw?.acceptedCases),
    implementedCases: count(raw?.implementedCases),
    declinedCases: count(raw?.declinedCases),
    decisionBasisCases: count(raw?.decisionBasisCases),
    contradictionEvaluatedCases: count(raw?.contradictionEvaluatedCases),
    contradictionAcceptedCases: count(raw?.contradictionAcceptedCases),
    workLinkedCases: count(raw?.workLinkedCases),
    sourceLinkedCases: count(raw?.sourceLinkedCases),
  };
  return {
    ...counts,
    evaluationCoverage: rate(counts.evaluatedCases, counts.totalCases),
    acceptedForRevision: rate(counts.acceptedCases, counts.evaluatedCases),
    implementationCoverage: rate(
      counts.implementedCases,
      counts.acceptedCases,
    ),
    documentedDecisionBasis: rate(
      counts.decisionBasisCases,
      counts.evaluatedCases,
    ),
    contradictionsAcceptedForRevision: rate(
      counts.contradictionAcceptedCases,
      counts.contradictionEvaluatedCases,
    ),
    groups: groups.map((group) => ({
      manufacturer: String(group.manufacturer || ""),
      model: String(group.model || ""),
      totalCases: count(group.totalCases),
      openCases: count(group.openCases),
      evaluatedCases: count(group.evaluatedCases),
      acceptedCases: count(group.acceptedCases),
      implementedCases: count(group.implementedCases),
    })),
  };
}
