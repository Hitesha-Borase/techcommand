"use client";
import {AssetScanInput} from "@/components/asset-scan-input";
import {parseAssetScan} from "@/lib/asset-scanning";
import {VoiceNote} from "@/components/voice-note";
import { FieldNotesBox } from "@/components/field-notes-box";
import { loadCompletionDraft, saveCompletionDraft, removeCompletionDraft } from "@/lib/offline-client";
const AssetAiGuide = lazy(() => import("@/components/asset-ai-guide").then(m => ({ default: m.AssetAiGuide })));
import {readProcedure,readAnswers} from "@/lib/asset-ai-procedure";
import { editEquipmentDraft } from "@/lib/equipment-draft";
const AssetProcedureContext = lazy(() => import("@/components/asset-procedure-context").then(m => ({ default: m.AssetProcedureContext })));
import type {AcademyFieldMode} from "@/lib/academy";

import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type ProgressStatus = "not_started" | "in_progress" | "completed" | "not_applicable";
type AssetProgress = {
  serviceType: string;
  id: string;
  assetId: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  description: string | null;
  status: ProgressStatus;
  notes: string | null;
  findings: string | null;
  workPerformed: string | null;
  testResults: string | null;
  disposition: string | null;
  notApplicableReason: string | null;
  procedureSnapshotJson: string | null;
  procedureAnswersJson: string | null;
  recordVersion: number;
  updatedAt: string;
};

type Draft = Omit<AssetProgress, "updatedAt">;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return portalJson<T>(response, "Equipment progress could not be saved.");
}

function equipmentName(item: AssetProgress | Draft) {
  return [item.manufacturer, item.model, item.description].filter(Boolean).join(" · ") || "Equipment details pending";
}

function blank(value: string | null) {
  return value || "";
}

function asDraft(item: AssetProgress): Draft {
  return {
    ...item,
    notes: blank(item.notes),
    findings: blank(item.findings),
    workPerformed: blank(item.workPerformed),
    testResults: blank(item.testResults),
    notApplicableReason: blank(item.notApplicableReason),
  };
}

export type EquipmentSaveHandle = { savePending: () => Promise<void> };

