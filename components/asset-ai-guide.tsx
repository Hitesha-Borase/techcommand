"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {AcademyFieldMode} from "@/lib/academy";
import {
  procedureDocument,
  procedurePath,
  procedureMeasurementContradiction,
  type ProcedureSnapshot,
  type ProcedureAnswer,
  type ProcedureDocument,
} from "@/lib/asset-ai-procedure";
type Research = {
  id?: string;
  status: string;
  document?: ProcedureDocument;
  updatedAt?: string;
  error?: string;
};
type Attachment = {
  id: string;
  fileName: string;
  contentType: string;
  category: string;
};
type PhotoProposal = {visibleDetails:string[];suggestedCaption:string;uncertainties:string[];manualChecks:string[];reviewRequired:true};
export function AssetAiGuide({
  workOrderId,
  assetId,
  snapshot,
  answers,
  disabled,
  onChange,
  dme = false,
  fieldMode = null,
  recordVersion,
  photoCopilotEnabled = true,
}: {
  workOrderId: string;
  assetId: string;
  dme?: boolean;
  snapshot: ProcedureSnapshot | null;
  answers: ProcedureAnswer[];
  disabled: boolean;
  onChange: (snapshot: ProcedureSnapshot, answers: ProcedureAnswer[]) => void;
  fieldMode?:AcademyFieldMode|null;
  recordVersion: number;
  photoCopilotEnabled?: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [photoBusy,setPhotoBusy]=useState("");
  const [photoProposals,setPhotoProposals]=useState<Record<string,PhotoProposal>>({});
  const [photoErrors,setPhotoErrors]=useState<Record<string,string>>({});
  const research = useQuery({
    queryKey: ["asset-ai-research", workOrderId, assetId, dme],
    enabled: !snapshot && !disabled,
    retry: false,
    staleTime: 86400000,
    refetchOnWindowFocus: false,
    refetchInterval: (q) =>
      q.state.data?.status === "researching" ? 4000 : false,
    queryFn: async () =>
      portalJson<Research>(
        await portalFetch(
          dme ? "/api/ai/dme-procedure" : "/api/ai/asset-procedure",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              dme ? { workOrderId } : { workOrderId, assetId },
            ),
          },
        ),
        "Manufacturer research failed. Your notes remain available.",
      ),
  });
  const source = snapshot?.document || research.data?.document,
    normalized = source ? procedureDocument.safeParse(source) : null;
  const candidate = normalized?.success
    ? snapshot
      ? { ...snapshot, document: normalized.data }
      : ["candidate", "approved"].includes(research.data?.status || "") &&
          research.data?.id
        ? {
            id: research.data.id,
            document: normalized.data,
            retrievedAt: research.data.updatedAt || "",
            reviewedAt: null,
            reviewedBy: null,
          }
        : null
    : null;
  const cataloging = candidate?.id.startsWith("cataloging-v1:");
  const evidence = useQuery({
    queryKey: [
      "procedure-photo-evidence",
      dme ? "work_order_intake" : "work_order",
      workOrderId,
    ],
    enabled: !!candidate,
    retry: false,
    queryFn: async () =>
      portalJson<{ attachments: Attachment[] }>(
        await portalFetch(
          `/api/attachments?entityType=${dme ? "work_order_intake" : "work_order"}&entityId=${encodeURIComponent(workOrderId)}`,
        ),
        "Photo evidence could not be loaded.",
      ),
  });
  const steps = candidate ? procedurePath(candidate, answers) : [],
    active = Math.min(stepIndex, Math.max(0, steps.length - 1)),
    step = steps[active];
  async function describePhoto(stepId:string,attachmentId:string){
    if(!candidate)return;
    setPhotoBusy(attachmentId);setPhotoErrors(current=>({...current,[attachmentId]:""}));
    try{
      const result=await portalJson<{proposal:PhotoProposal;attachmentId:string;stepId:string;procedureId:string;recordVersion:number}>(await portalFetch("/api/ai/photo-evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({track:dme?"dme_mobility":"biomedical",workOrderId,assetId,stepId,attachmentId,procedureId:candidate.id,expectedRecordVersion:recordVersion})}),"Photo Copilot could not review this image. Enter the caption manually.");
      if(result.attachmentId!==attachmentId||result.stepId!==stepId||result.procedureId!==candidate.id||result.recordVersion!==recordVersion)throw new Error("The photo proposal no longer matches this saved step. Nothing was applied.");
      setPhotoProposals(current=>({...current,[attachmentId]:result.proposal}));
    }catch(error){setPhotoErrors(current=>({...current,[attachmentId]:error instanceof Error?error.message:"Photo Copilot could not review this image."}));}
    finally{setPhotoBusy(current=>current===attachmentId?"":current);}
  }
  return (
    <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <h4 className="font-bold">
        {cataloging ? "Catalog this equipment" : "AI manufacturer guide"}
      </h4>
      {candidate ? (
        <>
          {cataloging ? (
            <p className="font-semibold">{candidate.document.title}</p>
          ) : (
            <a
              className="font-semibold text-blue-800 underline"
              href={candidate.document.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {candidate.document.title}
            </a>
          )}
          <p className="text-sm">
            {candidate.document.applicability} · Revision:{" "}
            {candidate.document.revision || "Not identified"}
          </p>
          {candidate.document.support && (
            <div className="rounded border bg-white p-3 text-sm">
              <strong>
                {candidate.document.support.label ||
                  "Manufacturer technical support"}
              </strong>
              <a
                className="ml-3 font-bold text-blue-800 underline"
                href={`tel:${candidate.document.support.phone.replace(/[^+0-9]/g, "")}`}
              >
                {candidate.document.support.phone}
              </a>
              <a
                className="ml-3 text-blue-800 underline"
                href={candidate.document.support.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Contact source
              </a>
            </div>
          )}
          {candidate.document.limitations.map((item, i) => (
            <p key={i} className="text-sm text-amber-900">
              {item}
            </p>
          ))}
          {!cataloging && (
            <label className="flex min-h-11 items-start gap-2 text-sm font-semibold">
              <input
                className="mt-1 size-5"
                type="checkbox"
                disabled={disabled}
                checked={!!candidate.reviewedAt}
                onChange={(e) =>
                  onChange(
                    {
                      ...candidate,
                      reviewedAt: e.target.checked
                        ? new Date().toISOString()
                        : null,
                    },
                    answers,
                  )
                }
              />
              {cataloging
                ? "I am documenting this equipment's inventory, not certifying maintenance or operating safety."
                : "I reviewed the source and confirmed the procedure applies to this unit, configuration and work."}
            </label>
          )}
          <p className="text-sm">
            Source criteria are not test results. Record what actually happened.
            Save for later at any point.
          </p>
          {fieldMode&&<p className={`rounded-md border p-3 text-sm ${fieldMode==="trainee"?"border-amber-300 bg-amber-50 text-amber-950":"border-cyan-200 bg-cyan-50 text-cyan-950"}`}><strong>{fieldMode[0].toUpperCase()+fieldMode.slice(1)} field mode.</strong> {fieldMode==="trainee"?"Work one step at a time. A qualified assigned trainer must observe and sign the exact saved revision before final submission.":fieldMode==="experienced"?"Use the step index for faster navigation. Every applicable step, measurement and evidence requirement remains mandatory.":"Work one step at a time with the full reviewed instructions. Guided view does not grant or expand technical authority."}</p>}
          {fieldMode==="experienced"&&steps.length>1&&<div className="grid gap-2 sm:grid-cols-2" aria-label="Procedure step index">{steps.map((item,index)=>{const answer=answers.find(value=>value.stepId===item.id);return <Button key={item.id} type="button" variant={index===active?"default":"outline"} className="h-auto min-h-11 justify-start whitespace-normal text-left" onClick={()=>setStepIndex(index)}>{index+1}. {item.instruction} · {answer?.status?.replaceAll("_"," ")||"not started"}</Button>;})}</div>}
          {step
            ? (() => {
                const answer = answers.find((a) => a.stepId === step.id) || {
                  stepId: step.id,
                  status: "not_started" as const,
                  outcome: "not_evaluated" as const,
                  result: "",
                  photoAttachmentIds: [],
                  photoCaptions: {},
                  measurements: [],
                };
                const edit = (fields: Partial<ProcedureAnswer>) =>
                  onChange(candidate, [
                    ...answers.filter((a) => a.stepId !== step.id),
                    { ...answer, ...fields },
                  ]);
                const measurement = (id: string) =>
                  answer.measurements.find((item) => item.requirementId === id);
                const photos = (evidence.data?.attachments || []).filter(
                  (item) => item.contentType.startsWith("image/"),
                );
                const editMeasurement = (
                  id: string,
                  fields: Partial<ProcedureAnswer["measurements"][number]>,
                ) => {
                  const requirement = step.measurements.find(
                    (item) => item.id === id,
                  )!;
                  const current = measurement(id) || {
                    requirementId: id,
                    recordedValue: "",
                    unit: requirement.unit,
                    conditions: "",
                    assessment: "not_evaluated" as const,
                    notes: "",
                    instrument: null,
                    recordedAt: null,
                    recordedBy: null,
                  };
                  edit({
                    measurements: [
                      ...answer.measurements.filter(
                        (item) => item.requirementId !== id,
                      ),
                      { ...current, ...fields },
                    ],
                  });
                };
                return (
                  <article
                    key={step.id}
                    className="space-y-3 rounded border bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        Step {active + 1} of {steps.length}
                      </p>
                      <span className="text-xs font-semibold text-slate-500">
                        {answer.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="font-semibold">{step.instruction}</p>
                    {!cataloging && (
                      <a
                        className="text-sm text-blue-800 underline"
                        href={step.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {step.locator}
                      </a>
                    )}
                    {step.conditions && (
                      <p className="whitespace-pre-wrap text-sm">
                        Conditions / setup: {step.conditions}
                      </p>
                    )}
                    {step.expectedResult && (
                      <p className="whitespace-pre-wrap text-sm">
                        {cataloging
                          ? "Documentation goal"
                          : "Manufacturer criteria"}
                        : {step.expectedResult}
                      </p>
                    )}
                    {step.photoGuidance && (
                      <p className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm">
                        <strong>Photo guidance:</strong> {step.photoGuidance}
                      </p>
                    )}
                    <label className="block text-sm font-semibold">
                      Step status
                      <select
                        className="mt-1 min-h-11 w-full rounded border px-2"
                        disabled={
                          disabled || (!cataloging && !candidate.reviewedAt)
                        }
                        value={answer.status}
                        onChange={(e) =>
                          edit({
                            status: e.target.value as ProcedureAnswer["status"],
                          })
                        }
                      >
                        <option value="not_started">Not started</option>
                        <option value="done">
                          Performed — record actual result
                        </option>
                        <option value="not_applicable">
                          N/A — explain why
                        </option>
                        <option value="deferred">
                          Deferred — finish later
                        </option>
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      Actual result or reason
                      <Textarea
                        className="mt-1"
                        disabled={disabled}
                        value={answer.result}
                        onChange={(e) => edit({ result: e.target.value })}
                      />
                    </label>
                    {step.branches.length > 0 && (
                      <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3">
                        <label className="block text-sm font-semibold">
                          Actual outcome for reviewed branching
                          <select
                            className="mt-1 min-h-11 w-full rounded border bg-white px-2"
                            disabled={disabled}
                            value={answer.outcome}
                            onChange={(event) =>
                              edit({
                                outcome: event.target
                                  .value as ProcedureAnswer["outcome"],
                              })
                            }
                          >
                            <option value="not_evaluated">Choose after performing this step</option>
                            <option value="meets_reference">Meets cited criteria</option>
                            <option value="outside_reference">Outside cited criteria</option>
                            <option value="not_applicable">Not applicable</option>
                            <option value="deferred">Deferred</option>
                          </select>
                        </label>
                        {step.branches.find((item) => item.outcome === answer.outcome) && (
                          <p className="mt-2 text-sm">
                            <strong>Reviewed next action:</strong>{" "}
                            {step.branches.find((item) => item.outcome === answer.outcome)!.instruction}{" "}
                            <span className="text-slate-600">({step.branches.find((item) => item.outcome === answer.outcome)!.sourceLocator})</span>
                          </p>
                        )}
                      </div>
                    )}
                    {(step.photoGuidance || step.photoRequired) && (
                      <div className="rounded-md border p-3">
                        <p className="text-sm font-semibold">Photo evidence for this step{step.photoRequired ? " *" : ""}</p>
                        {evidence.isLoading ? <p className="mt-2 text-sm">Loading saved photos…</p> : photos.length ? (
                          <div className="mt-2 space-y-3">{photos.map((photo) => {
                            const selected=answer.photoAttachmentIds.includes(photo.id);
                            const proposal=photoProposals[photo.id],proposalError=photoErrors[photo.id];
                            return <div key={photo.id} className="rounded border p-2"><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" disabled={disabled} checked={selected} onChange={(event) => {
                              const nextIds=event.target.checked?[...new Set([...answer.photoAttachmentIds,photo.id])]:answer.photoAttachmentIds.filter((id) => id !== photo.id);
                              const nextCaptions={...answer.photoCaptions};
                              if(!event.target.checked)delete nextCaptions[photo.id];
                              edit({photoAttachmentIds:nextIds,photoCaptions:nextCaptions});
                            }}/><span className="min-w-0 flex-1 truncate">{photo.fileName} · {photo.category.replaceAll("_", " ")}</span><a className="text-blue-800 underline" href={`/api/attachments?attachmentId=${encodeURIComponent(photo.id)}`} target="_blank" rel="noreferrer">Open</a></label>{selected&&<><label className="mt-2 block text-xs font-semibold">What this photo shows for this asset *<Input className="mt-1" maxLength={240} disabled={disabled} value={answer.photoCaptions[photo.id]||""} onChange={(event)=>edit({photoCaptions:{...answer.photoCaptions,[photo.id]:event.target.value}})} placeholder="Describe the actual equipment evidence shown"/></label>{photoCopilotEnabled&&<><Button className="mt-2" type="button" size="sm" variant="outline" disabled={disabled||photoBusy===photo.id} onClick={()=>void describePhoto(step.id,photo.id)}>{photoBusy===photo.id?"Reviewing saved photo…":"Suggest factual caption"}</Button>{proposalError&&<p role="alert" className="mt-2 text-xs font-semibold text-amber-900">{proposalError}</p>}{proposal&&<div className="mt-2 rounded border border-violet-200 bg-violet-50 p-3 text-xs"><p className="font-semibold">Copilot draft — technician review required</p><p className="mt-1">{proposal.suggestedCaption}</p>{proposal.visibleDetails.length?<p className="mt-1 text-slate-600">Visible details: {proposal.visibleDetails.join("; ")}</p>:null}{proposal.uncertainties.length?<p className="mt-1 text-amber-900">Uncertain: {proposal.uncertainties.join("; ")}</p>:null}{proposal.manualChecks.length?<p className="mt-1 text-slate-600">Confirm manually: {proposal.manualChecks.join("; ")}</p>:null}<p className="mt-2 text-slate-600">This proposal is not a diagnosis, measurement, completed action, safety finding or pass/fail result. Confirm the image yourself, add any exact identifiers manually, then save.</p><Button className="mt-2" type="button" size="sm" disabled={disabled} onClick={()=>edit({photoCaptions:{...answer.photoCaptions,[photo.id]:proposal.suggestedCaption}})}>Use as editable caption draft</Button></div>}</>}</>}</div>})}</div>
                        ) : <p className="mt-2 text-sm text-amber-800">Upload the actual photo in this work order, then return here to attach it to this step.</p>}
                      </div>
                    )}
                    {answer.status !== "not_applicable" &&
                      step.measurements.map((requirement) => {
                        const evidence = measurement(requirement.id),
                          instrument = evidence?.instrument,
                          contradiction = procedureMeasurementContradiction(
                            requirement,
                            evidence,
                          );
                        return (
                          <div
                            key={requirement.id}
                            className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-3"
                          >
                            <div>
                              <p className="font-semibold">
                                {requirement.name}
                                {requirement.required ? " *" : ""}
                              </p>
                              <p className="text-sm">
                                Record in <strong>{requirement.unit}</strong>.
                                Reference: {requirement.expectedMin ?? ""}
                                {requirement.expectedMin !== null ||
                                requirement.expectedMax !== null
                                  ? " to "
                                  : ""}
                                {requirement.expectedMax ?? ""}{" "}
                                {requirement.unit}
                                {requirement.expectedText
                                  ? ` — ${requirement.expectedText}`
                                  : ""}
                              </p>
                              <p className="text-xs text-slate-600">
                                {requirement.sourceLocator}
                                {requirement.conditions
                                  ? ` · ${requirement.conditions}`
                                  : ""}
                              </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-sm font-semibold">
                                Actual reading
                                <Input
                                  className="mt-1"
                                  disabled={disabled}
                                  value={evidence?.recordedValue || ""}
                                  onChange={(e) =>
                                    editMeasurement(requirement.id, {
                                      recordedValue: e.target.value,
                                      unit: requirement.unit,
                                    })
                                  }
                                />
                              </label>
                              <label className="text-sm font-semibold">
                                Comparison with cited criteria
                                <select
                                  className="mt-1 min-h-10 w-full rounded border bg-white px-2"
                                  disabled={disabled}
                                  value={
                                    evidence?.assessment || "not_evaluated"
                                  }
                                  onChange={(e) =>
                                    editMeasurement(requirement.id, {
                                      assessment: e.target
                                        .value as ProcedureAnswer["measurements"][number]["assessment"],
                                    })
                                  }
                                >
                                  <option value="not_evaluated">
                                    Not evaluated yet
                                  </option>
                                  <option value="meets_reference">
                                    Meets cited criteria
                                  </option>
                                  <option value="outside_reference">
                                    Outside cited criteria
                                  </option>
                                  <option value="not_applicable">
                                    N/A — explain in notes
                                  </option>
                                </select>
                              </label>
                              <label className="text-sm font-semibold sm:col-span-2">
                                Actual test conditions
                                <Input
                                  className="mt-1"
                                  disabled={disabled}
                                  value={evidence?.conditions || ""}
                                  onChange={(e) =>
                                    editMeasurement(requirement.id, {
                                      conditions: e.target.value,
                                    })
                                  }
                                />
                              </label>
                            </div>
                            {contradiction && (
                              <p
                                role="alert"
                                className="rounded border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950"
                              >
                                {contradiction}
                              </p>
                            )}
                            {evidence?.recordedAt && (
                              <p className="text-xs text-slate-600">
                                Saved measurement evidence: {evidence.recordedAt}
                              </p>
                            )}
                            {requirement.instrumentRequired && (
                              <div className="space-y-3 rounded border bg-white p-3">
                                <p className="font-semibold">
                                  Test instrument · {requirement.instrumentType}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Mini
                                    label="Type"
                                    value={
                                      instrument?.type ||
                                      requirement.instrumentType
                                    }
                                    disabled={disabled}
                                    onChange={(value) =>
                                      editMeasurement(requirement.id, {
                                        instrument: {
                                          type: value,
                                          manufacturer:
                                            instrument?.manufacturer || "",
                                          model: instrument?.model || "",
                                          serialNumber:
                                            instrument?.serialNumber || "",
                                          calibrationStatus:
                                            instrument?.calibrationStatus ||
                                            "unknown",
                                          calibrationCheckedOn:
                                            instrument?.calibrationCheckedOn ||
                                            null,
                                          calibrationDueOn:
                                            instrument?.calibrationDueOn ||
                                            null,
                                          certificateReference:
                                            instrument?.certificateReference ||
                                            "",
                                        },
                                      })
                                    }
                                  />
                                  <Mini
                                    label="Serial / asset ID"
                                    value={instrument?.serialNumber || ""}
                                    disabled={disabled}
                                    onChange={(value) =>
                                      editMeasurement(requirement.id, {
                                        instrument: {
                                          type:
                                            instrument?.type ||
                                            requirement.instrumentType,
                                          manufacturer:
                                            instrument?.manufacturer || "",
                                          model: instrument?.model || "",
                                          serialNumber: value,
                                          calibrationStatus:
                                            instrument?.calibrationStatus ||
                                            "unknown",
                                          calibrationCheckedOn:
                                            instrument?.calibrationCheckedOn ||
                                            null,
                                          calibrationDueOn:
                                            instrument?.calibrationDueOn ||
                                            null,
                                          certificateReference:
                                            instrument?.certificateReference ||
                                            "",
                                        },
                                      })
                                    }
                                  />
                                  {requirement.calibrationRequired && (
                                    <>
                                      <label className="text-sm font-semibold">
                                        Calibration status
                                        <select
                                          className="mt-1 min-h-10 w-full rounded border bg-white px-2"
                                          disabled={disabled}
                                          value={
                                            instrument?.calibrationStatus ||
                                            "unknown"
                                          }
                                          onChange={(e) =>
                                            editMeasurement(requirement.id, {
                                              instrument: {
                                                type:
                                                  instrument?.type ||
                                                  requirement.instrumentType,
                                                manufacturer:
                                                  instrument?.manufacturer ||
                                                  "",
                                                model: instrument?.model || "",
                                                serialNumber:
                                                  instrument?.serialNumber ||
                                                  "",
                                                calibrationStatus: e.target
                                                  .value as NonNullable<
                                                  typeof instrument
                                                >["calibrationStatus"],
                                                calibrationCheckedOn:
                                                  instrument?.calibrationCheckedOn ||
                                                  null,
                                                calibrationDueOn:
                                                  instrument?.calibrationDueOn ||
                                                  null,
                                                certificateReference:
                                                  instrument?.certificateReference ||
                                                  "",
                                              },
                                            })
                                          }
                                        >
                                          <option value="unknown">
                                            Not checked
                                          </option>
                                          <option value="current">
                                            Current
                                          </option>
                                          <option value="expired">
                                            Expired
                                          </option>
                                          <option value="not_required">
                                            Not required
                                          </option>
                                        </select>
                                      </label>
                                      <Mini
                                        label="Checked on"
                                        type="date"
                                        value={
                                          instrument?.calibrationCheckedOn || ""
                                        }
                                        disabled={disabled}
                                        onChange={(value) =>
                                          editMeasurement(requirement.id, {
                                            instrument: {
                                              type:
                                                instrument?.type ||
                                                requirement.instrumentType,
                                              manufacturer:
                                                instrument?.manufacturer || "",
                                              model: instrument?.model || "",
                                              serialNumber:
                                                instrument?.serialNumber || "",
                                              calibrationStatus:
                                                instrument?.calibrationStatus ||
                                                "unknown",
                                              calibrationCheckedOn:
                                                value || null,
                                              calibrationDueOn:
                                                instrument?.calibrationDueOn ||
                                                null,
                                              certificateReference:
                                                instrument?.certificateReference ||
                                                "",
                                            },
                                          })
                                        }
                                      />
                                      <Mini
                                        label="Calibration due"
                                        type="date"
                                        value={
                                          instrument?.calibrationDueOn || ""
                                        }
                                        disabled={disabled}
                                        onChange={(value) =>
                                          editMeasurement(requirement.id, {
                                            instrument: {
                                              type:
                                                instrument?.type ||
                                                requirement.instrumentType,
                                              manufacturer:
                                                instrument?.manufacturer || "",
                                              model: instrument?.model || "",
                                              serialNumber:
                                                instrument?.serialNumber || "",
                                              calibrationStatus:
                                                instrument?.calibrationStatus ||
                                                "unknown",
                                              calibrationCheckedOn:
                                                instrument?.calibrationCheckedOn ||
                                                null,
                                              calibrationDueOn: value || null,
                                              certificateReference:
                                                instrument?.certificateReference ||
                                                "",
                                            },
                                          })
                                        }
                                      />
                                      <Mini
                                        label="Certificate reference"
                                        value={
                                          instrument?.certificateReference || ""
                                        }
                                        disabled={disabled}
                                        onChange={(value) =>
                                          editMeasurement(requirement.id, {
                                            instrument: {
                                              type:
                                                instrument?.type ||
                                                requirement.instrumentType,
                                              manufacturer:
                                                instrument?.manufacturer || "",
                                              model: instrument?.model || "",
                                              serialNumber:
                                                instrument?.serialNumber || "",
                                              calibrationStatus:
                                                instrument?.calibrationStatus ||
                                                "unknown",
                                              calibrationCheckedOn:
                                                instrument?.calibrationCheckedOn ||
                                                null,
                                              calibrationDueOn:
                                                instrument?.calibrationDueOn ||
                                                null,
                                              certificateReference: value,
                                            },
                                          })
                                        }
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    <div className="flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={active === 0}
                        onClick={() => setStepIndex(Math.max(0, active - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={active >= steps.length - 1}
                        onClick={() =>
                          setStepIndex(Math.min(steps.length - 1, active + 1))
                        }
                      >
                        Next step
                      </Button>
                    </div>
                  </article>
                );
              })()
            : null}
        </>
      ) : research.isFetching || research.data?.status === "researching" ? (
        <p role="status">
          Finding the exact-model manufacturer procedure… You can keep recording
          observations below.
        </p>
      ) : (
        <>
          <p className="text-sm text-amber-900">
            {research.error?.message ||
              research.data?.error ||
              research.data?.document?.limitations.join(" ") ||
              "No exact-model procedure is available yet. Save observations while the reference is resolved."}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || research.isFetching}
            onClick={() => void research.refetch()}
          >
            Check manufacturer reference again
          </Button>
        </>
      )}
    </section>
  );
}
function Mini({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <Input
        className="mt-1"
        type={type}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
