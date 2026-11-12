"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, CircleAlert, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { problemReportHasContent, problemReportStorageKey, readProblemReportDraft, type ProblemReportDraft as Draft } from "@/lib/problem-report-draft";

const blank = (module: string): Draft => ({ id: crypto.randomUUID(), module, category: "workflow", referenceId: "", summary: "", steps: "", expected: "", actual: "", errorMessage: "", privacyConfirmed: false, savedAt: Date.now() });

export function ProblemReporter({ module, reporterId, offsetForSidebar = false }: { module: string; reporterId: string; offsetForSidebar?: boolean }) {
  const key = useMemo(() => problemReportStorageKey(reporterId), [reporterId]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => blank(module));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [draftStored, setDraftStored] = useState(true);
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLg(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    try {
      const stored = readProblemReportDraft(localStorage.getItem(key));
      if (stored) setDraft(stored);
      else localStorage.removeItem(key);
    } catch { setDraftStored(false); }
  }, [key]);

  useEffect(() => {
    if (!problemReportHasContent(draft)) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
      setDraftStored(true);
    } catch { setDraftStored(false); }
  }, [draft, key]);

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value, savedAt: Date.now() }));
    setError("");
  }

  async function submit() {
    setSending(true); setError("");
    try {
      const response = await portalFetch("/api/problem-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientReportId: draft.id, module: draft.module, category: draft.category, referenceId: draft.referenceId, summary: draft.summary, steps: draft.steps, expected: draft.expected, actual: draft.actual, errorMessage: draft.errorMessage, privacyConfirmed: draft.privacyConfirmed }) });
      const data = await portalJson<{ report: { id: string }; message: string }>(response, "The report could not be confirmed. Your draft is still available.");
      if (!data.report?.id) throw new Error("The report could not be confirmed. Your draft is still available.");
      setReceipt(draft.id.slice(0, 8).toUpperCase());
      try { localStorage.removeItem(key); } catch { /* The server receipt remains authoritative. */ }
      setDraft(blank(module));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The report could not be sent. Your draft is still available."); }
    finally { setSending(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (value && !problemReportHasContent(draft)) setDraft((current) => ({ ...current, module })); setOpen(value); if (!value) { setError(""); setReceipt(""); } }}>
    <DialogTrigger asChild>
      <Button
        variant="outline"
        size="sm"
        style={{ left: (offsetForSidebar && isLg) ? "274px" : "1rem" }}
        className="fixed bottom-4 z-40 border-blue-200 bg-white/95 shadow-lg"
      >
        <Bug /> <span className="hidden sm:inline">Report a problem</span><span className="sm:hidden">Report</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Report a portal problem</DialogTitle><DialogDescription>Describe the screen and action. Your draft stays on this device for 24 hours until a save is confirmed.</DialogDescription></DialogHeader>
      {receipt ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong>Report received.</strong> Receipt {receipt}. An administrator can review it in the Command Center.</div> : <>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Do not include names, addresses, phone numbers, email addresses, medical information, passwords, or files.</strong> Use a work-order number when a record reference is needed.</div>
        {!draftStored ? <div role="alert" className="rounded-xl border border-amber-200 bg-white p-3 text-sm text-amber-900">This browser could not save the draft locally. Keep this window open until the report is received.</div> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold">Screen<Input value={draft.module} readOnly className="bg-slate-50" /></label>
          <label className="space-y-1.5 text-sm font-semibold">Problem type<Select value={draft.category} onValueChange={(value) => update("category", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="save">Saving changes</SelectItem><SelectItem value="upload">Uploading a file</SelectItem><SelectItem value="import">Importing data</SelectItem><SelectItem value="access">Access or sign-in</SelectItem><SelectItem value="mobile">Mobile layout or controls</SelectItem><SelectItem value="workflow">Workflow or unclear next step</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></label>
        </div>
        <label className="space-y-1.5 text-sm font-semibold">Work order or request ID <span className="font-normal text-slate-500">(optional)</span><Input value={draft.referenceId} onChange={(event) => update("referenceId", event.target.value)} maxLength={120} pattern="[A-Za-z0-9#_.:/-]*" placeholder="Example: WO-12345" /><span className="block text-xs font-normal text-slate-500">Use an ID only—do not enter a customer or employee name.</span></label>
        <label className="space-y-1.5 text-sm font-semibold">What happened?<Textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} maxLength={500} rows={3} placeholder="Example: The saved column plan disappeared after I selected the next spreadsheet." /></label>
        <label className="space-y-1.5 text-sm font-semibold">Steps to reproduce <span className="font-normal text-slate-500">(optional)</span><Textarea value={draft.steps} onChange={(event) => update("steps", event.target.value)} maxLength={2000} rows={3} placeholder="List the buttons or fields used, without private data." /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold">Expected result <span className="font-normal text-slate-500">(optional)</span><Textarea value={draft.expected} onChange={(event) => update("expected", event.target.value)} maxLength={1000} rows={2} /></label><label className="space-y-1.5 text-sm font-semibold">Actual result <span className="font-normal text-slate-500">(optional)</span><Textarea value={draft.actual} onChange={(event) => update("actual", event.target.value)} maxLength={1000} rows={2} /></label></div>
        <label className="space-y-1.5 text-sm font-semibold">Exact error shown <span className="font-normal text-slate-500">(optional)</span><Input value={draft.errorMessage} onChange={(event) => update("errorMessage", event.target.value)} maxLength={500} placeholder="Copy only the error message—remove private information first." /></label>
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4" checked={draft.privacyConfirmed} onChange={(event) => update("privacyConfirmed", event.target.checked)} /><span>I checked this report and removed private customer, employee, login, and medical information.</span></label>
        {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
      </>}
      <DialogFooter>{receipt ? <Button onClick={() => setOpen(false)}>Done</Button> : <Button onClick={submit} disabled={sending || draft.summary.trim().length < 10 || !draft.privacyConfirmed}><Send />{sending ? "Sending…" : "Send report"}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
