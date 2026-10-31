"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Progress} from "@/components/ui/progress";
import {VoiceNote} from "@/components/voice-note";
import {dmeFieldProgress,dmeRecordedActivity} from "@/lib/dme-guided-service";
import type {SpinLifeJob,SpinLifeVisit} from "@/lib/spinlife-simple";

export function DmeGuidedChecks({job,disabled,allowAttestation,onChange,onSave,onPhoto}:{job:SpinLifeJob;disabled:boolean;allowAttestation:boolean;onChange:(checks:SpinLifeVisit["checks"])=>void;onSave:()=>Promise<unknown>;onPhoto:(files:File[],caption:string)=>Promise<void>}){
 const progress=dmeFieldProgress(job,allowAttestation);
 const [index,setIndex]=useState(()=>Math.max(0,progress.checks.findIndex(c=>!c.complete&&!c.notApplicable)));
 const [overview,setOverview]=useState(false),[started,setStarted]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const step=progress.checks[Math.min(index,Math.max(0,progress.total-1))];
 if(!step)return <p className="rounded-lg bg-amber-50 p-3">Choose a job type when known. Your incomplete work can still be saved.</p>;
 const key=step.key!,value=job.visit.checks[key]||{state:"pending" as const,note:""};
 function update(change:Partial<typeof value>){onChange({...job.visit.checks,[key]:{...value,...change}});}
 async function next(){setSaving(true);setError("");try{await onSave();if(index<progress.total-1)setIndex(index+1);else document.getElementById("dme-report-review")?.scrollIntoView({behavior:"smooth",block:"start"});}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 return <section className="mt-5 space-y-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4" aria-busy={saving}>
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Guided service · partner checks</h3><p className="text-sm">{progress.documented} of {progress.total} checks recorded · {progress.remaining.length} still need attention</p></div><Button type="button" variant="outline" onClick={()=>setOverview(!overview)}>{overview?"One step at a time":"View all checks"}</Button></div>
  <Progress value={progress.percent} aria-label="Recorded partner checks"/>
  <p className="text-xs text-slate-600">Recorded does not mean passed. Manufacturer procedures remain separate above; missing work and N/A stay visible in the report.</p>
  {!started?<Button type="button" className="min-h-12 w-full" disabled={disabled} onClick={()=>setStarted(true)}>Begin guided service</Button>:<>
  {overview?<div className="grid gap-2 sm:grid-cols-2">{progress.checks.map((c,i)=><Button type="button" key={c.key} variant="outline" className="min-h-12 h-auto justify-start whitespace-normal text-left" onClick={()=>{setIndex(i);setOverview(false);}}>{i+1}. {c.label} — {c.complete?"Recorded":c.notApplicable?"N/A":"Needs attention"}</Button>)}</div>:<article key={key} className="space-y-4 rounded-lg border bg-white p-4">
   <p className="text-sm font-semibold text-cyan-800">Step {index+1} of {progress.total}</p><h4 className="text-xl font-bold">{step.label}</h4>
   <p className="text-sm">Record what actually happened. Include values, units and test conditions when a measurement applies.</p>
   <div className="grid grid-cols-2 gap-2">{([["done",key==="sl_attestation"?"I attest":"Performed"],["not_done","Issue / not completed"],["na","Not applicable"],["pending","Leave for later"]] as const).map(([state,label])=><Button type="button" key={state} className="min-h-12 h-auto whitespace-normal" variant={value.state===state?"default":"outline"} disabled={disabled||saving} aria-pressed={value.state===state} onClick={()=>update({state})}>{label}</Button>)}</div>
   <label className="block text-sm font-semibold">{value.state==="na"?"Why this does not apply":value.state==="not_done"?"Issue found / work still needed":"Result, measurement or short note"}<Textarea className="mt-2 text-base" rows={3} value={value.note} disabled={disabled||saving} onChange={e=>update({note:e.target.value})}/></label>
   <VoiceNote disabled={disabled||saving} onText={text=>update({note:[value.note,text].filter(Boolean).join("\n")})}/>
   <label className="block min-h-11 text-sm font-semibold">Take / add a photo for this step<input className="mt-2 block max-w-full" type="file" accept="image/jpeg,image/png" capture="environment" multiple disabled={disabled||saving} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void onPhoto(files,step.label);}}/></label>
   <details><summary className="min-h-11 cursor-pointer text-sm font-semibold">Why this matters</summary><p className="text-sm">This preserves the partner’s requested check and your actual result in the service packet. “Performed” records an action, not proof of a pass or a diagnosis. Use the approved manufacturer procedure for technical limits; do not guess an expected value.</p></details>
   {value.state==="pending"||value.state==="not_done"?<p className="text-sm text-amber-800">This step remains unfinished. Continue saves that status without claiming completion.</p>:null}
   <div className="flex justify-between gap-3"><Button type="button" variant="outline" disabled={!index||disabled||saving} onClick={()=>setIndex(index-1)}>Previous</Button><Button type="button" disabled={disabled||saving} onClick={()=>void next()}>{saving?"Saving…":index===progress.total-1?"Save & review report":"Save & continue"}</Button></div>
  </article>}
  </>}
  {error?<p role="alert" className="text-sm text-red-800">{error}</p>:null}
  <details><summary className="min-h-11 cursor-pointer font-semibold">Service record building from your answers</summary><p className="mb-3 text-sm">Raw field data is preserved. Review AI-drafted wording below before using it in the branded report.</p>{dmeRecordedActivity(job).map(c=><div key={c.key} className="border-t py-2 text-sm"><p className="font-semibold">{c.label}: {c.status}</p>{c.note&&<p className="whitespace-pre-wrap">{c.note}</p>}</div>)}</details>
 </section>;
}
