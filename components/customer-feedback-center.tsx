"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Mail,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FollowUp = {
  id: string;
  channel: "email" | "sms";
  destination: string | null;
  campaignName: string;
  status: string;
  messageSubject: string | null;
  messageBody: string;
  reviewUrl: string | null;
  workOrderNumber: string;
  summary: string;
  accountName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  missing: string[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Follow-up workflow failed.");
  return data;
}

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function CustomerFeedbackCenter() {
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: ["customer-feedback"],
    queryFn: () =>
      api<{
        requests: FollowUp[];
        emailIntegration: { configured: boolean; missing: string[] };
      }>("/api/customer-feedback"),
  });
  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/customer-feedback", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["customer-feedback"] }),
        client.invalidateQueries({ queryKey: ["admin-tasks"] }),
      ]);
      toast.success(
        variables.action === "sync_email"
          ? "Review email queue processed"
          : variables.action === "suppress_sms"
            ? "SMS follow-up suppressed"
            : "800.com enrollment confirmed",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const active =
    queue.data?.requests.filter(
      (item) => !["sent", "enrolled", "suppressed"].includes(item.status),
    ) || [];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border bg-white p-5">
          <Mail className="size-5 text-blue-600" />
          <p className="mt-3 text-xs font-bold uppercase text-slate-500">
            Workspace email
          </p>
          <p className="mt-2 text-2xl font-bold">
            {active.filter((item) => item.channel === "email").length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Queued or blocked review requests
          </p>
        </article>
        <article className="rounded-xl border bg-white p-5">
          <MessageSquareText className="size-5 text-violet-600" />
          <p className="mt-3 text-xs font-bold uppercase text-slate-500">
            800.com actions
          </p>
          <p className="mt-2 text-2xl font-bold">
            {active.filter((item) => item.channel === "sms").length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Manual campaign enrollments pending
          </p>
        </article>
        <article className="rounded-xl border bg-[#102748] p-5 text-white">
          <ShieldCheck className="size-5 text-emerald-300" />
          <p className="mt-3 text-xs font-bold uppercase text-blue-200">
            Review policy
          </p>
          <p className="mt-2 font-bold">Every completed customer</p>
          <p className="mt-1 text-xs text-blue-100/70">
            Neutral request; no rating gate or selective sending
          </p>
        </article>
      </section>

      {!queue.data?.emailIntegration.configured ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div>
            <p className="font-bold">Automatic Gmail sending needs setup</p>
            <p className="mt-1 text-xs">
              Missing:{" "}
              {queue.data?.emailIntegration.missing.join(", ") ||
                "configuration"}
              . Requests remain safely queued.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate({ action: "sync_email" })}
          >
            <RefreshCw /> Retry email queue
          </Button>
        </section>
      ) : null}

      <section className="space-y-3">
        {queue.isLoading ? (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
            Loading post-service follow-ups…
          </div>
        ) : null}
        {queue.error ? (
          <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <CircleAlert className="size-4" /> {queue.error.message}
          </div>
        ) : null}
        {!queue.isLoading && !queue.data?.requests.length ? (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
            <CheckCircle2 className="mx-auto mb-3 size-7 text-emerald-600" />{" "}
            Follow-ups will appear after the first QA-approved completion.
          </div>
        ) : null}
        {queue.data?.requests.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-10 place-items-center rounded-lg ${item.channel === "email" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}
                >
                  {item.channel === "email" ? (
                    <Mail className="size-5" />
                  ) : (
                    <MessageSquareText className="size-5" />
                  )}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{item.customerName}</p>
                    <Badge variant="outline" className="capitalize">
                      {pretty(item.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.workOrderNumber} · {item.accountName} · {item.summary}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(item.messageBody);
                    toast.success("Follow-up instructions copied");
                  }}
                >
                  <Copy /> Copy
                </Button>
                {item.channel === "sms" &&
                item.status === "admin_action_required" ? (
                  <Button
                    size="sm"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        action: "mark_sms_enrolled",
                        feedbackRequestId: item.id,
                      })
                    }
                  >
                    <CheckCircle2 /> Mark enrolled
                  </Button>
                ) : null}
                {item.channel === "sms" &&
                !["enrolled", "suppressed"].includes(item.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        action: "suppress_sms",
                        feedbackRequestId: item.id,
                      })
                    }
                  >
                    No SMS consent
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Destination
                </p>
                <p className="mt-1 font-semibold">
                  {item.destination || "Missing"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Campaign
                </p>
                <p className="mt-1 font-semibold">{item.campaignName}</p>
              </div>
            </div>
            {item.missing.length ? (
              <p className="mt-3 flex gap-2 text-sm font-semibold text-amber-700">
                <CircleAlert className="mt-0.5 size-4" /> Still needed:{" "}
                {item.missing.join(", ")}
              </p>
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-600">
              {item.messageBody}
            </pre>
          </article>
        ))}
      </section>
    </div>
  );
}
