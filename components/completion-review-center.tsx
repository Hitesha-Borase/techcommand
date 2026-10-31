"use client";

import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileCheck2,
  Image as ImageIcon,
  LoaderCircle,
  ShieldCheck,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Submission = {
  reportId: string;
  workOrderId: string;
  technicianId: string;
  submittedAt: string;
  qaStatus: string;
  reviewedAt: string | null;
  externalId: string;
  serviceType: string;
  summary: string;
  acceptedPriceCents: number;
  grossMarginBasisPoints: number;
  accountName: string;
  locationName: string;
  technicianName: string;
};

type Detail = {
  workOrder: {
    recordVersion: number;
    id: string;
    externalId: string;
    summary: string;
    serviceType: string;
    status: string;
    locationName: string;
    locationAddress: string;
    acceptedPriceCents: number;
    grossMarginBasisPoints: number;
  };
  technician: { id: string; technicianName: string };
  report: {
    recordVersion: number;
    reportVersion: number;
    id: string;
    qaStatus: string;
    qaNotes: string;
    customerComplaint: string;
    equipmentType: string;
    manufacturer: string;
    model: string;
    serialNumber: string;
    findings: string;
    workPerformed: string;
    testResults: string;
    recommendation: string;
    assetDisposition: string;
    customerSignatureName: string;
    signatureAttachmentId: string | null;
    reportPdfAttachmentId: string | null;
    checklist: Array<{ key:string; label: string; complete: boolean; notApplicable?:boolean; reason?:string; result?:string }>;
    documentDetails?: {fieldNotes?:string;actualOnsiteMinutes?:number|null;workOrderDate:string;photoLayout:string;photoCaptions:Record<string,string>};
    diagnosticSteps: Array<{
      label: string;
      complete: boolean;
      result: string;
    }>;
    partsUsed: Array<{
      description: string;
      partNumber: string;
      quantity: number;
    }>;
  };
  assets: Array<{
    assetId:string;assetTag:string;recordVersion:number;manufacturer:string|null;model:string|null;serialNumber:string|null;
    notes:string|null;status:string;findings:string|null;workPerformed:string|null;testResults:string|null;disposition:string|null;notApplicableReason:string|null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    category: string;
    sizeBytes: number;
  }>;
  reportRevisions: Array<{
    reportVersion: number;
    sourceReportRecordVersion: number;
    submittedAt: string;
    evidenceFileCount: number;
    assetCount: number;
    customerSignatureRecorded: boolean;
  }>;
  missingEvidence: Array<{ label: string }>;
  reviewCheckpoint: {
    token: string;
    evidenceFileCount: number;
    crewCount: number;
    approvedTimeEntryCount: number;
    technicianPayPoolCents: number;
  } | null;
  billingReview: {
    mode: "standard" | "covered" | "billable" | "needs_review";
    title: string;
    explanation: string;
    approvalBlocked: boolean;
    invoiceTotalCents: number;
    contractNumber: string | null;
    contractName: string | null;
    startsOn: string | null;
    endsOn: string | null;
    annualFeeCents: number | null;
    correctiveLaborCentsPerHour: number | null;
    minimumMinutes: number | null;
    incrementMinutes: number | null;
    travelCentsPerHour: number | null;
    mileageCentsPerMile: number | null;
    partsMarkupPercent: number | null;
    minimumPartsMarkupCents: number | null;
    tollsParking: string | null;
  } | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return portalJson<T>(response, "The inbox could not be loaded or saved.");
}

