import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import {
  compensationTiers,
  evaluateCompensation,
  marginProjection,
} from "@/lib/compensation-engine";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_rate"),
    technicianId: z.string().min(1),
  }),
  z.object({
    action: z.literal("update_ceu"),
    technicianId: z.string().min(1),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requiredHours: z.number().min(0).max(500),
    completedHours: z.number().min(0).max(500),
  }),
  z.object({
    action: z.literal("assign_mentor"),
    mentorTechnicianId: z.string().min(1),
    menteeTechnicianId: z.string().min(1),
  }),
  z.object({ action: z.literal("mark_solo"), mentorshipId: z.string().min(1) }),
]);

type TechnicianRow = {
  id: string;
  name: string;
  technicianCode: string;
  createdAt: string;
  hireDate: string | null;
  employmentType: string;
  payoutType: string;
  payoutRate: number;
  currentHourlyRateCents: number;
  protectedRateCents: number;
  compensationTier: string;
  rateStatus: string;
  competencyScore: number;
  qaPassStreak: number;
  guidedJobsCompleted: number;
  ceuDueOn: string | null;
  ceuHoursRequired: number;
  ceuHoursCompleted: number;
  approvedJobs: number;
  approvedJobs90Days: number;
  returnedJobs90Days: number;
  currentCredentials: number;
  expiredCredentials: number;
  soloGraduates: number;
  approvedHoursThisMonth: number;
};

