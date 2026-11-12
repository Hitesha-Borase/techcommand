"use client";
import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { portalFetch,portalJson } from "@/lib/portal-fetch";
import type { readPreparedBiomedicalDispatch } from "@/lib/prepared-biomedical-dispatch";
type Plan=Awaited<ReturnType<typeof readPreparedBiomedicalDispatch>>;
export function PreparedBiomedicalDispatch() {
  const client=useQueryClient();
  const query=useQuery({queryKey:["prepared-biomedical-dispatch"],queryFn:async()=>portalJson<Plan>(await portalFetch("/api/biomedical-planned-rounds"),"The prepared visit could not be loaded.")});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function assign() {
    if(!query.data)return;
    setBusy(true);setError("");
    try {
      const saved=await portalJson<Plan>(await portalFetch("/api/biomedical-planned-rounds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:query.data.key})}),"Assignments were not confirmed. Refresh before retrying.");
      client.setQueryData(["prepared-biomedical-dispatch"],saved);
      await Promise.all([client.invalidateQueries({queryKey:["dispatch"]}),client.invalidateQueries({queryKey:["work-orders"]})]);
    } catch(e) {setError(e instanceof Error?e.message:"Assignments were not confirmed. Refresh before retrying.");}
    finally {setBusy(false);}
  }
  if(query.isPending)return <p role="status">Loading the prepared September 17 visit…</p>;
  if(query.isError)return <div role="alert" className="rounded-lg border p-4">{query.error.message}<Button className="ml-3" variant="outline" onClick={()=>void query.refetch()}>Reload prepared visit</Button></div>;
  if(!query.data)return null;
  const plan=query.data;
  return <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5" aria-label="Prepared biomedical visit">
    <h2 className="text-xl font-bold">Jim Madigan · Thursday, September 17</h2>
    <p className="mt-2">{plan.alreadySaved?"Both facility work orders are saved. Open Work Orders to view or change their schedules.":"Prepared cataloging and PM assessment — not assigned yet."}</p>
    <ol className="mt-3 space-y-3">{plan.stops.map(stop=><li key={stop.externalId} className="rounded-lg bg-white p-3"><p className="font-semibold">{stop.name} · {stop.assetCount} equipment items</p><p>{stop.timing}</p><p className="text-sm text-slate-600">{stop.address}</p>{stop.workOrder?<p className="mt-1 break-all text-sm font-semibold">Saved: {stop.workOrder.externalId} · {stop.workOrder.status.replaceAll('_',' ')}</p>:null}</li>)}</ol>
    <p className="mt-3 text-sm leading-6">{plan.billingNote} Outlet/receptacle reference rows and retired equipment are excluded. Every selected device starts as Not started.</p>
    {error?<p role="alert" className="mt-3 text-red-800">{error}</p>:null}
    {!plan.alreadySaved?<Button className="mt-4 min-h-11" disabled={busy} onClick={()=>void assign()}>{busy?"Saving both assignments…":"Assign both visits to Jim"}</Button>:<p role="status" className="mt-3 font-semibold text-emerald-800">Both assignments saved</p>}
  </section>;
}
