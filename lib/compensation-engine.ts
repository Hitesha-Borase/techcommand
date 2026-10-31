export const COMPENSATION_CAP_CENTS = 4000;
export const STARTING_RATE_CENTS = 2200;

export type CompensationMetrics = {
  tenureDays: number;
  approvedJobs: number;
  qaPassRate: number;
  qaPassStreak: number;
  competencyScore: number;
  soloGraduates: number;
  ceuCurrent: boolean;
  credentialsCurrent: boolean;
  reviewedJobs90Days?: number;
};

export type CompensationTier = {
  key: string;
  name: string;
  rateCents: number;
  tenureDays: number;
  approvedJobs: number;
  competencyScore: number;
  qaPassRate: number;
  qaPassStreak: number;
  soloGraduates: number;
};

export const compensationTiers: CompensationTier[] = [
  { key: "apprentice", name: "Apprentice", rateCents: 2200, tenureDays: 0, approvedJobs: 0, competencyScore: 0, qaPassRate: 0, qaPassStreak: 0, soloGraduates: 0 },
  { key: "field_tech_1", name: "Field Technician I", rateCents: 2500, tenureDays: 30, approvedJobs: 10, competencyScore: 80, qaPassRate: 80, qaPassStreak: 3, soloGraduates: 0 },
  { key: "field_tech_2", name: "Field Technician II", rateCents: 3000, tenureDays: 90, approvedJobs: 30, competencyScore: 88, qaPassRate: 90, qaPassStreak: 8, soloGraduates: 0 },
  { key: "senior", name: "Senior Technician", rateCents: 3500, tenureDays: 180, approvedJobs: 75, competencyScore: 92, qaPassRate: 95, qaPassStreak: 15, soloGraduates: 1 },
  { key: "lead", name: "Lead / Mentor", rateCents: 3800, tenureDays: 365, approvedJobs: 150, competencyScore: 95, qaPassRate: 96, qaPassStreak: 20, soloGraduates: 2 },
  { key: "regional_master", name: "Regional Master", rateCents: 4000, tenureDays: 730, approvedJobs: 250, competencyScore: 97, qaPassRate: 97, qaPassStreak: 25, soloGraduates: 4 },
];

function meetsPerformance(metrics: CompensationMetrics, tier: CompensationTier) {
  return metrics.approvedJobs >= tier.approvedJobs &&
    metrics.competencyScore >= tier.competencyScore &&
    metrics.qaPassRate >= tier.qaPassRate &&
    metrics.qaPassStreak >= tier.qaPassStreak &&
    metrics.soloGraduates >= tier.soloGraduates &&
    metrics.ceuCurrent && metrics.credentialsCurrent;
}

export function evaluateCompensation(metrics: CompensationMetrics, currentRateCents: number) {
  let earned = compensationTiers[0];
  let fastTracked = false;
  for (const tier of compensationTiers) {
    const normalTenure = metrics.tenureDays >= tier.tenureDays;
    const fastTenure = metrics.tenureDays >= Math.ceil(tier.tenureDays / 2);
    const stretchPerformance = metrics.competencyScore >= Math.max(95, tier.competencyScore) &&
      metrics.qaPassRate >= Math.max(96, tier.qaPassRate) &&
      metrics.qaPassStreak >= Math.max(10, tier.qaPassStreak);
    if (meetsPerformance(metrics, tier) && (normalTenure || (fastTenure && stretchPerformance))) {
      earned = tier;
      fastTracked = !normalTenure && tier.tenureDays > 0;
    }
  }
  const currentTier = compensationTiers.findLast((tier) => tier.rateCents <= currentRateCents) || compensationTiers[0];
  const currentTierIndex = compensationTiers.indexOf(currentTier);
  const next = compensationTiers[currentTierIndex + 1] || null;
  const blockers: string[] = [];
  if (!metrics.credentialsCurrent) blockers.push("Current credential evidence required for career-ladder review");
  if (!metrics.ceuCurrent) blockers.push("CEU evidence incomplete or overdue for career-ladder review");
  if (next) {
    if (metrics.tenureDays < Math.ceil(next.tenureDays / 2)) blockers.push(`${Math.ceil(next.tenureDays / 2) - metrics.tenureDays} days until fast-track tenure eligibility`);
    if (metrics.approvedJobs < next.approvedJobs) blockers.push(`${next.approvedJobs - metrics.approvedJobs} more QA-approved jobs`);
    if (metrics.competencyScore < next.competencyScore) blockers.push(`${next.competencyScore}% competency required`);
    if (metrics.qaPassRate < next.qaPassRate) blockers.push(`${next.qaPassRate}% QA pass rate required`);
    if (metrics.qaPassStreak < next.qaPassStreak) blockers.push(`${next.qaPassStreak - metrics.qaPassStreak} more consecutive QA approvals`);
    if (metrics.soloGraduates < next.soloGraduates) blockers.push(`${next.soloGraduates - metrics.soloGraduates} more technician${next.soloGraduates - metrics.soloGraduates === 1 ? "" : "s"} trained to solo readiness`);
  }
  const maintenanceFloor = currentTier;
  const enoughRecentEvidence = (metrics.reviewedJobs90Days ?? metrics.approvedJobs) >= 5;
  const maintaining = !enoughRecentEvidence || meetsPerformance(metrics, {
    ...maintenanceFloor,
    qaPassStreak: Math.min(5, maintenanceFloor.qaPassStreak),
    approvedJobs: 0,
    tenureDays: 0,
    soloGraduates: 0,
  });
  return {
    earnedTier: earned,
    recommendedRateCents: Math.min(COMPENSATION_CAP_CENTS, Math.max(currentRateCents, earned.rateCents)),
    fastTracked,
    nextTier: next,
    blockers,
    maintenanceStatus: !enoughRecentEvidence ? "building" as const : maintaining ? "maintaining" as const : "review_required" as const,
  };
}

export function marginProjection(revenueCents: number, directCostCents: number, addedPayrollCents: number) {
  const projectedCostCents = directCostCents + Math.max(0, addedPayrollCents);
  const marginBps = revenueCents > 0 ? Math.floor(((revenueCents - projectedCostCents) / revenueCents) * 10000) : 0;
  const requiredRevenueCents = Math.ceil(projectedCostCents / 0.6);
  return {
    projectedCostCents,
    marginBps,
    clearsFloor: revenueCents > 0 && marginBps >= 4000,
    requiredRevenueCents,
    counterofferGapCents: Math.max(0, requiredRevenueCents - revenueCents),
  };
}
