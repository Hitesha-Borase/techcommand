"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileWarning, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Amendment = {
  requestId: string;
  reportVersion: number;
  reportPdfAttachmentId: string;
  reason: string;
  proposedCorrection: string;
  requestedAt: string;
  requestedBy: string;
  status: "pending" | "approved" | "declined";
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  replacement: null | {
    replacementId: string;
    status: "pending" | "approved" | "declined";
    preparedBy: string;
    preparedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNotes: string | null;
    attachmentId: string | null;
    fileName: string | null;
  };
};

type Payload = {
  amendments: Amendment[];
  canRequest: boolean;
  canReview: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return portalJson<T>(response, "The report amendment could not be saved.");
}

function stamp(value: string | null) {
  return value ? value.replace("T", " ").replace("Z", " UTC") : "";
}

export function ReportAmendments({
  reportId,
  reportVersion,
  reportRecordVersion,
  reportPdfAttachmentId,
}: {
  reportId: string;
  reportVersion: number;
  reportRecordVersion: number;
  reportPdfAttachmentId: string | null;
}) {
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [correction, setCorrection] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [replacementAttestations, setReplacementAttestations] = useState<Record<string, boolean>>({});
  const [replacementReviewNotes, setReplacementReviewNotes] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["report-amendments", reportId],
    queryFn: () => api<Payload>(`/api/report-amendments?reportId=${encodeURIComponent(reportId)}`),
  });
  const requestAmendment = useMutation({
    mutationFn: () => api<{ status: string }>("/api/report-amendments", {
      method: "POST",
      body: JSON.stringify({
        action: "request",
        requestId: crypto.randomUUID(),
        reportId,
        expectedReportVersion: reportVersion,
        expectedReportRecordVersion: reportRecordVersion,
        expectedReportPdfAttachmentId: reportPdfAttachmentId,
        reason,
        proposedCorrection: correction,
      }),
    }),
    onSuccess: async () => {
      setReason("");
      setCorrection("");
      await client.invalidateQueries({ queryKey: ["report-amendments", reportId] });
      toast.success("Correction request recorded without changing the approved packet");
    },
    onError: (error) => toast.error(error.message),
  });
  const reviewAmendment = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: "approved" | "declined" }) =>
      api<{ status: string }>("/api/report-amendments", {
        method: "POST",
        body: JSON.stringify({
          action: "review",
          requestId,
          decision,
          reviewNotes: reviewNotes[requestId] || "",
        }),
      }),
    onSuccess: async (_, variables) => {
      setReviewNotes((current) => ({ ...current, [variables.requestId]: "" }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["report-amendments", reportId] }),
        client.invalidateQueries({ queryKey: ["completion-review-queue"] }),
      ]);
      toast.success("Report addendum decision recorded");
    },
    onError: (error) => toast.error(error.message),
  });
  const prepareReplacement = useMutation({
    mutationFn: (requestId: string) => api<{ status: string }>("/api/report-amendments", {
      method: "POST",
      body: JSON.stringify({ action: "prepare_replacement", replacementId: crypto.randomUUID(), requestId, attestationAccepted: true }),
    }),
    onSuccess: async (_, requestId) => {
      setReplacementAttestations((current) => ({ ...current, [requestId]: false }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["report-amendments", reportId] }),
        client.invalidateQueries({ queryKey: ["completion-review-queue"] }),
      ]);
      toast.success("Signed replacement prepared for independent release");
    },
    onError: (error) => toast.error(error.message),
  });
  const reviewReplacement = useMutation({
    mutationFn: ({ replacementId, decision }: { replacementId: string; decision: "approved" | "declined" }) =>
      api<{ status: string }>("/api/report-amendments", {
        method: "POST",
        body: JSON.stringify({ action: "review_replacement", replacementId, decision, reviewNotes: replacementReviewNotes[replacementId] || "" }),
      }),
    onSuccess: async (_, variables) => {
      setReplacementReviewNotes((current) => ({ ...current, [variables.replacementId]: "" }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["report-amendments", reportId] }),
        client.invalidateQueries({ queryKey: ["completion-review-queue"] }),
      ]);
      toast.success("Replacement artifact decision recorded");
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading) return <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" /> Loading approved-report amendments…</div>;
  if (query.isError) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{query.error.message}</div>;
  const data = query.data!;
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 size-5 shrink-0 text-violet-700" />
        <div>
          <p className="font-bold text-violet-950">Approved packet corrections</p>
          <p className="mt-1 text-sm leading-6 text-violet-900">The signed PDF, approval, invoice, pay records and technical evidence remain unchanged. An approved addendum records the correction beside that exact artifact; it never edits the original.</p>
        </div>
      </div>
      {data.amendments.length ? <div className="mt-4 space-y-3">{data.amendments.map((item) => (
        <article key={item.requestId} className="rounded-lg border bg-white p-3 text-sm text-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">Report revision {item.reportVersion} · {item.requestedBy}</p>
            <Badge variant="outline" className={item.status === "approved" ? "border-emerald-300 text-emerald-800" : item.status === "declined" ? "border-slate-300 text-slate-700" : "border-amber-300 text-amber-800"}>{item.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">Requested {stamp(item.requestedAt)}</p>
          <p className="mt-3"><strong>Why:</strong> {item.reason}</p>
          <p className="mt-2"><strong>Proposed factual correction:</strong> {item.proposedCorrection}</p>
          {item.reviewNotes ? <div className="mt-3 rounded-lg bg-slate-50 p-3"><p><strong>Decision note:</strong> {item.reviewNotes}</p><p className="mt-1 text-xs text-slate-500">{item.reviewedBy} · {stamp(item.reviewedAt)}</p></div> : null}
          {data.canReview && item.status === "pending" ? <div className="mt-3 space-y-2 border-t pt-3">
            <Textarea value={reviewNotes[item.requestId] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.requestId]: event.target.value }))} placeholder="Record why this addendum is accepted or declined." />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={reviewAmendment.isPending || (reviewNotes[item.requestId] || "").trim().length < 5} onClick={() => reviewAmendment.mutate({ requestId: item.requestId, decision: "declined" })}>Decline addendum</Button>
              <Button disabled={reviewAmendment.isPending || (reviewNotes[item.requestId] || "").trim().length < 5} onClick={() => reviewAmendment.mutate({ requestId: item.requestId, decision: "approved" })}><ShieldCheck /> Approve addendum</Button>
            </div>
          </div> : null}
          {item.status === "approved" ? <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-start gap-2"><FileCheck2 className="mt-0.5 size-4 shrink-0 text-blue-700" /><div>
              <p className="font-bold text-blue-950">Separately signed replacement artifact</p>
              <p className="mt-1 text-xs leading-5 text-blue-900">The original approved PDF stays unchanged. A replacement adds only this approved correction, the preparer attestation and a different owner/operations release.</p>
            </div></div>
            {item.replacement ? <div className="mt-3 rounded-md bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Prepared by {item.replacement.preparedBy}</p><Badge variant="outline">{item.replacement.status}</Badge></div>
              <p className="mt-1 text-xs text-slate-500">Prepared {stamp(item.replacement.preparedAt)}</p>
              {item.replacement.reviewNotes ? <p className="mt-2"><strong>Release decision:</strong> {item.replacement.reviewNotes}</p> : null}
              {item.replacement.reviewedBy ? <p className="mt-1 text-xs text-slate-500">{item.replacement.reviewedBy} · {stamp(item.replacement.reviewedAt)}</p> : null}
              {item.replacement.status === "approved" && item.replacement.attachmentId ? <Button className="mt-3" variant="outline" asChild><a href={`/api/attachments?attachmentId=${encodeURIComponent(item.replacement.attachmentId)}`}>Open released replacement</a></Button> : null}
              {data.canReview && item.replacement.status === "pending" ? <div className="mt-3 space-y-2 border-t pt-3">
                <Textarea value={replacementReviewNotes[item.replacement.replacementId] || ""} onChange={(event) => setReplacementReviewNotes((current) => ({ ...current, [item.replacement!.replacementId]: event.target.value }))} placeholder="Record why this exact replacement should be released or declined." />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={reviewReplacement.isPending || (replacementReviewNotes[item.replacement.replacementId] || "").trim().length < 5} onClick={() => reviewReplacement.mutate({ replacementId: item.replacement!.replacementId, decision: "declined" })}>Decline replacement</Button>
                  <Button disabled={reviewReplacement.isPending || (replacementReviewNotes[item.replacement.replacementId] || "").trim().length < 5} onClick={() => reviewReplacement.mutate({ replacementId: item.replacement!.replacementId, decision: "approved" })}><ShieldCheck /> Release replacement</Button>
                </div>
              </div> : null}
            </div> : null}
            {!item.replacement || item.replacement.status === "declined" ? <div className="mt-3 space-y-3">
              <label className="flex items-start gap-2 text-sm text-blue-950"><input className="mt-1" type="checkbox" checked={Boolean(replacementAttestations[item.requestId])} onChange={(event) => setReplacementAttestations((current) => ({ ...current, [item.requestId]: event.target.checked }))} /><span>I electronically attest that the replacement should contain only this approved factual correction and must preserve the original evidence and financial records.</span></label>
              <Button variant="outline" disabled={prepareReplacement.isPending || !replacementAttestations[item.requestId]} onClick={() => prepareReplacement.mutate(item.requestId)}>Prepare signed replacement</Button>
            </div> : null}
          </div> : null}
        </article>
      ))}</div> : <p className="mt-4 text-sm text-violet-900">No correction request is recorded for this approved artifact.</p>}
      {data.canRequest ? <details className="mt-4 rounded-lg border bg-white p-3">
        <summary className="cursor-pointer font-semibold text-slate-900">Request a factual correction</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-semibold">Reason the approved packet needs an addendum<Textarea className="mt-1.5" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the exact issue without rewriting the original evidence." /></label>
          <label className="block text-sm font-semibold">Proposed factual correction<Textarea className="mt-1.5" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="State the correction and what the approved packet currently says." /></label>
          <Button disabled={requestAmendment.isPending || reason.trim().length < 10 || correction.trim().length < 10 || !reportPdfAttachmentId} onClick={() => requestAmendment.mutate()}>Record correction request</Button>
        </div>
      </details> : null}
    </section>
  );
}
