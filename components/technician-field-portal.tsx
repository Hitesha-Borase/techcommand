"use client";
const TechnicianWorkOrderCreate = lazy(() => import("@/components/technician-work-order-create").then(m => ({default:m.TechnicianWorkOrderCreate})));
const AssetScanner = lazy(() => import("@/components/asset-scanner").then(m => ({default:m.AssetScanner})));
const TechnicianRoutePlanner = lazy(() => import("@/components/technician-route-planner").then(m => ({default:m.TechnicianRoutePlanner})));
const FieldTrainingCenter = lazy(() => import("@/components/field-training-center").then(m => ({default:m.FieldTrainingCenter})));
const FieldCompletion = lazy(() => import("@/components/field-completion").then(m => ({default:m.FieldCompletion})));
const BiomedicalAcademy = lazy(() => import("@/components/biomedical-academy").then(m => ({default:m.BiomedicalAcademy})));
const AcademyHub = lazy(() => import("@/components/biomedical-academy").then(m => ({default:m.AcademyHub})));
const AvailableJobs = lazy(() => import("@/components/available-jobs").then(m => ({default:m.AvailableJobs})));
import { portalIdentityQuery } from "@/lib/portal-identity-client";
import { OfflineSyncBadge } from "@/components/offline-sync-badge";


import { portalFetch } from "@/lib/portal-fetch";

import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  CircuitBoard,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type {AcademyTrack} from "@/lib/academy-catalog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DispatchPayload,
  ScheduledJob,
} from "@/components/dispatch-center";

import { PLATFORM_BRAND } from "@/lib/platform-brand";

import { TechnicianOnboarding } from "@/components/technician-onboarding";
import { captureOperationalEvent } from "@/lib/analytics-client";
import { technicianAssignments } from "@/lib/technician-assignments";


import {
  optionalTravelAction,
  recordFieldProgress,
  startWorkOrderAction,
  type FieldProgressState,
  type FieldProgressConfirmation,
} from "@/lib/technician-workflow-launch";

import { payCollectionStatusLabel } from "@/lib/pay-collection-status";
import { biomedicalActivities } from "@/lib/biomedical-workflows";

type PaySummary = {
  technicianId: string;
  technicianCode: string;
  technicianName: string;
  jobCount: number;
  pendingCents: number;
  agreementCoveredCents: number;
  paidCents: number;
};

type PayEntry = {
  id: string;
  status: string;
  collectionStatus: string;
  payoutCents: number;
  workOrderNumber: string;
  summary: string;
  accountName: string;
};

type PayStub = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  jobCount: number;
  grossPayCents: number;
  pdfAttachmentId: string | null;
  confirmedAt: string | null;
};

