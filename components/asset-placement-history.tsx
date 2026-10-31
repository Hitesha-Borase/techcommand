"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MapPin } from "lucide-react";
import { toast } from "sonner";
import type { ScannedAsset } from "@/lib/asset-scanning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Option = { id:string; name:string; accountId?:string; locationId?:string };
type Event = {
  id:string; fromAccountName:string; fromLocationName:string; fromDepartmentName:string|null; fromRoom:string|null;
  fromConfiguration:string|null; fromSoftwareVersion:string|null; toAccountName:string; toLocationName:string;
  toDepartmentName:string|null; toRoom:string|null; toConfiguration:string|null; toSoftwareVersion:string|null;
  reason:string; assetVersion:number; createdAt:string; changedBy:string;
};
type PlacementData = { asset:ScannedAsset; history:Event[]; options:null|{accounts:Option[];locations:Option[];departments:Option[]} };

async function api<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});
  const data=await response.json() as T&{error?:string};
  if(!response.ok) throw new Error(data.error||"Asset placement could not be saved.");
  return data;
}
export function AssetPlacementHistory({asset,canManage}:{asset:ScannedAsset;canManage:boolean}){
  const client=useQueryClient();
  const [form,setForm]=useState({accountId:asset.accountId,locationId:asset.locationId,departmentId:asset.departmentId||"none",room:asset.room||"",configuration:asset.configuration||"",softwareVersion:asset.softwareVersion||"",reason:""});
  const query=useQuery({queryKey:["asset-placement",asset.id],queryFn:()=>api<PlacementData>(`/api/asset-placement?assetId=${encodeURIComponent(asset.id)}`)});
  const current=query.data?.asset||asset;
  const save=useMutation({
    mutationFn:()=>api<{replayed:boolean}>("/api/asset-placement",{method:"POST",body:JSON.stringify({requestId:crypto.randomUUID(),assetId:asset.id,expectedRecordVersion:asset.recordVersion,accountId:form.accountId,locationId:form.locationId,departmentId:form.departmentId==="none"?null:form.departmentId,room:form.room||null,configuration:form.configuration||null,softwareVersion:form.softwareVersion||null,reason:form.reason})}),
    onSuccess:async()=>{setForm(value=>({...value,reason:""}));await Promise.all([client.invalidateQueries({queryKey:["asset-placement",asset.id]}),client.invalidateQueries({queryKey:["assets"]})]);toast.success("Asset placement history saved");},
    onError:(error)=>toast.error(error.message),
  });
  const options=query.data?.options;
  const locations=(options?.locations||[]).filter(item=>item.accountId===form.accountId);
  const departments=(options?.departments||[]).filter(item=>item.locationId===form.locationId);
  const place=(account:string,location:string,department:string|null,room:string|null)=>[account,location,department,room].filter(Boolean).join(" · ");
  return <section className="rounded-xl border p-4">
    <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 text-blue-600"/><div><h3 className="font-bold">Placement and configuration history</h3><p className="mt-1 text-sm text-slate-500">The permanent asset identity stays the same. Each approved change keeps its before/after values and server time.</p></div></div>
    <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Current placement</dt><dd>{place(current.accountName,current.locationName,current.departmentName,current.room)}</dd></div>
      <div><dt className="font-semibold">Configuration</dt><dd>{current.configuration||"Not recorded"}{current.softwareVersion?` · software ${current.softwareVersion}`:""}</dd></div>
    </dl>
    {canManage&&options?<form className="mt-4 space-y-3 border-t pt-4" onSubmit={event=>{event.preventDefault();save.mutate();}}>
      <p className="text-sm text-slate-600">Open work must be completed or cancelled first. A change never updates service findings, PM status, authorization, billing, or qualifications.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Account<Select value={form.accountId} onValueChange={accountId=>setForm({...form,accountId,locationId:"",departmentId:"none"})}><SelectTrigger className="w-full"><SelectValue placeholder="Select account"/></SelectTrigger><SelectContent>{options.accounts.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-sm font-semibold">Facility<Select value={form.locationId} onValueChange={locationId=>setForm({...form,locationId,departmentId:"none"})}><SelectTrigger className="w-full"><SelectValue placeholder="Select facility"/></SelectTrigger><SelectContent>{locations.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-sm font-semibold">Department<Select value={form.departmentId} onValueChange={departmentId=>setForm({...form,departmentId})}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Not assigned</SelectItem>{departments.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-sm font-semibold">Room<Input value={form.room} onChange={event=>setForm({...form,room:event.target.value})} placeholder="Unknown stays blank"/></label>
        <label className="space-y-1 text-sm font-semibold">Configuration<Input value={form.configuration} onChange={event=>setForm({...form,configuration:event.target.value})} placeholder="Exact recorded configuration"/></label>
        <label className="space-y-1 text-sm font-semibold">Software version<Input value={form.softwareVersion} onChange={event=>setForm({...form,softwareVersion:event.target.value})} placeholder="Exact observed version"/></label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">Reason for change<Textarea required minLength={5} maxLength={1000} value={form.reason} onChange={event=>setForm({...form,reason:event.target.value})} placeholder="Record the actual relocation or configuration evidence."/></label>
      <Button type="submit" disabled={save.isPending||!form.accountId||!form.locationId||form.reason.trim().length<5}>{save.isPending?"Saving…":"Save reviewed change"}</Button>
    </form>:null}
    <div className="mt-5 space-y-3 border-t pt-4"><h4 className="font-semibold">Change timeline</h4>{query.data?.history.length?query.data.history.map(item=><article key={item.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span>{place(item.fromAccountName,item.fromLocationName,item.fromDepartmentName,item.fromRoom)}</span><ArrowRight className="size-4 text-slate-400"/><span className="font-semibold">{place(item.toAccountName,item.toLocationName,item.toDepartmentName,item.toRoom)}</span></div><p className="mt-2 text-slate-600">Configuration: {item.fromConfiguration||"not recorded"} → {item.toConfiguration||"not recorded"}; software: {item.fromSoftwareVersion||"not recorded"} → {item.toSoftwareVersion||"not recorded"}</p><p className="mt-2">{item.reason}</p><p className="mt-2 text-xs text-slate-500">{item.createdAt} · {item.changedBy} · asset revision {item.assetVersion}</p></article>):<p className="text-sm text-slate-500">No reviewed placement changes recorded yet.</p>}</div>
  </section>;
}
