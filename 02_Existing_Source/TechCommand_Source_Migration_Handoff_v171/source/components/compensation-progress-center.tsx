"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BadgeDollarSign,
  BookOpenCheck,
  CheckCircle2,
  Gauge,
  Network,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tier = {
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
type Technician = {
  id: string;
  name: string;
  technicianCode: string;
  employmentType: string;
  payoutType: string;
  payoutRate: number;
  currentHourlyRateCents: number;
  compensationTier: string;
  tenureDays: number;
  approvedJobs: number;
  qaPassRate: number;
  qaPassStreak: number;
  competencyScore: number;
  soloGraduates: number;
  ceuCurrent: boolean;
  credentialsCurrent: boolean;
  ceuDueOn: string | null;
  ceuHoursRequired: number;
  ceuHoursCompleted: number;
  progression: {
    earnedTier: Tier;
    recommendedRateCents: number;
    fastTracked: boolean;
    nextTier: Tier | null;
    blockers: string[];
    maintenanceStatus: "building" | "maintaining" | "review_required";
  };
};
type Payload = {
  policy: { capCents: number; minimumMarginBps: number; tiers: Tier[] };
  month: {
    revenueCents: number;
    directCostCents: number;
    projectedCostCents: number;
    marginBps: number;
    clearsFloor: boolean;
    requiredRevenueCents: number;
    counterofferGapCents: number;
    proposedPayrollCents: number;
    jobCount: number;
    scenarios: Array<{
      key: string;
      label: string;
      detail: string;
      marginLiftBps: number;
      projection: { marginBps: number; counterofferGapCents: number };
    }>;
  };
  technicians: Technician[];
  mentorships: Array<{
    id: string;
    mentorTechnicianId: string;
    mentorName: string;
    menteeTechnicianId: string;
    menteeName: string;
    status: string;
    soloQualifiedOn: string | null;
    earnedCents: number;
    fundedCents: number;
    bonusCapCents: number;
  }>;
};

const money = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
const percent = (bps: number) => `${(Number(bps || 0) / 100).toFixed(1)}%`;

async function load() {
  const response = await fetch("/api/compensation");
  const data = (await response.json()) as Payload & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Compensation data is unavailable.");
  return data;
}

export function CompensationProgressCenter() {
  const [reviewRequested, setReviewRequested] = useState(false);
  if (!reviewRequested) {
    return (
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold">Career ladder (optional)</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Credential evidence and CEUs are reviewed only when you request a
          career-ladder review. They do not block routine assignments, service,
          or existing pay.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => setReviewRequested(true)}>
          Review career ladder
        </Button>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => setReviewRequested(false)}>
        Close career-ladder review
      </Button>
      <CareerLadderReview />
    </div>
  );
}

