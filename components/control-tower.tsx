"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  CloudCog,
  DatabaseZap,
  HardHat,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { NextActionPanel } from "@/components/next-action-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  severity: "urgent" | "high" | "normal";
  module: string;
};

type ActiveOrder = {
  id: string;
  externalId: string;
  externalSource: string;
  serviceType: string;
  summary: string;
  priority: string;
  status: string;
  scheduledStart: string | null;
  acceptedPriceCents: number;
  estimatedCostCents: number | null;
  grossMarginBasisPoints: number | null;
  requiredTechnicianCount: number;
  assignedCount: number;
  accountName: string;
  locationName: string;
  city: string;
  state: string;
  technicianNames: string | null;
};

type RouteRow = {
  id: string;
  status: string;
  totalMiles: number | null;
  totalDriveMinutes: number | null;
  technicianName: string;
  technicianCode: string;
  homePostalCode: string | null;
  stopCount: number;
  missingTravelCount: number;
  firstStopAt: string | null;
  lastStopAt: string | null;
};

type CoverageTrackRow = {
  track: "biomedical" | "dme_mobility";
  activeTechnicians: number;
  originsReady: number;
  openWork: number;
  scheduled30: number;
  unassigned: number;
  completed90: number;
};

type CoverageLocationRow = {
  locationId: string;
  accountName: string;
  locationName: string;
  city: string;
  state: string;
  track: "biomedical" | "dme_mobility";
  openWork: number;
  scheduled30: number;
  unassigned: number;
  completed90: number;
  activeAssets: number;
  pmDue90: number;
  matchingTechnicians: number;
  techniciansWithKnownOrigin: number;
  techniciansWithKnownReach: number;
  status:
    | "within_saved_radius"
    | "location_coordinates_missing"
    | "no_matching_discipline"
    | "technician_coordinates_missing"
    | "no_saved_radius_match";
};

type ControlTowerPayload = {
  generatedAt: string;
  businessDate: string;
  metrics: {
    openWorkOrders: number;
    marginBlocked: number;
    pricingIncomplete: number;
    projectedMarginBps: number | null;
    activeRevenueCents: number;
    scheduledStops: number;
    routeCount: number;
    verifiedMiles: number;
    missingTravelCount: number;
    pmDue30: number;
    pmOverdue: number;
    openBalanceCents: number;
    overdueBalanceCents: number;
  };
  queues: {
    intakeOpen: number;
    intakeIncomplete: number;
    qa: number;
    invoiceReady: number;
    adminOpen: number;
    adminUrgent: number;
    adminOverdue: number;
    integrationPending: number;
    integrationFailed: number;
    feedbackAction: number;
    approvedPayCents: number;
    collectedUnpaidCents: number;
    collectedUnpaidCount: number;
    agedOpen: number;
  };
  workforce: {
    active: number;
    loginLinked: number;
    routedToday: number;
    missingCoordinates: number;
    ceuAction: number;
    compensationReview: number;
  };
  preventiveMaintenance: {
    total: number;
    overdue: number;
    due30: number;
    due90: number;
  };
  dataQuality: {
    assetsMissingSerial: number;
    locationsMissingCoordinates: number;
    customersMissingContact: number;
    accountsMissingBillingEmail: number;
  };
  coveragePlanning: {
    tracks: CoverageTrackRow[];
    locations: CoverageLocationRow[];
    basis: string;
    limitation: string;
  };
  attention: AttentionItem[];
  activeOrders: ActiveOrder[];
  routes: RouteRow[];
};

async function loadControlTower() {
  const response = await fetch("/api/control-tower", { cache: "no-store" });
  const data = (await response.json()) as ControlTowerPayload & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || "The operational dashboard could not load.");
  return data;
}