export const WorkOrderAssetProgress = forwardRef<EquipmentSaveHandle, {
  workOrderId: string; actorUserId: string; locked: boolean; busy?:boolean; fieldMode: AcademyFieldMode | null; onHasNotesChange?: (value:boolean)=>void;
}>(function WorkOrderAssetProgress({ workOrderId, actorUserId, locked, busy, fieldMode, onHasNotesChange }, ref) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts); draftsRef.current = drafts;
  const dirty = useRef(new Set<string>());
  const recovered = useRef(new Set<string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [openAssetId, setOpenAssetId] = useState("");
  const [guidanceId, setGuidanceId] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [recoveryCopies,setRecoveryCopies] = useState<Record<string,Draft>>({});
  const query = useQuery({ queryKey: ["work-order-assets", workOrderId],
    queryFn: () => api<{ assets: AssetProgress[] }>(`/api/work-order-assets?workOrderId=${encodeURIComponent(workOrderId)}`),
    refetchOnWindowFocus: false,
  });
  const assets = useMemo(() => query.data?.assets || [], [query.data]);
  const deviceKey = (assetId: string) => `equipment-notes:${workOrderId}:${assetId}`;

  useEffect(() => {
    let active = true;
    for (const asset of assets) {
      if (recovered.current.has(asset.assetId)) continue;
      recovered.current.add(asset.assetId);
      if (locked) { void removeCompletionDraft(actorUserId, deviceKey(asset.assetId)).catch(() => undefined); continue; }
      void loadCompletionDraft<Draft>(actorUserId, deviceKey(asset.assetId)).then(recovery => {
        const saved = recovery?.report;
        if (!active || !saved || saved.assetId !== asset.assetId) return;
        if (saved.recordVersion !== asset.recordVersion) {
          setRecoveryCopies(current=>({...current,[asset.assetId]:saved}));
          setSaveMessage("A device recovery copy differs from the cloud version. Compare it before replacing any saved work.");
          return;
        }
        if (JSON.stringify(saved) === JSON.stringify(asDraft(asset))) return;
        dirty.current.add(asset.assetId);
        setDrafts(current => ({ ...current, [asset.assetId]: current[asset.assetId] || saved }));
      }).catch(() => setSaveMessage("Device recovery is unavailable. Use Save notes and wait for cloud confirmation."));
    }
    return () => { active = false; };
  }, [assets, locked, actorUserId, workOrderId]);

  function update(assetId: string, fields: Partial<Draft>) {
    const saved = assets.find(asset => asset.assetId === assetId); if (!saved || locked) return;
    const next = editEquipmentDraft(asDraft(saved), draftsRef.current[assetId], fields);
    draftsRef.current = { ...draftsRef.current, [assetId]: next };
    dirty.current.add(assetId); setDrafts(draftsRef.current); setSaveMessage("Saving notes…");
    void saveCompletionDraft(actorUserId, deviceKey(assetId), next).catch(() => setSaveMessage("Device storage is unavailable. Keep this page open and use Save notes."));
  }

  async function persist(assetId: string) {
    const run = chain.current.catch(() => undefined).then(async () => {
      if (!dirty.current.has(assetId)) return;
      const draft = draftsRef.current[assetId]; if (!draft || locked) return;
      if (!navigator.onLine) { setSaveMessage("Saved on this device. Reconnect, then Save notes to confirm the cloud copy."); return; }
      const sent = { ...draft, status: draft.status === "not_started" ? "in_progress" as const : draft.status };
      const result = await api<{ asset: AssetProgress }>("/api/work-order-assets", { method: "POST", body: JSON.stringify({
        workOrderId, assetId, expectedRecordVersion: sent.recordVersion, procedureId: readProcedure(sent.procedureSnapshotJson)?.id,
        procedureReviewed: Boolean(readProcedure(sent.procedureSnapshotJson)?.reviewedAt), procedureAnswers: readAnswers(sent.procedureAnswersJson),
        status: sent.status, notes: sent.notes || "", findings: sent.findings || "", workPerformed: sent.workPerformed || "", testResults: sent.testResults || "",
        disposition: sent.disposition, notApplicableReason: sent.notApplicableReason || "",
      }) });
      const current = draftsRef.current[assetId];
      const unchanged = JSON.stringify(current) === JSON.stringify(draft);
      const next = unchanged ? asDraft(result.asset) : { ...current, recordVersion: result.asset.recordVersion, procedureSnapshotJson: result.asset.procedureSnapshotJson };
      if (unchanged) dirty.current.delete(assetId);
      draftsRef.current = { ...draftsRef.current, [assetId]: next }; setDrafts(draftsRef.current);
      const deviceCopy = await saveCompletionDraft(actorUserId, deviceKey(assetId), next).then(()=>true).catch(()=>false);
      setSaveMessage(!deviceCopy ? "Saved to cloud. A device recovery copy could not be kept." : dirty.current.size ? "Latest changes are waiting to save." : "Saved to cloud.");
      client.setQueryData<{ assets: AssetProgress[] }>(["work-order-assets", workOrderId], data => data ? { assets: data.assets.map(a => a.assetId === assetId ? result.asset : a) } : data);
    });
    chain.current = run; await run;
  }
  const save = useMutation({ mutationFn: persist, onError: error => { setSaveMessage(error.message); toast.error(error.message); } });
  const saveAll = async () => {
    await chain.current.catch(() => undefined);
    for (const assetId of [...dirty.current]) await persist(assetId);
    if (navigator.onLine && dirty.current.size) throw new Error("Some equipment notes are not saved yet. Use Save notes before sending for review.");
  };
  useImperativeHandle(ref, () => ({ savePending: saveAll }));
  useEffect(() => {
    if (locked || !dirty.current.size) return;
    const timer = window.setTimeout(() => { for (const assetId of [...dirty.current]) save.mutate(assetId); }, 1800);
    return () => window.clearTimeout(timer);
  }, [drafts, locked]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current.size) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => { onHasNotesChange?.(assets.some(asset=>{const draft=drafts[asset.assetId]||asset;return [draft.notes,draft.findings,draft.workPerformed,draft.testResults,draft.notApplicableReason].some(value=>value?.trim());})); }, [assets,drafts,onHasNotesChange]);

  async function compareCloud() {
    await chain.current.catch(()=>undefined);
    const pending = Object.fromEntries([...dirty.current].map(id=>[id,draftsRef.current[id]]));
    setRecoveryCopies(current=>({...current,...pending}));
    dirty.current.clear();draftsRef.current={};setDrafts({});
    await query.refetch();setSaveMessage("Cloud copy reloaded. Compare the recovered device notes below before saving again.");
  }

  async function scan(code: string) {
    try {
      const parsed = parseAssetScan(code);
      let asset = assets.find(a => parsed.kind === "asset_id" ? a.assetId === parsed.value : a.assetTag === parsed.value);
      if (!asset) {
        const result = await api<{ asset: { id: string } }>("/api/assets/resolve", { method: "POST", body: JSON.stringify({ code, kind: "label" }) });
        asset = assets.find(a => a.assetId === result.asset.id);
      }
      if (!asset) throw new Error("This tag is not linked to equipment on this assignment. Choose the correct assigned unit, or add it to your visit.");
      setOpenAssetId(asset.assetId); setGuidanceId(""); setDetailsId("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Asset lookup failed."); }
  }

  if (query.isLoading) return <p className="flex gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading assigned units…</p>;
  if (query.error) return <div role="alert" className="rounded-lg border border-red-200 p-3 text-sm"><p>{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Retry equipment</Button></div>;
  if (!assets.length) return null;
  const expandedId = openAssetId || assets[0].assetId;
  return <section className="space-y-4">
    <h3 className="font-bold">Assigned equipment · {assets.length} unit{assets.length === 1 ? "" : "s"}</h3>
    {assets.length > 1 ? <AssetScanInput label="Scan to open this unit’s notes" disabled={locked || busy || save.isPending} onScan={code => void scan(code)} /> : null}
    <p role="status" className="text-sm text-slate-600">{saveMessage || "Open a unit, type your notes, then save. Blank questions do not block saving."}</p>
    {save.isError ? <Button type="button" variant="outline" disabled={busy || save.isPending} onClick={()=>void compareCloud()}>Reload cloud copy / compare my notes</Button> : null}
    {assets.map(asset => {
      const draft = drafts[asset.assetId] || asDraft(asset);
      const cataloging = asset.serviceType === "biomed_cataloging";
      const snapshot = readProcedure(draft.procedureSnapshotJson);
      const matchedSnapshot = snapshot && (snapshot.id.startsWith("cataloging-v1:") || (snapshot.document.manufacturer.trim().toLowerCase() === asset.manufacturer?.trim().toLowerCase() && snapshot.document.model.trim().toLowerCase() === asset.model?.trim().toLowerCase())) ? snapshot : null;
      const next = assets[assets.findIndex(a => a.assetId === asset.assetId) + 1];
      return <article key={asset.assetId} className="rounded-xl border bg-white">
        <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setOpenAssetId(asset.assetId)}>
          <span><strong className="font-mono">{asset.assetTag}</strong><span className="mt-1 block text-sm text-slate-600">{equipmentName(asset)} · S/N {asset.serialNumber || "not recorded"}</span></span>
          <Badge variant="outline">{draft.status === "completed" ? "Notes saved" : draft.status.replaceAll("_", " ")}</Badge>
        </button>
        {expandedId === asset.assetId ? <div className="space-y-4 border-t p-4">
          {recoveryCopies[asset.assetId] ? <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p className="font-semibold">Compare recovered device notes</p><Textarea readOnly value={recoveryCopies[asset.assetId].notes||"No free-text notes in recovery copy."} /><p>The cloud record changed. These notes have not replaced it.</p><Button variant="outline" type="button" disabled={locked || busy || save.isPending} onClick={()=>{const notes=[draft.notes,recoveryCopies[asset.assetId].notes].filter(Boolean).join("\n\nRecovered device notes:\n");if(notes.length>10000){toast.error("The combined notes exceed 10,000 characters. Compare and shorten them before saving; the recovery copy remains here.");return;}update(asset.assetId,{notes});setRecoveryCopies(current=>{const next={...current};delete next[asset.assetId];return next;});}}>Append recovered notes to current draft</Button></div>:null}
          <FieldNotesBox value={draft.notes || ""} onChange={notes => update(asset.assetId, { notes })} serviceType={asset.serviceType} snapshot={matchedSnapshot} disabled={locked || busy} />
          {!locked ? <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || save.isPending} onClick={() => save.mutate(asset.assetId)}><Save />{save.isPending ? "Saving…" : "Save notes"}</Button>
            <Button type="button" variant="outline" disabled={busy || save.isPending} onClick={async () => {
              if (![draft.notes,draft.findings,draft.workPerformed,draft.testResults].some(value=>value?.trim())) { toast.info("Type a note first, or use Save notes to keep an unfinished unit."); return; }
              if (draft.status === "not_applicable") { try { await save.mutateAsync(asset.assetId); if(next)setOpenAssetId(next.assetId); } catch {} return; }
              update(asset.assetId, { status: "completed", disposition: draft.disposition || (cataloging ? "cataloged" : "needs_review") });
              try { await save.mutateAsync(asset.assetId); if (next) setOpenAssetId(next.assetId); } catch { /* Keep entered notes and show the save error. */ }
            }}><Check />{next ? "Done with unit / next" : "Done with unit"}</Button>
          </div> : null}
          <p className="text-xs text-slate-500">Done saves this unit’s documentation. Record the actual test results if you select Passed or Returned to service.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setGuidanceId(guidanceId === asset.assetId ? "" : asset.assetId)}>Manufacturer guidance (optional)</Button>
            <Button type="button" variant="outline" onClick={() => setDetailsId(detailsId === asset.assetId ? "" : asset.assetId)}>Detailed fields / report (optional)</Button>
          </div>
          {guidanceId === asset.assetId ? <Suspense fallback={<p className="text-sm">Loading guidance…</p>}>
            <AssetAiGuide workOrderId={workOrderId} assetId={asset.assetId} snapshot={matchedSnapshot} answers={readAnswers(draft.procedureAnswersJson)} disabled={locked || busy || save.isPending} fieldMode={fieldMode} recordVersion={draft.recordVersion}
              onChange={(snapshot, answers) => update(asset.assetId, { procedureSnapshotJson: JSON.stringify(snapshot), procedureAnswersJson: JSON.stringify(answers) })} />
            <AssetProcedureContext assetId={asset.assetId} workOrderId={workOrderId} />
          </Suspense> : null}
          {detailsId === asset.assetId ? <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
            {(["findings", "workPerformed", "testResults"] as const).map(key => <label key={key} className="block text-sm font-semibold">{key.replace(/([A-Z])/g, " $1")} (optional)<Textarea maxLength={10000} disabled={locked || busy || save.isPending} value={draft[key] || ""} onChange={event => update(asset.assetId, { [key]: event.target.value })} /></label>)}
            <VoiceNote disabled={locked || busy || save.isPending} onText={text => update(asset.assetId, { notes: [draft.notes, text].filter(Boolean).join("\n").slice(0, 10000) })} />
            <label className="block text-sm font-semibold">Outcome / disposition<select className="mt-1 min-h-11 w-full rounded border bg-white px-3" disabled={locked || busy || save.isPending} value={draft.disposition || ""} onChange={event => update(asset.assetId, { disposition: event.target.value || null })}>
              <option value="">Outcome not assessed</option>{cataloging ? <option value="cataloged">Cataloged — operating safety not assessed</option> : <><option value="passed">Passed</option><option value="returned_to_service">Returned to service</option></>}
              {["parts_required", "follow_up_required", "quarantined", "retired", "needs_resolution", "needs_review"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select></label>
            <label className="block text-sm font-semibold">Work status<select className="mt-1 min-h-11 w-full rounded border bg-white px-3" disabled={locked || busy || save.isPending} value={draft.status} onChange={event => update(asset.assetId, { status: event.target.value as ProgressStatus })}>
              <option value="in_progress">In progress</option><option value="completed">Notes saved</option><option value="not_applicable">Not applicable to this visit</option>
            </select></label>
            {draft.status === "not_applicable" ? <label className="block text-sm font-semibold">Reason / access restriction<Textarea disabled={locked || busy || save.isPending} maxLength={2000} value={draft.notApplicableReason || ""} onChange={event => update(asset.assetId, { notApplicableReason: event.target.value })} /></label> : null}
            <a className="block text-sm font-semibold text-blue-700" href={`/api/work-order-asset-report?workOrderId=${encodeURIComponent(workOrderId)}&assetId=${encodeURIComponent(asset.assetId)}&mode=compact`}>Download saved asset draft</a>
            <p className="text-xs text-slate-600">Download uses the cloud copy. Save and wait for confirmation first.</p>
          </div> : null}
        </div> : null}
      </article>;
    })}
  </section>;
});
