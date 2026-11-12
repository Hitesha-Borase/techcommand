"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fieldNotesTemplate } from "@/lib/field-notes";
import type { ProcedureSnapshot } from "@/lib/asset-ai-procedure";

export function FieldNotesBox({ value, onChange, serviceType, snapshot, disabled, label = "Technician notes", maxLength = 10000 }: {
  value: string; onChange: (value: string) => void; serviceType: string;
  snapshot?: ProcedureSnapshot | null; disabled?: boolean; label?: string; maxLength?: number;
}) {
  const template = fieldNotesTemplate(serviceType, snapshot);
  return <div className="space-y-3">
    <label className="block space-y-2 text-sm font-semibold">{label}
      <Textarea className="min-h-64 text-base" rows={12} maxLength={maxLength} disabled={disabled}
        value={value} onChange={event => onChange(event.target.value)} placeholder={template} />
    </label>
    <p className="text-sm text-slate-600">Type freely or use your phone’s dictation. Skip anything unavailable; record only what you observed or did. The questions are optional.</p>
    <details className="rounded-lg border bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Optional note template / manufacturer reference</summary>
      <p className="mt-2 text-slate-600">{snapshot && !snapshot.id.startsWith("cataloging-v1:") ? "Prompts use the attached manufacturer reference. Verify the exact model and revision before technical work." : "General documentation prompts. Open manufacturer guidance to attach a matching source; these prompts are not an OEM test procedure."}</p>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">{template}</pre>
      {!disabled && !value.trim() ? <Button type="button" variant="outline" className="mt-3" onClick={() => onChange(template.slice(0, maxLength))}>Use this template</Button> : null}
    </details>
  </div>;
}
