"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCheck, CheckCircle2, ClipboardList, Plus, Save, SearchCheck, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Track = "biomedical" | "dme_mobility";
type Measurement = {
  id: string;
  name: string;
  unit: string;
  expectedMin: string | null;
  expectedMax: string | null;
  expectedText: string | null;
  conditions: string;
  sourceLocator: string;
  required: boolean;
  instrumentType: string;
  instrumentRequired: boolean;
  calibrationRequired: boolean;
};
type Branch = {
  outcome:
    "meets_reference" | "outside_reference" | "not_applicable" | "deferred";
  nextStepId: string;
  instruction: string;
  sourceLocator: string;
};
type Step = {
  id: string;
  instruction: string;
  locator: string;
  conditions: string;
  expectedResult: string;
  photoGuidance: string;
  photoRequired: boolean;
  branches: Branch[];
  measurements: Measurement[];
};
type Draft = {
  track: Track;
  familyId: string | null;
  manufacturer: string;
  model: string;
  serialRange: string;
  documentType:
    | "service_manual"
    | "pm_procedure"
    | "technical_bulletin"
    | "safety_notice"
    | "manufacturer_documentation"
    | "regulatory_standard"
    | "techflex_internal";
  title: string;
  sourceName: string;
  sourceUrl: string;
  sourceRevision: string;
  effectiveOn: string | null;
  verifiedOn: string | null;
  applicability: string;
  limitations: string[];
  reviewBasis: string;
  feedbackIds: string[];
  rollbackRevisionId: string | null;
  revisionImpact:
    | "routine"
    | "review_open_work"
    | "stop_and_review_open_work";
  revisionImpactNote: string;
  serviceType: string;
  steps: Step[];
};
type DocumentRow = {
  id: string;
  track: Track;
  manufacturer: string;
  model: string;
  title: string;
  status: string;
  currentRevisionId: string | null;
  version: number;
  revisionNumber: number | null;
  openReviewCount?: number;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceRevision: string | null;
  verifiedOn: string | null;
  applicability: string | null;
  serviceType: string | null;
  draftJson?: string;
  stepsJson?: string;
  updatedAt: string;
};
type RevisionRow = {
  revisionId: string;
  documentId: string;
  revisionNumber: number;
  sourceRevision: string;
  effectiveOn: string | null;
  verifiedOn: string;
  publishedAt: string;
  publishedBy: string;
};
type Library = {
  manager: boolean;
  canPublish: boolean;
  documents: DocumentRow[];
  revisions: RevisionRow[];
};

async function api<T>(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Technical knowledge request failed.");
  return d;
}
const newMeasurement = (): Measurement => ({
  id: crypto.randomUUID(),
  name: "",
  unit: "",
  expectedMin: null,
  expectedMax: null,
  expectedText: null,
  conditions: "",
  sourceLocator: "",
  required: true,
  instrumentType: "",
  instrumentRequired: false,
  calibrationRequired: false,
});
const newStep = (): Step => ({
  id: `step-${crypto.randomUUID().slice(0, 8)}`,
  instruction: "",
  locator: "",
  conditions: "",
  expectedResult: "",
  photoGuidance: "",
  photoRequired: false,
  branches: [],
  measurements: [],
});
const blank = (track: Track): Draft => ({
  track,
  familyId: null,
  manufacturer: "",
  model: "",
  serialRange: "",
  documentType: "service_manual",
  title: "",
  sourceName: "",
  sourceUrl: "",
  sourceRevision: "",
  effectiveOn: null,
  verifiedOn: null,
  applicability: "",
  limitations: [],
  reviewBasis: "",
  feedbackIds: [],
  rollbackRevisionId: null,
  revisionImpact: "routine",
  revisionImpactNote: "",
  serviceType: "",
  steps: [newStep()],
});
const normalizeSteps = (steps: Partial<Step>[]): Step[] =>
  (steps || []).map((step) => ({
    ...newStep(),
    ...step,
    branches: step.branches || [],
    measurements: (step.measurements || []).map((item) => ({
      ...newMeasurement(),
      ...item,
    })),
  }));