function money(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pretty(value: string) {
  if (value === "needs_review") return "Outcome not assessed";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function CompletionReviewCenter({initialWorkOrderId=""}:{initialWorkOrderId?:string}={}) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [editor, setEditor] = useState<{reportId:string;sourceVersion:number;report:Detail["report"];assets:Detail["assets"]}|null>(null);
  const queue = useQuery({
    refetchOnWindowFocus: false,
    queryKey: ["completion-review-queue"],
    queryFn: () =>
      api<{ submissions: Submission[] }>("/api/completions?queue=review"),
  });
  const effectiveSelectedId =
    selectedId || (initialWorkOrderId?queue.data?.submissions.find(s=>s.workOrderId===initialWorkOrderId)?.reportId:queue.data?.submissions[0]?.reportId) || "";
  const selected = queue.data?.submissions.find(
    (item) => item.reportId === effectiveSelectedId,
  );
  const detail = useQuery({
    queryKey: [
      "completion-review-detail",
      selected?.workOrderId,
      selected?.technicianId,
    ],
    refetchOnWindowFocus: false,
    enabled: Boolean(selected),
    queryFn: () =>
      api<Detail>(
        `/api/completions?workOrderId=${encodeURIComponent(selected!.workOrderId)}&technicianId=${encodeURIComponent(selected!.technicianId)}`,
      ),
  });
  const review = useMutation({
    mutationFn: (decision: "note" | "reviewed") =>
      api<{
        status: string;
      }>("/api/completions", {
        method: "POST",
        body: JSON.stringify({
          action: "inbox_review",
          reportId: detail.data?.report.id,
          expectedReportVersion: detail.data?.report.recordVersion,
          expectedWorkOrderVersion: detail.data?.workOrder.recordVersion,
          expectedReviewSnapshot: detail.data?.reviewCheckpoint?.token,
          decision,
          qaNotes,
        }),
      }),
    onSuccess: async (result) => {
      toast.success(result.status === "reviewed" ? "Marked viewed. Field work stays complete." : "Comment saved. The job stays complete.");
      setSelectedId("");
      setQaNotes("");
      setEditor(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["completion-review-queue"] }),
        client.invalidateQueries({ queryKey: ["completion-review-detail"] }),
        client.invalidateQueries({ queryKey: ["work-orders"] }),
        client.invalidateQueries({ queryKey: ["admin-tasks"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const refine = useMutation({
    mutationFn: async () => {
      if (!editor || !detail.data || editor.reportId !== detail.data.report.id || editor.sourceVersion !== detail.data.report.recordVersion)
        throw new Error("This report changed. Compare the latest saved version before saving edits.");
      return api<{status:string}>("/api/completions", {method:"POST",body:JSON.stringify({
        action:"refine_report",reportId:editor.reportId,expectedReportVersion:editor.sourceVersion,
        expectedWorkOrderVersion:detail.data.workOrder.recordVersion,expectedReviewSnapshot:detail.data.reviewCheckpoint?.token,
        report:editor.report,assets:editor.assets.filter(asset=>JSON.stringify(asset)!==JSON.stringify(detail.data!.assets.find(saved=>saved.assetId===asset.assetId))).map(asset=>({
          assetId:asset.assetId,expectedRecordVersion:asset.recordVersion,status:asset.status,
          findings:asset.findings||"",workPerformed:asset.workPerformed||"",testResults:asset.testResults||"",
          disposition:asset.disposition,notApplicableReason:asset.notApplicableReason||"",
        })),
      })});
    },
    onSuccess: async () => {
      setEditor(null);toast.success("Report edits saved. Original technician notes retained.");
      await client.invalidateQueries({queryKey:["completion-review-detail"]});
    },
    onError:error=>toast.error(error.message),
  });
  const editing = editor?.reportId === detail.data?.report.id ? editor : null;
  function editReport(fields:Partial<Detail["report"]>) { setEditor(current=>current?{...current,report:{...current.report,...fields}}:current); }
  function editAsset(assetId:string,fields:Partial<Detail["assets"][number]>) { setEditor(current=>current?{...current,assets:current.assets.map(asset=>asset.assetId===assetId?{...asset,...fields}:asset)}:current); }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <article className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Administrator submission inbox</h2>
              <Badge>
                {queue.data?.submissions.filter(
                  (item) => !item.reviewedAt,
                ).length || 0}{" "}
                new
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Optional review only. Submissions finish field work immediately; technicians can add notes without approval.
            </p>
          </div>
          {queue.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
              <LoaderCircle className="size-4 animate-spin" /> Loading…
            </div>
          ) : queue.data?.submissions.length ? (
            <div className="max-h-[720px] divide-y overflow-y-auto">
              {queue.data.submissions.map((item) => (
                <button
                  key={item.reportId}
                  type="button"
                  disabled={review.isPending}
                  onClick={() => {
                    setSelectedId(item.reportId);
                    setQaNotes("");
                  }}
                  className={`w-full p-4 text-left transition hover:bg-slate-50 ${effectiveSelectedId === item.reportId ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-blue-700">
                      {item.externalId}
                    </p>
                    <Badge variant="outline" className="capitalize">
                      {item.reviewedAt ? "Viewed" : "New"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-bold">{item.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.technicianName} · {item.locationName}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">
              <CheckCircle2 className="mx-auto mb-3 size-7 text-emerald-600" />{" "}
              No submissions yet.
            </div>
          )}
        </article>

        <article className="rounded-xl border bg-white">
          {!selected ? (
            <div className="grid min-h-[420px] place-items-center p-8 text-center text-sm text-slate-500">
              <div>
                <ShieldCheck className="mx-auto mb-3 size-8 text-blue-600" />{" "}
                Select a submission to view its saved notes.
              </div>
            </div>
          ) : detail.isLoading ? (
            <div className="grid min-h-[420px] place-items-center text-sm text-slate-500">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : detail.error ? (
            <div className="m-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <CircleAlert className="size-4" /> {detail.error.message}
            </div>
          ) : detail.data ? (
            <div>
              <div className="border-b p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-blue-700">
                      {detail.data.workOrder.externalId}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">
                      {detail.data.workOrder.summary}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {detail.data.technician.technicianName} ·{" "}
                      {detail.data.workOrder.locationAddress}
                    </p>
                  </div>
                  <Badge variant="outline">{["completed","ready_to_invoice","invoiced","paid"].includes(detail.data.workOrder.status) ? "Field work complete" : "Saved submission"}</Badge>
                </div>
              </div>
              <div className="space-y-5 p-5">
                {detail.data.report.documentDetails?.fieldNotes?.trim() ? <section className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold">Original technician notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.data.report.documentDetails.fieldNotes}</p></section> : null}
                {detail.data.assets?.length ? <section className="space-y-3"><h3 className="font-bold">Per-unit notes</h3>{detail.data.assets.map(asset=><article key={asset.assetId} className="rounded-xl border p-4"><p className="font-bold">{asset.assetTag} · {asset.manufacturer} {asset.model}</p><p className="text-xs text-slate-500">Serial {asset.serialNumber || "not recorded"} · {pretty(asset.status)} · {pretty(asset.disposition || "needs_review")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{asset.notes || "No free-text notes recorded."}</p>{asset.findings || asset.workPerformed || asset.testResults ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Saved structured findings</summary><p className="whitespace-pre-wrap">{[asset.findings,asset.workPerformed,asset.testResults].filter(Boolean).join("\n\n")}</p></details> : null}</article>)}</section> : null}
                {detail.data.reviewCheckpoint ? <section className="space-y-4 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Report wording and details (optional)</h3><p className="text-sm text-slate-600">Refine wording and document verified details. Technician notes and the original submission remain retained.</p></div>{!editing ? <Button type="button" variant="outline" disabled={review.isPending || detail.isFetching} onClick={()=>{setEditor({reportId:detail.data!.report.id,sourceVersion:detail.data!.report.recordVersion,report:structuredClone(detail.data!.report),assets:structuredClone(detail.data!.assets || [])});}}>Edit report</Button> : null}</div>
                  {editing ? <fieldset disabled={refine.isPending} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">{(["equipmentType","manufacturer","model","serialNumber"] as const).map(key=><label key={key} className="text-sm font-semibold">{pretty(key.replace(/([A-Z])/g,"_$1"))}<Input maxLength={key==="equipmentType"?240:160} value={editing.report[key]} onChange={event=>editReport({[key]:event.target.value})} /></label>)}</div>
                    {(["customerComplaint","findings","workPerformed","testResults","recommendation"] as const).map(key=><label key={key} className="block space-y-2 text-sm font-semibold">{pretty(key.replace(/([A-Z])/g,"_$1"))}<Textarea rows={4} maxLength={key==="customerComplaint"?5000:10000} value={editing.report[key]} onChange={event=>editReport({[key]:event.target.value})} /></label>)}
                    <label className="block text-sm font-semibold">Service outcome<select className="mt-1 min-h-11 w-full rounded border px-3" value={editing.report.assetDisposition} onChange={event=>editReport({assetDisposition:event.target.value})}>
                      {(detail.data.workOrder.serviceType==="biomed_cataloging"?["cataloged","needs_review","follow_up_required","needs_resolution","quarantined","retired"]:["needs_review","passed","returned_to_service","parts_required","follow_up_required","needs_resolution","quarantined","retired","delivery_completed"]).map(value=><option key={value} value={value}>{pretty(value)}</option>)}
                    </select></label>
                    {editing.assets.map(asset=><details key={asset.assetId} className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Refine unit {asset.assetTag}</summary><div className="mt-3 space-y-3">{(["findings","workPerformed","testResults"] as const).map(key=><label key={key} className="block text-sm font-semibold">{pretty(key.replace(/([A-Z])/g,"_$1"))}<Textarea value={asset[key]||""} maxLength={10000} onChange={event=>editAsset(asset.assetId,{[key]:event.target.value})} /></label>)}
                      <label className="block text-sm font-semibold">Documentation status<select className="mt-1 min-h-11 w-full rounded border px-3" value={asset.status} onChange={event=>editAsset(asset.assetId,{status:event.target.value})}>{["not_started","in_progress","completed","not_applicable"].map(value=><option key={value} value={value}>{pretty(value)}</option>)}</select></label>
                      <label className="block text-sm font-semibold">Disposition<select className="mt-1 min-h-11 w-full rounded border px-3" value={asset.disposition||""} onChange={event=>editAsset(asset.assetId,{disposition:event.target.value || null})}><option value="">Not recorded</option>{(detail.data.workOrder.serviceType==="biomed_cataloging"?["cataloged","needs_review","follow_up_required","needs_resolution","quarantined","retired"]:["needs_review","passed","returned_to_service","parts_required","follow_up_required","needs_resolution","quarantined","retired"]).map(value=><option key={value} value={value}>{pretty(value)}</option>)}</select></label>
                      {asset.status==="not_applicable"?<label className="block text-sm font-semibold">Reason<Textarea maxLength={2000} value={asset.notApplicableReason||""} onChange={event=>editAsset(asset.assetId,{notApplicableReason:event.target.value})} /></label>:null}
                    </div></details>)}
                    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Partner checklist / optional question record</summary><div className="mt-3 space-y-3">{editing.report.checklist.map((item,index)=><div key={item.key || index} className="space-y-2 text-sm"><label className="flex gap-2"><input type="checkbox" checked={item.complete} onChange={event=>editReport({checklist:editing.report.checklist.map((row,i)=>i===index?{...row,complete:event.target.checked}:row)})} />{item.label}</label><Textarea value={item.result || ""} maxLength={2000} placeholder="Recorded result, if applicable" onChange={event=>editReport({checklist:editing.report.checklist.map((row,i)=>i===index?{...row,result:event.target.value}:row)})} /></div>)}</div></details>
                    <div className="flex flex-wrap gap-2"><Button type="button" disabled={refine.isPending || editing.sourceVersion !== detail.data.report.recordVersion} onClick={()=>refine.mutate()}><FileCheck2 />{refine.isPending?"Saving edits…":"Save report edits"}</Button><Button type="button" variant="outline" disabled={refine.isPending} onClick={()=>setEditor(null)}>Cancel edits</Button></div>
                    {refine.error?<p role="alert" className="text-sm text-red-700">{refine.error.message}</p>:null}
                  </fieldset> : null}
                </section> : null}
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Equipment identity
                    </p>
                    <p className="mt-2 font-bold">
                      {detail.data.report.equipmentType}
                    </p>
                    <p className="mt-1 text-sm">
                      {detail.data.report.manufacturer}{" "}
                      {detail.data.report.model}
                    </p>
                    <p className="mt-1 font-mono text-xs">
                      S/N {detail.data.report.serialNumber}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Customer acknowledgement
                    </p>
                    <p className="mt-2 font-bold">
                      {detail.data.report.customerSignatureName}
                    </p>
                    {detail.data.report.signatureAttachmentId ? (
                      <a
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700"
                        href={`/api/attachments?attachmentId=${detail.data.report.signatureAttachmentId}`}
                      >
                        <FileCheck2 className="size-3.5" /> View signature
                      </a>
                    ) : (
                      <p className="mt-2 text-xs font-bold text-red-700">
                        Signature not recorded (optional)
                      </p>
                    )}
                  </div>
                </section>
                {(
                  [
                    [
                      "Customer complaint",
                      detail.data.report.customerComplaint,
                    ],
                    ["Technical findings", detail.data.report.findings],
                    ["Work performed", detail.data.report.workPerformed],
                    ["Final test results", detail.data.report.testResults],
                    [
                      "Recommendations",
                      detail.data.report.recommendation || "None",
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <section key={label}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {value}
                    </p>
                  </section>
                ))}
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Optional guided-question record</summary>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Recorded guidance
                  </p>
                  <div className="mt-2 space-y-2">
                    {detail.data.report.diagnosticSteps.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-lg border p-3 text-sm"
                      >
                        <p className="flex gap-2 font-semibold">
                          <CheckCircle2
                            className={`mt-0.5 size-4 shrink-0 ${item.complete ? "text-emerald-600" : "text-red-600"}`}
                          />{" "}
                          {item.label}
                        </p>
                        <p className="mt-1 pl-6 text-xs text-slate-500">
                          {item.result || "No result recorded"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
                <details className="space-y-2 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Checklist and document details</summary>
                  <p className="text-sm font-bold">Partner checklist and document details</p>
                  {detail.data.workOrder.serviceType.startsWith("biomed") ? <p className="mb-2 text-sm font-semibold">Documented actual on-site time: {detail.data.report.documentDetails?.actualOnsiteMinutes == null ? "Not recorded" : `${detail.data.report.documentDetails.actualOnsiteMinutes} minutes`}. Coverage and charges still need billing review.</p> : null}
                  <p className="text-sm">Work-order date: {detail.data.report.documentDetails?.workOrderDate || 'Not recorded'} · Photo layout: {detail.data.report.documentDetails?.photoLayout || 'detail'}</p>
                  {detail.data.report.checklist.map((item,i)=><div key={i} className="rounded-lg border p-3 text-sm"><p className="font-semibold">{item.label}</p><p>{item.notApplicable ? `N/A: ${item.reason || 'Reason missing'}` : `${item.complete ? 'Recorded' : 'Missing'}${item.result ? ': '+item.result : ''}`}</p></div>)}
                </details>
                <section>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Evidence files
                    </p>
                    <Badge variant="outline">
                      {detail.data.attachments.length} files
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {detail.data.attachments.map((item) => (
                      <a
                        key={item.id}
                        href={`/api/attachments?attachmentId=${item.id}`}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-blue-700"
                      >
                        <ImageIcon className="size-4" />
                        <span className="truncate">
                          {pretty(item.category)} · {item.fileName}
                        </span>
                      </a>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">{detail.data.attachments.filter(item=>detail.data.report.documentDetails?.photoCaptions?.[item.id]).map(item=><p key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{item.fileName}</strong><br/>{detail.data.report.documentDetails?.photoCaptions?.[item.id]}</p>)}</div>
                </section>
                {detail.data.reportRevisions.length ? (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Immutable submission history</p>
                        <p className="mt-1 text-sm text-slate-800">You are viewing report revision {detail.data.report.reportVersion}. Earlier submissions remain unchanged.</p>
                      </div>
                      <Badge variant="outline" className="bg-white">{detail.data.reportRevisions.length} submitted revision{detail.data.reportRevisions.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {detail.data.reportRevisions.map((revision) => (
                        <div key={revision.reportVersion} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                          <strong>Revision {revision.reportVersion}</strong> · {revision.submittedAt.replace("T", " ").replace("Z", " UTC")} · {revision.evidenceFileCount} files · {revision.assetCount} selected assets · signature {revision.customerSignatureRecorded ? "recorded" : "not recorded"}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                <Button asChild variant="outline"><a href={`/api/completions?workOrderId=${encodeURIComponent(detail.data.workOrder.id)}&technicianId=${encodeURIComponent(detail.data.technician.id)}&format=pdf`}><Download /> Download saved service report</a></Button>
                {detail.data.report.qaNotes ? <section className="rounded-lg bg-slate-50 p-4"><h3 className="text-sm font-bold">Saved inbox comments</h3><p className="mt-2 whitespace-pre-wrap text-sm">{detail.data.report.qaNotes}</p></section> : null}
                <label className="block space-y-1.5 text-sm font-semibold">
                  Inbox comment (optional)
                  <Textarea
                    className="min-h-24"
                    value={qaNotes}
                    onChange={(event) => setQaNotes(event.target.value)}
                    placeholder="Add a comment or details to check later. This does not reopen or block the job."
                  />
                </label>
                {review.isError ? (
                  <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p>{review.error.message}</p>
                    <Button variant="outline" className="mt-3" disabled={detail.isFetching} onClick={async () => {
                      await detail.refetch();
                      await queue.refetch();
                      review.reset();
                    }}>Refresh review and compare</Button>
                  </div>
                ) : null}
                {detail.data.reviewCheckpoint ? <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                  <Button variant="outline" disabled={Boolean(editing) || refine.isPending || review.isPending || detail.isFetching || !qaNotes.trim()} onClick={() => review.mutate("note")}><Save /> Save comment</Button>
                  <Button disabled={Boolean(editing) || refine.isPending || review.isPending || detail.isFetching} onClick={() => review.mutate("reviewed")}><CheckCircle2 /> {review.isPending ? "Saving…" : "Mark viewed (optional)"}</Button>
                </div> : null}
              </div>
            </div>
          ) : null}
        </article>
      </section>

    </div>
  );
}
