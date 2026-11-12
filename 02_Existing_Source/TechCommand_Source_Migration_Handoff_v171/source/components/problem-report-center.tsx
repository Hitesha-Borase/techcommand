"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type ProblemReport = {
  id: string;
  module: string;
  category: string;
  referenceId: string;
  summary: string;
  steps: string;
  expected: string;
  actual: string;
  errorMessage: string;
  reporterRole: string;
  receipt: string;
  priority: "high" | "normal";
  status: "open" | "in_progress" | "complete";
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
};

function dateTime(value: string) {
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

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ProblemReportCenter() {
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: ["problem-reports"],
    queryFn: async () => {
      const response = await portalFetch("/api/problem-reports", { cache: "no-store" });
      return portalJson<{ reports: ProblemReport[] }>(response, "Problem reports could not be loaded.");
    },
    refetchOnWindowFocus: true,
  });
  const update = useMutation({
    mutationFn: async ({ report, status }: { report: ProblemReport; status: "in_progress" | "complete" }) => {
      const response = await portalFetch("/api/problem-reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: report.id, version: report.recordVersion, status }),
      });
      return portalJson<{ report: { id: string; status: string; recordVersion: number } }>(response, "The review status could not be confirmed.");
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["problem-reports"] }),
        client.invalidateQueries({ queryKey: ["control-tower"] }),
      ]);
      toast.success(variables.status === "complete" ? "Problem report resolved" : "Review started");
    },
    onError: async (error) => {
      await client.invalidateQueries({ queryKey: ["problem-reports"] });
      toast.error(error instanceof Error ? error.message : "Refresh and compare before trying again.");
    },
  });

  return (
    <section className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Bug className="size-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">Problem report review</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Review privacy-safe portal reports. A changed report must be refreshed before another decision can be saved.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => reports.refetch()} disabled={reports.isFetching}>
          <RefreshCw className={reports.isFetching ? "animate-spin" : ""} /> Refresh and compare
        </Button>
      </div>

      {reports.isLoading ? (
        <div className="flex min-h-32 items-center justify-center gap-2 p-6 text-sm font-semibold text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Loading problem reports…</div>
      ) : reports.error ? (
        <div role="alert" className="m-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">Problem reports are unavailable.</p><p className="mt-1">{reports.error.message}</p></div></div>
      ) : reports.data?.reports.length ? (
        <div className="divide-y">
          {reports.data.reports.map((report) => (
            <details key={`${report.id}-${report.recordVersion}`} className="group p-5 open:bg-slate-50/60">
              <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={report.status === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : report.status === "in_progress" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-800"}>{report.status === "complete" ? "Resolved" : report.status === "in_progress" ? "Reviewing" : "New"}</Badge>
                    <Badge variant="outline">{label(report.category)}</Badge>
                    {report.priority === "high" ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">High priority</Badge> : null}
                    <span className="text-xs text-slate-500">Receipt {report.receipt.toUpperCase()}</span>
                  </div>
                  <p className="mt-2 font-bold text-slate-900">{report.module}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{report.summary}</p>
                </div>
                <span className="text-xs text-slate-500">{dateTime(report.createdAt)}</span>
              </summary>
              <div className="mt-5 grid gap-4 border-t pt-5 text-sm md:grid-cols-2">
                {report.referenceId ? <div><p className="font-semibold text-slate-500">Work order or request ID</p><p className="mt-1 font-mono text-slate-800">{report.referenceId}</p></div> : null}
                <div><p className="font-semibold text-slate-500">Reporter role</p><p className="mt-1 text-slate-800">{label(report.reporterRole)}</p></div>
                {report.steps ? <div className="md:col-span-2"><p className="font-semibold text-slate-500">Steps</p><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{report.steps}</p></div> : null}
                {report.expected ? <div><p className="font-semibold text-slate-500">Expected</p><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{report.expected}</p></div> : null}
                {report.actual ? <div><p className="font-semibold text-slate-500">Actual</p><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{report.actual}</p></div> : null}
                {report.errorMessage ? <div className="md:col-span-2 rounded-lg border border-red-100 bg-red-50 p-3"><p className="font-semibold text-red-800">Displayed error</p><p className="mt-1 whitespace-pre-wrap leading-6 text-red-900">{report.errorMessage}</p></div> : null}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-xs text-slate-500">Review checkpoint v{report.recordVersion} · updated {dateTime(report.updatedAt)}</p>
                {report.status === "complete" ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-4" /> Final status locked</span> : <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={update.isPending || report.status === "in_progress"} onClick={() => update.mutate({ report, status: "in_progress" })}><SearchCheck /> Start review</Button><Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ report, status: "complete" })}><CheckCircle2 /> Mark resolved</Button></div>}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center"><CheckCircle2 className="mx-auto size-8 text-emerald-600" /><p className="mt-3 font-semibold text-slate-800">No problem reports are waiting.</p><p className="mt-1 text-sm text-slate-500">New reports will appear here with a private receipt and review checkpoint.</p></div>
      )}
    </section>
  );
}
