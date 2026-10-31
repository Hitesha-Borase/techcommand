"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { parseDisciplines, disciplineLabels, type ServiceDiscipline } from "@/lib/service-disciplines";
export function TechnicianDisciplines({ technician }: {technician:{id:string;name:string;recordVersion:number;serviceDisciplinesJson:string|null}}) {
 const client=useQueryClient(); const [open,setOpen]=useState(false); const [values,setValues]=useState<ServiceDiscipline[]>(parseDisciplines(technician.serviceDisciplinesJson));
 const save=useMutation({mutationFn:async()=>portalJson(await portalFetch("/api/technicians",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"disciplines",technicianId:technician.id,recordVersion:technician.recordVersion,disciplines:values})}),"Capabilities could not be saved."),onSuccess:async()=>{await client.invalidateQueries({queryKey:["technicians"]});setOpen(false);}});
 return <div className="mt-2 text-sm"><p>{parseDisciplines(technician.serviceDisciplinesJson).map(v=>disciplineLabels[v]).join(" + ") || "Service capabilities not recorded"}</p><Button variant="outline" onClick={()=>{setValues(parseDisciplines(technician.serviceDisciplinesJson));setOpen(!open);}}>Service capabilities</Button>{open&&<fieldset disabled={save.isPending} className="space-y-2 rounded border p-3"><legend>{technician.name}</legend>{(["biomedical","dme_mobility"] as const).map(value=><label key={value} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={values.includes(value)} onChange={e=>setValues(e.target.checked?[...values,value]:values.filter(v=>v!==value))}/>{disciplineLabels[value]}</label>)}<p>Select both when the technician works in both disciplines. This does not grant billing or administrator access.</p>{save.error&&<p role="alert">{save.error.message}</p>}<Button onClick={()=>save.mutate()}>Save capabilities</Button></fieldset>}</div>;
}
