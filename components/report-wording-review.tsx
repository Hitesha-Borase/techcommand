"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { wordingFields, type WritingReport, type WritingReview, type RecordedFact } from "@/lib/report-writing";

export function ReportWordingReview({ report, review, facts, stale, pending, disabled, error, onRequest, onApply }: {
  report: WritingReport; review?: WritingReview; facts: RecordedFact[]; stale: boolean; pending: boolean; disabled: boolean; error?: string;
  onRequest: () => void; onApply: (fields: Partial<WritingReport>) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  return <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Turn your answers into the service report</h3><p className="mt-1 text-sm text-slate-600">Copilot organizes your recorded work into TechFlex report sections. Review the wording and its supporting answers before using it.</p></div><Button type="button" variant="outline" disabled={disabled || pending} onClick={() => {setSelected([]);setConfirmed(false);onRequest();}}>{pending ? "Preparing draft…" : review ? "Refresh report draft" : "Draft report from answers"}</Button></div>
    {error ? <p role="alert" className="text-sm text-amber-900">{error}</p> : null}
    {stale ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">Your answers or equipment details changed. Refresh the draft before applying wording.</p> : null}
    {review ? <div className="space-y-3 text-sm"><p>{review.summary}</p>
      {review.missingFacts.length ? <div><p className="font-bold">Still needs information</p><ul className="list-disc space-y-1 pl-5">{review.missingFacts.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {review.safetyFlags.length ? <div className="rounded-lg bg-amber-50 p-3 text-amber-950"><p className="font-bold">Resolve these concerns</p><ul className="list-disc space-y-1 pl-5">{review.safetyFlags.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {wordingFields.map(([proposed, field, label]) => review[proposed].trim() ? <article key={field} className="space-y-3 rounded-lg border bg-white p-3">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="size-4" checked={selected.includes(field)} disabled={disabled || stale || pending} onChange={event => {setConfirmed(false);setSelected(current => event.target.checked ? [...current, field] : current.filter(item => item !== field));}}/>Use this {label.toLowerCase()} section</label>
        {report[field].trim() ? <details><summary className="cursor-pointer text-slate-600">Current text</summary><p className="mt-2 whitespace-pre-wrap">{report[field]}</p></details> : null}
        <p className="whitespace-pre-wrap leading-6">{review[proposed]}</p>
        <details><summary className="cursor-pointer font-semibold text-blue-800">Supporting recorded answers ({review.sources[proposed].length})</summary><div className="mt-2 space-y-3">{review.sources[proposed].map(id => {const fact = facts.find(item => item.id === id);return fact ? <div key={id}><p className="font-semibold">{fact.label}</p><p className="whitespace-pre-wrap text-slate-600">{fact.text}</p></div> : null;})}</div></details>
      </article> : null)}
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={confirmed} disabled={disabled || stale || pending || !selected.length} onChange={event => setConfirmed(event.target.checked)}/>I reviewed the selected sections. They accurately describe the recorded work and preserve any limitations.</label>
      <Button type="button" disabled={disabled || stale || pending || !selected.length || !confirmed} onClick={() => {const changes: Partial<WritingReport> = {};for(const [proposed, field] of wordingFields) if(selected.includes(field)) changes[field] = review[proposed];onApply(changes);setConfirmed(false);setSelected([]);}}>Use reviewed sections</Button>
      <p className="text-xs text-slate-500">This saves wording into your draft. Check it against the recorded facts; administrator review is optional.</p>
    </div> : null}
  </section>;
}