function parseDraft(row: DocumentRow): Draft {
  try {
    const saved = JSON.parse(row.draftJson || "{}");
    if (saved.track)
      return {
        ...blank(saved.track),
        ...saved,
        steps: normalizeSteps(saved.steps),
      } as Draft;
  } catch {}
  let steps: Step[] = [];
  try {
    steps = normalizeSteps(JSON.parse(row.stepsJson || "[]"));
  } catch {}
  return {
    ...blank(row.track),
    manufacturer: row.manufacturer,
    model: row.model,
    title: row.title,
    sourceName: row.sourceName || "",
    sourceUrl: row.sourceUrl || "",
    sourceRevision: row.sourceRevision || "",
    verifiedOn: row.verifiedOn || null,
    applicability: row.applicability || "",
    serviceType: row.serviceType || "",
    steps: steps.length ? steps : [newStep()],
  };
}

export function TechnicalKnowledge() {
  const queryClient = useQueryClient();
  const [track, setTrack] = useState<Track>("biomedical"),
    [search, setSearch] = useState(""),
    [id, setId] = useState<string | null>(null),
    [version, setVersion] = useState(0),
    [draft, setDraft] = useState<Draft>(() => blank("biomedical")),
    [feedbackTarget, setFeedbackTarget] = useState<DocumentRow | null>(null),
    [rollbackReason, setRollbackReason] = useState(""),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false);
  const library = useQuery({
    queryKey: ["technical-knowledge", track],
    queryFn: () => api<Library>(`/api/technical-knowledge?track=${track}`),
  });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (library.data?.documents || []).filter(
      (d) =>
        !q ||
        [d.manufacturer, d.model, d.title, d.serviceType, d.sourceName].some(
          (v) => v?.toLowerCase().includes(q),
        ),
    );
  }, [library.data, search]);
  const revisionHistory = useMemo(
    () => (library.data?.revisions || []).filter((item) => item.documentId === id),
    [library.data, id],
  );
  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
  };
  const saveDraft = async () => {
    const documentId = id || crypto.randomUUID();
    if (!id) setId(documentId);
    setSaving(true);
    try {
      const result = await api<{ version: number }>(
        "/api/technical-knowledge",
        {
          method: "POST",
          body: JSON.stringify({
            action: "save_draft",
            requestId: crypto.randomUUID(),
            id: documentId,
            version,
            draft,
          }),
        },
      );
      setVersion(result.version);
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["technical-knowledge", track],
      });
      toast.success("Technical-source draft saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const publish = useMutation({
    mutationFn: () =>
      api<{ version: number; revision: number }>("/api/technical-knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "publish",
          requestId: crypto.randomUUID(),
          id,
          version,
        }),
      }),
    onSuccess: async (result) => {
      setVersion(result.version);
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["technical-knowledge", track],
      });
      toast.success(`Reviewed procedure revision ${result.revision} published`);
    },
    onError: (e) => toast.error(e.message),
  });
  const prepareRollback = useMutation({
    mutationFn: (rollbackRevisionId: string) =>
      api<{ version: number; draft: Draft }>("/api/technical-knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "prepare_rollback",
          requestId: crypto.randomUUID(),
          id,
          version,
          rollbackRevisionId,
          reason: rollbackReason,
        }),
      }),
    onSuccess: async (result) => {
      setVersion(result.version);
      setDraft({ ...result.draft, steps: normalizeSteps(result.draft.steps) });
      setRollbackReason("");
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["technical-knowledge", track],
      });
      toast.success("Historical content saved as a new forward-review draft");
    },
    onError: (e) => toast.error(e.message),
  });
  const startNew = () => {
    setId(null);
    setVersion(0);
    setDraft(blank(track));
    setRollbackReason("");
    setDirty(false);
  };
  const switchTrack = (next: Track) => {
    setTrack(next);
    setId(null);
    setVersion(0);
    setDraft(blank(next));
    setFeedbackTarget(null);
    setRollbackReason("");
    setDirty(false);
  };
  const load = (row: DocumentRow) => {
    setId(row.id);
    setVersion(row.version);
    setDraft(parseDraft(row));
    setRollbackReason("");
    setDirty(false);
  };
  const updateStep = (index: number, patch: Partial<Step>) =>
    change({
      ...draft,
      steps: draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  const updateMeasurement = (
    si: number,
    mi: number,
    patch: Partial<Measurement>,
  ) =>
    updateStep(si, {
      measurements: draft.steps[si].measurements.map((m, i) =>
        i === mi ? { ...m, ...patch } : m,
      ),
    });
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-blue-700" />
              <h2 className="font-bold">Reviewed technical procedures</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Exact manufacturer/model procedures appear in fieldwork only after
              source review. Drafts may remain incomplete; publishing requires a
              dated source, applicability, and cited acceptance criteria.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={track === "biomedical" ? "default" : "outline"}
              onClick={() => switchTrack("biomedical")}
            >
              Biomedical
            </Button>
            <Button
              variant={track === "dme_mobility" ? "default" : "outline"}
              onClick={() => switchTrack("dme_mobility")}
            >
              DME / Mobility
            </Button>
          </div>
        </div>
        <Input
          className="mt-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manufacturer, model, source, or service type"
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => { setFeedbackTarget(row); if (library.data?.manager) load(row); }}
              className="rounded-xl border p-4 text-left hover:border-blue-300"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {row.manufacturer || "Manufacturer missing"}{" "}
                    {row.model || ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {row.title || "Untitled draft"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                >
                  {row.status === "published"
                    ? `Published r${row.revisionNumber}`
                    : "Draft"}
                </span>
              </div>
              {row.status === "published" ? (
                <div className="mt-3 text-xs text-slate-500">
                  <p>
                    {row.serviceType} · {row.sourceName} · verified{" "}
                    {row.verifiedOn}
                  </p>
                  {row.openReviewCount ? (
                    <p className="mt-1 font-bold text-amber-800">
                      {row.openReviewCount} open work item
                      {row.openReviewCount === 1 ? "" : "s"} need revision review
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-amber-700">
                  Not available in technician fieldwork.
                </p>
              )}
            </button>
          ))}
        </div>
        {!library.isLoading && !rows.length ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No reviewed procedures match this track and search. The AI will flag
            documentation review instead of inventing a protocol.
          </p>
        ) : null}
      </section>
      <TechnicalFeedbackPanel
        track={track}
        target={feedbackTarget?.status === "published" ? feedbackTarget : null}
        onPrepare={(feedback) => {
          const row=(library.data?.documents||[]).find(item=>item.id===feedback.documentId);
          if(!row)return;
          const next=parseDraft(row);
          load(row);
          setDraft({...next,feedbackIds:[...new Set([...(next.feedbackIds||[]),feedback.id])],rollbackRevisionId:null});
          setDirty(true);
        }}
      />
      {library.data?.manager ? (
        <details className="rounded-xl border bg-white p-5" open={Boolean(id)}>
          <summary className="cursor-pointer font-bold">
            Procedure authoring and review
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                Save incomplete research at any time. Publish only after the
                source and every step are verified.
              </p>
              <Button variant="outline" onClick={startNew}>
                <Plus />
                New draft
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="Manufacturer"
                value={draft.manufacturer}
                onChange={(v) => change({ ...draft, manufacturer: v })}
              />
              <Field
                label="Exact model"
                value={draft.model}
                onChange={(v) => change({ ...draft, model: v })}
              />
              <Field
                label="Serial/model range"
                value={draft.serialRange}
                onChange={(v) => change({ ...draft, serialRange: v })}
              />
              <Field
                label="Service type"
                value={draft.serviceType}
                onChange={(v) => change({ ...draft, serviceType: v })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Procedure title"
                value={draft.title}
                onChange={(v) => change({ ...draft, title: v })}
              />
              <label className="space-y-1 text-sm font-semibold">
                Document type
                <select
                  className="h-9 w-full rounded-md border bg-white px-3 font-normal"
                  value={draft.documentType}
                  onChange={(e) =>
                    change({
                      ...draft,
                      documentType: e.target.value as Draft["documentType"],
                    })
                  }
                >
                  <option value="service_manual">Service manual</option>
                  <option value="pm_procedure">PM procedure</option>
                  <option value="technical_bulletin">Technical bulletin</option>
                  <option value="safety_notice">Safety notice</option>
                  <option value="manufacturer_documentation">
                    Manufacturer documentation
                  </option>
                  <option value="regulatory_standard">
                    Regulatory / standard
                  </option>
                  <option value="techflex_internal">TechFlex internal</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="Source name"
                value={draft.sourceName}
                onChange={(v) => change({ ...draft, sourceName: v })}
              />
              <Field
                label="Source URL (HTTPS)"
                value={draft.sourceUrl}
                onChange={(v) => change({ ...draft, sourceUrl: v })}
              />
              <Field
                label="Source revision"
                value={draft.sourceRevision}
                onChange={(v) => change({ ...draft, sourceRevision: v })}
              />
              <Field
                label="Verified on"
                type="date"
                value={draft.verifiedOn || ""}
                onChange={(v) => change({ ...draft, verifiedOn: v || null })}
              />
              <Field
                label="Effective on"
                type="date"
                value={draft.effectiveOn || ""}
                onChange={(v) => change({ ...draft, effectiveOn: v || null })}
              />
            </div>
            {draft.feedbackIds.length ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>{draft.feedbackIds.length} reviewed feedback item{draft.feedbackIds.length===1?"":"s"}</strong> linked to this draft. Publishing requires an effective date and creates a new immutable revision; the current procedure remains active until then.</div>:null}
            {draft.rollbackRevisionId ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>Forward rollback draft.</strong> Historical content was copied
                without changing the active procedure. Reverify the source, record new
                verified and effective dates, review every step, then publish a new
                higher revision. Existing fieldwork stays pinned to its saved revision.
              </div>
            ) : null}
            {id && revisionHistory.length > 1 ? (
              <section className="rounded-xl border bg-slate-50 p-4">
                <h3 className="font-bold">Published revision history</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Restoring prior content never repoints the active procedure or edits
                  history. It prepares a review draft that must be published as a new
                  revision.
                </p>
                <Area
                  label="Source-reviewed reason for restoring prior content"
                  value={rollbackReason}
                  onChange={setRollbackReason}
                />
                <div className="mt-3 space-y-2">
                  {revisionHistory.map((item) => {
                    const current = item.revisionId ===
                      (library.data?.documents || []).find((row) => row.id === id)
                        ?.currentRevisionId;
                    return (
                      <div
                        key={item.revisionId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3 text-sm"
                      >
                        <div>
                          <p className="font-bold">
                            Revision {item.revisionNumber}{current ? " · Current" : ""}
                          </p>
                          <p className="text-slate-600">
                            Source {item.sourceRevision || "not labeled"} · verified {item.verifiedOn}
                            {item.effectiveOn ? ` · effective ${item.effectiveOn}` : ""}
                          </p>
                        </div>
                        {!current ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={rollbackReason.trim().length < 10 || prepareRollback.isPending}
                            onClick={() => prepareRollback.mutate(item.revisionId)}
                          >
                            Prepare forward rollback
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <Area
              label="Applicability"
              value={draft.applicability}
              onChange={(v) => change({ ...draft, applicability: v })}
            />
            <Area
              label="Technical review basis"
              value={draft.reviewBasis}
              onChange={(v) => change({ ...draft, reviewBasis: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold">
                Effect on work already in progress
                <select
                  className="min-h-11 w-full rounded-md border bg-white px-3 font-normal"
                  value={draft.revisionImpact}
                  onChange={(event) =>
                    change({
                      ...draft,
                      revisionImpact: event.target.value as Draft["revisionImpact"],
                    })
                  }
                >
                  <option value="routine">
                    Routine revision — preserve pinned open work
                  </option>
                  <option value="review_open_work">
                    Flag affected open work for technical review
                  </option>
                  <option value="stop_and_review_open_work">
                    Urgent stop and technical review
                  </option>
                </select>
              </label>
              <Area
                label="Source-backed revision impact note"
                value={draft.revisionImpactNote}
                onChange={(value) =>
                  change({ ...draft, revisionImpactNote: value })
                }
              />
            </div>
            <Area
              label="Limitations (one per line)"
              value={draft.limitations.join("\n")}
              onChange={(v) =>
                change({
                  ...draft,
                  limitations: v
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
            <div className="space-y-3">
              {draft.steps.map((step, si) => (
                <article
                  key={step.id}
                  className="rounded-xl border bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">Step {si + 1}</h3>
                    {draft.steps.length > 1 ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change({
                            ...draft,
                            steps: draft.steps.filter((_, i) => i !== si),
                          })
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Step ID"
                      value={step.id}
                      onChange={(v) => updateStep(si, { id: v })}
                    />
                    <Field
                      label="Source page / section"
                      value={step.locator}
                      onChange={(v) => updateStep(si, { locator: v })}
                    />
                  </div>
                  <Area
                    label="Technician instruction"
                    value={step.instruction}
                    onChange={(v) => updateStep(si, { instruction: v })}
                  />
                  <Area
                    label="Conditions / safety context"
                    value={step.conditions}
                    onChange={(v) => updateStep(si, { conditions: v })}
                  />
                  <Area
                    label="Verified expected result"
                    value={step.expectedResult}
                    onChange={(v) => updateStep(si, { expectedResult: v })}
                  />
                  <Area
                    label="Photo guidance (describe the exact evidence to capture)"
                    value={step.photoGuidance}
                    onChange={(v) => updateStep(si, { photoGuidance: v })}
                  />
                  <Check
                    label="Require photo evidence on this exact step"
                    checked={step.photoRequired}
                    onChange={(v) => updateStep(si, { photoRequired: v })}
                  />
                  {step.branches.map((branch, bi) => (
                    <div
                      key={`${branch.outcome}:${bi}`}
                      className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm font-semibold">
                          Observed outcome
                          <select
                            className="h-9 w-full rounded-md border bg-white px-3 font-normal"
                            value={branch.outcome}
                            onChange={(e) =>
                              updateStep(si, {
                                branches: step.branches.map((b, i) =>
                                  i === bi
                                    ? {
                                        ...b,
                                        outcome: e.target
                                          .value as Branch["outcome"],
                                      }
                                    : b,
                                ),
                              })
                            }
                          >
                            <option value="meets_reference">
                              Meets cited criteria
                            </option>
                            <option value="outside_reference">
                              Outside cited criteria
                            </option>
                            <option value="not_applicable">
                              Not applicable
                            </option>
                            <option value="deferred">Deferred</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-sm font-semibold">
                          Continue at reviewed step
                          <select
                            className="h-9 w-full rounded-md border bg-white px-3 font-normal"
                            value={branch.nextStepId}
                            onChange={(e) =>
                              updateStep(si, {
                                branches: step.branches.map((b, i) =>
                                  i === bi
                                    ? { ...b, nextStepId: e.target.value }
                                    : b,
                                ),
                              })
                            }
                          >
                            <option value="">Choose a later step</option>
                            {draft.steps.slice(si + 1).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.id}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <Area
                        label="Source-backed branch instruction"
                        value={branch.instruction}
                        onChange={(v) =>
                          updateStep(si, {
                            branches: step.branches.map((b, i) =>
                              i === bi ? { ...b, instruction: v } : b,
                            ),
                          })
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Field
                          label="Branch source page / section"
                          value={branch.sourceLocator}
                          onChange={(v) =>
                            updateStep(si, {
                              branches: step.branches.map((b, i) =>
                                i === bi ? { ...b, sourceLocator: v } : b,
                              ),
                            })
                          }
                        />
                        <Button
                          className="self-end"
                          variant="ghost"
                          onClick={() =>
                            updateStep(si, {
                              branches: step.branches.filter(
                                (_, i) => i !== bi,
                              ),
                            })
                          }
                        >
                          Remove branch
                        </Button>
                      </div>
                    </div>
                  ))}
                  {si < draft.steps.length - 1 ? (
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={step.branches.length >= 4}
                      onClick={() =>
                        updateStep(si, {
                          branches: [
                            ...step.branches,
                            {
                              outcome: "outside_reference",
                              nextStepId: draft.steps[si + 1].id,
                              instruction: "",
                              sourceLocator: "",
                            },
                          ],
                        })
                      }
                    >
                      <Plus />
                      Add reviewed outcome branch
                    </Button>
                  ) : null}
                  {step.measurements.map((m, mi) => (
                    <div
                      key={m.id}
                      className="mt-3 rounded-lg border bg-white p-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field
                          label="Measurement"
                          value={m.name}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { name: v })
                          }
                        />
                        <Field
                          label="Unit"
                          value={m.unit}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { unit: v })
                          }
                        />
                        <Field
                          label="Minimum"
                          value={m.expectedMin || ""}
                          onChange={(v) =>
                            updateMeasurement(si, mi, {
                              expectedMin: v || null,
                            })
                          }
                        />
                        <Field
                          label="Maximum"
                          value={m.expectedMax || ""}
                          onChange={(v) =>
                            updateMeasurement(si, mi, {
                              expectedMax: v || null,
                            })
                          }
                        />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Text acceptance criteria"
                          value={m.expectedText || ""}
                          onChange={(v) =>
                            updateMeasurement(si, mi, {
                              expectedText: v || null,
                            })
                          }
                        />
                        <Field
                          label="Measurement source locator"
                          value={m.sourceLocator}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { sourceLocator: v })
                          }
                        />
                        <Field
                          label="Required instrument type"
                          value={m.instrumentType}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { instrumentType: v })
                          }
                        />
                        <Field
                          label="Test conditions"
                          value={m.conditions}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { conditions: v })
                          }
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm">
                        <Check
                          label="Required measurement"
                          checked={m.required}
                          onChange={(v) =>
                            updateMeasurement(si, mi, { required: v })
                          }
                        />
                        <Check
                          label="Instrument identity required"
                          checked={m.instrumentRequired}
                          onChange={(v) =>
                            updateMeasurement(si, mi, {
                              instrumentRequired: v,
                              calibrationRequired: v
                                ? m.calibrationRequired
                                : false,
                            })
                          }
                        />
                        <Check
                          label="Current calibration evidence required"
                          checked={m.calibrationRequired}
                          onChange={(v) =>
                            updateMeasurement(si, mi, {
                              calibrationRequired: v,
                              instrumentRequired: v || m.instrumentRequired,
                            })
                          }
                        />
                      </div>
                      <Button
                        className="mt-2"
                        variant="ghost"
                        onClick={() =>
                          updateStep(si, {
                            measurements: step.measurements.filter(
                              (_, i) => i !== mi,
                            ),
                          })
                        }
                      >
                        Remove measurement
                      </Button>
                    </div>
                  ))}
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() =>
                      updateStep(si, {
                        measurements: [...step.measurements, newMeasurement()],
                      })
                    }
                  >
                    <Plus />
                    Add measurement
                  </Button>
                </article>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  change({ ...draft, steps: [...draft.steps, newStep()] })
                }
              >
                <Plus />
                Add step
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={saveDraft}>
                <Save />
                {saving ? "Saving…" : dirty ? "Save draft" : "Draft saved"}
              </Button>
              <Button
                disabled={!id || version === 0 || dirty || publish.isPending}
                onClick={() => publish.mutate()}
              >
                <BookCheck />
                Publish reviewed revision
              </Button>
            </div>
            {dirty ? (
              <p className="text-xs text-amber-700">
                Save this draft before publishing its reviewed revision.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

type ProcedureFeedback = {
  id:string;documentId:string;revisionId:string;revisionNumber:number;track:Track;manufacturer:string;model:string;
  feedbackType:"needs_clarification"|"observed_difference"|"contradicts_current"|"source_revision_notice";
  summary:string;observedResult:string;expectedResult:string;sourceLocator:string;supportingSourceUrl:string|null;
  negatingEvidence:string;workReference:string;status:"submitted"|"in_review"|"ready_for_revision"|"declined"|"implemented";
  decisionNote:string;recordVersion:number;implementedRevisionId:string|null;createdAt:string;
};
type CaseRate={numerator:number;denominator:number;percent:number|null};
type CaseQuality={
  totalCases:number;openCases:number;evaluatedCases:number;acceptedCases:number;implementedCases:number;declinedCases:number;
  decisionBasisCases:number;contradictionEvaluatedCases:number;contradictionAcceptedCases:number;workLinkedCases:number;sourceLinkedCases:number;
  evaluationCoverage:CaseRate;acceptedForRevision:CaseRate;implementationCoverage:CaseRate;documentedDecisionBasis:CaseRate;contradictionsAcceptedForRevision:CaseRate;
  groups:Array<{manufacturer:string;model:string;totalCases:number;openCases:number;evaluatedCases:number;acceptedCases:number;implementedCases:number}>;
};
type FeedbackQueue={manager:boolean;feedback:ProcedureFeedback[];quality:CaseQuality|null};

function TechnicalFeedbackPanel({track,target,onPrepare}:{track:Track;target:DocumentRow|null;onPrepare:(feedback:ProcedureFeedback)=>void}){
  const client=useQueryClient();
  const [feedbackType,setFeedbackType]=useState<ProcedureFeedback["feedbackType"]>("needs_clarification");
  const [summary,setSummary]=useState(""),[observed,setObserved]=useState(""),[expected,setExpected]=useState(""),[locator,setLocator]=useState(""),[sourceUrl,setSourceUrl]=useState(""),[negating,setNegating]=useState(""),[reference,setReference]=useState("");
  const [notes,setNotes]=useState<Record<string,string>>({});
  const queue=useQuery({queryKey:["technical-feedback",track],queryFn:()=>api<FeedbackQueue>(`/api/technical-feedback?track=${track}`)});
  const submit=useMutation({mutationFn:()=>{
    if(!target?.currentRevisionId)throw new Error("Choose a published procedure first.");
    return api<{saved:boolean}>("/api/technical-feedback",{method:"POST",body:JSON.stringify({id:crypto.randomUUID(),documentId:target.id,revisionId:target.currentRevisionId,feedbackType,summary,observedResult:observed,expectedResult:expected,sourceLocator:locator,supportingSourceUrl:sourceUrl,negatingEvidence:negating,workReference:reference})});
  },onSuccess:async()=>{setSummary("");setObserved("");setExpected("");setLocator("");setSourceUrl("");setNegating("");setReference("");await client.invalidateQueries({queryKey:["technical-feedback",track]});toast.success("Procedure feedback submitted for independent review");},onError:e=>toast.error(e.message)});
  const decide=useMutation({mutationFn:({feedback,action}:{feedback:ProcedureFeedback;action:"start_review"|"prepare_revision"|"decline"})=>api<{saved:boolean}>("/api/technical-feedback",{method:"PATCH",body:JSON.stringify({id:feedback.id,version:feedback.recordVersion,action,decisionNote:notes[feedback.id]||""})}).then(result=>({result,feedback,action})),onSuccess:async({feedback,action})=>{await client.invalidateQueries({queryKey:["technical-feedback",track]});if(action==="prepare_revision")onPrepare(feedback);toast.success(action==="prepare_revision"?"Feedback linked to a new draft; verify sources before publishing":action==="decline"?"Feedback declined with an audit note":"Independent review started");},onError:e=>toast.error(e.message)});
  const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  return <section className="rounded-xl border bg-white p-5">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><ClipboardList className="size-5"/></span><div><h2 className="font-bold">Reviewed field feedback</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Record what was actually observed against an exact published procedure. Feedback never changes field guidance by itself; another authorized reviewer must link it to a sourced, effective-dated revision.</p></div></div>
    <div className="mt-4 rounded-xl border bg-slate-50 p-4">
      <p className="text-sm font-bold">{target?`${target.manufacturer} ${target.model} · published r${target.revisionNumber}`:"Select a published procedure above"}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Feedback type<select className="h-9 w-full rounded-md border bg-white px-3 font-normal" value={feedbackType} onChange={e=>setFeedbackType(e.target.value as ProcedureFeedback["feedbackType"])}><option value="needs_clarification">Needs clarification</option><option value="observed_difference">Observed difference</option><option value="contradicts_current">Contradicts current guidance</option><option value="source_revision_notice">Source revision notice</option></select></label>
        <Field label="Exact source page / section" value={locator} onChange={setLocator}/>
        <Field label="Work-order reference (optional)" value={reference} onChange={setReference}/>
        <Field label="Supporting HTTPS source (optional)" value={sourceUrl} onChange={setSourceUrl}/>
      </div>
      <div className="mt-3"><Area label="What needs review" value={summary} onChange={setSummary}/></div>
      <div className="mt-3 grid gap-3 md:grid-cols-2"><Area label="Actual observed result (do not infer)" value={observed} onChange={setObserved}/><Area label="Expected result from the cited revision" value={expected} onChange={setExpected}/></div>
      {feedbackType==="contradicts_current"?<div className="mt-3"><Area label="Negating / conflicting evidence" value={negating} onChange={setNegating}/></div>:null}
      <Button className="mt-4" disabled={!target||submit.isPending||summary.trim().length<10||locator.trim().length<3} onClick={()=>submit.mutate()}><ClipboardList/>{submit.isPending?"Submitting…":"Submit for independent review"}</Button>
    </div>
    {queue.data?.manager&&queue.data.quality?<div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <h3 className="font-bold">Reviewed-case evidence quality</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Counts come only from explicit independent decisions in this track. Open cases are not treated as declined or accepted, and these measures are not technician scores, AI accuracy claims, or proof that a procedure is safe.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([
          ["Evaluation coverage",queue.data.quality.evaluationCoverage,"Evaluated cases out of all submitted cases"],
          ["Accepted for sourced revision",queue.data.quality.acceptedForRevision,"Accepted cases out of evaluated cases"],
          ["Published implementation",queue.data.quality.implementationCoverage,"Published improvements out of accepted cases"],
          ["Decision basis recorded",queue.data.quality.documentedDecisionBasis,"Evaluated cases with a written review basis"],
          ["Contradictions accepted",queue.data.quality.contradictionsAcceptedForRevision,"Contradiction cases accepted out of evaluated contradictions"],
        ] as Array<[string,CaseRate,string]>).map(([title,rate,detail])=><div key={title} className="rounded-lg border bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 text-lg font-bold">{rate.percent===null?"No reviewed denominator yet":`${rate.percent}% · ${rate.numerator} of ${rate.denominator}`}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
        <span className="rounded-full bg-white px-3 py-1">{queue.data.quality.openCases} open</span>
        <span className="rounded-full bg-white px-3 py-1">{queue.data.quality.declinedCases} declined</span>
        <span className="rounded-full bg-white px-3 py-1">{queue.data.quality.workLinkedCases} with work reference</span>
        <span className="rounded-full bg-white px-3 py-1">{queue.data.quality.sourceLinkedCases} with supporting source</span>
      </div>
      {queue.data.quality.groups.length?<details className="mt-3 rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-bold">Manufacturer/model case counts</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{queue.data.quality.groups.map(group=><div key={`${group.manufacturer}:${group.model}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-bold">{group.manufacturer} {group.model}</p><p className="mt-1 text-slate-600">{group.totalCases} submitted · {group.evaluatedCases} evaluated · {group.acceptedCases} accepted · {group.implementedCases} published · {group.openCases} open</p></div>)}</div></details>:null}
    </div>:null}
    <div className="mt-5 space-y-3">
      <h3 className="font-bold">{queue.data?.manager?"Procedure feedback queue":"My submitted feedback"}</h3>
      {queue.isLoading?<p className="text-sm text-slate-500">Loading feedback…</p>:queue.error?<p role="alert" className="text-sm text-red-700">{queue.error.message}</p>:queue.data?.feedback.length?queue.data.feedback.map(item=><article key={`${item.id}:${item.recordVersion}`} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{label(item.status)}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{label(item.feedbackType)}</span></div><p className="mt-2 font-bold">{item.manufacturer} {item.model} · r{item.revisionNumber}</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.summary}</p></div><span className="text-xs text-slate-500">{new Date(`${item.createdAt}Z`).toLocaleDateString()}</span></div>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="font-semibold text-slate-500">Citation</dt><dd>{item.sourceLocator}</dd></div>{item.workReference?<div><dt className="font-semibold text-slate-500">Work reference</dt><dd>{item.workReference}</dd></div>:null}{item.observedResult?<div><dt className="font-semibold text-slate-500">Observed</dt><dd>{item.observedResult}</dd></div>:null}{item.expectedResult?<div><dt className="font-semibold text-slate-500">Expected</dt><dd>{item.expectedResult}</dd></div>:null}{item.negatingEvidence?<div className="md:col-span-2"><dt className="font-semibold text-slate-500">Negating evidence</dt><dd>{item.negatingEvidence}</dd></div>:null}</dl>
        {item.decisionNote?<p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Review note:</strong> {item.decisionNote}</p>:null}
        {queue.data?.manager&&["submitted","in_review"].includes(item.status)?<div className="mt-4 border-t pt-4"><Textarea aria-label={`Decision note for ${item.id}`} placeholder="Source-review basis (required for a decision)" value={notes[item.id]||""} onChange={e=>setNotes({...notes,[item.id]:e.target.value})}/><div className="mt-3 flex flex-wrap gap-2">{item.status==="submitted"?<Button size="sm" variant="outline" disabled={decide.isPending} onClick={()=>decide.mutate({feedback:item,action:"start_review"})}><SearchCheck/>Start independent review</Button>:null}<Button size="sm" disabled={decide.isPending||(notes[item.id]||"").trim().length<10} onClick={()=>decide.mutate({feedback:item,action:"prepare_revision"})}><CheckCircle2/>Prepare sourced revision</Button><Button size="sm" variant="outline" disabled={decide.isPending||(notes[item.id]||"").trim().length<10} onClick={()=>decide.mutate({feedback:item,action:"decline"})}><XCircle/>Decline</Button></div></div>:null}
        {item.status==="ready_for_revision"?<p className="mt-3 text-sm font-semibold text-blue-800">Linked review input. The published procedure remains unchanged until a sourced, effective-dated revision is approved.</p>:item.status==="implemented"?<p className="mt-3 text-sm font-semibold text-emerald-700">Implemented in a later immutable procedure revision.</p>:null}
      </article>):<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No feedback is waiting in this track.</p>}
    </div>
  </section>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1 text-sm font-semibold">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1 text-sm font-semibold">
      {label}
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 font-semibold">
      <input
        className="size-5"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