async function loadDashboard(technicianId: string | null) {
  const [techniciansResult, financeResult, mentorshipResult] =
    await env.DB.batch([
      env.DB.prepare(
        `SELECT t.id, COALESCE(u.display_name,t.technician_code) AS name,
        t.technician_code AS technicianCode,t.created_at AS createdAt,t.hire_date AS hireDate,
        t.employment_type AS employmentType,t.payout_type AS payoutType,t.payout_rate AS payoutRate,
        t.current_hourly_rate_cents AS currentHourlyRateCents,t.protected_rate_cents AS protectedRateCents,
        t.compensation_tier AS compensationTier,t.rate_status AS rateStatus,
        t.competency_score AS competencyScore,t.qa_pass_streak AS qaPassStreak,
        t.guided_jobs_completed AS guidedJobsCompleted,t.ceu_due_on AS ceuDueOn,
        t.ceu_hours_required AS ceuHoursRequired,t.ceu_hours_completed AS ceuHoursCompleted,
        (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=t.id AND sr.qa_status='approved') AS approvedJobs,
        (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=t.id AND sr.qa_status='approved' AND date(COALESCE(sr.qa_reviewed_at,sr.updated_at))>=date('now','-90 days')) AS approvedJobs90Days,
        (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=t.id AND sr.qa_status IN ('returned','changes_requested') AND date(COALESCE(sr.qa_reviewed_at,sr.updated_at))>=date('now','-90 days')) AS returnedJobs90Days,
        (SELECT COUNT(*) FROM technician_credentials tc WHERE tc.technician_id=t.id AND tc.status='current' AND (tc.expires_on IS NULL OR date(tc.expires_on)>=date('now'))) AS currentCredentials,
        (SELECT COUNT(*) FROM technician_credentials tc WHERE tc.technician_id=t.id AND (tc.status!='current' OR (tc.expires_on IS NOT NULL AND date(tc.expires_on)<date('now')))) AS expiredCredentials,
        (SELECT COUNT(*) FROM technician_mentorships tm WHERE tm.mentor_technician_id=t.id AND tm.solo_qualified_on IS NOT NULL) AS soloGraduates,
        (SELECT COALESCE(SUM(te.hours),0) FROM technician_time_entries te WHERE te.technician_id=t.id AND te.status='approved' AND date(te.entry_date)>=date('now','start of month')) AS approvedHoursThisMonth
      FROM technicians t LEFT JOIN users u ON u.id=t.user_id
      WHERE t.organization_id=? AND t.status='active' AND (? IS NULL OR t.id=?)
      ORDER BY name`,
      ).bind(TECHFLEX_ORG_ID, technicianId, technicianId),
      env.DB.prepare(
        `SELECT
        COALESCE(SUM(i.total_cents),0) AS revenueCents,
        COALESCE(SUM(w.estimated_cost_cents),0) AS directCostCents,
        COUNT(*) AS jobCount
      FROM invoices i JOIN work_orders w ON w.id=i.work_order_id
      WHERE i.organization_id=? AND i.status!='void' AND date(i.issued_on)>=date('now','start of month')`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT tm.id,tm.mentor_technician_id AS mentorTechnicianId,
        COALESCE(mu.display_name,mt.technician_code) AS mentorName,
        tm.mentee_technician_id AS menteeTechnicianId,COALESCE(eu.display_name,et.technician_code) AS menteeName,
        tm.status,tm.started_on AS startedOn,tm.solo_qualified_on AS soloQualifiedOn,
        tm.bonus_rate_bps AS bonusRateBps,tm.bonus_cap_cents AS bonusCapCents,
        tm.earned_cents AS earnedCents,tm.funded_cents AS fundedCents,tm.paid_cents AS paidCents,
        tm.earning_window_ends_on AS earningWindowEndsOn
      FROM technician_mentorships tm
      JOIN technicians mt ON mt.id=tm.mentor_technician_id LEFT JOIN users mu ON mu.id=mt.user_id
      JOIN technicians et ON et.id=tm.mentee_technician_id LEFT JOIN users eu ON eu.id=et.user_id
      WHERE tm.organization_id=? AND (? IS NULL OR tm.mentor_technician_id=? OR tm.mentee_technician_id=?)
      ORDER BY tm.created_at DESC`,
      ).bind(TECHFLEX_ORG_ID, technicianId, technicianId, technicianId),
    ]);
  const finance = financeResult.results[0] as {
    revenueCents: number;
    directCostCents: number;
    jobCount: number;
  };
  const technicians = (techniciansResult.results as TechnicianRow[]).map(
    (row) => {
      if (
        row.employmentType === "contractor" ||
        row.payoutType === "percentage"
      ) {
        const contractorTier = {
          key: "contractor",
          name: "Contractor",
          rateCents: 0,
          tenureDays: 0,
          approvedJobs: 0,
          competencyScore: 0,
          qaPassRate: 0,
          qaPassStreak: 0,
          soloGraduates: 0,
        };
        return {
          ...row,
          tenureDays: 0,
          approvedJobs: Number(row.approvedJobs),
          qaPassRate: 0,
          soloGraduates: Number(row.soloGraduates),
          progression: {
            earnedTier: contractorTier,
            recommendedRateCents: 0,
            fastTracked: false,
            nextTier: null,
            blockers: [
              "Contractor compensation is the approved work-order percentage.",
            ],
            maintenanceStatus: "maintaining" as const,
          },
          addedPayrollCents: 0,
        };
      }
      const tenureStart = new Date(`${row.hireDate || row.createdAt}`);
      const tenureDays = Math.max(
        0,
        Math.floor((Date.now() - tenureStart.getTime()) / 86400000),
      );
      const totalReviewed =
        Number(row.approvedJobs90Days) + Number(row.returnedJobs90Days);
      const qaPassRate = totalReviewed
        ? Math.round((Number(row.approvedJobs90Days) / totalReviewed) * 100)
        : 0;
      const ceuCurrent =
        Number(row.ceuHoursCompleted) >= Number(row.ceuHoursRequired) &&
        (!row.ceuDueOn ||
          row.ceuDueOn >= new Date().toISOString().slice(0, 10));
      const metrics = {
        tenureDays,
        approvedJobs: Number(row.approvedJobs),
        qaPassRate,
        qaPassStreak: Number(row.qaPassStreak),
        competencyScore: Number(row.competencyScore),
        soloGraduates: Number(row.soloGraduates),
        ceuCurrent,
        credentialsCurrent:
          Number(row.currentCredentials) > 0 &&
          Number(row.expiredCredentials) === 0,
        reviewedJobs90Days: totalReviewed,
      };
      const progression = evaluateCompensation(
        metrics,
        Number(row.currentHourlyRateCents),
      );
      const addedPayrollCents = Math.round(
        Number(row.approvedHoursThisMonth) *
          Math.max(
            0,
            progression.recommendedRateCents -
              Number(row.currentHourlyRateCents),
          ),
      );
      return { ...row, ...metrics, progression, addedPayrollCents };
    },
  );
  const proposedPayrollCents = technicians.reduce(
    (sum, row) => sum + row.addedPayrollCents,
    0,
  );
  const revenueCents = Number(finance.revenueCents);
  const directCostCents = Number(finance.directCostCents);
  const current = marginProjection(
    revenueCents,
    directCostCents,
    proposedPayrollCents,
  );
  const scenarios = [
    {
      key: "authorization_gap",
      label: "Recover the exact authorization gap",
      detail:
        "Requote blocked work, mileage, crew, stairs, parts, or rural travel until the 40% floor is restored.",
      projection: marginProjection(
        revenueCents + current.counterofferGapCents,
        directCostCents,
        proposedPayrollCents,
      ),
    },
    {
      key: "rate_card_5",
      label: "Test a 5% rate-card increase",
      detail:
        "Use on renewals and accounts whose actual service cost no longer matches the agreement.",
      projection: marginProjection(
        Math.round(revenueCents * 1.05),
        directCostCents,
        proposedPayrollCents,
      ),
    },
    {
      key: "cost_leakage_5",
      label: "Remove 5% of direct-cost leakage",
      detail:
        "Target route overlap, unbilled return travel, duplicate admin entry, and avoidable repeat visits.",
      projection: marginProjection(
        revenueCents,
        Math.round(directCostCents * 0.95),
        proposedPayrollCents,
      ),
    },
  ].map((item) => ({
    ...item,
    marginLiftBps: item.projection.marginBps - current.marginBps,
  }));
  return {
    policy: {
      capCents: 4000,
      minimumMarginBps: 4000,
      fastTrackMinimumTenurePercent: 50,
      mentorBonusRateBps: 100,
      mentorBonusCapCents: 100000,
      tiers: compensationTiers,
    },
    month: { ...finance, ...current, proposedPayrollCents, scenarios },
    technicians,
    mentorships: mentorshipResult.results,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
      "technician",
    ]);
    return Response.json(
      await loadDashboard(
        identity.role === "technician"
          ? identity.technicianId || "missing"
          : null,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const input = actionSchema.parse(await request.json());
    if (input.action === "update_ceu") {
      const result = await env.DB.prepare(
        `UPDATE technicians SET ceu_due_on=?,ceu_hours_required=?,ceu_hours_completed=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      )
        .bind(
          input.dueOn,
          input.requiredHours,
          input.completedHours,
          input.technicianId,
          TECHFLEX_ORG_ID,
        )
        .run();
      if (!result.meta.changes)
        return Response.json(
          { error: "Technician not found." },
          { status: 404 },
        );
      return Response.json({ updated: true });
    }
    if (input.action === "assign_mentor") {
      if (input.mentorTechnicianId === input.menteeTechnicianId)
        return Response.json(
          { error: "A technician cannot mentor themselves." },
          { status: 400 },
        );
      const existing = await env.DB.prepare(
        `SELECT id FROM technician_mentorships WHERE organization_id=? AND mentee_technician_id=? AND status='active'`,
      )
        .bind(TECHFLEX_ORG_ID, input.menteeTechnicianId)
        .first();
      if (existing)
        return Response.json(
          { error: "This technician already has an active mentor." },
          { status: 409 },
        );
      await env.DB.prepare(
        `INSERT INTO technician_mentorships (id,organization_id,mentor_technician_id,mentee_technician_id,status,started_on) VALUES (?,?,?,?,'active',date('now'))`,
      )
        .bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          input.mentorTechnicianId,
          input.menteeTechnicianId,
        )
        .run();
      return Response.json({ created: true }, { status: 201 });
    }
    if (input.action === "mark_solo") {
      const result = await env.DB.prepare(
        `UPDATE technician_mentorships SET status='graduated',solo_qualified_on=COALESCE(solo_qualified_on,date('now')),earning_window_ends_on=COALESCE(earning_window_ends_on,date('now','+90 days')),updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      )
        .bind(input.mentorshipId, TECHFLEX_ORG_ID)
        .run();
      if (!result.meta.changes)
        return Response.json(
          { error: "Mentorship not found." },
          { status: 404 },
        );
      return Response.json({ graduated: true });
    }
    const dashboard = await loadDashboard(null);
    const technician = dashboard.technicians.find(
      (row) => row.id === input.technicianId,
    );
    if (!technician)
      return Response.json({ error: "Technician not found." }, { status: 404 });
    if (
      technician.employmentType === "contractor" ||
      technician.payoutType === "percentage"
    )
      return Response.json(
        {
          error:
            "Contractors use work-order percentage compensation and do not enter the employee hourly ladder.",
        },
        { status: 409 },
      );
    if (
      technician.progression.recommendedRateCents <=
      Number(technician.currentHourlyRateCents)
    )
      return Response.json(
        { error: "No earned rate increase is currently available." },
        { status: 409 },
      );
    if (identity.role !== "owner_administrator")
      return Response.json(
        {
          error:
            "Only the Owner Administrator can approve a permanent pay-rate change.",
        },
        { status: 403 },
      );
    if (!dashboard.month.clearsFloor)
      return Response.json(
        {
          error: `The raise is earned but not yet funded at the 40% monthly margin floor. Add at least $${(dashboard.month.counterofferGapCents / 100).toFixed(2)} in authorized revenue before activation.`,
        },
        { status: 409 },
      );
    const reviewId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE technicians SET current_hourly_rate_cents=?,protected_rate_cents=max(protected_rate_cents,?),compensation_tier=?,rate_status='active',last_compensation_review_at=CURRENT_TIMESTAMP,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      ).bind(
        technician.progression.recommendedRateCents,
        technician.progression.recommendedRateCents,
        technician.progression.earnedTier.key,
        technician.id,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `INSERT INTO technician_compensation_reviews (id,organization_id,technician_id,current_rate_cents,recommended_rate_cents,approved_rate_cents,recommended_tier,score_snapshot_json,margin_snapshot_json,status,effective_on,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,'approved',date('now'),?,CURRENT_TIMESTAMP)`,
      ).bind(
        reviewId,
        TECHFLEX_ORG_ID,
        technician.id,
        technician.currentHourlyRateCents,
        technician.progression.recommendedRateCents,
        technician.progression.recommendedRateCents,
        technician.progression.earnedTier.key,
        JSON.stringify({
          tenureDays: technician.tenureDays,
          approvedJobs: technician.approvedJobs,
          qaPassRate: technician.qaPassRate,
          competencyScore: technician.competencyScore,
          qaPassStreak: technician.qaPassStreak,
          soloGraduates: technician.soloGraduates,
        }),
        JSON.stringify(dashboard.month),
        identity.userId,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'technician.rate_approved','technician',?,?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        technician.id,
        JSON.stringify({
          reviewId,
          rateCents: technician.progression.recommendedRateCents,
          tier: technician.progression.earnedTier.key,
        }),
      ),
    ]);
    return Response.json({
      approved: true,
      reviewId,
      rateCents: technician.progression.recommendedRateCents,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Review the compensation action details.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    return apiError(error);
  }
}
