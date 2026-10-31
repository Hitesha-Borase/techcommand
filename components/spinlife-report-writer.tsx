"use client";
import {useState} from "react";
import {ReportWordingReview} from "@/components/report-wording-review";
import {portalFetch,portalJson} from "@/lib/portal-fetch";
import {spinlifeWritingReport,spinlifeReviewedWording,spinlifeWritingFingerprint} from "@/lib/spinlife-writing";
import type {SpinLifeJob} from "@/lib/spinlife-simple";
import type {WritingReport,WritingReview,RecordedFact} from "@/lib/report-writing";
export function SpinlifeReportWriter({job,disabled,onSave,onApply}:{job:SpinLifeJob;disabled:boolean;onSave:()=>Promise<SpinLifeJob>;onApply:(fields:Partial<WritingReport>)=>void}){
 const [pending,setPending]=useState(false),[error,setError]=useState("");
 const [result,setResult]=useState<{review:WritingReview;evidence:RecordedFact[];fingerprint:string}|null>(null);
 const report=spinlifeWritingReport(job),fingerprint=spinlifeWritingFingerprint(job);
 async function prepare(){setPending(true);setError("");try{const saved=await onSave();const response=await portalJson<{review:WritingReview;evidence:RecordedFact[]}>(await portalFetch("/api/ai/spinlife-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workOrderId:saved.id,expectedVersion:saved.version})}),"Report drafting is unavailable. Your saved notes remain available.");setResult({...response,fingerprint:spinlifeWritingFingerprint(saved)});}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 const reviewed=spinlifeReviewedWording(job);
 return <section id="dme-report-review" className="scroll-mt-6 space-y-3"><ReportWordingReview report={report} review={result?.review} facts={result?.evidence||[]} stale={!!result&&result.fingerprint!==fingerprint} pending={pending} disabled={disabled} error={error} onRequest={()=>void prepare()} onApply={onApply}/>{reviewed?<details className="rounded-lg border bg-white p-4"><summary className="min-h-11 cursor-pointer font-semibold">Reviewed report wording — original field notes preserved</summary>{Object.entries(reviewed).map(([key,value])=><p key={key} className="my-3 whitespace-pre-wrap">{value}</p>)}</details>:job.visit.reportWording?<p role="status" className="text-sm text-amber-800">Field evidence changed. Earlier report wording remains saved but will not be used in the current PDF. Refresh and review the report draft.</p>:null}</section>;
}
