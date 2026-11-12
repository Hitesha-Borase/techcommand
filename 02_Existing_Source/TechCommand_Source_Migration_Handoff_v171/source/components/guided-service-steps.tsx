"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { nextUnansweredStep } from "@/lib/equipment-workflow";
import type { DiagnosticStep } from "@/lib/completion-policy";
import type {AcademyFieldMode} from "@/lib/academy";

export function GuidedServiceSteps({ steps, disabled, fieldMode=null, onChange }: { steps: DiagnosticStep[]; disabled: boolean; fieldMode?:AcademyFieldMode|null; onChange: (steps: DiagnosticStep[]) => void }) {
  const [showAll, setShowAll] = useState(false);
  const next = nextUnansweredStep(steps);
  const done = steps.filter(step => step.complete && step.result.trim()).length;
  const showEverything=fieldMode==="experienced"||showAll;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">{next < 0 ? "Service answers recorded" : fieldMode==="experienced"?"Experienced checklist":"Your next step"} · {done}/{steps.length}</h3>{fieldMode&&<p className="text-xs text-slate-600">{fieldMode==="trainee"?"Trainee: complete each item and obtain the required exact-revision trainer sign-off.":fieldMode==="experienced"?"Experienced: compact navigation only; no required check is removed.":"Guided: one step at a time; no technical authority is added."}</p>}</div>{fieldMode!=="experienced"&&<Button type="button" variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show next question" : "Review all answers"}</Button>}</div>
    {steps.map((item, index) => (showEverything || index === next) ? <article key={`${index}-${item.label}`} className={`rounded-xl border p-4 ${index === next ? "border-blue-300 bg-blue-50/40" : "bg-white"}`}>
      <label className="block space-y-3"><span className="block text-base font-semibold leading-6">{index + 1}. {item.label}</span><Textarea disabled={disabled} className="min-h-28 bg-white text-base" value={item.result} onChange={event => onChange(steps.map((current, at) => at === index ? { ...current, result: event.target.value, complete: false } : current))} placeholder="Record what you observed or did. Include readings and units, or explain why this was not performed."/></label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{item.complete ? "Answer recorded" : "Only record actions and results you can verify."}</p><Button type="button" disabled={disabled || item.result.trim().length < 3 || item.complete} onClick={() => onChange(steps.map((current, at) => at === index ? { ...current, complete: true } : current))}>Record answer & continue</Button></div>
    </article> : null)}
    {next < 0 && !showEverything ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">All questions have recorded answers. Review findings, work performed and test results below. A recorded limitation does not mean the equipment passed.</p> : null}
  </section>;
}