function money(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function percent(basisPoints: number | null) {
  return basisPoints === null ? "—" : `${(basisPoints / 100).toFixed(1)}%`;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function serviceLabel(value: string) {
  const labels: Record<string, string> = {
    evaluation: "Diagnostic / evaluation",
    repair_single: "Single-part repair",
    repair_multi: "Multi-part repair",
    frame_repair: "Frame repair",
    hourly_service: "Hourly service",
    biomed_service_call: "Biomedical service call",
    consumer_install: "Consumer installation",
    wgd_basic: "White-glove delivery",
    wgd_complex: "Complex white-glove delivery",
    bed_delivery: "Hospital / adjustable bed",
    biomed_pm_a: "Biomedical PM · Tier A",
    biomed_pm_b: "Biomedical PM · Tier B",
    biomed_pm_c: "Biomedical PM · Tier C",
    biomed_pm_d: "Biomedical PM · Tier D",
  };
  return labels[value] || titleCase(value);
}

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function time(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toneForStatus(status: string) {
  if (["in_progress", "arrived", "paid"].includes(status))
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["pricing_review", "technician_submitted"].includes(status))
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (["ready_to_assign", "new"].includes(status))
    return "border-red-200 bg-red-50 text-red-700";
  if (["assigned", "ready_to_invoice"].includes(status))
    return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function coverageStatus(row: CoverageLocationRow) {
  if (row.status === "within_saved_radius")
    return {
      label: `${row.techniciansWithKnownReach} within saved radius`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  if (row.status === "location_coordinates_missing")
    return {
      label: "Location coordinates missing",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  if (row.status === "technician_coordinates_missing")
    return {
      label: "Technician origins missing",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  if (row.status === "no_matching_discipline")
    return {
      label: "No matching discipline recorded",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  return {
    label: "No saved radius match",
    className: "border-red-200 bg-red-50 text-red-700",
  };
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ClipboardList;
  tone: "blue" | "amber" | "green" | "violet";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <article className="rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,33,61,.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-[28px] font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${colors[tone]}`}>
          <Icon className="size-[19px]" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function DataReadinessRow({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50"
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`min-w-8 rounded-full px-2 py-1 text-center text-xs font-bold ${count ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}
      >
        {count}
      </span>
    </button>
  );
}

export function ControlTower({
  search,
  onNavigate,
}: {
  search: string;
  onNavigate: (module: string) => void;
}) {
  const query = useQuery({
    queryKey: ["control-tower"],
    queryFn: loadControlTower,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return query.data?.activeOrders || [];
    return (query.data?.activeOrders || []).filter((order) =>
      Object.values(order).join(" ").toLowerCase().includes(needle),
    );
  }, [query.data?.activeOrders, search]);

  if (query.isLoading)
    return (
      <div className="grid min-h-[420px] place-items-center rounded-xl border bg-white text-sm font-semibold text-slate-500">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" /> Loading live portal
          records…
        </span>
      </div>
    );
  if (query.error)
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">The live command dashboard is unavailable.</p>
            <p className="mt-1">{query.error.message}</p>
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
            >
              <RefreshCw /> Try again
            </Button>
          </div>
        </div>
      </div>
    );

  const data = query.data!;
  const pmCurrent = Math.max(
    0,
    data.preventiveMaintenance.total -
      data.preventiveMaintenance.overdue -
      data.preventiveMaintenance.due30 -
      data.preventiveMaintenance.due90,
  );
  const pmCurrentPercent = data.preventiveMaintenance.total
    ? Math.round((pmCurrent / data.preventiveMaintenance.total) * 100)
    : 0;
  const workforceLinkedPercent = data.workforce.active
    ? Math.round((data.workforce.loginLinked / data.workforce.active) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_85%_0%,rgba(52,211,235,.2),transparent_22rem),linear-gradient(110deg,#071827,#0a2b47_55%,#0b5165)] p-5 text-white shadow-xl shadow-slate-900/10">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
            <DatabaseZap className="size-4" /> Live operational control
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-100/85">
            Every number below comes from saved TechFlex records. Empty means
            nothing has been entered—not that the system made up a prettier answer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-cyan-100/70">
            <p>Business date {data.businessDate}</p>
            <p>Refreshes every 60 seconds</p>
          </div>
          <Button
            size="sm"
            className="bg-white text-slate-950 hover:bg-blue-50"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </section>

      <NextActionPanel onNavigate={onNavigate} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open work orders"
          value={String(data.metrics.openWorkOrders)}
          detail={`${data.metrics.marginBlocked} margin-blocked · ${data.metrics.pricingIncomplete} unverified cost basis · ${data.queues.qa} awaiting QA`}
          icon={ClipboardList}
          tone={data.metrics.marginBlocked ? "amber" : "blue"}
        />
        <MetricCard
          label="Today’s field plan"
          value={`${data.metrics.scheduledStops} stops`}
          detail={`${data.metrics.routeCount} routes · ${data.metrics.verifiedMiles.toFixed(1)} verified miles`}
          icon={Route}
          tone={data.metrics.missingTravelCount ? "amber" : "violet"}
        />
        <MetricCard
          label="PM due within 30 days"
          value={String(data.metrics.pmDue30)}
          detail={`${data.metrics.pmOverdue} overdue · ${data.preventiveMaintenance.total} active PM plans`}
          icon={Activity}
          tone={data.metrics.pmOverdue ? "amber" : "green"}
        />
        <MetricCard
          label="Open invoice balance"
          value={money(data.metrics.openBalanceCents)}
          detail={`${money(data.metrics.overdueBalanceCents)} currently past due`}
          icon={Banknote}
          tone={data.metrics.overdueBalanceCents ? "amber" : "green"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <article className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-bold text-slate-900">Active work</h2>
              <p className="mt-1 text-sm text-slate-500">
                Prioritized by pricing blocks, QA, crew gaps, and schedule.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onNavigate("work-orders")}
            >
              Open work orders <ChevronRight />
            </Button>
          </div>
          {filteredOrders.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="pl-5">WORK ORDER</TableHead>
                    <TableHead>SERVICE / LOCATION</TableHead>
                    <TableHead>TECHNICIAN</TableHead>
                    <TableHead>SCHEDULE</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="pr-5 text-right">MARGIN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const crewGap = Math.max(
                      0,
                      Number(order.requiredTechnicianCount) -
                        Number(order.assignedCount),
                    );
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="pl-5">
                          <p className="font-mono text-xs font-bold text-slate-900">
                            {order.externalId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {order.accountName}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-slate-800">
                            {serviceLabel(order.serviceType)}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="size-3" /> {order.locationName} ·{" "}
                            {order.city}, {order.state}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-700">
                            {order.technicianNames || "Unassigned"}
                          </p>
                          {crewGap ? (
                            <p className="mt-1 text-xs font-semibold text-red-700">
                              {crewGap} crew position{crewGap === 1 ? "" : "s"} open
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {dateTime(order.scheduledStart)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`whitespace-nowrap capitalize ${toneForStatus(order.status)}`}
                          >
                            {titleCase(order.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-5 text-right font-bold">
                          <span
                            className={
                              order.grossMarginBasisPoints !== null &&
                              order.grossMarginBasisPoints < 4000
                                ? "text-red-700"
                                : "text-emerald-700"
                            }
                          >
                            {!order.acceptedPriceCents
                              ? "Pending"
                              : order.grossMarginBasisPoints === null
                                ? "Unverified"
                                : percent(order.grossMarginBasisPoints)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <CircleCheck className="mx-auto size-8 text-emerald-600" />
              <p className="mt-3 font-bold text-slate-800">
                {search ? "No active work matches this search." : "No active work orders are loaded."}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                New records will appear after controlled intake and pricing.
              </p>
            </div>
          )}
        </article>

        <div className="space-y-5">
          <article className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Priority queue</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Exceptions that can block service, compliance, or cash.
                </p>
              </div>
              <span className="grid min-w-8 place-items-center rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                {data.attention.length}
              </span>
            </div>
            {data.attention.length ? (
              <div className="mt-4 divide-y">
                {data.attention.slice(0, 7).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onNavigate(item.module)}
                    className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${item.severity === "urgent" ? "bg-red-50 text-red-700" : item.severity === "high" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}
                    >
                      <CircleAlert className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {item.count} · {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        {item.detail}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex gap-2">
                  <ShieldCheck className="size-5 shrink-0" />
                  <p>
                    No stored operational exceptions are open. Continue the
                    daily intake and verification routine.
                  </p>
                </div>
              </div>
            )}
          </article>

          <article
            className={`rounded-xl border p-5 ${data.metrics.projectedMarginBps !== null && data.metrics.projectedMarginBps < 4000 ? "border-red-300 bg-red-50" : "border-blue-200 bg-[#102748] text-white"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-bold uppercase tracking-[0.14em] ${data.metrics.projectedMarginBps !== null && data.metrics.projectedMarginBps < 4000 ? "text-red-700" : "text-blue-200"}`}>
                  Margin protection
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {percent(data.metrics.projectedMarginBps)}
                </p>
                <p className={`mt-1 text-sm ${data.metrics.projectedMarginBps !== null && data.metrics.projectedMarginBps < 4000 ? "text-red-800" : "text-blue-100/75"}`}>
                  {data.metrics.projectedMarginBps === null
                    ? "No accepted active pricing to measure yet."
                    : `${money(data.metrics.activeRevenueCents)} accepted active revenue`}
                </p>
              </div>
              <BarChart3 className="size-6" />
            </div>
            <div className={`mt-4 border-t pt-4 text-xs ${data.metrics.projectedMarginBps !== null && data.metrics.projectedMarginBps < 4000 ? "border-red-200 text-red-800" : "border-white/10 text-blue-100/75"}`}>
              Hard floor: 40.0% · {data.metrics.marginBlocked} blocked record
              {data.metrics.marginBlocked === 1 ? "" : "s"}
            </div>
          </article>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold text-slate-900">Workforce &amp; customer coverage</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Actual saved work, declared disciplines, coordinates, and service radii. Geographic reach is separate from Academy authorization.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onNavigate("technicians")}>
            <HardHat /> Open workforce
          </Button>
        </div>
        <div className="grid gap-3 border-b bg-slate-50/60 p-5 lg:grid-cols-2">
          {data.coveragePlanning.tracks.map((track) => (
            <article key={track.track} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {track.track === "biomedical" ? "Biomedical / HTM" : "DME / Mobility"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {track.activeTechnicians} active with this discipline · {track.originsReady} with coordinates
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <MapPin className="size-5" />
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Open", track.openWork],
                  ["Next 30", track.scheduled30],
                  ["Unassigned", track.unassigned],
                  ["Completed 90", track.completed90],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-2 py-3">
                    <p className="text-lg font-bold text-slate-900">{value}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        {data.coveragePlanning.locations.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="pl-5">CUSTOMER / FACILITY</TableHead>
                  <TableHead>DIVISION</TableHead>
                  <TableHead>ACTUAL WORK</TableHead>
                  <TableHead>BIOMEDICAL DEMAND</TableHead>
                  <TableHead className="pr-5">GEOGRAPHIC INDICATOR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.coveragePlanning.locations.map((location) => {
                  const status = coverageStatus(location);
                  return (
                    <TableRow key={location.locationId}>
                      <TableCell className="pl-5">
                        <p className="font-bold text-slate-900">{location.locationName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {location.accountName} · {location.city}, {location.state}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-slate-700">
                        {location.track === "biomedical" ? "Biomedical" : "DME / Mobility"}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-bold text-slate-800">
                          {location.openWork} open · {location.scheduled30} next 30 days
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {location.unassigned} unassigned · {location.completed90} completed in 90 days
                        </p>
                      </TableCell>
                      <TableCell>
                        {location.track === "biomedical" ? (
                          <>
                            <p className="text-sm font-bold text-slate-800">{location.activeAssets} active assets</p>
                            <p className="mt-1 text-xs text-slate-500">{location.pmDue90} PM due through 90 days</p>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">Not applicable</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge variant="outline" className={status.className}>{status.label}</Badge>
                        <p className="mt-1 text-xs text-slate-500">
                          {location.techniciansWithKnownOrigin}/{location.matchingTechnicians} matching technicians have an origin
                        </p>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No active customer locations have a saved division, work order, or biomedical asset yet.
          </div>
        )}
        <div className="border-t bg-amber-50/70 px-5 py-3 text-xs leading-5 text-amber-900">
          {data.coveragePlanning.limitation} Distance uses {data.coveragePlanning.basis.toLowerCase()}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Today’s field plan</h2>
              <p className="mt-1 text-xs text-slate-500">
                Saved routes and verified travel—not estimated map theater.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate("dispatch")}
            >
              <Route /> Open dispatch
            </Button>
          </div>
          {data.routes.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {data.routes.map((route) => (
                <div key={route.id} className="rounded-xl border bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white">
                        {route.technicianName
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {route.technicianName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {route.stopCount} stops · {route.homePostalCode || "Home ZIP missing"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {titleCase(route.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Window</p>
                      <p className="mt-1 font-bold text-slate-700">
                        {time(route.firstStopAt)}–{time(route.lastStopAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Road miles</p>
                      <p className="mt-1 font-bold text-slate-700">
                        {route.totalMiles === null
                          ? "Unverified"
                          : Number(route.totalMiles).toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Drive</p>
                      <p className="mt-1 font-bold text-slate-700">
                        {route.totalDriveMinutes === null
                          ? "Unverified"
                          : `${Math.floor(route.totalDriveMinutes / 60)}h ${route.totalDriveMinutes % 60}m`}
                      </p>
                    </div>
                  </div>
                  {route.missingTravelCount ? (
                    <p className="mt-3 text-xs font-semibold text-amber-700">
                      {route.missingTravelCount} stop
                      {route.missingTravelCount === 1 ? "" : "s"} need verified
                      travel.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
              No routes are saved for {data.businessDate}.
            </div>
          )}
        </article>

        <div className="space-y-5">
          <article className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Operational readiness</h2>
                <p className="mt-1 text-xs text-slate-500">
                  People, PM coverage, and finance handoffs.
                </p>
              </div>
              <HardHat className="size-5 text-blue-600" />
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="font-semibold text-slate-600">
                    Technician logins linked
                  </span>
                  <span className="font-bold text-slate-800">
                    {data.workforce.loginLinked}/{data.workforce.active}
                  </span>
                </div>
                <Progress value={workforceLinkedPercent} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="font-semibold text-slate-600">
                    PM plans beyond 90-day window
                  </span>
                  <span className="font-bold text-slate-800">
                    {pmCurrent}/{data.preventiveMaintenance.total}
                  </span>
                </div>
                <Progress value={pmCurrentPercent} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate("automations")}
                  className="rounded-lg bg-slate-50 p-3 text-left"
                >
                  <p className="text-xs text-slate-500">Needs addressed</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {data.queues.adminOpen}
                  </p>
                  <p className="mt-1 text-xs text-red-700">
                    {data.queues.adminOverdue} overdue
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("finance")}
                  className="rounded-lg bg-slate-50 p-3 text-left"
                >
                  <p className="text-xs text-slate-500">Collected, unpaid tech pay</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {money(data.queues.collectedUnpaidCents)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {data.queues.collectedUnpaidCount} pay records
                  </p>
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Data readiness</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Missing fields that weaken routing, service history, or billing.
                </p>
              </div>
              <CloudCog className="size-5 text-blue-600" />
            </div>
            <div className="mt-3 -mx-3">
              <DataReadinessRow
                label="Assets missing serial number"
                count={data.dataQuality.assetsMissingSerial}
                onClick={() => onNavigate("assets")}
              />
              <DataReadinessRow
                label="Locations missing coordinates"
                count={data.dataQuality.locationsMissingCoordinates}
                onClick={() => onNavigate("locations")}
              />
              <DataReadinessRow
                label="Customers missing phone or email"
                count={data.dataQuality.customersMissingContact}
                onClick={() => onNavigate("customers")}
              />
              <DataReadinessRow
                label="Accounts missing billing email"
                count={data.dataQuality.accountsMissingBillingEmail}
                onClick={() => onNavigate("accounts")}
              />
            </div>
          </article>

          <article className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Automation outbox</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Durable handoffs waiting for Sheets, email, or accounting.
                </p>
              </div>
              <CalendarClock className="size-5 text-violet-600" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xl font-bold text-blue-800">
                  {data.queues.integrationPending}
                </p>
                <p className="mt-1 text-[11px] text-blue-700">Queued</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xl font-bold text-red-800">
                  {data.queues.integrationFailed}
                </p>
                <p className="mt-1 text-[11px] text-red-700">Retry</p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3">
                <p className="text-xl font-bold text-violet-800">
                  {data.queues.feedbackAction}
                </p>
                <p className="mt-1 text-[11px] text-violet-700">Follow-up</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
