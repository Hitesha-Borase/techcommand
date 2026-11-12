"use client";
import {useEffect} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {portalFetch,portalJson} from "@/lib/portal-fetch";
import {Button} from "@/components/ui/button";
import type {AcademyCheck,AcademyFieldMode,AcademyFieldModeState} from "@/lib/academy";

type WorkCheck={applies:boolean;track?:"biomedical"|"dme_mobility";checks:AcademyCheck[];missingAssets:boolean;message?:string;fieldMode:AcademyFieldModeState};
const modeLabel:Record<AcademyFieldMode,string>={guided:"Guided",experienced:"Experienced",trainee:"Trainee"};

export function AcademyJobCheck({workOrderId,technicianId,onModeChange}:{workOrderId:string;technicianId?:string;onModeChange?:(mode:AcademyFieldMode|null)=>void}){
 const client=useQueryClient(),key=["academy-work",workOrderId,technicianId];
 const query=useQuery({queryKey:key,queryFn:async()=>portalJson<WorkCheck>(await portalFetch(`/api/academy/work-order?workOrderId=${encodeURIComponent(workOrderId)}${technicianId?`&technicianId=${encodeURIComponent(technicianId)}`:""}`),"Equipment authorization could not be checked."),refetchOnWindowFocus:false});
 const select=useMutation({mutationFn:async(mode:AcademyFieldMode)=>portalJson<{fieldMode:AcademyFieldModeState}>(await portalFetch("/api/academy/work-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),workOrderId,...(technicianId?{technicianId}:{}),mode,expectedRecordVersion:query.data?.fieldMode.recordVersion||0})}),"Field mode could not be saved."),onSuccess:async()=>{await client.invalidateQueries({queryKey:key});toast.success("Field mode saved");},onError:error=>toast.error(error.message)});
 useEffect(()=>onModeChange?.(query.data?.fieldMode.mode||null),[onModeChange,query.data?.fieldMode.mode]);
 if(query.data&&!query.data.applies)return null;
 const label=query.data?.track==="dme_mobility"?"DME / Mobility":"Biomedical / HTM",field=query.data?.fieldMode;
 return <section className="my-3 rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm"><h3 className="font-bold">{label} competency and field mode</h3>{query.isPending?<p>Checking saved authorizations…</p>:query.error?<p role="alert">{query.error.message}</p>:<><p className="mt-1">These career records are optional context for field documentation. Choose any view; saving and submission do not require administrator or supervisor review.</p>{query.data?.message&&<p>{query.data.message}</p>}{query.data?.missingAssets&&<p>Confirm the exact equipment identity and family to finish the competency check.</p>}<details className="mt-2"><summary className="cursor-pointer font-semibold">Career authorization records (optional)</summary><ul className="mt-2 space-y-2">{query.data?.checks.map(c=><li key={c.unit.assetId}><strong>{c.unit.assetTag}: {c.status}</strong><p>Academy record only; this does not block field documentation.</p></li>)}</ul></details>{field&&<div className="mt-3 rounded-md border border-cyan-300 bg-white p-3"><p className="font-semibold">Optional guide view: {field.mode?modeLabel[field.mode]:"Not selected"}{!field.selected&&field.mode?" · default":""}</p><p className="mt-1 text-slate-600">{field.reason}</p>{field.allowedModes.length>1&&<div className="mt-3 flex flex-wrap gap-2">{field.allowedModes.map(mode=><Button key={mode} type="button" size="sm" variant={field.mode===mode?"default":"outline"} disabled={select.isPending||field.mode===mode&&field.selected} onClick={()=>select.mutate(mode)}>{modeLabel[mode]}</Button>)}</div>}{field.mode==="trainee"&&<p className="mt-2 font-medium text-amber-800">Trainee view adds guidance. It does not change your recorded qualifications or require sign-off to save or submit notes.</p>}</div>}</>}
 <Button className="mt-2" variant="outline" disabled={query.isFetching||select.isPending} onClick={()=>void query.refetch()}>Refresh authorization</Button></section>;
}
