"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Plus, Upload, Play, CheckCircle2, FileText, ChevronRight, Sparkles, AlertTriangle, Receipt } from "lucide-react";
import { checkModelMismatch } from "@/lib/model-mismatch";
import {procedureText} from "@/lib/asset-ai-procedure";
import {DmeGuidedChecks} from "@/components/dme-guided-checks";
import {DmeParts} from "@/components/dme-parts";
import {dmeFamilies} from "@/lib/academy-catalog";
import {dmeFieldProgress} from "@/lib/dme-guided-service";
const SpinlifeCloseout = lazy(() => import("@/components/spinlife-closeout").then(m => ({default:m.SpinlifeCloseout})));
const CompletionReviewCenter = lazy(() => import("@/components/completion-review-center").then(m => ({default:m.CompletionReviewCenter})));
import {spinlifeWritingFingerprint} from "@/lib/spinlife-writing";
const SpinlifeReportWriter = lazy(() => import("@/components/spinlife-report-writer").then(m => ({default:m.SpinlifeReportWriter})));
const AssetAiGuide = lazy(() => import("@/components/asset-ai-guide").then(m => ({default:m.AssetAiGuide})));
const JobCopilotGuide = lazy(() => import("@/components/job-copilot-guide").then(m => ({default:m.JobCopilotGuide})));
import { VoiceNote } from "@/components/voice-note";
import { Button } from "@/components/ui/button";
import { portalFetch, portalJson, PortalResponseError } from "@/lib/portal-fetch";
import { orderHref, orderTargetFromValue, type OrderTarget } from "@/lib/order-navigation";
import { spinlifeDataSchema, spinlifeVisitSchema, simpleChecks, spinlifeServiceLabels, type SpinLifeData, type SpinLifeJob, type SpinLifeVisit, type SpinLifeJobSummary } from "@/lib/spinlife-simple";
import { fieldDraftWriter } from "@/lib/field-draft-writer";
import { clearSpinLifeDraft, loadSpinLifeDraft, reconcileSpinLifeDraft, saveSpinLifeDraft } from "@/lib/spinlife-draft";

