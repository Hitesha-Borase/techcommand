"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { rateLabel, type RateSheet, type RateProposal } from "@/lib/rate-sheet";

export function RateSheetImport({ accountId, accountName, onApply, disabled = false, onBusy }: { disabled?: boolean; onBusy?: (busy: boolean) => void; accountId: string; accountName: string; onApply: (rates: RateProposal[], sourceDocumentId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [applied, setApplied] = useState(false);
  const savedDocument = useRef<{ file: File; id: string } | null>(null);
  const read = useMutation({ mutationFn: async (chosen: File) => {
    if (chosen.size > 20 * 1024 * 1024) throw new Error("Choose a rate sheet up to 20 MB.");
    const body = new FormData(); body.set("accountId", accountId); body.set("file", chosen);
    if (/\.csv$/i.test(chosen.name)) body.set("spreadsheetText", await chosen.text());
    if (/\.xlsx$/i.test(chosen.name)) {
      const readFile = (await import("read-excel-file/browser")).default;
      const sheets = await readFile(chosen);
      body.set("spreadsheetText", JSON.stringify(sheets));
    }
    if (String(body.get("spreadsheetText") || "").length > 100000) throw new Error("This spreadsheet is too large to review together. Split it into smaller rate sheets.");
    return portalJson<{ sheet: RateSheet }>(await portalFetch("/api/pricing-policies/extract", { method: "POST", body }), "The rate sheet could not be read.");
  }, onSuccess: () => { setSelected([]); setConfirmed(false); } });
  function choose(chosen?: File) {
    if (!chosen || disabled || read.isPending || apply.isPending) return;
    setFile(chosen); setApplied(false); setConfirmed(false); setSelected([]); savedDocument.current = null; apply.reset(); read.mutate(chosen);
  }
  const apply = useMutation({ mutationFn: async () => {
    if (!file || !read.data || !confirmed || !selected.length) throw new Error("Review the source and select the applicable rates first.");
    let sourceDocumentId = savedDocument.current?.file === file ? savedDocument.current.id : "";
    if (!sourceDocumentId) {
      const body = new FormData(); body.set("file", file); body.set("scopeType", "account"); body.set("scopeId", accountId); body.set("category", "rate_sheet"); body.set("title", file.name);
      const response = await portalFetch("/api/documents", { method: "POST", body });
      const result = await portalJson<{ document?: { id: string } }>(response, "The source rate sheet could not be archived. No rates were applied.");
      if (!result.document?.id) throw new Error("The source upload was not confirmed. No rates were applied.");
      sourceDocumentId = result.document.id; savedDocument.current = { file, id: sourceDocumentId };
    }
    onApply(read.data.sheet.rates.filter((_, index) => selected.includes(index)), sourceDocumentId);
  }, onSuccess: () => setApplied(true) });
  useEffect(() => { onBusy?.(read.isPending || apply.isPending); return () => onBusy?.(false); }, [read.isPending, apply.isPending, onBusy]);
  const sheet = read.data?.sheet;
  const foreignCurrency = sheet?.currency && sheet.currency.toUpperCase() !== "USD";
  return <section className="mt-5 space-y-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
    <h3 className="font-bold">Upload {accountName}’s rate sheet</h3><p className="text-sm text-slate-600">Copilot extracts proposed rates. Check the source, select the applicable rows, then save the reviewed account rules below.</p>
    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-cyan-300 bg-white p-5 text-center" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}><Upload className="mx-auto size-5 text-cyan-700"/><span className="mt-2 block font-semibold">{read.isPending ? "Reading rate sheet…" : file?.name || "Drop a rate sheet or choose a file"}</span><span className="mt-1 block text-sm text-slate-500">PDF, Excel, CSV, JPEG, PNG or WEBP · 20 MB</span><input className="sr-only" aria-label="Partner rate sheet" type="file" accept=".pdf,.xlsx,.csv,.jpg,.jpeg,.png,.webp" disabled={disabled || read.isPending || apply.isPending} onChange={event => { choose(event.target.files?.[0]); event.target.value = ""; }}/></label>
    {read.error ? <div role="alert" className="text-sm text-amber-900">{read.error.message} {file ? <Button type="button" variant="outline" size="sm" onClick={() => read.mutate(file)}>Retry reading</Button> : null}</div> : null}
    {sheet && !read.isPending ? <><p className="text-sm">Source partner: <strong>{sheet.partnerName || "Not stated"}</strong> · Currency: {sheet.currency || "Not stated — verify USD"} · Effective: {sheet.effectiveDate || "Not stated"}</p>
      {sheet.warnings.length ? <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-950">{sheet.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
      {foreignCurrency ? <p role="alert" className="text-sm text-red-700">This account calculator uses USD. These rates cannot be applied in {sheet.currency}.</p> : null}
      {sheet.rates.length ? <div className="space-y-2">{sheet.rates.map((rate, index) => <label key={index} className="flex items-start gap-3 rounded-lg border bg-white p-3"><Checkbox disabled={Boolean(foreignCurrency) || applied || apply.isPending} checked={selected.includes(index)} onCheckedChange={value => { setConfirmed(false); setSelected(current => value ? [...current, index] : current.filter(item => item !== index)); }}/><span className="min-w-0 text-sm"><span className="block font-bold capitalize">{rateLabel(rate.target)} · ${rate.value.toFixed(2)}</span><span className="mt-1 block text-slate-600">Source: “{rate.evidence}”</span>{rate.conditions ? <span className="mt-1 block text-amber-900">Conditions: {rate.conditions}</span> : null}</span></label>)}</div> : <p className="text-sm">No supported rates could be mapped confidently. Enter verified rates manually below.</p>}
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={confirmed} disabled={applied || Boolean(foreignCurrency) || apply.isPending} onCheckedChange={value => setConfirmed(value === true)}/><span>I checked the selected rows against the source: they apply to {accountName}, are in USD, and their dates, units and conditions fit this account’s rules.</span></label>
      <Button type="button" variant="outline" disabled={disabled || !confirmed || !selected.length || Boolean(foreignCurrency) || apply.isPending || applied} onClick={() => apply.mutate()}>{apply.isPending ? <LoaderCircle className="animate-spin"/> : null}{applied ? "Selected rates added to draft" : apply.isPending ? "Archiving source…" : "Use selected rates in draft"}</Button>
      {applied ? <p role="status" className="text-sm font-semibold text-blue-800">Source archived. Rates are still a draft — review and save the account rules below to activate them.</p> : null}
    </> : null}
    {apply.error ? <p role="alert" className="text-sm text-red-700">{apply.error.message}</p> : null}
  </section>;
}
