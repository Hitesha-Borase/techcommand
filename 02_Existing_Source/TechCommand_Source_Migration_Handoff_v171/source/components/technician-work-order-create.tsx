"use client";

import { WorkOrderAiIntake } from "@/components/work-order-ai-intake";
import { VoiceNote } from "@/components/voice-note";
import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type Facility = {
  accountId: string;
  accountName: string;
  locationId: string;
  locationName: string;
  address: string;
  assets: Array<{
    id: string;
    assetTag: string;
    equipment: string;
    serialNumber: string | null;
    status: string;
  }>;
};

async function api<T>(init?: RequestInit): Promise<T> {
  const response = await portalFetch("/api/technician-work-orders", {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "The work order could not be saved.");
  return data;
}

function newRequestId() {
  return crypto.randomUUID();
}

export function TechnicianWorkOrderCreate({
  onCreated,
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
  onCreated: (scheduledStart: string | null) => Promise<void> | void;
}) {
  const [sourceFiles,setSourceFiles]=useState<File[]>([]);
  const uploadedFiles=useRef(new WeakSet<File>());
  const savedResult=useRef<{workOrder:{id:string;externalId:string;scheduledStart:string|null;selectedAssetCount:number};alreadySaved:boolean}|null>(null);
  const [uploadRetry,setUploadRetry]=useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const [requestId, setRequestId] = useState(newRequestId);
  const [locationId, setLocationId] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [workNeeded, setWorkNeeded] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [serviceType, setServiceType] = useState<
    "biomed_service_call" | "biomed_pm_a" | "biomed_cataloging" | "biomed_repair"
  >("biomed_service_call");
  const facilities = useQuery({
    queryKey: ["technician-work-order-facilities"],
    queryFn: () => api<{ facilities: Facility[] }>(),
    enabled: open,
  });
  const selected = facilities.data?.facilities.find(
    (facility) => facility.locationId === locationId,
  );
  const create = useMutation({
    mutationFn: () => savedResult.current ? Promise.resolve(savedResult.current) :
      api<{
        workOrder: { id: string; externalId: string; scheduledStart: string | null; selectedAssetCount: number };
        alreadySaved: boolean;
      }>({
        method: "POST",
        body: JSON.stringify({
          requestId,
          locationId,
          assetIds,
          serviceType,
          workNeeded,
          scheduledStart: scheduledStart
            ? new Date(scheduledStart).toISOString()
            : null,
        }),
      }),
    onSuccess: async (result) => {
      savedResult.current=result;setUploadRetry(true);
      for(const file of sourceFiles){
        if(uploadedFiles.current.has(file))continue;
        const body=new FormData();body.set("entityType","work_order");body.set("entityId",result.workOrder.id);body.set("category","client_work_order");body.set("file",file);
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
        const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${result.workOrder.id}:${file.name}:${digest}`)));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const hex=Array.from(bytes.slice(0,16)).map(b=>b.toString(16).padStart(2,"0")).join("");body.set("attachmentId",`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`);
        const response=await portalFetch("/api/attachments",{method:"POST",body});const uploaded=await portalJson<{attachment?:{id:string}}>(response,"Work order saved. An original file has not finished uploading. Keep this page open and retry the upload.");if(!uploaded.attachment?.id)throw new Error("The original file upload was not confirmed. Keep this page open and retry.");uploadedFiles.current.add(file);
      }
      savedResult.current=null;setUploadRetry(false);setSourceFiles([]);
      await onCreated(result.workOrder.scheduledStart);
      setRequestId(newRequestId());
      setAssetIds([]);
      setWorkNeeded("");
      setScheduledStart("");
    },
  });

  if (!open)
    return (
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Plus /> New Biomedical/PM work order
      </Button>
    );

  return (
    <article className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <Wrench className="size-5 text-blue-700" /> New Biomedical/PM work order
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose the saved facility, add what is known, and save. The
            work is assigned only to you; billing remains separate.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={create.isPending}
        >
          Close
        </Button>
      </div>

      {facilities.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading saved facilities…</p>
      ) : facilities.isError ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <CircleAlert className="mr-2 inline size-4" />
          {facilities.error.message}
          <Button type="button" variant="outline" size="sm" className="ml-3" onClick={() => void facilities.refetch()}>
            Retry
          </Button>
        </div>
      ) : !facilities.data?.facilities.length ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No saved Biomedical/PM facilities are available yet. An administrator
          can add the prepared accounts from Biomedical/PM Accounts.
        </p>
      ) : (
        <fieldset disabled={create.isPending||uploadRetry} className="mt-4 grid gap-4">
          <WorkOrderAiIntake onFiles={setSourceFiles} onExtract={fields=>{setWorkNeeded(current=>current||[fields.summary,fields.customerComplaint,Array.isArray(fields.checklistItems)?fields.checklistItems.join("\n"):""].filter(value=>typeof value==="string"&&value).join("\n").slice(0,5000));}}/>
          <label className="text-sm font-semibold text-slate-700">
            Facility
            <select
              className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base"
              value={locationId}
              onChange={(event) => {
                create.reset();
                setLocationId(event.target.value);
                setAssetIds([]);
              }}
            >
              <option value="">Choose a facility</option>
              {facilities.data.facilities.map((facility) => (
                <option key={facility.locationId} value={facility.locationId}>
                  {facility.accountName} — {facility.locationName}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <p className="-mt-2 text-sm text-slate-500">{selected.address}</p>
          ) : null}
          {["biomed_pm_a", "biomed_cataloging"].includes(serviceType) ? (
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">
                Equipment in this visit (optional)
              </legend>
              <p className="mb-2 text-xs text-slate-500">
                Select only the equipment planned for this round. Every selection starts as Not started.
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {selected?.assets.map((asset) => (
                  <label key={asset.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      checked={assetIds.includes(asset.id)}
                      onChange={(event) => {
                        create.reset();
                        setAssetIds((current) =>
                          event.target.checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        );
                      }}
                    />
                    <span className="text-sm text-slate-700">
                      <strong>{asset.assetTag}</strong> — {asset.equipment}
                      {asset.serialNumber ? ` — S/N ${asset.serialNumber}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-blue-800">
                {assetIds.length} selected · none marked inspected
              </p>
            </fieldset>
          ) : (
            <label className="text-sm font-semibold text-slate-700">
              Equipment (optional)
              <select
                className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base disabled:bg-slate-100"
                value={assetIds[0] || ""}
                disabled={!selected}
                onChange={(event) => {
                  create.reset();
                  setAssetIds(event.target.value ? [event.target.value] : []);
                }}
              >
                <option value="">No equipment selected yet</option>
                {selected?.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.assetTag} — {asset.equipment}
                    {asset.serialNumber ? ` — S/N ${asset.serialNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm font-semibold text-slate-700">
            What needs attention? (optional)
            <Textarea
              className="mt-1.5 min-h-28 text-base"
              maxLength={5000}
              value={workNeeded}
              onChange={(event) => {
                create.reset();
                setWorkNeeded(event.target.value);
              }}
              placeholder="Type the request in your own words. You can add findings after you start the work order."
            />
          </label>
          <VoiceNote onText={text=>setWorkNeeded(current=>[current,text].filter(Boolean).join("\n").slice(0,5000))}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Work type
              <select
                className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base"
                value={serviceType}
                onChange={(event) => {
                  create.reset();
                  setServiceType(
                    event.target.value as
                      | "biomed_service_call"
                      | "biomed_pm_a" | "biomed_cataloging" | "biomed_repair",
                  );
                  if (!["biomed_pm_a", "biomed_cataloging"].includes(event.target.value))
                    setAssetIds((current) => current.slice(0, 1));
                }}
              >
                <option value="biomed_cataloging">Cataloging</option>
                <option value="biomed_service_call">Service call</option>
                <option value="biomed_repair">Corrective repair</option>
                <option value="biomed_pm_a">Annual PM visit</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Planned date and time (optional)
              <Input
                type="datetime-local"
                className="mt-1.5 min-h-11 text-base"
                value={scheduledStart}
                onChange={(event) => {
                  create.reset();
                  setScheduledStart(event.target.value);
                }}
              />
            </label>
          </div>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-fit"
            disabled={!locationId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Create my work order"}
          </Button>
        </fieldset>
      )}
      {uploadRetry&&!create.isPending&&<Button type="button" onClick={()=>create.mutate()}>Retry original-file upload</Button>}
      {create.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {create.error.message} Your entries are still here; correct the issue
          or retry.
        </p>
      ) : null}
      {create.isSuccess ? (
        <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">
          Saved as {create.data.workOrder.externalId}. It now appears in your
          assignments with {create.data.workOrder.selectedAssetCount} equipment
          {create.data.workOrder.selectedAssetCount === 1 ? " item" : " items"}; choose Start Work Order when ready.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">
        Saving does not create an invoice, payout, signature, finding, or PM
        result. Record the actual fieldwork in your notes; administrator review is optional.
      </p>
    </article>
  );
}
