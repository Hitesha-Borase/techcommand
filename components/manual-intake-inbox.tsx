"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  evaluateIntake,
  type IntakeData,
  type IntakeIssue,
} from "@/lib/intake-completeness";

type StoredIssue = IntakeIssue & {
  severity: "blocking" | "recommended";
};

export type ManualIntakeRecord = {
  id: string;
  source: string;
  externalId: string | null;
  noticeType: string;
  sourceDetailUrl: string | null;
  responseDueAt: string | null;
  status: string;
  editor?: "spinlife" | "intake";
  convertedWorkOrderId?: string | null;
  recordVersion?: number;
  blockingCount: number;
  missingFields: StoredIssue[];
  data: IntakeData;
  accountName: string | null;
  locationName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "The intake inbox could not be updated.");
  return data;
}

const statusStyles: Record<string, string> = {
  needs_information: "border-amber-200 bg-amber-50 text-amber-800",
  ready_for_pricing: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancellation_review: "border-red-200 bg-red-50 text-red-700",
};

const noticeLabels: Record<string, string> = {
  new_assignment: "New assignment",
  scheduling_reminder: "Scheduling reminder",
  cancellation: "Cancellation",
  authorization_update: "Authorization update",
  general_update: "General update",
};

function dateTime(value: string | null) {
  if (!value) return "No exact deadline entered";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ManualIntakeInbox({
  onResume,
}: {
  onResume: (record: ManualIntakeRecord) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["work-order-intakes"],
    queryFn: () => json<{ intakes: ManualIntakeRecord[] }>("/api/intakes"),
  });
  const archive = useMutation({
    mutationFn: (id: string) =>
      json("/api/intakes", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "archive" }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-order-intakes"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
      ]);
      toast.success("Intake archived");
    },
    onError: (error) => toast.error(error.message),
  });
  const intakes = query.data?.intakes ?? [];
  const needsData = intakes.filter(
    (item) => item.status === "needs_information",
  ).length;
  const ready = intakes.filter(
    (item) => item.status === "ready_for_pricing",
  ).length;
  const cancellations = intakes.filter(
    (item) => item.status === "cancellation_review",
  ).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <CircleAlert className="size-4" />
            </span>
            <span className="text-2xl font-bold text-slate-900">
              {needsData}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">
            Need information
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Held before pricing or dispatch
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-4" />
            </span>
            <span className="text-2xl font-bold text-slate-900">{ready}</span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">
            Ready for pricing
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Critical intake fields complete
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-lg bg-red-50 text-red-700">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-2xl font-bold text-slate-900">
              {cancellations}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">
            Cancellation review
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Stop dispatch and document disposition
          </p>
        </article>
      </section>

      <article className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="size-5 text-blue-700" />
              <h2 className="font-bold text-slate-900">Manual intake inbox</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Every external notice stays here until an administrator supplies
              the missing data or closes the exception.
            </p>
          </div>
          <Badge variant="outline">{intakes.length} open records</Badge>
        </div>
        {query.isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading the intake inbox…
          </div>
        ) : null}
        {query.error ? (
          <div className="flex gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {query.error.message}
          </div>
        ) : null}
        {!query.isLoading && !intakes.length ? (
          <div className="p-12 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-blue-50 text-blue-700">
              <Inbox className="size-5" />
            </span>
            <p className="mt-3 font-bold text-slate-900">
              No manual intakes waiting
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Paste the next assignment, cancellation, or reminder to start its
              controlled checklist.
            </p>
          </div>
        ) : null}
        {intakes.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[840px]">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="pl-5 min-w-[130px]">WORK ORDER</TableHead>
                  <TableHead className="min-w-[140px]">NOTICE / SOURCE</TableHead>
                  <TableHead className="min-w-[140px]">COMPLETENESS</TableHead>
                  <TableHead className="min-w-[240px] max-w-[320px]">NEXT REQUIRED DATA</TableHead>
                  <TableHead className="min-w-[150px]">DEADLINE</TableHead>
                  <TableHead className="pr-5 text-right min-w-[130px]">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intakes.map((record) => {
                  const evaluation = evaluateIntake(record.data);
                  const blockers = record.missingFields.filter(
                    (item) => item.severity === "blocking",
                  );
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="pl-5 align-top whitespace-normal">
                        <p className="font-mono text-xs font-bold text-slate-900">
                          {record.externalId || "Number missing"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.accountName || "Account not linked"}
                          {record.locationName
                            ? ` · ${record.locationName}`
                            : ""}
                        </p>
                        <Badge
                          variant="outline"
                          className={`mt-2 capitalize ${statusStyles[record.status] || ""}`}
                        >
                          {record.status.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <p className="text-sm font-semibold text-slate-800">
                          {noticeLabels[record.noticeType] || record.noticeType}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs capitalize text-slate-500">
                          {record.source}
                          {record.sourceDetailUrl ? (
                            <a
                              href={record.sourceDetailUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                            >
                              Open source <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40 align-top whitespace-normal">
                        {record.editor==="spinlife"?<p className="text-sm font-semibold text-blue-700">SpinLife saved record</p>:<>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-600">
                            {evaluation.score}% ready
                          </span>
                          <span className="text-slate-400">
                            {blockers.length} blocking
                          </span>
                        </div>
                        <Progress
                          value={evaluation.score}
                          className="mt-2 h-2"
                        />
                        </>}
                      </TableCell>
                      <TableCell className="min-w-[240px] max-w-[320px] align-top whitespace-normal">
                        {record.editor==="spinlife"?<p className="text-xs leading-relaxed text-slate-600">Add known details in the SpinLife editor. Missing details do not block saving; completion and billing stay separate.</p>:blockers.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {blockers.slice(0, 4).map((item) => (
                              <span
                                key={item.key}
                                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
                                title={item.reason}
                              >
                                {item.label}
                              </span>
                            ))}
                            {blockers.length > 4 ? (
                              <span className="px-1 py-1 text-xs font-bold text-slate-500">
                                +{blockers.length - 4} more
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                            <CheckCircle2 className="size-4" /> Critical data
                            complete
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <span className="inline-flex items-start gap-1.5 text-xs text-slate-600">
                          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                          {dateTime(record.responseDueAt)}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 align-top whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => onResume(record)}>
                            {record.editor==="spinlife" ? "Open / update" : record.status === "ready_for_pricing"
                              ? "Price"
                              : record.status === "cancellation_review"
                                ? "Review"
                                : "Continue"}
                            <ArrowRight />
                          </Button>
                          {record.editor!=="spinlife"?<Button
                            size="icon-sm"
                            variant="outline"
                            aria-label={`Archive ${record.externalId || "intake"}`}
                            onClick={() => archive.mutate(record.id)}
                            disabled={archive.isPending}
                          >
                            <Archive />
                          </Button>:null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </article>
    </div>
  );
}
