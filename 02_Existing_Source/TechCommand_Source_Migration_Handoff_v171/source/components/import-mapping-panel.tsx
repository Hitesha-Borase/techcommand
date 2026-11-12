"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { adaptImportMapping, importMappingFields, normalizeImportHeader, suggestImportMapping, validateImportMapping, type ImportMapping } from "@/lib/import-mapping";
import { importMappingDraftKey, readImportMappingDraft, type ImportMappingDraft } from "@/lib/import-mapping-draft";
import type { StructuredImportType } from "@/lib/import-templates";

export type ImportMappingProfile = {
  id: string;
  profileName: string;
  importType: StructuredImportType;
  sourceHeaders: string[];
  mapping: ImportMapping;
  status: "saved_plan";
  exchangeVerified: false;
  recordVersion: number;
  updatedAt: string;
};

async function json<T>(url: string, init?: RequestInit) {
  const response = await portalFetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  return portalJson<T>(response, "The column plan request could not be confirmed.");
}

export function ImportMappingPanel({
  importType,
  sourceHeaders,
  directReady,
  userId,
  onProfileChange,
  onDraftChange,
}: {
  importType: StructuredImportType;
  sourceHeaders: string[];
  directReady: boolean;
  userId: string;
  onProfileChange: (profile: ImportMappingProfile | null) => void;
  onDraftChange: (active: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("new");
  const [profileName, setProfileName] = useState("");
  const [mapping, setMapping] = useState<ImportMapping>(() => suggestImportMapping(sourceHeaders, importType));
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  const [deviceDraft, setDeviceDraft] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [draftStored, setDraftStored] = useState(true);
  const profiles = useQuery({ queryKey: ["import-mappings"], queryFn: () => json<{ profiles: ImportMappingProfile[] }>("/api/imports/mappings") });
  const availableProfiles = (profiles.data?.profiles || []).filter((item) => item.importType === importType);
  const normalizedHeaders = useMemo(() => sourceHeaders.map((header) => ({ value: normalizeImportHeader(header), label: header })), [sourceHeaders]);
  const draftKey = useMemo(() => importMappingDraftKey(userId, importType, sourceHeaders), [userId, importType, sourceHeaders]);
  const validation = useMemo(() => validateImportMapping(sourceHeaders, importType, mapping), [sourceHeaders, importType, mapping]);
  const missingMappingSources = useMemo(() => {
    const available = new Set(normalizedHeaders.map((header) => header.value));
    return [...new Set(Object.values(mapping).map(normalizeImportHeader).filter((source) => !available.has(source)))];
  }, [mapping, normalizedHeaders]);
  const selectedProfileMissing = profiles.isSuccess && selectedId !== "new" && !availableProfiles.some((item) => item.id === selectedId);

  useEffect(() => {
    let recovered: ImportMappingDraft | null = null;
    try {
      recovered = readImportMappingDraft(localStorage.getItem(draftKey), { importType, sourceHeaders });
      if (!recovered) localStorage.removeItem(draftKey);
      setDraftStored(true);
    } catch {
      setDraftStored(false);
    }
    if (recovered) {
      setSelectedId(recovered.selectedId);
      setProfileName(recovered.profileName);
      setEditingVersion(recovered.editingVersion);
      setMapping(recovered.mapping);
      setDeviceDraft(true);
      setRestoredDraft(true);
      onProfileChange(null);
      onDraftChange(true);
      return;
    }
    setSelectedId("new");
    setProfileName("");
    setEditingVersion(undefined);
    setMapping(suggestImportMapping(sourceHeaders, importType));
    setDeviceDraft(false);
    setRestoredDraft(false);
    onProfileChange(null);
    onDraftChange(false);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function rememberDraft(next: Omit<ImportMappingDraft, "importType" | "sourceHeaders" | "savedAt">) {
    setDeviceDraft(true);
    onDraftChange(true);
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ...next, importType, sourceHeaders, savedAt: Date.now() }));
      setDraftStored(true);
    } catch {
      setDraftStored(false);
    }
  }

  function clearDeviceDraft() {
    try { localStorage.removeItem(draftKey); setDraftStored(true); } catch { setDraftStored(false); }
    setDeviceDraft(false);
    setRestoredDraft(false);
    onDraftChange(false);
  }

  function choose(value: string) {
    clearDeviceDraft();
    setSelectedId(value);
    if (value === "new") {
      setProfileName("");
      setEditingVersion(undefined);
      setMapping(suggestImportMapping(sourceHeaders, importType));
      onProfileChange(null);
      return;
    }
    const selected = availableProfiles.find((item) => item.id === value);
    if (!selected) return;
    setProfileName(selected.profileName);
    setEditingVersion(selected.recordVersion);
    setMapping(selected.mapping);
    const check = validateImportMapping(sourceHeaders, importType, selected.mapping);
    onProfileChange(check.ready ? selected : null);
    onDraftChange(!check.ready);
  }

  const save = useMutation({
    mutationFn: () => json<{ profile: ImportMappingProfile; message: string }>("/api/imports/mappings", {
      method: "POST",
      body: JSON.stringify({ id: selectedId === "new" ? undefined : selectedId, profileName, importType, sourceHeaders, mapping, recordVersion: editingVersion }),
    }),
    onSuccess: async ({ profile, message }) => {
      await queryClient.invalidateQueries({ queryKey: ["import-mappings"] });
      setSelectedId(profile.id);
      setEditingVersion(profile.recordVersion);
      setMapping(profile.mapping);
      onProfileChange(profile);
      clearDeviceDraft();
      toast.success("Column plan saved", { description: message });
    },
    onError: (error) => toast.error(error.message, { description: deviceDraft ? "Your unsaved column choices remain protected on this device." : undefined }),
  });

  function changeMapping(target: string, source: string) {
    const next = { ...mapping };
    if (source === "not_mapped") delete next[target]; else next[target] = source;
    setMapping(next);
    rememberDraft({ selectedId, profileName, mapping: next, editingVersion });
    onProfileChange(null);
  }

  function changeProfileName(value: string) {
    setProfileName(value);
    rememberDraft({ selectedId, profileName: value, mapping, editingVersion });
    onProfileChange(null);
  }

  function adaptToFile() {
    const next = adaptImportMapping(sourceHeaders, importType, mapping);
    setMapping(next);
    setRestoredDraft(false);
    rememberDraft({ selectedId, profileName, mapping: next, editingVersion });
    onProfileChange(null);
  }

  function saveAsNewPlan() {
    setSelectedId("new");
    setEditingVersion(undefined);
    setRestoredDraft(false);
    rememberDraft({ selectedId: "new", profileName, mapping, editingVersion: undefined });
    onProfileChange(null);
  }

  return <section className={`rounded-xl border p-4 ${directReady ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/50"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{directReady ? <CheckCircle2 className="size-4 text-emerald-700"/> : <CircleAlert className="size-4 text-amber-700"/>} Match partner columns</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{directReady ? "Required headings are recognized. You can import now or save this layout for the next file." : "Some required headings are not recognized. Map them below and save the plan before importing."}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full border bg-white px-2.5 py-1">Plan: {deviceDraft ? "unsaved changes" : selectedId === "new" ? "not saved" : "saved"}</span><span className="rounded-full border bg-white px-2.5 py-1">Prerequisites: {validation.ready ? "configured" : "incomplete"}</span><span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-slate-700">Real exchange: not tested</span></div>
    </div>
    <details className="mt-3" open={!directReady}>
      <summary className="cursor-pointer text-sm font-semibold text-blue-700">Review or save the column plan</summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold text-slate-700">Saved plan<Select value={selectedId} onValueChange={choose}><SelectTrigger className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">New plan</SelectItem>{availableProfiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.profileName}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-700">Plan name<Input className="bg-white" value={profileName} maxLength={80} placeholder="Example: Partner work orders" onChange={(event) => changeProfileName(event.target.value)}/></label>
        </div>
        {deviceDraft ? <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>{restoredDraft ? "Unsaved column work recovered." : "Unsaved column work protected."}</strong> {restoredDraft ? "Review the choices below, then save the plan before importing." : "If this tab closes, choose a file with these same headings within 24 hours to continue."} Only the plan name and column choices are stored here—never spreadsheet rows or the file.</div> : null}
        {!draftStored ? <div role="alert" className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900">This browser could not protect the unsaved column plan. Keep this page open until the plan is saved.</div> : null}
        {selectedProfileMissing ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900"><span><strong>The earlier saved plan is no longer available.</strong> Your recovered choices are still here.</span><Button size="sm" variant="outline" onClick={saveAsNewPlan}><Save/>Save as a new plan</Button></div> : null}
        {missingMappingSources.length ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900"><span><strong>This plan does not match the selected file.</strong> Missing {missingMappingSources.length === 1 ? "heading" : "headings"}: {missingMappingSources.join(", ")}. No records can be imported until you review and save the updated choices.</span><Button size="sm" variant="outline" onClick={adaptToFile}><RefreshCw/>Adapt and review</Button></div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{importMappingFields(importType).map((field) => <label key={field.key} className="space-y-1.5 text-sm font-semibold text-slate-700"><span>{field.label}{field.required ? <span className="ml-1 text-xs font-normal text-slate-500">required choice</span> : null}</span><Select value={mapping[field.key] || "not_mapped"} onValueChange={(value) => changeMapping(field.key, value)}><SelectTrigger className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="not_mapped">Not mapped</SelectItem>{normalizedHeaders.map((header) => <SelectItem key={header.value} value={header.value}>{header.label}</SelectItem>)}</SelectContent></Select></label>)}</div>
        {!validation.ready ? <div role="alert" className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900"><strong>Before saving:</strong> {validation.errors.join(" ")}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-slate-600">A saved plan remembers headings only. It does not connect to the partner, send data, or prove their export format.</p><Button variant="outline" disabled={!validation.ready || profileName.trim().length < 2 || save.isPending} onClick={() => save.mutate()}><Save/>{save.isPending ? "Saving plan…" : selectedId === "new" ? "Save plan" : "Update plan"}</Button></div>
      </div>
    </details>
  </section>;
}
