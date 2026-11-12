"use client";
import {AcademyJobCheck} from "@/components/academy-job-check";
import { parseDisciplines, disciplineLabels } from "@/lib/service-disciplines";

import { canEditDispatchPlan } from "@/lib/dispatch-policy";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  Route,
  ShieldCheck,
  SplitSquareVertical,
  UserRoundCheck,
} from "lucide-react";
import { RouteMapCanvas } from "@/components/route-map-canvas";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Technician = {
  serviceDisciplinesJson?: string | null;
  id: string;
  technicianCode: string;
  name: string;
  homePostalCode: string | null;
  maxRadiusMiles: number;
};

export type DispatchJob = {
  id: string;
  externalId: string;
  externalSource: string;
  serviceType: string;
  summary: string;
  priority: string;
  status: string;
  requiredTechnicianCount: number;
  assignedCount?: number;
  grossMarginBasisPoints?: number;
  scheduledStart: string | null;
  scheduledEnd?: string | null;
  accountName: string;
  locationId: string;
  locationName: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  nearestTechnician?: {
    technicianId: string;
    technicianName: string;
    miles: number;
  } | null;
};

export type ScheduledJob = DispatchJob & {
  assignmentId: string;
  technicianId: string;
  technicianName: string;
  technicianCode: string;
  assignmentRole: "primary" | "support";
  assignmentStatus: string;
  routeId: string | null;
  routeStatus: string | null;
  stopId: string | null;
  stopOrder: number | null;
  plannedArrival: string | null;
  plannedDeparture: string | null;
  legMiles: number | null;
  driveMinutes: number | null;
  travelSource: string | null;
  stopStatus: string | null;
  approximateLegMiles?: number | null;
};

export type DispatchRoute = {
  version: number;
  startLocation?: { address?: string; postalCode?: string };
  planning?: { startAddress: string; startTime?: string; includeReturn: boolean; returnAddress: string; returnMinutes: number | null;
    stops: Array<{ stopId: string; serviceMinutes: number; driveMinutes: number | null }> } | null;
  id: string;
  technicianId: string;
  technicianName: string;
  technicianCode: string;
  routeDate: string;
  status: string;
  totalMiles: number | null;
  totalDriveMinutes: number | null;
  missingTravelCount: number;
  stops: ScheduledJob[];
};

export type DispatchPayload = {
  date: string;
  role: string;
  technicianId: string | null;
  technicians: Technician[];
  available: DispatchJob[];
  scheduled: ScheduledJob[];
  routes: DispatchRoute[];
};

type ScheduleForm = {
  workOrderId: string;
  technicianId: string;
  assignmentRole: "primary" | "support";
  scheduledStart: string;
  durationMinutes: number;
  legMiles: string;
  driveMinutes: string;
};

