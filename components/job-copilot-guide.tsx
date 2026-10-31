"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, LoaderCircle, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { equipmentWorkflow, manufacturerSupport, type EquipmentContext } from "@/lib/equipment-workflow";
import type { DiagnosticStep } from "@/lib/completion-policy";

type Context = EquipmentContext & { serialNumber?: string; complaint?: string; observations?: DiagnosticStep[] };
type Guide = {
  aiStatus: string; hasModelReference: boolean;
  guide: { summary: string; missingInformation: string[]; questions: { prompt: string; reason: string; referenceIds: string[] }[]; cautions: string[] } | null;
  references: { id: string; title: string; sourceUrl: string; verifiedOn: string }[];
  resolvedEquipment: { equipmentType: string; manufacturer: string; model: string; serialNumber: string };
};

export function JobCopilotGuide({ context, phase, workOrderId, technicianId, autoKey, onAddQuestions, disabled = false }: {
  context: Context; phase: "intake" | "field" | "spinlife"; workOrderId?: string; technicianId?: string | null;
  autoKey?: string; onAddQuestions?: (steps: DiagnosticStep[]) => void; disabled?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const lastAuto = useRef("");
  const [snapshot, setSnapshot] = useState("");
  const fingerprint = JSON.stringify(context);
  const support = manufacturerSupport(context.manufacturer || "");
  const standard = equipmentWorkflow(context);
  const request = useMutation({
    mutationFn: async () => {
      const response = await portalFetch("/api/ai/job-guide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, workOrderId, technicianId, ...context, question }),
      });
      return { data: await portalJson<Guide>(response, "Copilot could not prepare this guidance. Your answers are preserved."), fingerprint };
    },
    onSuccess: result => setSnapshot(result.fingerprint),
  });
  useEffect(() => {
    if (!autoKey || lastAuto.current === autoKey || disabled || request.isPending) return;
    lastAuto.current = autoKey;
    request.mutate();
  }, [autoKey, disabled, request]);
  const data = request.data?.data;
  const stale = Boolean(data && snapshot !== fingerprint);
  return <section className="space-y-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
    <div className="flex items-center gap-2"><Bot className="size-5 text-cyan-700"/><h3 className="font-bold text-slate-950">Copilot · {phase === "intake" ? "Prepare this job" : "Help with this step"}</h3></div>
    <p className="text-sm text-slate-600">{[context.manufacturer, context.model].filter(Boolean).join(" · ") || "Identify the manufacturer and model for specific guidance."} {context.serialNumber ? `S/N ${context.serialNumber}` : "Serial number still needs verification."}</p>
    {support ? <div className="rounded-lg border bg-white p-3 text-sm"><p className="font-semibold">{support.name} · {support.label}</p><div className="mt-2 flex flex-wrap gap-4"><a className="inline-flex items-center gap-2 font-bold text-blue-700" href={`tel:${support.phone}`}><Phone className="size-4"/>{support.phone}</a><a href={support.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">Manufacturer contact page</a></div><p className="mt-1 text-xs text-slate-500">Checked {support.verifiedOn}. Have the model, serial and observed issue ready.</p></div> : <p className="text-sm text-slate-600">Use the contact in the approved equipment reference or ask dispatch to verify the manufacturer’s support number.</p>}
    <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Ask equipment Copilot" value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} placeholder="What should I verify next?" disabled={disabled || request.isPending}/><Button type="button" variant="outline" disabled={disabled || request.isPending} onClick={() => request.mutate()}>{request.isPending ? <LoaderCircle className="animate-spin"/> : <Bot/>}{request.isPending ? "Preparing…" : data ? "Ask / refresh" : "Prepare guidance"}</Button></div>
    {request.isPending ? <p role="status" className="text-sm text-cyan-900">Checking this job and available model references…</p> : null}
    {request.error ? <p role="alert" className="text-sm text-amber-900">{request.error.message}</p> : null}
    {data?.aiStatus === "not_configured" ? <p className="text-sm text-amber-900">Live AI is not configured. The standard questions and verified contacts remain available.</p> : null}
    {data ? <p className="rounded-lg border bg-white p-3 text-sm text-slate-700"><strong>Guidance checked against saved equipment:</strong> {[data.resolvedEquipment.manufacturer, data.resolvedEquipment.model].filter(Boolean).join(" · ") || "manufacturer/model not saved"} · {data.resolvedEquipment.serialNumber ? `S/N ${data.resolvedEquipment.serialNumber}` : "serial number not saved"}</p> : null}
    {data && !data.hasModelReference ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">No verified model-specific reference is attached to the saved equipment identity. Save any corrected manufacturer, model, and serial number, then obtain the correct manual or technical-support direction before a model-specific test or adjustment.</p> : null}
    {stale ? <p role="status" className="text-sm font-semibold text-amber-900">The job details or answers changed. Refresh Copilot before using these earlier suggestions.</p> : null}
    {data?.guide ? <div className="space-y-3 text-sm"><p>{data.guide.summary}</p>{data.guide.missingInformation.length ? <div><p className="font-bold">Information to obtain</p><ul className="mt-1 list-disc space-y-1 pl-5">{data.guide.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}{data.guide.questions.length ? <ol className="space-y-3">{data.guide.questions.map((item, i) => <li key={i} className="rounded-lg border bg-white p-3"><p className="font-semibold">{i + 1}. {item.prompt}</p><p className="mt-1 text-slate-600">{item.reason}</p>{item.referenceIds.map(id => { const source = data.references.find(ref => ref.id === id); return source ? <a key={id} href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-blue-700 underline">{source.title} · checked {source.verifiedOn}</a> : null; })}</li>)}</ol> : null}{data.guide.cautions.length ? <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-amber-950">{data.guide.cautions.map((item, i) => <li key={i}>{item}</li>)}</ul> : null}</div> : null}
    <details className="text-sm"><summary className="cursor-pointer font-semibold text-cyan-900">Standard job questions ({standard.length})</summary><ol className="mt-3 list-decimal space-y-2 pl-5">{standard.map(step => <li key={step.label}>{step.label}</li>)}</ol></details>
    {onAddQuestions ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => onAddQuestions(standard)}><Plus/>Add missing standard questions</Button>{data?.guide?.questions.length ? <Button type="button" variant="outline" disabled={disabled || stale || request.isPending} onClick={() => onAddQuestions(data.guide!.questions.map(item => ({ label: item.prompt, complete: false, result: "" })))}><Plus/>Add Copilot questions</Button> : null}</div> : null}
    <p className="text-xs text-slate-500">Suggestions are not findings. Your recorded notes and evidence determine the report. Review is optional.</p>
  </section>;
}