type CareerPayload = {
  technicians: Array<{
    employmentType: string;
    payoutRate: number;
    currentHourlyRateCents: number;
    tenureDays: number;
    approvedJobs: number;
    qaPassRate: number;
    competencyScore: number;
    ceuCurrent: boolean;
    progression: {
      earnedTier: { name: string };
      nextTier: { name: string; rateCents: number } | null;
      blockers: string[];
      maintenanceStatus: "maintaining" | "review_required";
    };
  }>;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "The field portal could not update.");
  return data;
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function time(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function directions(address: string) {
  const query = new URLSearchParams({
    api: "1",
    destination: address,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}


function service(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function travel(job: ScheduledJob) {
  const values = [
    job.legMiles !== null ? `${job.legMiles} mi` : null,
    job.driveMinutes !== null ? `${job.driveMinutes} min` : null,
  ].filter(Boolean);
  if (values.length) return values.join(" · ");
  if (job.approximateLegMiles !== null && job.approximateLegMiles !== undefined)
    return `${job.approximateLegMiles} mi approximate`;
  return "Travel pending admin verification";
}

export function TechnicianFieldPortal({
  displayName,
  userId,
  onExit,
  onDmeWork,
}: {
  displayName: string;
  userId: string;
  onExit?: () => void;
  onDmeWork?: () => void;
}) {
  const queryClient = useQueryClient();
  const [serviceDate, setServiceDate] = useState(today);
  const [activeJob, setActiveJob] = useState("");
  const capability = useQuery(portalIdentityQuery);
  const [disciplineFilter,setDisciplineFilter] = useState("all");
  const [tab, setTab] = useState("today");
  const [extrasOpen,setExtrasOpen]=useState(false);
  const [scannerOpen,setScannerOpen]=useState(false);
  const [careerReviewRequested, setCareerReviewRequested] = useState(false);
  const [completionJob, setCompletionJob] = useState<ScheduledJob | null>(null);
  const dispatch = useQuery({
    queryKey: ["dispatch", serviceDate, "technician"],
    queryFn: () => api<DispatchPayload>(`/api/dispatch?date=${serviceDate}`),
  });
  const pay = useQuery({
    queryKey: ["technician-pay"],
    enabled: tab === "pay",
    queryFn: () =>
      api<{ summary: PaySummary[]; entries: PayEntry[]; payStubs: PayStub[] }>(
        "/api/pay",
      ),
  });
  const career = useQuery({
    queryKey: ["technician-career"],
    queryFn: () => api<CareerPayload>("/api/compensation"),
    enabled: careerReviewRequested,
  });
  const progress = useMutation({
    mutationFn: ({
      job,
      state,
    }: {
      job: ScheduledJob;
      state: FieldProgressState;
    }) =>
      recordFieldProgress(job, state, (input) => api<FieldProgressConfirmation>("/api/dispatch", {
        method: "PATCH",
        body: JSON.stringify({
          action: "progress",
          ...input,
        }),
      }), setCompletionJob),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      captureOperationalEvent("technician_status_updated", { status: variables.state });
      if (variables.state === "service_in_progress") {
        captureOperationalEvent("technician_completion_opened", { status: "in_progress" });
        toast.success("Job started — follow the guided workflow");
      } else toast.success("Field status updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const confirmPay = useMutation({
    mutationFn: (payStubId: string) =>
      api("/api/pay", {
        method: "POST",
        body: JSON.stringify({ action: "confirm_pay_stub", payStubId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["technician-pay"] });
      captureOperationalEvent("technician_pay_acknowledged");
      toast.success("Pay statement acknowledged");
    },
    onError: (error) => toast.error(error.message),
  });
  const chooseWorkflow=useMutation({
    mutationFn:async({job,serviceType}:{job:ScheduledJob;serviceType:string})=>{
      const result=await api<{workOrderId:string;serviceType:string}>("/api/biomedical-workflow",{method:"POST",body:JSON.stringify({workOrderId:job.id,serviceType,previousServiceType:job.serviceType})});
      if(result.workOrderId!==job.id||result.serviceType!==serviceType)throw new Error("Workflow selection was not confirmed. Refresh this assignment before retrying.");
      await progress.mutateAsync({job:{...job,serviceType},state:"service_in_progress"});
    },
    onError:error=>toast.error(error.message),
  });
  const activeRoute =
    dispatch.data?.routes.find(
      (route) => route.technicianId === dispatch.data?.technicianId,
    ) || dispatch.data?.routes[0];
  const allJobs = technicianAssignments(activeRoute?.stops || [], dispatch.data?.scheduled || []);
  const jobs = allJobs.filter(job => disciplineFilter === "all" || (job.serviceType.startsWith("biomed_") ? "biomedical" : "dme_mobility") === disciplineFilter);
  const canCreateBiomedical = true;
  const canUseBiomedical = canCreateBiomedical || allJobs.some(job=>job.serviceType.startsWith("biomed_"));
  const pendingPay = pay.data?.summary.reduce(
    (sum, item) => sum + Number(item.pendingCents || 0),
    0,
  );
  const confirmedJobs = pay.data?.summary.reduce(
    (sum, item) => sum + Number(item.jobCount || 0),
    0,
  );
  const agreementCoveredPay = pay.data?.summary.reduce(
    (sum, item) => sum + Number(item.agreementCoveredCents || 0),
    0,
  );
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    captureOperationalEvent("technician_portal_opened", { role: "technician" });
  }, []);

  return (
    <div className="techcommand-canvas min-h-screen text-slate-900">
      <header className="techcommand-sidebar sticky top-0 z-20 border-b border-white/10 text-white">
        <div className="mx-auto flex min-h-[70px] max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="techcommand-mark grid size-10 place-items-center rounded-xl">
            <CircuitBoard className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{PLATFORM_BRAND.name} Field</p>
            <p className="text-xs text-cyan-100/70">
              by {PLATFORM_BRAND.publisher}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OfflineSyncBadge />
            {onExit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onExit}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                Return to admin
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        {onDmeWork&&<Button variant="outline" className="min-h-12 h-auto w-full whitespace-normal py-3 sm:w-auto" onClick={onDmeWork}>DME / Mobility · SpinLife work orders</Button>}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-[#123b70] to-[#155eef] p-5 text-white shadow-lg shadow-blue-900/10">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-white/15 font-bold">
              {initials}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-200">
                {serviceDate === today() ? "Your assignments" : "Scheduled field view"}
              </p>
              <h1 className="mt-1 text-xl font-bold">
                Good morning, {displayName.split(" ")[0]}
              </h1>
              <p className="mt-1 text-sm text-blue-100/80">
                {dispatch.isLoading
                  ? "Loading today’s assignments…"
                  : `${jobs.length} assignment${jobs.length === 1 ? "" : "s"} · ${activeRoute?.totalMiles ?? "travel pending"} ${activeRoute?.totalMiles !== null && activeRoute?.totalMiles !== undefined ? "verified miles" : ""}`}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-100">
            <span className="size-2 rounded-full bg-emerald-300" /> Your work
          </span>
        </section>

        {dispatch.error ? (
          <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {dispatch.error.message}
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => { setTab(value); captureOperationalEvent("technician_tab_viewed", { tab: value }); }}>
          <TabsList className="techcommand-field-tabs grid h-auto w-full grid-cols-2 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-3 lg:grid-cols-7 bg-white p-1 shadow-sm">
            <TabsTrigger value="today" className="py-2.5">
              <CalendarDays /> {serviceDate === today() ? "Today" : "Assignments"}
            </TabsTrigger>
            {canUseBiomedical && <TabsTrigger value="assets" className="py-2.5">Biomedical / PM</TabsTrigger>}
            <TabsTrigger value="route" className="py-2.5">
              <Route /> Route
            </TabsTrigger>
            <TabsTrigger value="pay" className="py-2.5">
              <CircleDollarSign /> Pay
            </TabsTrigger>
            <TabsTrigger value="training">Field training</TabsTrigger>
            <TabsTrigger value="academy" className="py-2.5">My Career</TabsTrigger>
            <TabsTrigger value="profile" className="py-2.5">
              <UserRound /> Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="training" className="mt-5"><Suspense fallback={<p>Loading training…</p>}><FieldTrainingCenter /></Suspense></TabsContent>
          <TabsContent value="academy" className="mt-5"><Suspense fallback={<p>Loading Academy…</p>}><AcademyHub tracks={capability.data?.serviceDisciplines.filter((t):t is AcademyTrack=>t==="biomedical"||t==="dme_mobility")}/></Suspense></TabsContent>
          <TabsContent value="assets" className="mt-5 space-y-4"><h2 className="text-xl font-bold">Biomedical / PM facilities and assets</h2><p className="text-sm text-slate-600">Biomedical service uses facility asset identity, applicable manufacturer procedures, measurements, and per-asset history. DME / Mobility follows the partner work order and product-specific delivery or repair requirements.</p>{canCreateBiomedical ? <Suspense fallback={<p>Loading visit setup…</p>}><TechnicianWorkOrderCreate initiallyOpen onCreated={async scheduledStart => {setServiceDate(scheduledStart?.slice(0,10)||today());setDisciplineFilter("biomedical");setTab("today");await queryClient.invalidateQueries({queryKey:["dispatch"]});}} /></Suspense> : <p className="rounded border p-4">Biomedical capability has not been recorded on your profile. Existing assigned work is available under Assignments. Administrators manage Service capabilities in the technician roster.</p>}<details onToggle={event=>setScannerOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer font-semibold">Scan a biomedical asset label</summary>{scannerOpen ? <Suspense fallback={<p>Loading scanner…</p>}><AssetScanner onOpenJob={job => {
            if (!job.visitDate || !job.assignmentId) return;
            setServiceDate(job.visitDate); setActiveJob(job.assignmentId); setTab("today");
          }} /></Suspense> : null}</details></TabsContent>
          <TabsContent value="today" className="mt-5 space-y-4">
            <details onToggle={event=>setExtrasOpen(event.currentTarget.open)} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Available work / learning (optional)</summary>{extrasOpen ? <Suspense fallback={<p>Loading optional tools…</p>}>{capability.data?.serviceDisciplines.length?<BiomedicalAcademy compact track={canCreateBiomedical?"biomedical":"dme_mobility"} onOpen={()=>setTab("academy")}/>:null}<AvailableJobs /></Suspense> : null}</details>
            <div className="flex flex-wrap gap-2" aria-label="Assignment work type">{[["all","All assignments"],["biomedical","Biomedical / PM"],["dme_mobility","DME / Mobility"]].map(([value,label])=><Button key={value} variant={disciplineFilter===value?"default":"outline"} onClick={()=>setDisciplineFilter(value)}>{label}</Button>)}</div>
            {serviceDate !== today() && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm">
              <p>Showing the scanned asset&apos;s scheduled assignments for <strong>{serviceDate}</strong>.</p>
              <Button variant="outline" onClick={() => { setServiceDate(today()); setActiveJob(""); }}>Back to today</Button>
            </div>}
            {dispatch.isLoading ? (
              <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
                Loading assignments for {serviceDate}…
              </div>
            ) : null}
            {dispatch.isError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              The current assignments could not be loaded. Check your connection and retry.
              <Button variant="outline" className="ml-2" onClick={() => { void dispatch.refetch(); }}>Retry assignments</Button>
            </div>}
            {dispatch.isSuccess && activeJob && !jobs.some(job => job.assignmentId === activeJob) && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              This assignment is no longer in your current schedule. Scan again or contact dispatch.
              <Button variant="outline" className="ml-2" onClick={() => { setActiveJob(""); setTab("assets"); }}>Scan again</Button>
            </div>}
            {dispatch.isSuccess && !jobs.length ? (
              <div className="rounded-xl border bg-white p-10 text-center">
                <CalendarDays className="mx-auto size-7 text-blue-600" />
                <p className="mt-3 font-bold">No assigned work for {serviceDate}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Work you create or receive appears here, even before a time is chosen.
                </p>
              </div>
            ) : null}
            {jobs.map((job, index) => {
              const expanded = activeJob === job.assignmentId;
              const startAction = startWorkOrderAction(job);
              const travelAction = optionalTravelAction(job);
              return (
                <article
                  key={job.assignmentId}
                  className={`rounded-xl border bg-white p-4 transition ${expanded ? "border-blue-300 ring-2 ring-blue-100" : ""}`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-blue-700">
                            {job.externalId}
                          </p>
                          <h2 className="mt-1 font-bold">
                            {job.serviceType.startsWith("biomed_") ? job.accountName : service(job.serviceType)}
                          </h2>
                        </div>
                        <Badge variant="outline">
                          {time(job.scheduledStart)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-600">
                        {job.serviceType.startsWith("biomed_") ? (biomedicalActivities.find(item=>item.serviceType===job.serviceType)?.label||service(job.serviceType)) : job.accountName}
                      </p>
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        {job.address}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <Clock3 className="size-3.5" />
                        {travel(job)}
                      </p>
                      {expanded ? (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                          <p className="font-semibold">{job.summary}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Role: {job.assignmentRole} · Field status:{" "}
                            {job.assignmentStatus.replaceAll("_", " ")}
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {job.assignmentStatus === "submitted" ||
                        ["completed","technician_submitted"].includes(job.status) ? (
                          <Button size="sm" variant="outline" onClick={() => setCompletionJob(job)}><FileCheck2 /> View / add notes</Button>
                        ) : job.status === "in_progress" ? (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => { setCompletionJob(job); captureOperationalEvent("technician_completion_opened", { status: job.status }); }}
                          >
                            <FileCheck2 /> Continue Work Order
                          </Button>
                        ) : startAction && job.serviceType.startsWith("biomed_") ? (
                          <Button className="min-h-11" onClick={()=>setActiveJob(expanded?"":job.assignmentId)}>Open facility</Button>
                        ) : startAction ? (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={progress.isPending}
                            onClick={() => progress.mutate({ job, state: startAction.state })}
                          >
                            <Wrench /> {startAction.label}
                          </Button>
                        ) : (
                          <Badge className="bg-emerald-600">
                            Ready for service
                          </Badge>
                        )}
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={directions(job.address)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Navigation /> Navigate
                          </a>
                        </Button>
                        {travelAction ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={progress.isPending}
                            onClick={() => progress.mutate({ job, state: travelAction.state })}
                          >
                            {travelAction.label}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setActiveJob(expanded ? "" : job.assignmentId)
                          }
                        >
                          {expanded ? "Hide details" : "View assignment"}
                        </Button>
                      </div>
                      {expanded&&startAction&&job.serviceType.startsWith("biomed_")&&<section className="mt-4 space-y-3"><h3 className="font-bold">What are you doing at this facility?</h3><div className="grid gap-3 sm:grid-cols-3">{biomedicalActivities.map(activity=><Button key={activity.serviceType} variant="outline" className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-left" disabled={chooseWorkflow.isPending||progress.isPending} onClick={()=>chooseWorkflow.mutate({job,serviceType:activity.serviceType})}><span className="font-bold">{activity.label}</span><span className="text-sm font-normal">{activity.description}</span></Button>)}</div><p className="text-sm text-slate-600">Choose an activity to start. Save unfinished work throughout; no pricing or billing is created here.</p></section>}
                    </div>
                  </div>
                </article>
              );
            })}
          </TabsContent>

          <TabsContent value="route" className="mt-5">
            {activeRoute ? <Suspense fallback={<p>Loading route…</p>}><TechnicianRoutePlanner key={activeRoute.id} route={activeRoute} actorUserId={userId} /></Suspense> : <p className="rounded-xl border bg-white p-5">No route is assigned for today. Ask dispatch to schedule your stops.</p>}
          </TabsContent>

          <TabsContent value="pay" className="mt-5 space-y-4">
            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border bg-white p-4">
                <p className="text-sm text-slate-500">Confirmed, not paid</p>
                <p className="mt-2 text-3xl font-bold">{money(pendingPay)}</p>
                <p className="mt-2 text-xs text-slate-500">
                  From QA-approved work orders
                </p>
                {agreementCoveredPay ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    {money(agreementCoveredPay)} is covered by annual agreements and remains in normal payroll.
                  </p>
                ) : null}
              </article>
              <article className="rounded-xl border bg-white p-4">
                <p className="text-sm text-slate-500">Confirmed jobs</p>
                <p className="mt-2 text-3xl font-bold">{confirmedJobs || 0}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Only approved submissions count
                </p>
              </article>
              <article className="rounded-xl border bg-[#102748] p-4 text-white">
                <p className="text-sm text-blue-200">Pay visibility</p>
                <p className="mt-2 text-lg font-bold">Your records only</p>
                <p className="mt-2 text-xs text-blue-100/70">
                  Company revenue and other technicians remain private
                </p>
              </article>
            </section>
            <article className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b p-4">
                <h2 className="font-bold">Pay ledger</h2>
                <p className="mt-1 text-xs text-slate-500">
                  A covered visit can have a $0 completion invoice while your approved pay remains due.
                </p>
              </div>
              {pay.data?.entries.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>WORK ORDER</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead className="text-right">YOUR PAY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pay.data.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <p className="font-mono text-xs font-bold">
                            {entry.workOrderNumber}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.summary}
                          </p>
                        </TableCell>
                        <TableCell className="capitalize">
                          <p>{entry.status.replaceAll("_", " ")}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {payCollectionStatusLabel(entry.collectionStatus)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {money(entry.payoutCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  No confirmed pay records yet.
                </div>
              )}
            </article>
            <article className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b p-4">
                <h2 className="font-bold">Weekly pay statements</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The prior week closes Wednesday at 3:00 PM Eastern; your
                  statement is generated on the first authorized portal check
                  after cutoff.
                </p>
              </div>
              {pay.data?.payStubs.length ? (
                <div className="divide-y">
                  {pay.data.payStubs.map((stub) => (
                    <div
                      key={stub.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          {stub.periodStart} through {stub.periodEnd}
                        </p>
                        <p className="mt-1 text-xs capitalize text-slate-500">
                          {stub.jobCount} job{stub.jobCount === 1 ? "" : "s"} ·{" "}
                          {stub.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">
                          {money(stub.grossPayCents)}
                        </span>
                        {stub.pdfAttachmentId ? (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`/api/attachments?attachmentId=${stub.pdfAttachmentId}`}
                            >
                              <FileCheck2 /> PDF
                            </a>
                          </Button>
                        ) : null}
                        {!stub.confirmedAt ? (
                          <Button
                            size="sm"
                            disabled={confirmPay.isPending}
                            onClick={() => confirmPay.mutate(stub.id)}
                          >
                            <BadgeCheck /> Acknowledge
                          </Button>
                        ) : (
                          <Badge className="bg-emerald-600">Confirmed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  Statements appear after the first Wednesday payroll close.
                </div>
              )}
            </article>
          </TabsContent>

          <TabsContent
            value="profile"
            className="mt-5 grid gap-5 lg:grid-cols-2"
          >
            <article className="rounded-xl border bg-white p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold">Career ladder (optional)</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Credential evidence and CEUs are checked only for a requested
                    career-ladder review. They do not block routine work or existing pay.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCareerReviewRequested((requested) => !requested)}
                >
                  {careerReviewRequested ? "Close career-ladder review" : "Review career ladder"}
                </Button>
              </div>
              {careerReviewRequested && career.isPending ? (
                <p className="mt-3 text-sm text-slate-500">Loading requested review…</p>
              ) : careerReviewRequested && career.isError ? (
                <p className="mt-3 text-sm text-red-700">Career-ladder review could not load. Routine work remains available.</p>
              ) : null}
            </article>
            {careerReviewRequested && career.data?.technicians[0]?.employmentType === "contractor" ? (
              <article className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-5 lg:col-span-2">
                <h2 className="font-bold">Contractor compensation</h2>
                <p className="mt-2 text-sm text-slate-600">Your approved work-order allocation is {(Number(career.data.technicians[0].payoutRate) * 100).toFixed(1)}%. Contractors do not enter the employee hourly progression ladder.</p>
              </article>
            ) : careerReviewRequested && career.data?.technicians[0] ? (
              <article className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-5 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="size-5 text-blue-700" />
                      <h2 className="font-bold">Career progression</h2>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {career.data.technicians[0].progression.earnedTier.name} ·{" "}
                      {career.data.technicians[0].approvedJobs} approved jobs ·{" "}
                      {career.data.technicians[0].competencyScore}% competency
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Current rate
                    </p>
                    <p className="mt-1 text-2xl font-black text-blue-800">
                      {money(career.data.technicians[0].currentHourlyRateCents)}
                      /hr
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-blue-200 bg-white/75 p-3 text-sm leading-6 text-slate-700">
                  {career.data.technicians[0].progression.nextTier ? (
                    <>
                      <span className="font-bold">
                        Next:{" "}
                        {career.data.technicians[0].progression.nextTier.name}{" "}
                        at{" "}
                        {money(
                          career.data.technicians[0].progression.nextTier
                            .rateCents,
                        )}
                        /hr.
                      </span>{" "}
                      {career.data.technicians[0].progression.blockers
                        .slice(0, 3)
                        .join(" · ")}
                    </>
                  ) : (
                    <span className="font-bold">
                      Top tier achieved. Credential and CEU evidence is reviewed
                      when a career-ladder review is requested; existing pay is unchanged.
                    </span>
                  )}
                </div>
              </article>
            ) : null}
            <article className="rounded-xl border bg-white p-5">
              <div className="flex items-center gap-3">
                <UserRound className="size-5 text-blue-600" />
                <h2 className="font-bold">Employee file</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Your contact information, employment record, service territory,
                and company documents are controlled by TechFlex administrators.
              </p>
            </article>
            <article className="rounded-xl border bg-white p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-600" />
                <h2 className="font-bold">Credentials</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Existing credential records remain in your protected employee
                file. Documents and CEU evidence are optional for routine work
                and are needed only when a career-ladder review is requested.
              </p>
            </article>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white p-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" /> Live updates require a connection
          </span>
          <span className="flex items-center gap-1.5">
            <FileCheck2 className="size-3.5" /> Evidence remains required before
            submission
          </span>
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="size-3.5" /> Admin approval controls pay
          </span>
        </div>
      </main>
      {completionJob ? <Suspense fallback={<p className="fixed bottom-4 left-4 rounded-lg border bg-white p-3">Opening notes…</p>}><FieldCompletion
        job={completionJob}
        actorUserId={userId}
        open={Boolean(completionJob)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCompletionJob(null);
        }}
      /></Suspense> : null}
      <TechnicianOnboarding onNavigate={setTab} />
    </div>
  );
}
