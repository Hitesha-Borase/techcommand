"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DraftFields = { summary: string; customerComplaint: string; scheduledStart: string };
export function AssetServiceDraft({ value, account, equipment, address, pending, saved, error, onChange, onSave }:{
  value: DraftFields; account: string; equipment: string; address: string;
  pending: boolean; saved: boolean; error?: string;
  onChange: (patch: Partial<DraftFields>) => void; onSave: () => void;
}) {
  return <article className="rounded-xl border bg-white p-5">
    <h2 className="text-xl font-bold">Plan equipment service</h2>
    <p className="mt-2 font-medium">{account || "Selected account"}</p>
    <p className="mt-1 break-words text-slate-600">{equipment}</p>
    <p className="mt-1 break-words text-slate-600">{address}</p>
    <p className="mt-3 text-sm text-slate-600">Equipment and facility details are already included. Save now or add what you know. This is a request, not a completed inspection, assigned visit or invoice.</p>
    <fieldset disabled={pending} className="mt-4 space-y-4">
      <label className="block font-medium">Short description (optional)
        <Input className="mt-2 min-h-11 text-base" value={value.summary} maxLength={500} onChange={e=>onChange({summary:e.target.value})}/>
      </label>
      <label className="block font-medium">What needs attention? (optional)
        <Textarea className="mt-2 min-h-28 text-base" value={value.customerComplaint} maxLength={5000} onChange={e=>onChange({customerComplaint:e.target.value})} placeholder="Type the request or reported concern. Leave unknown details for later."/>
      </label>
      <label className="block font-medium">Preferred date and time (optional)
        <Input type="datetime-local" className="mt-2 min-h-11 w-full min-w-0 text-base sm:max-w-sm" value={value.scheduledStart} onChange={e=>onChange({scheduledStart:e.target.value})}/>
      </label>
      <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={onSave}>{pending?"Saving…":"Save for later"}</Button>
    </fieldset>
    {error?<p role="alert" className="mt-3 text-red-700">{error} Your entries are still here. Correct the issue or retry Save for later.</p>:null}
    {saved&&!pending&&!error?<p role="status" className="mt-3 text-emerald-800">Service request saved. Reopen it in Work orders → Intake inbox to continue.</p>:null}
    <p className="mt-3 text-sm text-slate-600">No new customer, serial, schedule, price or checklist answer is needed to save. Billing coverage and final paperwork still require the applicable review.</p>
  </article>;
}