type Payload={jobs:SpinLifeJobSummary[];technicians:Array<{id:string;name:string;email:string}>;canAssign:boolean};
type Attachment={id:string;fileName:string;category:string;contentType:string};
const control="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900";
const money=(c:number|null)=>c===null?"Pay to be added":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
const jobStatus=(job:SpinLifeJobSummary)=>["spinlife_review","spinlife_completed"].includes(job.status)?"Field work complete":job.packetSourceVersion===job.version?"PDF ready":job.startedAt?"In progress":job.technicianId?"Assigned":"Draft";
const sourceFields:Array<[keyof SpinLifeData,string]>=[
  ["externalId","Work order number (include suffix)"],["customerName","Customer"],["customerPhone","Phone"],
  ["serviceAddress","Service address"],["equipmentType","Equipment"],["manufacturer","Manufacturer"],["model","Model"],
];
async function uploadIdentity(jobId:string,category:string,file:File) {
  const content=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${jobId}:${category}:${file.name}:${content}`)));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes.slice(0,16)).map(b=>b.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function api<T>(path:string,body?:unknown):Promise<T> {
  return portalJson<T>(await portalFetch(path,body===undefined?undefined:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),"The request could not be completed.");
}
function newJob():SpinLifeJob {return {id:crypto.randomUUID(),version:0,status:"spinlife_draft",data:spinlifeDataSchema.parse({}),visit:spinlifeVisitSchema.parse({}),technicianId:null,technicianName:null,technicianPayCents:null,scheduledStart:null,startedAt:null,documentedAt:null,lastMutationId:null,packetAttachmentId:null,packetSourceVersion:null};}

function Signature({onSave,disabled}:{onSave:(file:File)=>Promise<void>;disabled:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null),drawing=useRef(false);
  const [ink,setInk]=useState(false);
  function point(e:PointerEvent<HTMLCanvasElement>){const c=canvas.current!,r=c.getBoundingClientRect();return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height] as const;}
  function clear(){const c=canvas.current!;c.getContext("2d")!.clearRect(0,0,c.width,c.height);setInk(false);}
  async function save(){canvas.current!.toBlob(blob=>{if(blob) void onSave(new File([blob],"Customer-signature.png",{type:"image/png"}));},"image/png");}
  return <div className="space-y-2"><p className="text-sm">Customer may sign below. You can save the job without a signature.</p>
    <canvas ref={canvas} width={700} height={180} className="w-full touch-none rounded-lg border bg-white" aria-label="SpinLife customer signature pad"
      onPointerDown={e=>{if(disabled)return; e.currentTarget.setPointerCapture(e.pointerId);const c=canvas.current!.getContext("2d")!;c.beginPath();c.moveTo(...point(e));c.lineWidth=2.5;c.strokeStyle="#102c46";drawing.current=true;}}
      onPointerMove={e=>{if(!drawing.current)return;const c=canvas.current!.getContext("2d")!;c.lineTo(...point(e));c.stroke();setInk(true);}}
      onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}} />
    <div className="flex gap-2"><Button type="button" variant="outline" onClick={clear} disabled={disabled}>Clear</Button><Button type="button" onClick={save} disabled={!ink||disabled}>Save signature</Button></div>
  </div>;
}

export function SpinLifePortal({userId,technician=false,onOtherWork,onCareer,initialJobId}:{userId:string;technician?:boolean;onOtherWork?:()=>void;onCareer?:()=>void;initialJobId?:string}) {
  const [job,setJob]=useState<SpinLifeJob|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const [completedJob,setCompletedJob]=useState<SpinLifeJob|null>(null);
  const [generatingPacket,setGeneratingPacket]=useState(false);
  const [generatingInvoice,setGeneratingInvoice]=useState(false);
  const [invoiceAttachmentId,setInvoiceAttachmentId]=useState<string|null>(null);

  const liveServiceConflict = useMemo(() => {
    if (!job) return null;
    const issueChecks = Object.entries(job.visit.checks).filter(
      ([_, c]) => c.state === "not_done" || /broken|damaged|defect|failed|failure|issue|replace|service\s*needed/i.test(c.note)
    );
    if (issueChecks.length > 0) {
      const first = issueChecks[0][1];
      return first.note?.trim() || "Check finding recorded as issue / not passed; service or repair required.";
    }
    if (["parts_required", "needs_resolution", "out_of_service", "incomplete"].includes(job.visit.disposition)) {
      return `Outcome set to ${job.visit.disposition.replaceAll("_", " ")}; unit requires service or parts.`;
    }
    if (/broken|damage|failed|motor\s*failure|controller\s*failure|inoperable/i.test(job.visit.narrative || "") ||
        /broken|damage|failed|motor\s*failure|controller\s*failure|inoperable/i.test(job.visit.findings || "")) {
      return "Field observations record equipment defect or failure.";
    }
    return null;
  }, [job]);

  const outstandingExceptions = useMemo(() => {
    if (!completedJob) return [];
    const items: string[] = [];
    const progress = dmeFieldProgress(completedJob, false);
    const remaining = progress.checks.filter(c => !c.complete && !c.notApplicable);
    if (remaining.length > 0) {
      items.push(`${remaining.length} partner check(s) not completed (${remaining.map(r => r.label).slice(0, 3).join(", ")}${remaining.length > 3 ? "..." : ""})`);
    }
    const pendingParts = (completedJob.visit.parts || []).filter(p => p.state === "needed" || p.state === "ordered");
    if (pendingParts.length > 0) {
      items.push(`${pendingParts.length} part(s) flagged as needed/ordered: ${pendingParts.map(p => p.description || p.partNumber || "Part").join(", ")}`);
    }
    if (!completedJob.data.serialNumber || completedJob.data.serialNumber === "N/A") {
      items.push("Serial number was not recorded or marked N/A.");
    }
    if (!completedJob.visit.customerSignedAt && !completedJob.visit.signatureAttachmentId) {
      items.push("Customer signature was not collected on site.");
    }
    return items;
  }, [completedJob]);
  const [techStage,setTechStage]=useState<"essentials"|"steps"|"review">("essentials");
  const [visibleCount,setVisibleCount]=useState(30);
  const [savingNotes,setSavingNotes]=useState(false);
  const query=useQuery({queryKey:["spinlife-jobs",userId,"summary"],queryFn:()=>api<Payload>("/api/spinlife?view=summary"),enabled:Boolean(userId),refetchInterval:job?false:60000});
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[aiBusy,setAiBusy]=useState(false),[aiMessage,setAiMessage]=useState("");
  const [reviewOnly,setReviewOnly]=useState(false);
  const [guidanceOpen,setGuidanceOpen]=useState(false);
  const [photoCategory,setPhotoCategory]=useState("after");
  const [closeoutWorkOrderId,setCloseoutWorkOrderId]=useState("");
  const [files,setFiles]=useState<Attachment[]>([]),[pay,setPay]=useState(""),[showClosed,setShowClosed]=useState(false);
  const [draftRetry,setDraftRetry]=useState(0),[draftStored,setDraftStored]=useState(true),[recoveryMessage,setRecoveryMessage]=useState("");
  const [existingTarget,setExistingTarget]=useState<OrderTarget|null>(null),[saveWarning,setSaveWarning]=useState("");
  const draftRef=useRef(job),baseRef=useRef<SpinLifeJob|null>(null),mutation=useRef<string|null>(null),aiRequest=useRef(0),sourceInput=useRef<HTMLInputElement>(null);
  const aiController=useRef<AbortController|null>(null);
  useEffect(()=>()=>aiController.current?.abort(),[]);
  const payRef=useRef(pay);payRef.current=pay;
  const saveFlight=useRef<Promise<SpinLifeJob>|null>(null);
  const [draftPending,setDraftPending]=useState(false);
  const deviceWriter=useMemo(()=>fieldDraftWriter<{baseJob:SpinLifeJob;job:SpinLifeJob;pay:string}>(input=>{
    try{saveSpinLifeDraft(localStorage,userId,input);setDraftStored(true);}catch{setDraftStored(false);}
    setDraftPending(false);
  }),[userId]);
  useEffect(()=>{
    const flush=()=>deviceWriter.flush();
    const hidden=()=>{if(document.visibilityState!=="visible")flush();};
    window.addEventListener("pagehide",flush);document.addEventListener("visibilitychange",hidden);
    return()=>{window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",hidden);flush();};
  },[deviceWriter]);
  draftRef.current=job;
  const canAssign=!technician && Boolean(query.data?.canAssign);
  useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
  useEffect(()=>{
    if(!query.isSuccess)return;
    let cancelled=false;
    async function restore() {
      let result:ReturnType<typeof loadSpinLifeDraft>={status:"none"};
      try {result=loadSpinLifeDraft(localStorage,userId,Date.now(),initialJobId);setDraftStored(true);}catch{setDraftStored(false);}
      const id=initialJobId || (result.status==="restored"?result.draft.job.id:null);
      if(!id)return;
      setBusy(true);
      try {
        let server:SpinLifeJob|null=null;
        try {server=(await api<{job:SpinLifeJob}>(`/api/spinlife?id=${encodeURIComponent(id)}`)).job;}
        catch(e){if(!(e instanceof PortalResponseError && e.status===404 && !initialJobId && result.status==="restored" && result.draft.job.version===0))throw e;}
        if(cancelled)return;
        if(result.status!=="restored") {if(server)await open(server);return;}
        const recovered=reconcileSpinLifeDraft(result.draft,server);
        if(recovered.status!=="restored")throw new Error("This assignment is no longer available to this account. Its unsaved device draft has not been overwritten.");
        baseRef.current=structuredClone(server||result.draft.baseJob);draftRef.current=recovered.job;setJob(recovered.job);setPay(recovered.pay);setDirty(true);setFiles([]);
        setRecoveryMessage(recovered.conflicts.length
          ? `Unsaved work recovered. Review overlapping changes: ${recovered.conflicts.join(", ")}. Your recovered values remain shown; nothing has been resaved.`
          : "Unsaved work recovered from this device. Review it, then save when ready.");
        if(server)await loadFiles(id);
      }catch(e){if(!cancelled)setError((e as Error).message);}finally{if(!cancelled)setBusy(false);}
    }
    void restore();
    return()=>{cancelled=true;};
  },[draftRetry,query.isSuccess,userId,initialJobId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function loadFiles(id:string){const r=await api<{attachments:Attachment[]}>(`/api/attachments?entityType=work_order_intake&entityId=${encodeURIComponent(id)}`);if(draftRef.current?.id===id)setFiles(r.attachments);}
  async function open(selected:SpinLifeJob|SpinLifeJobSummary){
    deviceWriter.flush();
    setCompletedJob(null);
    if(!("visit" in selected)) {
      setBusy(true);
      try{const full=(await api<{job:SpinLifeJob}>(`/api/spinlife?id=${encodeURIComponent(selected.id)}`)).job;return await open(full);}
      catch(e){showError(e);return null;}finally{setBusy(false);}
    }
    setError("");setNotice("");setSaveWarning("");setExistingTarget(null);setRecoveryMessage("");setAiMessage("");setAiBusy(false);setGuidanceOpen(false);aiController.current?.abort();aiRequest.current++;
    let next=structuredClone(selected),nextPay=selected.technicianPayCents===null?"":String(selected.technicianPayCents/100),restored=false;
    baseRef.current=structuredClone(selected);
    try {
      const cached=loadSpinLifeDraft(localStorage,userId,Date.now(),selected.id);
      if(cached.status==="restored"){
        const recovered=reconcileSpinLifeDraft(cached.draft,selected);
        if(recovered.status==="restored") {next=recovered.job;nextPay=recovered.pay;restored=true;setRecoveryMessage(recovered.conflicts.length?`Unsaved work recovered. Review overlapping changes: ${recovered.conflicts.join(", ")}.`:"Unsaved work recovered from this device. Review it, then save when ready.");}
      }
    }catch{setDraftStored(false);}
    setJob(next);draftRef.current=next;setPay(nextPay);payRef.current=nextPay;setDirty(restored);mutation.current=null;setFiles([]);
    const progress=dmeFieldProgress(next,!canAssign);
    if(next.startedAt&&progress.remaining.length>0)setTechStage("steps");
    else if(next.startedAt&&progress.remaining.length===0)setTechStage("review");
    else setTechStage("essentials");
    if(selected.version||selected.intakeVersion)void loadFiles(selected.id).catch(e=>setError(String((e as Error).message)));
    return {job:next,restored};
  }
  function showError(e:unknown){setError((e as Error).message);setExistingTarget(e instanceof PortalResponseError?orderTargetFromValue((e.details as {target?:unknown})?.target):null);}
  function protect(next:SpinLifeJob,nextPay=payRef.current){setDraftPending(true);deviceWriter.schedule({baseJob:baseRef.current||next,job:next,pay:nextPay});}
  function edit(next:SpinLifeJob){draftRef.current=next;setJob(next);setDirty(true);setNotice("");mutation.current=null;protect(next);}
  function data(key:keyof SpinLifeData,value:string){if(!job)return;const changed=["manufacturer","model","serviceType"].includes(key)&&job.data[key]!==value&&job.visit.manufacturerGuide;edit({...job,data:{...job.data,[key]:value},visit:changed?{...job.visit,previousGuidance:[job.visit.previousGuidance,"Previous equipment guidance — retained history, not the current procedure:\n"+procedureText(job.visit.manufacturerGuide,job.visit.manufacturerAnswers)].filter(Boolean).join("\n\n"),manufacturerGuide:null,manufacturerAnswers:[]}:job.visit});}
  function visit(key:keyof SpinLifeVisit,value:unknown){if(job)edit({...job,visit:{...job.visit,[key]:value}});}
  function acceptSaved(sent:SpinLifeJob,saved:SpinLifeJob,sentPay:string) {
    const current=draftRef.current;
    const newer=!!current&&current.id===sent.id&&(current!==sent||payRef.current!==sentPay);
    const recovery=newer?reconcileSpinLifeDraft({format:1,ownerUserId:userId,savedAt:Date.now(),baseJob:sent,job:current!,pay:payRef.current},saved):null;
    const next=recovery?.status==="restored"?recovery.job:saved;
    const nextPay=recovery?.status==="restored"?recovery.pay:(saved.technicianPayCents===null?"":String(saved.technicianPayCents/100));
    deviceWriter.cancel();setDraftPending(false);
    setJob(next);draftRef.current=next;baseRef.current=structuredClone(saved);setPay(nextPay);payRef.current=nextPay;setDirty(newer);
    if(newer) {protect(next,nextPay);setRecoveryMessage("Saved the earlier entries. Your latest changes remain on this device; press Save again when ready.");}
    else {setRecoveryMessage("");try{clearSpinLifeDraft(localStorage,userId,saved.id);setDraftStored(true);}catch{setDraftStored(false);}}
    return next;
  }
  function save(action:"save"|"start"|"submit"="save",value=draftRef.current):Promise<SpinLifeJob> {
    if(saveFlight.current)return saveFlight.current;
    const operation=(async()=>{
      if(!value)throw new Error("Open a work order first.");
      deviceWriter.flush();
      const sentPay=payRef.current;
      let technicianPayCents:number|null=null;
      if(canAssign&&sentPay.trim()){const dollars=Number(sentPay);if(!Number.isFinite(dollars)||dollars<0)throw new Error("Enter a valid pay amount, or clear it and save for later.");technicianPayCents=Math.round(dollars*100);}
      const mutationId=mutation.current ||= crypto.randomUUID();
      let result:{job:SpinLifeJob;warning?:string;target?:OrderTarget};
      try{result=await api("/api/spinlife",{id:value.id,mutationId,expectedVersion:value.version,expectedIntakeVersion:value.intakeVersion,action,
        data:value.data,visit:value.visit,scheduledStart:value.scheduledStart,...(canAssign?{technicianId:value.technicianId,technicianPayCents}:{})});}
      catch(error){
        if(error instanceof PortalResponseError&&error.status<500)throw error;
        // A lost response can follow a committed write. Read before asking for a retry; never replay blindly.
        const confirmed=await api<{job:SpinLifeJob}>(`/api/spinlife?id=${encodeURIComponent(value.id)}`).catch(()=>null);
        if(confirmed?.job.lastMutationId!==mutationId)throw error;
        result=confirmed;
      }
      acceptSaved(value,result.job,sentPay);setSaveWarning(result.warning||"");setExistingTarget(result.target||null);mutation.current=null;
      void query.refetch();return result.job;
    })();
    saveFlight.current=operation;
    void operation.finally(()=>{saveFlight.current=null;}).catch(()=>undefined);
    return operation;
  }
  async function refreshSaved() {
    if(!job)return;setBusy(true);setError("");
    try {
      const server=(await api<{job:SpinLifeJob}>(`/api/spinlife?id=${encodeURIComponent(job.id)}`)).job;
      const draft={format:1 as const,ownerUserId:userId,savedAt:Date.now(),baseJob:baseRef.current||job,job,pay};
      const result=reconcileSpinLifeDraft(draft,server);
      if(result.status!=="restored")throw new Error("This record could not be reconciled. Your entries remain unchanged.");
      baseRef.current=structuredClone(server);setJob(result.job);draftRef.current=result.job;setPay(result.pay);setDirty(true);mutation.current=null;protect(result.job,result.pay);
      setRecoveryMessage(result.conflicts.length?`Saved copy refreshed. Review overlapping changes: ${result.conflicts.join(", ")}. Your edits are shown; nothing has been resaved.`:"Saved copy refreshed and your edits kept. Review, then Save for later.");
      await loadFiles(server.id);
    }catch(e){showError(e);}finally{setBusy(false);}
  }
  async function perform(action:"save"|"start"|"packet"|"back"|"review") {
    setBusy(true);setSavingNotes(action==="save");setError("");setNotice("");
    try {
      const saved=action==="review"?await save("submit"):action==="start"?await save("start"):dirty||!job?.version?await save():job!;
      if(action==="review") {
        setCompletedJob(saved);
        setJob(null);
        setFiles([]);
        setNotice("");
        try{clearSpinLifeDraft(localStorage,userId,saved.id);}catch{}
        if(typeof window!=="undefined"){window.scrollTo({top:0,behavior:"smooth"});}
        void query.refetch();
      }
      else if(action==="packet") {const result=await api<{attachmentId:string}>("/api/spinlife/packet",{id:saved.id,expectedVersion:saved.version});setJob(current=>{if(!current||current.id!==saved.id)return current;const next={...current,packetAttachmentId:result.attachmentId,packetSourceVersion:saved.version};draftRef.current=next;return next;});setNotice("PDF ready from your saved notes. Administrator review is optional.");await loadFiles(saved.id);void query.refetch();}
      else if(action==="back"){if(draftRef.current!==saved){setNotice("Earlier entries saved. Newer changes remain here; save again before leaving.");}else{setJob(null);setFiles([]);}} else {if(action==="start")setTechStage("steps");setNotice(action==="start"?"Work started. You can save any time.":draftRef.current!==saved?"Earlier entries saved. Your newer changes are protected on this device; save again when ready.":"Saved. You can add the rest later.");}
    }catch(e){showError(e);}finally{setBusy(false);setSavingNotes(false);}
  }
  async function startCard(selected:SpinLifeJobSummary) {
    setBusy(true);
    try {
      const opened=await open(selected);
      // Recovered work must be reviewed before Start can transmit it. Never
      // replace it with the older list copy or silently approve local changes.
      if(!opened)return;
      if(opened.restored)return;
      const targetJob = { ...opened.job };
      if (!targetJob.technicianId && query.data?.technicians?.length) {
        targetJob.technicianId = query.data.technicians[0].id;
        targetJob.technicianName = query.data.technicians[0].name;
      }
      await save("start",targetJob);setNotice("Work started. You can save any time.");setTechStage("steps");
    }catch(e){showError(e);}finally{setBusy(false);}
  }
  async function extract(incoming:File[],sourceText:string,targetId:string) {
    aiController.current?.abort();const controller=new AbortController();aiController.current=controller;
    const token=++aiRequest.current;setAiBusy(true);setAiMessage("Reading the work order… You can still enter details and save.");
    try {
      const form=new FormData();incoming.forEach(f=>form.append("files",f));form.set("sourceText",sourceText);
      const result=await portalJson<{fields:Record<string,unknown>}>(await portalFetch("/api/ai/work-order-extract",{method:"POST",body:form,signal:controller.signal}),"Automatic extraction is unavailable. You can enter details and save.");
      if(token!==aiRequest.current || draftRef.current?.id!==targetId)return;
      const current=draftRef.current;
      const updated={...current.data};
      for(const key of Object.keys(spinlifeDataSchema.shape) as Array<keyof SpinLifeData>){const value=result.fields[key];if(!updated[key] && typeof value==="string"){if(key==="serviceType" && !spinlifeDataSchema.shape.serviceType.safeParse(value).success)continue;Object.assign(updated,{[key]:value});}}
      if(!updated.extraChecks && Array.isArray(result.fields.checklistItems)){const checks=result.fields.checklistItems.filter((x):x is string=>typeof x==="string").join("\n");if(checks.length>5000)throw new Error("The original is saved, but its additional checks exceed this form’s capacity. Existing answers are preserved; review the original requirements before completion.");updated.extraChecks=checks;}
      edit({...current,data:updated});setAiMessage("Available details filled in. Please check them against the original before assigning. Technician pay is entered by the administrator.");if(technician)setTechStage("essentials");
    }catch(e){if(token===aiRequest.current)setAiMessage((e as Error).message);}finally{if(token===aiRequest.current)setAiBusy(false);}
  }
  async function upload(incoming:File[],category:string,caption?:string) {
    if(!incoming.length||!job||busy)return;setBusy(true);setError("");
    try {
      let saved=dirty||!job.version?await save():job;
      for(const file of incoming){
        if(file.size>20*1024*1024)throw new Error(`${file.name}: choose a file under 20 MB. The job is saved.`);
        const form=new FormData();form.set("file",file);form.set("entityType","work_order_intake");form.set("entityId",saved.id);form.set("category",category);form.set("attachmentId",await uploadIdentity(saved.id,category,file));
        const uploaded=await portalJson<{attachment?:{id:string};id?:string}>(await portalFetch("/api/attachments",{method:"POST",body:form}),"Upload failed. Your work order is saved; retry the file.");
        const beforeUpload=saved;const fresh=await api<{job:SpinLifeJob}>(`/api/spinlife?id=${encodeURIComponent(saved.id)}`);acceptSaved(beforeUpload,fresh.job,payRef.current);saved=fresh.job;
        if(category==="signature"||caption) {
          const id=uploaded.attachment?.id || uploaded.id;
          if(!id)throw new Error("Signature upload could not be confirmed. Try again.");
          saved={...(draftRef.current||saved),visit:{...(draftRef.current||saved).visit,...(category==="signature"?{signatureAttachmentId:id}:{photoCaptions:{...saved.visit.photoCaptions,[id]:caption!}})}};
          edit(saved);saved=await save("save",saved);
        }
      }
      await loadFiles(saved.id);setNotice("Upload saved.");
      if(category==="client_work_order")void extract(incoming,saved.data.rawText,saved.id);
      if(category==="serial" || (caption && /serial|label|rating\s*plate/i.test(caption))) {
        setNotice("Reading equipment label with AI OCR...");
        try {
          const ocrForm = new FormData();
          ocrForm.set("file", incoming[0]);
          const ocrRes = await portalFetch("/api/ai/label-extract", { method: "POST", body: ocrForm });
          if (ocrRes.ok) {
            const ocr = (await ocrRes.json()) as {
              serialNumber: string | null;
              model: string | null;
              manufacturer: string | null;
              isBlurryOrUnreadable: boolean;
              qualityFeedback: string;
            };
            if (ocr.isBlurryOrUnreadable) {
              setError(ocr.qualityFeedback || "Serial label photo is unclear or unreadable. Please upload a clearer photo of the unit serial number tag.");
            } else if (ocr.serialNumber) {
              const current = draftRef.current || saved;
              const nextData = { ...current.data, serialNumber: ocr.serialNumber };
              if (ocr.model && !nextData.model) nextData.model = ocr.model;
              if (ocr.manufacturer && !nextData.manufacturer) nextData.manufacturer = ocr.manufacturer;
              saved = { ...current, data: nextData };
              edit(saved);
              await save("save", saved);
              setNotice(`AI OCR verified label: Serial #${ocr.serialNumber}${ocr.model ? ` (${ocr.model})` : ""} auto-filled into work order.`);
            }
          }
        } catch (ocrErr) {
          console.warn("[Label OCR error]", ocrErr);
        }
      }
    }catch(e){showError(e);}finally{setBusy(false);}
  }
  const orders=query.data?.jobs || [];
  const shown=orders.filter(j=>(!reviewOnly||["spinlife_review","spinlife_completed"].includes(j.status))&&(showClosed || jobStatus(j)!=="PDF ready"));
  return <section className="mx-auto w-full min-w-0 max-w-5xl space-y-5 px-3 sm:px-6 py-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">TechCommand OS · TechFlex</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{technician?"My SpinLife work orders":"SpinLife work portal"}</h1></div>
      {!job&&!completedJob&&!closeoutWorkOrderId&&(canAssign||technician)?<Button disabled={busy} onClick={()=>{setCompletedJob(null);void open(newJob());}}><Plus/>{technician?"New work order":"Assign a work order"}</Button>:null}
      {!job&&!completedJob&&onOtherWork?<Button variant="outline" onClick={onOtherWork}>Other assignments, routes & profile</Button>:null}</header>
    {query.isError&&!job?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">{query.error.message}<Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>:null}
    {error?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"><p>{error}</p>{job?<Button variant="outline" disabled={busy} onClick={()=>void refreshSaved()}>Refresh saved copy and keep my edits</Button>:<Button variant="outline" disabled={busy} onClick={()=>setDraftRetry(n=>n+1)}>Retry opening saved order</Button>}</div>:null}
    {saveWarning?<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">{saveWarning}</p>:null}
    {existingTarget?<p className="rounded-lg border bg-white p-4 text-sm"><a className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={orderHref(existingTarget)} target="_blank" rel="noopener noreferrer">Open existing order in a new tab</a><br/>This tab keeps your entries. Nothing is copied or merged automatically.</p>:null}
    {notice?<p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p>:null}
    {recoveryMessage?<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">{recoveryMessage}</p>:null}
    {!draftStored?<p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">This browser could not protect unsaved changes. Keep this page open and use Save for later before leaving.</p>:null}
    {completedJob ? (
      <article className="space-y-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-10" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Work Order Completed!</h2>
          <p className="mt-1 max-w-lg text-slate-600">
            Field work for work order <span className="font-semibold text-slate-900">{completedJob.data.externalId || completedJob.id}</span> ({completedJob.data.customerName || "Customer"}) has been submitted successfully to the administrator inbox.
          </p>
        </div>

        <div className="mx-auto max-w-lg divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-sm">
          <div className="flex items-center justify-between p-3.5">
            <span className="text-slate-600">Field Work Status</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <span className="size-2 rounded-full bg-emerald-500"></span>
              Submitted for review
            </span>
          </div>
          <div className="flex items-center justify-between p-3.5">
            <span className="text-slate-600">Authorized Technician Pay</span>
            <span className="font-semibold text-slate-900">{money(completedJob.technicianPayCents)}</span>
          </div>
          <div className="flex items-center justify-between p-3.5">
            <span className="text-slate-600">Accounting / Invoicing</span>
            <span className="font-medium text-slate-700">Separate invoice drafted under account rules</span>
          </div>
          <div className="flex items-center justify-between p-3.5">
            <span className="text-slate-600">Service Report</span>
            <span className="font-medium text-slate-700">{completedJob.packetAttachmentId ? "Official PDF Ready" : "Draft report recorded"}</span>
          </div>
          <div className="p-3.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {outstandingExceptions.length > 0 ? `Outstanding Exceptions (${outstandingExceptions.length})` : "Checklist & Quality Status"}
            </p>
            {outstandingExceptions.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-xs text-amber-900">
                {outstandingExceptions.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                All standard service checks completed with no outstanding exceptions.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {completedJob.packetAttachmentId ? (
            <Button asChild>
              <a href={`/api/attachments?attachmentId=${encodeURIComponent(completedJob.packetAttachmentId)}`} target="_blank" rel="noreferrer">
                <Download className="mr-1.5 size-4" /> Download Service Report PDF
              </a>
            </Button>
          ) : (
            <Button
              disabled={generatingPacket}
              onClick={async () => {
                setGeneratingPacket(true);
                try {
                  const result = await api<{ attachmentId: string }>("/api/spinlife/packet", { id: completedJob.id, expectedVersion: completedJob.version });
                  setCompletedJob(prev => prev ? { ...prev, packetAttachmentId: result.attachmentId, packetSourceVersion: prev.version } : prev);
                  window.open(`/api/attachments?attachmentId=${encodeURIComponent(result.attachmentId)}`, "_blank");
                } catch (e) {
                  showError(e);
                } finally {
                  setGeneratingPacket(false);
                }
              }}
            >
              <FileText className="mr-1.5 size-4" /> {generatingPacket ? "Generating PDF..." : "Download Service Report PDF"}
            </Button>
          )}

          {invoiceAttachmentId ? (
            <Button variant="outline" asChild>
              <a href={`/api/attachments?attachmentId=${encodeURIComponent(invoiceAttachmentId)}`} target="_blank" rel="noreferrer">
                <Download className="mr-1.5 size-4" /> Download Accounting Invoice PDF
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={generatingInvoice}
              onClick={async () => {
                setGeneratingInvoice(true);
                try {
                  const res = await api<{ attachmentId: string; fileName: string; invoiceNumber: string }>("/api/spinlife/invoice", {
                    id: completedJob.id,
                    expectedVersion: completedJob.version,
                  });
                  setInvoiceAttachmentId(res.attachmentId);
                  window.open(`/api/attachments?attachmentId=${encodeURIComponent(res.attachmentId)}`, "_blank");
                } catch (e) {
                  showError(e);
                } finally {
                  setGeneratingInvoice(false);
                }
              }}
            >
              <Receipt className="mr-1.5 size-4 text-cyan-700" /> {generatingInvoice ? "Drafting Invoice..." : "Download Accounting Invoice PDF"}
            </Button>
          )}

          <Button variant="ghost" onClick={() => { setCompletedJob(null); void query.refetch(); }}>
            <ArrowLeft className="mr-1.5 size-4" /> Return to assignments
          </Button>
        </div>
      </article>
    ) : closeoutWorkOrderId ? <Suspense fallback={<p role="status">Opening closeout…</p>}><Button variant="outline" onClick={()=>setCloseoutWorkOrderId("")}>Back to SpinLife work orders</Button><CompletionReviewCenter key={closeoutWorkOrderId} initialWorkOrderId={closeoutWorkOrderId}/></Suspense>:!job?<>
      {technician&&onCareer?<Button variant="outline" onClick={onCareer}>My DME Career</Button>:null}
      <p className="text-slate-600">{technician?"Create your own work order or open an assignment. You can change your planned date and save unfinished work.":"Choose the technician, add their pay, and drop or paste the SpinLife order. Details can be added later."}</p>
      {query.isPending?<p role="status">Loading work orders…</p>:null}
      {canAssign?<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewOnly} onChange={e=>setReviewOnly(e.target.checked)}/>Submissions for optional review ({orders.filter(j=>["spinlife_review","spinlife_completed"].includes(j.status)).length})</label>:null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)}/>Show orders with generated reports</label>
      {!query.isPending&&!query.isError&&!shown.length?<div className="rounded-xl border bg-white p-8 text-slate-600">{technician?"No open orders in the new SpinLife portal yet. Assignments made through the earlier screens are available under Other assignments, routes & profile.":"No open SpinLife orders. Choose Assign a work order to get started."}</div>:null}
      {shown.slice(0,visibleCount).map(j=><article key={j.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5 shadow-sm"><div><h2 className="text-lg font-bold">{j.data.externalId || "Work order number to add"} · {j.data.customerName || "Customer to add"}</h2><p>{spinlifeServiceLabels[j.data.serviceType]} · {jobStatus(j)}</p><p className="mt-1 text-sm text-slate-600">{j.technicianName || "Technician to choose"} · {money(j.technicianPayCents)}</p>{j.data.serviceAddress?<p className="text-sm text-slate-600">{j.data.serviceAddress}</p>:null}</div>
        <Button disabled={busy} onClick={()=>void (technician&&!j.startedAt?startCard(j):open(j))}>{technician&&!j.startedAt?<><Play/>Start Work Order</>:technician?"Open Work Order":"Open / assign"}</Button></article>)}
      {shown.length>visibleCount?<Button variant="outline" onClick={()=>setVisibleCount(n=>n+30)}>Show more work orders</Button>:null}
    </>:<>
      <Button variant="ghost" onClick={()=>void perform("back")} disabled={busy}><ArrowLeft/>Save & back to work orders</Button>
      {technician ? (
        <div className="space-y-5">
          {(() => {
            const mismatch = checkModelMismatch(
              job.data.manufacturer,
              job.data.model,
              `${job.visit.narrative} ${Object.values(job.visit.checks).map(c => c.note).join(" ")} ${job.data.rawText}`
            );
            return mismatch ? (
              <div role="alert" className="flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-xs">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Equipment Model Mismatch Detected</p>
                  <p className="text-xs mt-1 leading-relaxed text-amber-800">{mismatch.message}</p>
                </div>
              </div>
            ) : null;
          })()}
          {/* Top Stage Stepper */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setTechStage("essentials")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm transition ${
                  techStage === "essentials" ? "bg-cyan-700 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-xs">1</span>
                Essentials
              </button>
              <ChevronRight className="size-4 text-slate-300" />
              <button
                type="button"
                onClick={() => setTechStage("steps")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm transition ${
                  techStage === "steps" ? "bg-cyan-700 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-xs">2</span>
                Follow Next Step
              </button>
              <ChevronRight className="size-4 text-slate-300" />
              <button
                type="button"
                onClick={() => setTechStage("review")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm transition ${
                  techStage === "review" ? "bg-cyan-700 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-xs">3</span>
                Review & Finish
              </button>
            </div>
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">
              {spinlifeServiceLabels[job.data.serviceType] || "General DME"} · {money(job.technicianPayCents)}
            </span>
          </div>

          {/* STAGE 1 & 2: CONFIRM ESSENTIALS */}
          {techStage === "essentials" && (
            <fieldset disabled={busy && !savingNotes} aria-busy={busy} className="space-y-5 disabled:opacity-70">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="inline-block rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">
                      {spinlifeServiceLabels[job.data.serviceType] || "General DME Service"}
                    </span>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">
                      Order #{job.data.externalId || "Pending ID"}
                    </h2>
                    <p className="font-semibold text-slate-700">{job.data.customerName || "Customer Name"}</p>
                    {job.data.customerPhone ? <p className="text-sm text-slate-500">{job.data.customerPhone}</p> : null}
                    {job.data.serviceAddress ? <p className="text-sm text-slate-600">{job.data.serviceAddress}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider text-slate-400">Authorized Pay</p>
                    <p className="text-lg font-bold text-slate-900">{money(job.technicianPayCents)}</p>
                    {job.startedAt ? (
                      <p className="mt-1 text-xs text-emerald-600 font-medium">Started {new Date(job.startedAt).toLocaleTimeString()}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <span className="text-xs font-semibold text-slate-500">EQUIPMENT</span>
                    <p className="font-bold text-slate-800">
                      {job.data.manufacturer || "Manufacturer"} {job.data.model || "Model"}
                    </p>
                    <p className="text-slate-600">{job.data.equipmentType || "DME Unit"}</p>
                  </div>
                  {liveServiceConflict ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-900">
                        <AlertTriangle className="size-3.5 text-amber-600" /> Live Condition: Unit Requires Service / Parts
                      </span>
                      <p className="mt-1 text-sm font-semibold text-amber-950">{liveServiceConflict}</p>
                      <p className="mt-1 text-xs text-amber-800">
                        Supersedes initial intake note: {job.data.customerComplaint || job.data.summary || "None"}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <span className="text-xs font-semibold text-slate-500">REPORTED PROBLEM / COMPLAINT</span>
                      <p className="text-slate-700">{job.data.customerComplaint || job.data.summary || "No specific customer complaint recorded."}</p>
                    </div>
                  )}
                </div>

                {/* Missing essentials: Serial Number check */}
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-semibold text-slate-800">
                    Unit Serial Number {!job.data.serialNumber && <span className="text-red-500 font-normal">* (Confirm from unit label)</span>}
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className={control}
                        value={job.data.serialNumber}
                        onChange={e => data("serialNumber", e.target.value)}
                        placeholder="Enter serial number or mark N/A"
                      />
                      <Button type="button" variant="outline" onClick={() => data("serialNumber", "N/A")}>
                        N/A
                      </Button>
                    </div>
                  </label>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cyan-50 p-2.5 text-xs text-cyan-900 border border-cyan-100">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Sparkles className="size-4 text-cyan-700 shrink-0" />
                      Auto-extract serial from unit label photo:
                    </span>
                    <label className="cursor-pointer font-bold text-cyan-800 underline hover:text-cyan-950">
                      Upload Label Photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = "";
                          await upload([file], "serial", "Equipment identity label");
                        }}
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-sm font-semibold text-slate-800">
                    My Planned Date (Optional)
                    <input
                      type="date"
                      className={control}
                      value={job.scheduledStart || ""}
                      onChange={e => edit({ ...job, scheduledStart: e.target.value || null })}
                    />
                  </label>
                </div>
              </div>

              {/* Collapsible Drop or Paste Order */}
              <details className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-700">Drop or Paste Work Order (AI Extraction)</summary>
                <div className="mt-3 space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer rounded-xl border-2 border-dashed border-cyan-500 bg-cyan-50 p-5 text-center"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); if (!busy) void upload(Array.from(e.dataTransfer.files), "client_work_order"); }}
                    onClick={() => sourceInput.current?.click()}
                  >
                    <Upload className="mx-auto mb-2 size-5 text-cyan-700" />
                    Drop new work order PDF or image here
                  </div>
                  <input ref={sourceInput} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void upload(files, "client_work_order"); }} />
                  <textarea className={control} rows={3} value={job.data.rawText} onChange={e => data("rawText", e.target.value)} placeholder="Or paste raw work order text here..." />
                  <Button variant="outline" size="sm" disabled={aiBusy || !job.data.rawText.trim()} onClick={() => void extract([], job.data.rawText, job.id)}>
                    {aiBusy ? "Reading..." : "Read pasted order with AI"}
                  </Button>
                  {aiMessage ? <p className="text-xs text-slate-600">{aiMessage}</p> : null}
                </div>
              </details>

              {/* Primary Launch Action */}
              <div className="pt-2">
                {!job.startedAt ? (
                  <Button
                    size="lg"
                    className="w-full bg-cyan-700 hover:bg-cyan-800 text-white py-6 text-base font-bold shadow-md"
                    onClick={async () => {
                      await perform("start");
                      setTechStage("steps");
                    }}
                  >
                    <Play className="mr-2 size-5" /> Start Work Order & Proceed to Steps
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="w-full bg-cyan-700 hover:bg-cyan-800 text-white py-6 text-base font-bold shadow-md"
                    onClick={() => setTechStage("steps")}
                  >
                    Continue Work Order Steps <ChevronRight className="ml-1 size-5" />
                  </Button>
                )}
              </div>
            </fieldset>
          )}

          {/* STAGE 3: FOLLOW THE NEXT STEP */}
          {techStage === "steps" && (
            <fieldset disabled={busy && !savingNotes} aria-busy={busy} className="space-y-4 disabled:opacity-70">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                <span>{job.data.externalId || "Work Order"} · {job.data.manufacturer} {job.data.model}</span>
                <span className="text-cyan-800">{spinlifeServiceLabels[job.data.serviceType]}</span>
              </div>
              {liveServiceConflict ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  <span>Live Condition: Unit Requires Service / Parts ({liveServiceConflict})</span>
                </div>
              ) : null}

              {/* Single Step Card */}
              <DmeGuidedChecks
                key={job.id}
                job={job}
                disabled={busy}
                allowAttestation={true}
                onChange={checks => visit("checks", checks)}
                onSave={async () => { setBusy(true); try { return await save(); } finally { setBusy(false); } }}
                onPhoto={(incoming, caption) => upload(incoming, "diagnosis", caption)}
                onComplete={() => setTechStage("review")}
              />

              {/* Guidance reference accordion */}
              <details className="rounded-xl border bg-blue-50/40 p-3 text-sm" onToggle={e => setGuidanceOpen(e.currentTarget.open)}>
                <summary className="cursor-pointer font-semibold text-blue-900">Manufacturer guidance & Copilot (optional)</summary>
                <Suspense fallback={<p role="status">Opening guidance...</p>}>
                  {guidanceOpen && job.version > 0 && job.data.serviceType ? (
                    <AssetAiGuide key={`${job.id}:${job.data.serviceType}:${job.data.manufacturer}:${job.data.model}`} dme workOrderId={job.id} assetId="" recordVersion={job.version} photoCopilotEnabled={true} snapshot={job.visit.manufacturerGuide} answers={job.visit.manufacturerAnswers} disabled={busy || dirty && !job.visit.manufacturerGuide} onChange={(snapshot, answers) => { const current = draftRef.current; if (current) edit({ ...current, visit: { ...current.visit, manufacturerGuide: snapshot, manufacturerAnswers: answers } }); }} />
                  ) : null}
                </Suspense>
              </details>

              <div className="pt-2">
                <Button variant="outline" className="w-full text-slate-700" onClick={() => setTechStage("review")}>
                  Proceed to Review & Finish ➜
                </Button>
              </div>
            </fieldset>
          )}

          {/* STAGE 4: REVIEW & FINISH */}
          {techStage === "review" && (
            <fieldset disabled={busy && !savingNotes} aria-busy={busy} className="space-y-5 disabled:opacity-70">
              {liveServiceConflict ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs font-semibold text-amber-950">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  <span>Observed Condition Note: {liveServiceConflict} (Ensure outcome aligns with physical unit status)</span>
                </div>
              ) : null}
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">1. Final Service Outcome</h2>
                <p className="text-sm text-slate-600">Select the confirmed outcome to complete this work order.</p>
                <select className={control} value={job.visit.disposition} onChange={e => visit("disposition", e.target.value)}>
                  <option value="needs_review">To be confirmed</option>
                  <option value="delivery_completed">Delivery completed</option>
                  <option value="returned_to_service">Repair completed / returned to service</option>
                  <option value="parts_required">Needs parts</option>
                  <option value="needs_resolution">Needs resolution / follow-up</option>
                  <option value="out_of_service">Out of service</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>

              <div className="rounded-xl border bg-white p-5 space-y-3">
                <h2 className="text-lg font-bold text-slate-900">2. Additional Field Notes (Optional)</h2>
                <textarea className={control} rows={3} value={job.visit.narrative} onChange={e => visit("narrative", e.target.value)} placeholder="Summary notes or dictation..." />
                <VoiceNote disabled={busy} onText={text => { const current = draftRef.current; if (current) edit({ ...current, visit: { ...current.visit, narrative: [current.visit.narrative, text].filter(Boolean).join("\n") } }); }} />
              </div>

              <DmeParts parts={job.visit.parts || []} disabled={busy} onChange={parts => visit("parts", parts)} />

              <Suspense fallback={<p role="status">Opening report draft...</p>}>
                <SpinlifeReportWriter key={job.id} job={job} disabled={busy} onSave={async () => { setBusy(true); try { return await save(); } finally { setBusy(false); } }} onApply={fields => { const current = draftRef.current; if (!current) return; edit({ ...current, visit: { ...current.visit, reportWording: { sourceFingerprint: spinlifeWritingFingerprint(current), reviewedAt: new Date().toISOString(), fields: { ...current.visit.reportWording?.sourceFingerprint === spinlifeWritingFingerprint(current) ? current.visit.reportWording.fields : {}, ...fields } } } }); }} />
              </Suspense>

              <div className="rounded-xl border bg-white p-5 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Photos & Customer Signature</h2>
                <label className="mt-3 block text-sm font-semibold">Photo purpose<select className={control} value={photoCategory} onChange={e=>setPhotoCategory(e.target.value)}>{[["after","Final condition"],["before","Before service"],["serial","Equipment identity label"],["diagnosis","Diagnostic finding"],["repair","Repair / installed part"],["packaging","Shipping / packaging condition"],["test","Recorded test result"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
                <label className="mt-3 block text-sm font-semibold">
                  Add job photos (JPG or PNG)
                  <input type="file" accept="image/jpeg,image/png" multiple className={control} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void upload(files, photoCategory); }} />
                </label>
                {files.filter(f => ["before", "after", "serial", "diagnosis", "repair", "packaging", "test"].includes(f.category)).map(f => (
                  <label key={f.id} className="mt-3 block"><a className="text-blue-700 underline" target="_blank" rel="noreferrer" href={`/api/attachments?attachmentId=${encodeURIComponent(f.id)}`}>{f.fileName}</a><input className={control} value={job.visit.photoCaptions[f.id] || ""} placeholder="Photo caption (optional)" onChange={e=>visit("photoCaptions",{...job.visit.photoCaptions,[f.id]:e.target.value})}/></label>
                ))}
                <label className="mt-5 block text-sm font-semibold">
                  Customer Signer's Name
                  <input className={control} value={job.visit.customerSignatureName} onChange={e => visit("customerSignatureName", e.target.value)} placeholder="Name or N/A" />
                </label>
                {job.visit.signatureAttachmentId ? (
                  <div className="mt-3 flex items-center gap-3">
                    <p className="text-sm font-medium text-emerald-700">Customer signature recorded.</p>
                    <Button variant="outline" size="sm" onClick={() => visit("signatureAttachmentId", "")}>Remove</Button>
                  </div>
                ) : (
                  <div className="mt-3"><Signature disabled={busy} onSave={f => upload([f], "signature")} /></div>
                )}
              </div>

              <div className="pt-2">
                <Button size="lg" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-6 text-base font-bold shadow-md" disabled={busy} onClick={() => void perform("review")}>
                  <CheckCircle2 className="mr-2 size-5" /> Submit & Finish Work Order
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      ) : (
      <fieldset disabled={busy&&!savingNotes} aria-busy={busy} className="space-y-5 disabled:opacity-70">
        {canAssign?<div className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-bold">1. Assign the work order</h2><div className="grid gap-4 sm:grid-cols-2">
          <label>Technician<select className={control} value={job.technicianId || ""} onChange={e=>edit({...job,technicianId:e.target.value || null})}><option value="">Choose now or later</option>{query.data?.technicians.map(t=><option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select></label>
          <label>Technician payment ($)<input inputMode="decimal" className={control} value={pay} placeholder="Add now or later" onChange={e=>{payRef.current=e.target.value;setPay(e.target.value);setDirty(true);setNotice("");mutation.current=null;if(job)protect(job,e.target.value);}}/><span className="text-xs text-slate-500">Agreed pay for this technician. Separate from the customer invoice.</span></label>
        </div>{!query.isPending&&!query.data?.technicians.length?<p className="mt-3 text-sm text-amber-800">No active technician profiles were found. You can save this draft and add the technician in Technicians.</p>:null}</div>:<div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">{job.data.externalId || "Work order number to add"}</h2><p>{job.data.customerName} · {money(job.technicianPayCents)}</p><p>{job.data.serviceAddress}</p>{job.startedAt?<p className="mt-2 text-sm text-slate-600">Started {new Date(job.startedAt).toLocaleString()}</p>:<Button onClick={()=>void perform("start")} className="mt-3"><Play/>Start Work Order</Button>}</div>}
        {<div className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-bold">Drop or paste the work order</h2>
          <div role="button" tabIndex={0} className="cursor-pointer rounded-xl border-2 border-dashed border-cyan-500 bg-cyan-50 p-7 text-center" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void upload(Array.from(e.dataTransfer.files),"client_work_order");}} onClick={()=>sourceInput.current?.click()} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();sourceInput.current?.click();}}}><Upload className="mx-auto mb-2"/>Drop the work order here, or choose files<p className="text-xs text-slate-600">PDF, JPG or PNG · up to 20 MB per file</p></div>
          <input ref={sourceInput} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void upload(files,"client_work_order");}}/>
          <label className="mt-4 block">Or paste the work order<textarea className={control} rows={4} value={job.data.rawText} onChange={e=>data("rawText",e.target.value)} onPaste={e=>{const pasted=e.clipboardData.getData("text");if(pasted.trim())void extract([],pasted,job.id);}}/></label>
          <Button variant="outline" className="mt-2" disabled={aiBusy||!job.data.rawText.trim()} onClick={()=>void extract([],job.data.rawText,job.id)}>Read pasted work order</Button>
          {aiMessage?<p role="status" className="mt-3 text-sm text-slate-700">{aiMessage}</p>:null}
        </div>}
        {files.some(f=>f.category==="client_work_order")?<div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Original work order</h2>{files.filter(f=>f.category==="client_work_order").map(f=><a key={f.id} className="mt-2 block text-blue-700 underline" href={`/api/attachments?attachmentId=${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer">{f.fileName}</a>)}</div>:null}
        {!canAssign&&job.data.rawText?<details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Read pasted work order</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{job.data.rawText}</pre></details>:null}
        <div className="rounded-xl border bg-white p-5"><label className="font-semibold">{technician?"My planned date (optional)":"Planned date (optional)"}<input type="date" className={control} value={job.scheduledStart || ""} onChange={e=>edit({...job,scheduledStart:e.target.value || null})}/></label><p className="mt-2 text-sm text-slate-600">Choose or change the day you plan to work. Save for later keeps this date with your order; it does not send a customer appointment notice.</p></div>
        <details open={canAssign||job.version===0} className="rounded-xl border bg-white p-5"><summary className="cursor-pointer text-lg font-bold">Work order details — all editable</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>Job type<select className={control} value={job.data.serviceType} onChange={e=>data("serviceType",e.target.value)}>{Object.entries(spinlifeServiceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          {sourceFields.map(([key,label])=><label key={key}>{label}<input className={control} value={job.data[key]} onChange={e=>data(key,e.target.value)} placeholder="Add now or later"/></label>)}
          <label>Equipment family for career experience (optional)<select className={control} value={job.data.dmeFamilyId} onChange={e=>data("dmeFamilyId",e.target.value)}><option value="">Unclassified — choose later</option>{dmeFamilies.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="sm:col-span-2">Requested work / problem<textarea className={control} rows={3} value={job.data.customerComplaint || job.data.summary} onChange={e=>data("customerComplaint",e.target.value)}/></label>

          {canAssign?<label className="sm:col-span-2">Additional work-order checks (one per line)<textarea className={control} rows={3} value={job.data.extraChecks} onChange={e=>data("extraChecks",e.target.value)}/></label>:null}
        </div></details>
        <details className="rounded-xl border bg-blue-50/40 p-4" onToggle={e=>setGuidanceOpen(e.currentTarget.open)}><summary className="cursor-pointer font-semibold">Manufacturer guidance & Copilot (optional)</summary>
          <Suspense fallback={<p role="status">Opening guidance… Your notes remain available.</p>}>
        {guidanceOpen&&job.version>0&&job.data.serviceType?<AssetAiGuide key={`${job.id}:${job.data.serviceType}:${job.data.manufacturer}:${job.data.model}`} dme workOrderId={job.id} assetId="" recordVersion={job.version} photoCopilotEnabled={!canAssign} snapshot={job.visit.manufacturerGuide} answers={job.visit.manufacturerAnswers} disabled={busy||dirty&&!job.visit.manufacturerGuide} onChange={(snapshot,answers)=>{const current=draftRef.current;if(current)edit({...current,visit:{...current.visit,manufacturerGuide:snapshot,manufacturerAnswers:answers}});}}/>:null}
        {guidanceOpen&&job.version>0&&job.data.serviceType?<JobCopilotGuide key={job.id} phase="spinlife" workOrderId={job.id} autoKey={`${job.id}:${job.data.serviceType}:${job.data.manufacturer}:${job.data.model}`} disabled={busy||dirty}
          context={{...job.data,complaint:job.data.customerComplaint,observations:simpleChecks(job.data,job.visit).map(check=>({label:check.label,complete:check.complete,result:check.result||""}))}}
          onAddQuestions={steps=>{const current=draftRef.current;if(!current)return;const labels=[...new Set([...current.data.extraChecks.split("\n").filter(Boolean),...steps.map(step=>step.label)])];if(labels.join("\n").length>5000||labels.length>50){setAiMessage("Save the existing questions first; no questions were overwritten.");return;}edit({...current,data:{...current.data,extraChecks:labels.join("\n")}});}}/>:null}
          </Suspense>
        </details>
        <details open={!canAssign || Boolean(job.startedAt)} className="space-y-4"><summary className="cursor-pointer rounded-xl border bg-slate-50 p-4 font-semibold">{canAssign?"The technician completes this on site":"Checks, notes & photos"}</summary>
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">On-site work</h2><p className="mt-1 text-sm text-slate-600">Fill in what you know. Leave the rest for later or choose N/A. Record only work actually performed.</p>
          <label className="mt-4 block font-semibold">Remember the serial number<div className="flex items-center gap-2"><input className={control} value={job.data.serialNumber} onChange={e=>data("serialNumber",e.target.value)} placeholder="Serial number or N/A"/><Button variant="outline" onClick={()=>data("serialNumber","N/A")}>N/A</Button></div></label>
          <DmeGuidedChecks key={job.id} job={job} disabled={busy} allowAttestation={!canAssign} onChange={checks=>visit("checks",checks)} onSave={async()=>{setBusy(true);try{return await save();}finally{setBusy(false);}}} onPhoto={(incoming,caption)=>upload(incoming,"diagnosis",caption)}/>
          {!job.data.serviceType?<p className="mt-4 text-sm text-amber-800">Choose the job type above when known to show its SpinLife checks. You can save your notes now.</p>:null}
          <label className="mt-6 block text-lg font-semibold">Additional raw field notes (optional)<textarea className={control} rows={5} value={job.visit.narrative} onChange={e=>visit("narrative",e.target.value)} placeholder="Add anything the step answers did not capture. Short notes or dictation are enough; Copilot drafts the report below."/></label>
          <VoiceNote disabled={busy} onText={text=>{const current=draftRef.current;if(current)edit({...current,visit:{...current.visit,narrative:[current.visit.narrative,text].filter(Boolean).join("\n")}});}}/>
          <label className="mt-4 block">Outcome<select className={control} value={job.visit.disposition} onChange={e=>visit("disposition",e.target.value)}><option value="needs_review">To be confirmed</option><option value="delivery_completed">Delivery completed</option><option value="returned_to_service">Repair completed / returned to service</option><option value="parts_required">Needs parts</option><option value="needs_resolution">Needs resolution / follow-up</option><option value="out_of_service">Out of service</option><option value="incomplete">Incomplete</option></select></label>
          <details className="mt-4"><summary className="cursor-pointer font-semibold">Add findings, test results or follow-up notes</summary>{([["findings","Findings / observations"],["testResults","Tests actually performed and results"],["recommendation","Remaining needs / recommendations"]] as const).map(([key,label])=><label key={key} className="mt-3 block">{label}<textarea className={control} rows={3} value={job.visit[key]} onChange={e=>visit(key,e.target.value)}/></label>)}</details>
        </div>
        <DmeParts parts={job.visit.parts||[]} disabled={busy} onChange={parts=>visit("parts",parts)}/>
        <Suspense fallback={<p className="p-3 text-sm" role="status">Opening optional report tools…</p>}><SpinlifeReportWriter key={job.id} job={job} disabled={busy} onSave={async()=>{setBusy(true);try{return await save();}finally{setBusy(false);}}} onApply={fields=>{const current=draftRef.current;if(!current)return;edit({...current,visit:{...current.visit,reportWording:{sourceFingerprint:spinlifeWritingFingerprint(current),reviewedAt:new Date().toISOString(),fields:{...current.visit.reportWording?.sourceFingerprint===spinlifeWritingFingerprint(current)?current.visit.reportWording.fields:{},...fields}}}});}}/></Suspense>
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Photos & customer signature</h2><label className="mt-3 block">Photo purpose<select className={control} value={photoCategory} onChange={e=>setPhotoCategory(e.target.value)}>{[["after","Final condition"],["before","Before service"],["serial","Equipment identity label"],["diagnosis","Diagnostic finding"],["repair","Repair / installed part"],["packaging","Shipping / packaging condition"],["test","Recorded test result"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="mt-3 block">Add job photos (JPG or PNG)<input type="file" accept="image/jpeg,image/png" multiple className={control} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void upload(files,photoCategory);}}/></label>
          {files.filter(f=>["before","after","serial","diagnosis","repair","packaging","test"].includes(f.category)).map(f=><label key={f.id} className="mt-3 block"><a className="text-blue-700 underline" target="_blank" rel="noreferrer" href={`/api/attachments?attachmentId=${encodeURIComponent(f.id)}`}>{f.fileName}</a><input className={control} value={job.visit.photoCaptions[f.id] || ""} placeholder="Photo caption (optional)" onChange={e=>visit("photoCaptions",{...job.visit.photoCaptions,[f.id]:e.target.value})}/></label>)}
          <label className="mt-5 block">Customer signer’s name<input className={control} value={job.visit.customerSignatureName} onChange={e=>visit("customerSignatureName",e.target.value)} placeholder="Name or N/A"/></label>
          {job.visit.signatureAttachmentId?<div className="mt-3 flex items-center gap-3"><p>Customer signature saved.</p><Button variant="outline" onClick={()=>visit("signatureAttachmentId","")}>Remove from this version</Button></div>:<div className="mt-3"><Signature disabled={busy} onSave={f=>upload([f],"signature")}/></div>}
        </div>
        </details>
      </fieldset>
      )}
      {canAssign&&job.version>0?<Suspense fallback={<p role="status">Opening closeout controls…</p>}><SpinlifeCloseout id={job.id} sourceVersion={job.version} unsaved={dirty||busy} onPrepared={id=>{try{clearSpinLifeDraft(localStorage,userId,job.id);}catch{/* The immutable saved source remains. */}setJob(null);setFiles([]);setCloseoutWorkOrderId(id);void query.refetch();}}/></Suspense>:null}
      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-lg"><p className="text-sm text-slate-600" role="status">{busy?"Saving…":dirty&&draftPending?"Protecting latest changes…":dirty&&draftStored?"Unsaved changes protected on this device":dirty?"Unsaved changes":job.version?"Saved":"Draft — save whenever you are ready"}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void perform("save")}>{canAssign&&job.technicianId?"Save & assign":"Save for later"}</Button><Button disabled={busy} onClick={()=>void perform("packet")}>Generate service PDF</Button>{technician?<Button disabled={busy} onClick={()=>void perform("review")}>Submit & finish</Button>:null}{job.packetAttachmentId?<Button variant="outline" asChild><a href={`/api/attachments?attachmentId=${encodeURIComponent(job.packetAttachmentId)}`} target="_blank" rel="noreferrer"><Download/>Open PDF{dirty||job.packetSourceVersion!==job.version?" (previous version)":""}</a></Button>:null}</div></footer>
      <p className="text-xs text-slate-500">The PDF includes the digital SpinLife form, TechFlex report and uploaded photos. Blank, N/A and unperformed items remain visible. Original documents remain available above. Billing and partner submission are separate.</p>
    </>}
  </section>;
}