const serviceLabels: Record<string, string> = {
  evaluation: "Evaluation",
  repair_single: "Single-part repair",
  repair_multi: "Multi-part repair",
  frame_repair: "Frame repair",
  hourly_service: "Hourly service",
  biomed_service_call: "Biomedical service",
  consumer_install: "Consumer installation",
  wgd_basic: "White-glove delivery",
  wgd_complex: "Complex white-glove delivery",
  bed_delivery: "Bed delivery",
  biomed_pm_a: "Biomedical PM · Tier A",
  biomed_pm_b: "Biomedical PM · Tier B",
  biomed_pm_c: "Biomedical PM · Tier C",
  biomed_pm_d: "Biomedical PM · Tier D",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Dispatch could not be updated.");
  return data;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return next.toISOString().slice(0, 10);
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function localInput(value: string | null | undefined, fallbackDate: string) {
  if (!value) return `${fallbackDate}T09:00`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${fallbackDate}T09:00`;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function routeUrl(stops: ScheduledJob[]) {
  const addresses = stops.map((stop) => stop.address).filter(Boolean);
  if (!addresses.length) return null;
  const destination = addresses.at(-1)!;
  const origin = addresses[0];
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(origin)}%3B${encodeURIComponent(destination)}`;
}

function destinationUrl(address: string) {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}

function travelLabel(job: ScheduledJob) {
  if (job.legMiles !== null || job.driveMinutes !== null)
    return [
      job.legMiles !== null ? `${job.legMiles} verified mi` : null,
      job.driveMinutes !== null ? `${job.driveMinutes} min` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  if (job.approximateLegMiles !== null && job.approximateLegMiles !== undefined)
    return `${job.approximateLegMiles} mi straight-line estimate`;
  return "Travel verification required";
}

function DateNavigator({
  date,
  onChange,
}: {
  date: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        <ArrowLeft />
      </Button>
      <Input
        className="w-40 bg-white"
        type="date"
        value={date}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
      >
        <ArrowRight />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onChange(localDate())}>
        Today
      </Button>
    </div>
  );
}

export function DispatchCenter({ mode }: { mode: "schedule" | "routes" }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localDate);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [routeViewMode, setRouteViewMode] = useState<"list" | "map" | "split">("split");
  const [form, setForm] = useState<ScheduleForm>({
    workOrderId: "",
    technicianId: "",
    assignmentRole: "primary",
    scheduledStart: `${localDate()}T09:00`,
    durationMinutes: 60,
    legMiles: "",
    driveMinutes: "",
  });
  const query = useQuery({
    queryKey: ["dispatch", date],
    queryFn: () => api<DispatchPayload>(`/api/dispatch?date=${date}`),
  });
  const data = query.data;
  const routeTechnicianId =
    selectedTechnician ||
    data?.routes[0]?.technicianId ||
    data?.technicians[0]?.id ||
    "";
  const activeRoute = data?.routes.find(
    (route) => route.technicianId === routeTechnicianId,
  );
  const scheduledWorkOrders = new Set(
    data?.scheduled.map((job) => job.id) ?? [],
  ).size;
  const crewGaps = (data?.available ?? []).filter(
    (job) =>
      Number(job.assignedCount || 0) < Number(job.requiredTechnicianCount || 1),
  ).length;
  const missingTravel = (data?.routes ?? []).reduce(
    (sum, route) => sum + Number(route.missingTravelCount || 0),
    0,
  );
  const schedulingChoices = useMemo(() => {
    const choices = new Map<string, DispatchJob>();
    data?.available.forEach((job) => choices.set(job.id, job));
    data?.scheduled.forEach((job) => choices.set(job.id, job));
    return [...choices.values()];
  }, [data]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dispatch"] }),
      queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
    ]);
  const schedule = useMutation({
    mutationFn: () =>
      api<{ crewGap: number }>("/api/dispatch", {
        method: "PATCH",
        body: JSON.stringify({
          action: "schedule",
          workOrderId: form.workOrderId,
          technicianId: form.technicianId,
          assignmentRole: form.assignmentRole,
          routeDate: date,
          scheduledStart: new Date(form.scheduledStart).toISOString(),
          durationMinutes: form.durationMinutes,
          legMiles: form.legMiles === "" ? null : Number(form.legMiles),
          driveMinutes:
            form.driveMinutes === "" ? null : Number(form.driveMinutes),
        }),
      }),
    onSuccess: async (result) => {
      await refresh();
      setSheetOpen(false);
      if (result.crewGap)
        toast.warning("Appointment saved; additional crew still required", {
          description: `${result.crewGap} technician position${result.crewGap === 1 ? "" : "s"} remains open.`,
        });
      else toast.success("Appointment and route stop saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const unschedule = useMutation({
    mutationFn: ({
      workOrderId,
      technicianId,
    }: {
      workOrderId: string;
      technicianId: string;
    }) =>
      api("/api/dispatch", {
        method: "PATCH",
        body: JSON.stringify({
          action: "unschedule",
          workOrderId,
          technicianId,
        }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Technician removed from the route");
    },
    onError: (error) => toast.error(error.message),
  });
  const reorder = useMutation({
    mutationFn: ({
      routeId,
      stopIds,
    }: {
      routeId: string;
      stopIds: string[];
    }) =>
      api("/api/dispatch", {
        method: "PATCH",
        body: JSON.stringify({
          action: "reorder",
          routeId,
          orderedStopIds: stopIds,
        }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Route order saved");
    },
    onError: (error) => toast.error(error.message),
  });

  function openScheduler(job?: DispatchJob, scheduled?: ScheduledJob) {
    const firstTechnician =
      scheduled?.technicianId ||
      job?.nearestTechnician?.technicianId ||
      data?.technicians[0]?.id ||
      "";
    setForm({
      workOrderId: job?.id || scheduled?.id || "",
      technicianId: firstTechnician,
      assignmentRole: scheduled?.assignmentRole || "primary",
      scheduledStart: localInput(scheduled?.scheduledStart, date),
      durationMinutes:
        scheduled?.scheduledStart && scheduled.scheduledEnd
          ? Math.max(
              15,
              Math.round(
                (new Date(scheduled.scheduledEnd).getTime() -
                  new Date(scheduled.scheduledStart).getTime()) /
                  60000,
              ),
            )
          : 60,
      legMiles: scheduled?.legMiles?.toString() || "",
      driveMinutes: scheduled?.driveMinutes?.toString() || "",
    });
    setSheetOpen(true);
  }

  function moveStop(index: number, direction: -1 | 1) {
    if (!activeRoute) return;
    const next = [...activeRoute.stops];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({
      routeId: activeRoute.id,
      stopIds: next.map((stop) => stop.stopId).filter(Boolean) as string[],
    });
  }

  if (query.isLoading)
    return (
      <div className="rounded-xl border bg-white p-12 text-center text-sm text-slate-500">
        Loading live dispatch records…
      </div>
    );

  if (query.error)
    return (
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <CircleAlert className="mt-0.5 size-5 shrink-0" />
        {query.error.message}
      </div>
    );

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            {mode === "schedule" ? "Scheduling control" : "Route control"}
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            {dateLabel(date)}
          </h2>
        </div>
        <DateNavigator date={date} onChange={setDate} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Scheduled work orders",
            scheduledWorkOrders,
            "Appointments on this service date",
            CalendarDays,
            "text-blue-700 bg-blue-50",
          ],
          [
            "Open crew positions",
            crewGaps,
            crewGaps
              ? "Still held in ready-to-assign"
              : "All scheduled crew requirements met",
            UserRoundCheck,
            crewGaps
              ? "text-amber-700 bg-amber-50"
              : "text-emerald-700 bg-emerald-50",
          ],
          [
            "Active technician routes",
            data?.routes.length || 0,
            `${data?.technicians.length || 0} active technicians available`,
            Route,
            "text-violet-700 bg-violet-50",
          ],
          [
            "Travel checks needed",
            missingTravel,
            missingTravel
              ? "Enter road miles and drive time"
              : "All route legs verified",
            ShieldCheck,
            missingTravel
              ? "text-amber-700 bg-amber-50"
              : "text-emerald-700 bg-emerald-50",
          ],
        ].map(([label, value, detail, Icon, tone]) => {
          const MetricIcon = Icon as typeof CalendarDays;
          return (
            <article
              key={String(label)}
              className="rounded-xl border bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`grid size-9 place-items-center rounded-lg ${tone}`}
                >
                  <MetricIcon className="size-4" />
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {String(value)}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-800">
                {String(label)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{String(detail)}</p>
            </article>
          );
        })}
      </section>

      {mode === "schedule" ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <article className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-start justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-bold text-slate-900">Ready to schedule</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Only work that passed pricing can enter dispatch.
                </p>
              </div>
              <Badge variant="outline">{data?.available.length || 0}</Badge>
            </div>
            <div className="max-h-[680px] space-y-3 overflow-y-auto p-3">
              {data?.available.length ? (
                data.available.map((job) => (
                  <article
                    key={job.id}
                    className="rounded-xl border bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-bold text-blue-700">
                          {job.externalId}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {job.accountName} ·{" "}
                          {serviceLabels[job.serviceType] || job.serviceType}
                        </p>
                      </div>
                      {job.priority === "urgent" ? (
                        <Badge className="bg-red-600">Urgent</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {job.summary}
                    </p>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      {job.address}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <span className="text-xs font-semibold text-slate-500">
                        Crew {job.assignedCount || 0}/
                        {job.requiredTechnicianCount}
                        {job.nearestTechnician
                          ? ` · ${job.nearestTechnician.technicianName} is approximately ${job.nearestTechnician.miles} mi away`
                          : ""}
                      </span>
                      <Button size="sm" onClick={() => openScheduler(job)}>
                        <Plus /> Schedule
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  No priced work orders are waiting for this date.
                </div>
              )}
            </div>
          </article>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">
                  Technician day board
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Appointment ownership, route order, and travel readiness.
                </p>
              </div>
              <Button
                onClick={() => openScheduler()}
                disabled={
                  !schedulingChoices.length || !data?.technicians.length
                }
              >
                <Plus /> Schedule work order
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {data?.technicians.map((technician) => {
                const jobs = data.scheduled.filter(
                  (job) => job.technicianId === technician.id,
                );
                return (
                  <article
                    key={technician.id}
                    className="overflow-hidden rounded-xl border bg-white"
                  >
                    <div className="flex items-center justify-between border-b bg-slate-50 p-4">
                      <div>
                        <p className="font-bold text-slate-900">
                          {technician.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {technician.technicianCode} · starts near{" "}
                          {technician.homePostalCode || "address not entered"}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {jobs.length} stop{jobs.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="min-h-36 space-y-2 p-3">
                      {jobs.length ? (
                        jobs.map((job, index) => (
                          <article
                            key={job.assignmentId}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex items-start gap-3">
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                                {job.stopOrder || index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-mono text-xs font-bold text-blue-700">
                                      {job.externalId}
                                    </p>
                                    <p className="mt-1 text-sm font-bold">
                                      {timeLabel(job.scheduledStart)} ·{" "}
                                      {serviceLabels[job.serviceType] ||
                                        job.serviceType}
                                    </p>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="capitalize"
                                  >
                                    {job.assignmentRole}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                  {job.locationName} · {travelLabel(job)}
                                </p>
                                {canEditDispatchPlan(job.status, job.assignmentStatus) ? <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      openScheduler(undefined, job)
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-700"
                                    onClick={() =>
                                      unschedule.mutate({
                                        workOrderId: job.id,
                                        technicianId: technician.id,
                                      })
                                    }
                                    disabled={unschedule.isPending}
                                  >
                                    Remove
                                  </Button>
                                </div> : <p className="mt-3 text-sm text-slate-600">
                                  Dispatch plan locked · {job.status.replaceAll("_", " ")}. Review this work order in the completion workflow.
                                </p>}
                              </div>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="p-6 text-center text-sm text-slate-500">
                          No stops scheduled.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
          <article className="rounded-xl border bg-white p-5">
            <h2 className="font-bold text-slate-900">
              Choose technician route
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Route records are created automatically when the first appointment
              is assigned.
            </p>
            <div className="mt-4">
              <Select
                value={routeTechnicianId}
                onValueChange={setSelectedTechnician}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {data?.technicians.map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.name} · {parseDisciplines(technician.serviceDisciplinesJson).map(value=>disciplineLabels[value]).join(" + ") || "Capability pending"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeRoute ? (
              <div className="mt-5 space-y-3 border-t pt-5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Stops</span>
                  <span className="font-bold">{activeRoute.stops.length}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Road miles</span>
                  <span className="font-bold">
                    {activeRoute.totalMiles ?? "Not calculated"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    Drive estimate{activeRoute.planning?.includeReturn ? " · includes return" : ""}
                  </span>
                  <span className="font-bold">
                    {activeRoute.totalDriveMinutes !== null
                      ? `${activeRoute.totalDriveMinutes} min`
                      : "Incomplete"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Road-data gaps</span>
                  <span
                    className={`font-bold ${activeRoute.missingTravelCount ? "text-amber-700" : "text-emerald-700"}`}
                  >
                    {activeRoute.missingTravelCount}
                  </span>
                </div>
                {routeUrl(activeRoute.stops) ? (
                  <Button asChild className="mt-2 w-full">
                    <a
                      href={routeUrl(activeRoute.stops)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation /> Open full route <ExternalLink />
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                This technician has no route for the selected date.
              </p>
            )}
          </article>

          <article className="overflow-hidden rounded-xl border bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-bold text-slate-900">
                  {activeRoute?.technicianName || "Daily route"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Use the arrows to preserve the exact field sequence. OpenStreetMap supplies live interactive routing and waypoint tracking.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setRouteViewMode("split")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold cursor-pointer transition ${routeViewMode === "split" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <SplitSquareVertical className="size-3.5" /> Split Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteViewMode("map")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold cursor-pointer transition ${routeViewMode === "map" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <MapIcon className="size-3.5" /> Full Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteViewMode("list")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold cursor-pointer transition ${routeViewMode === "list" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <List className="size-3.5" /> Stop List
                  </button>
                </div>
                {activeRoute ? (
                  <Badge
                    className={
                      activeRoute.missingTravelCount
                        ? "bg-amber-600"
                        : "bg-emerald-600"
                    }
                  >
                    {activeRoute.missingTravelCount
                      ? "Travel verification needed"
                      : "Travel verified"}
                  </Badge>
                ) : null}
              </div>
            </div>

            {routeViewMode === "map" ? (
              <div className="p-4">
                <RouteMapCanvas route={activeRoute} />
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {routeViewMode === "split" ? (
                  <RouteMapCanvas route={activeRoute} />
                ) : null}
                <div className="space-y-3">
                  {activeRoute?.stops.length ? (
                    activeRoute.stops.map((job, index) => (
                      <article
                        key={job.stopId || job.assignmentId}
                        className="rounded-xl border p-4"
                      >
                        <div className="flex gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-mono text-xs font-bold text-blue-700">
                                  {job.externalId}
                                </p>
                                <h3 className="mt-1 font-bold text-slate-900">
                                  {job.accountName} ·{" "}
                                  {serviceLabels[job.serviceType] ||
                                    job.serviceType}
                                </h3>
                              </div>
                              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                <Clock3 className="size-4" />
                                {timeLabel(job.scheduledStart)}
                              </span>
                            </div>
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                              <MapPin className="mt-0.5 size-4 shrink-0" />
                              {job.address}
                            </p>
                            <div
                              className={`mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold ${job.legMiles === null || job.driveMinutes === null ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}
                            >
                              {job.legMiles === null ||
                              job.driveMinutes === null ? (
                                <CircleAlert className="size-4" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                              {travelLabel(job)}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => moveStop(index, -1)}
                                  disabled={index === 0 || reorder.isPending}
                                  aria-label={`Move ${job.externalId} earlier`}
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => moveStop(index, 1)}
                                  disabled={
                                    index === activeRoute.stops.length - 1 ||
                                    reorder.isPending
                                  }
                                  aria-label={`Move ${job.externalId} later`}
                                >
                                  <ArrowDown />
                                </Button>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openScheduler(undefined, job)}
                                >
                                  Verify travel
                                </Button>
                                <Button asChild size="sm">
                                  <a
                                    href={destinationUrl(job.address)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Navigation /> Directions
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No route stops exist for this technician and date.
                    </div>
                  )}
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b px-6 pb-5 pt-6">
            <SheetTitle>Schedule and route work</SheetTitle>
            <SheetDescription>
              Choose the responsible technician, appointment, expected duration,
              and verified travel values.
            </SheetDescription>
          </SheetHeader>
          <form
            className="space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              schedule.mutate();
            }}
          >
            <Field label="Work order">
              <Select
                value={form.workOrderId}
                onValueChange={(value) =>
                  setForm({ ...form, workOrderId: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select priced work order" />
                </SelectTrigger>
                <SelectContent>
                  {schedulingChoices.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.externalId} · {job.accountName} · {job.locationName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Technician">
                <Select
                  value={form.technicianId}
                  onValueChange={(value) =>
                    setForm({ ...form, technicianId: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.technicians.map((technician) => (
                      <SelectItem key={technician.id} value={technician.id}>
                        {technician.name} · {parseDisciplines(technician.serviceDisciplinesJson).map(value=>disciplineLabels[value]).join(" + ") || "Capability pending"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Crew role">
                <Select
                  value={form.assignmentRole}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      assignmentRole: value as "primary" | "support",
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary technician</SelectItem>
                    <SelectItem value="support">Support technician</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Appointment start">
                <Input
                  required
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(event) =>
                    setForm({ ...form, scheduledStart: event.target.value })
                  }
                />
              </Field>
              <Field label="Expected service minutes">
                <Input
                  required
                  type="number"
                  min={15}
                  max={720}
                  step={15}
                  value={form.durationMinutes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      durationMinutes: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Road miles from prior stop">
                <Input
                  type="number"
                  min={0}
                  max={2500}
                  step="0.1"
                  value={form.legMiles}
                  onChange={(event) =>
                    setForm({ ...form, legMiles: event.target.value })
                  }
                  placeholder="Enter after route check"
                />
              </Field>
              <Field label="Drive minutes from prior stop">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  value={form.driveMinutes}
                  onChange={(event) =>
                    setForm({ ...form, driveMinutes: event.target.value })
                  }
                  placeholder="Enter after route check"
                />
              </Field>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
              Leaving travel blank is allowed, but the route stays visibly
              incomplete. Straight-line distance may be shown only as an
              estimate when both coordinates are available; it is never treated
              as verified road mileage.
            </div>
            {form.workOrderId&&form.technicianId?<AcademyJobCheck workOrderId={form.workOrderId} technicianId={form.technicianId}/>:null}
            <Button
              className="w-full"
              type="submit"
              disabled={
                schedule.isPending ||
                !form.workOrderId ||
                !form.technicianId ||
                !form.scheduledStart
              }
            >
              {schedule.isPending
                ? "Checking and saving…"
                : "Save appointment and route stop"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