function CareerLadderReview() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["compensation"], queryFn: load });
  const [mentor, setMentor] = useState("");
  const [mentee, setMentee] = useState("");
  const [ceuDraft, setCeuDraft] = useState<
    Record<
      string,
      { dueOn: string; requiredHours: number; completedHours: number }
    >
  >({});
  const action = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch("/api/compensation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "The compensation action failed.");
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["compensation"] }),
        queryClient.invalidateQueries({ queryKey: ["technicians"] }),
      ]);
      toast.success("Compensation record updated");
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading)
    return (
      <section className="rounded-xl border bg-white p-6 text-sm text-slate-500">
        Calculating career progression…
      </section>
    );
  if (query.error)
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {query.error.message}
      </section>
    );
  const data = query.data!;
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-[#081b35] text-white shadow-lg shadow-blue-950/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr] lg:p-6">
          <div>
            <div className="flex items-center gap-2 text-cyan-300">
              <BadgeDollarSign className="size-5" />
              <p className="text-sm font-bold uppercase tracking-[.14em]">
                Career & compensation engine
              </p>
            </div>
            <h2 className="mt-3 text-2xl font-black">
              Reward mastery without sacrificing the company.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/75">
              Review advancement using performance, tenure, credential evidence,
              and CEUs. These checks apply only to the career ladder. Existing
              rates remain protected and require owner approval to change.
            </p>
          </div>
          <div
            className={`rounded-xl border p-4 ${data.month.clearsFloor ? "border-emerald-400/30 bg-emerald-400/10" : "border-amber-300/30 bg-amber-300/10"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                Projected monthly margin
              </span>
              <span className="text-2xl font-black">
                {percent(data.month.marginBps)}
              </span>
            </div>
            <Progress
              value={Math.max(0, Math.min(100, data.month.marginBps / 100))}
              className="mt-3 bg-white/15"
            />
            <p className="mt-3 text-xs leading-5 text-blue-100/75">
              Revenue {money(data.month.revenueCents)} · direct cost{" "}
              {money(data.month.projectedCostCents)} · hard floor 40.0%
            </p>
            {!data.month.clearsFloor && (
              <p className="mt-2 text-xs font-bold text-amber-200">
                Required additional authorized revenue:{" "}
                {money(data.month.counterofferGapCents)}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-amber-600" />
          <h3 className="font-bold">Margin recovery playbook</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Live scenarios show the estimated monthly effect before anyone changes
          pricing or payroll.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {data.month.scenarios.map((scenario) => (
            <article
              key={scenario.key}
              className="rounded-xl border bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold">{scenario.label}</h4>
                <Badge
                  variant="outline"
                  className={
                    scenario.marginLiftBps > 0
                      ? "border-emerald-200 text-emerald-700"
                      : ""
                  }
                >
                  {scenario.marginLiftBps >= 0 ? "+" : ""}
                  {percent(scenario.marginLiftBps)}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {scenario.detail}
              </p>
              <p className="mt-3 text-xs font-bold text-slate-700">
                Projected margin {percent(scenario.projection.marginBps)}
                {scenario.projection.counterofferGapCents > 0
                  ? ` · gap ${money(scenario.projection.counterofferGapCents)}`
                  : " · floor cleared"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 size-5 text-blue-600" />
          <div>
            <h3 className="font-bold">Published advancement ladder</h3>
            <p className="mt-1 text-sm text-slate-500">
              Fast-track eligibility begins at 50% of the normal tenure
              requirement, but only with exceptional sustained performance.
              Approved rates are protected from silent automatic reductions.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.policy.tiers.map((tier, index) => (
            <article
              key={tier.key}
              className={`rounded-xl border p-4 ${tier.rateCents === 3500 ? "border-blue-300 bg-blue-50" : "bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Level {index + 1}
                  </p>
                  <h4 className="mt-1 font-bold">{tier.name}</h4>
                </div>
                <span className="text-xl font-black text-blue-700">
                  {money(tier.rateCents)}/hr
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Standard {tier.tenureDays} days · earliest{" "}
                {Math.ceil(tier.tenureDays / 2)} · {tier.approvedJobs} approved
                jobs · {tier.competencyScore}% competency · {tier.qaPassRate}%
                rolling QA · {tier.soloGraduates} solo graduate
                {tier.soloGraduates === 1 ? "" : "s"}
              </p>
            </article>
          ))}
        </div>
      </section>

      {data.technicians.some((tech) => tech.employmentType === "contractor") && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="font-bold">Contractor compensation</h3>
          <p className="mt-1 text-sm text-slate-500">Contractors remain outside the employee hourly ladder and use one approved work-order percentage.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.technicians.filter((tech) => tech.employmentType === "contractor").map((tech) => (
              <div key={tech.id} className="rounded-lg border bg-slate-50 p-4">
                <p className="font-bold">{tech.name}</p>
                <p className="mt-1 text-sm text-slate-600">{(Number(tech.payoutRate) * 100).toFixed(1)}% work-order allocation</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="space-y-3">
        {data.technicians
          .filter((tech) => tech.employmentType !== "contractor")
          .map((tech) => {
          const draft = ceuDraft[tech.id] || {
            dueOn: tech.ceuDueOn || new Date().toISOString().slice(0, 10),
            requiredHours: Number(tech.ceuHoursRequired),
            completedHours: Number(tech.ceuHoursCompleted),
          };
          const raise =
            tech.progression.recommendedRateCents > tech.currentHourlyRateCents;
          const status = tech.progression.maintenanceStatus;
          return (
            <article key={tech.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">{tech.name}</h3>
                    <Badge variant="outline">{tech.technicianCode}</Badge>
                    {tech.progression.fastTracked && (
                      <Badge className="bg-cyan-100 text-cyan-800">
                        Fast track
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {tech.progression.earnedTier.name} · {tech.tenureDays} days
                    · {tech.approvedJobs} approved jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Current / earned
                  </p>
                  <p className="mt-1 text-xl font-black">
                    {money(tech.currentHourlyRateCents)}{" "}
                    <span className="text-slate-300">→</span>{" "}
                    <span className="text-blue-700">
                      {money(tech.progression.recommendedRateCents)}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  ["Competency", `${tech.competencyScore}%`],
                  ["90-day QA", `${tech.qaPassRate}%`],
                  ["Approval streak", String(tech.qaPassStreak)],
                  ["Solo graduates", String(tech.soloGraduates)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <div
                  className={`rounded-lg border p-3 ${status === "maintaining" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
                >
                  <div className="flex gap-2">
                    {status === "maintaining" ? (
                      <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {status === "maintaining"
                          ? "Rate standards maintained"
                          : status === "building"
                            ? "Building performance history"
                            : "Corrective review required"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {tech.progression.blockers.slice(0, 3).join(" · ") ||
                          "All current advancement gates are satisfied."}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  disabled={!raise || action.isPending}
                  onClick={() =>
                    action.mutate({
                      action: "approve_rate",
                      technicianId: tech.id,
                    })
                  }
                >
                  {raise ? (
                    <>
                      <ArrowUpRight />
                      Approve {money(tech.progression.recommendedRateCents)}
                    </>
                  ) : (
                    "Current rate earned"
                  )}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_120px_120px_auto]">
                <label className="text-xs font-semibold text-slate-600">
                  CEU due date
                  <Input
                    className="mt-1"
                    type="date"
                    value={draft.dueOn}
                    onChange={(event) =>
                      setCeuDraft({
                        ...ceuDraft,
                        [tech.id]: { ...draft, dueOn: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Required hours
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={draft.requiredHours}
                    onChange={(event) =>
                      setCeuDraft({
                        ...ceuDraft,
                        [tech.id]: {
                          ...draft,
                          requiredHours: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Completed
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={draft.completedHours}
                    onChange={(event) =>
                      setCeuDraft({
                        ...ceuDraft,
                        [tech.id]: {
                          ...draft,
                          completedHours: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <Button
                  className="self-end"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      action: "update_ceu",
                      technicianId: tech.id,
                      ...draft,
                    })
                  }
                >
                  <BookOpenCheck />
                  Save CEUs
                </Button>
              </div>
            </article>
          );
          })}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <Network className="size-5 text-blue-600" />
            <h3 className="font-bold">Build a technician team</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Mentor rewards are one level deep: 1% of collected gross profit
            during the graduate’s first 90 solo days, capped at $1,000 per
            graduate. Earnings accrue at collection; only the margin-safe amount
            is funded.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select value={mentor} onValueChange={setMentor}>
              <SelectTrigger>
                <SelectValue placeholder="Select mentor" />
              </SelectTrigger>
              <SelectContent>
                {data.technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mentee} onValueChange={setMentee}>
              <SelectTrigger>
                <SelectValue placeholder="Select trainee" />
              </SelectTrigger>
              <SelectContent>
                {data.technicians
                  .filter((t) => t.id !== mentor)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="mt-3 w-full"
            disabled={!mentor || !mentee || action.isPending}
            onClick={() =>
              action.mutate({
                action: "assign_mentor",
                mentorTechnicianId: mentor,
                menteeTechnicianId: mentee,
              })
            }
          >
            <Award />
            Create mentorship
          </Button>
        </article>
        <article className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600" />
            <h3 className="font-bold">Active mentorships</h3>
          </div>
          <div className="mt-4 space-y-3">
            {data.mentorships.length ? (
              data.mentorships.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-bold">
                      {item.mentorName} → {item.menteeName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.soloQualifiedOn
                        ? `Solo since ${item.soloQualifiedOn}`
                        : "Guided training active"}{" "}
                      · earned {money(item.earnedCents)} · funded{" "}
                      {money(item.fundedCents)}
                    </p>
                  </div>
                  {!item.soloQualifiedOn && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action.mutate({
                          action: "mark_solo",
                          mentorshipId: item.id,
                        })
                      }
                    >
                      Mark solo-ready
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">
                No mentorships assigned yet.
              </p>
            )}
          </div>
        </article>
      </section>
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        Rate recommendations use job evidence, QA outcomes, tenure, credentials,
        CEUs, and verified mentoring results—not protected personal traits.
        Permanent changes require the Owner Administrator and remain auditable.
        Payroll must still apply overtime, classification, and local wage rules.
      </p>
    </div>
  );
}
