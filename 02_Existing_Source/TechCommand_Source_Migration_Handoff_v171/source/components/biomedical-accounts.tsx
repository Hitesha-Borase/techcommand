"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import type { BiomedicalSummary, SavedBiomedicalAccount } from "@/lib/biomedical-accounts";
type Payload={accounts:{source:BiomedicalSummary;saved:SavedBiomedicalAccount|null}[];canImport:boolean};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
async function read<T>(body?:unknown) {
  return portalJson<T>(await portalFetch("/api/biomedical-accounts",body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:undefined),"The account could not be loaded. Your prepared files remain available; retry when connected.");
}
export function PreparedBiomedicalAccounts({onPlanAsset,sourceKey}:{onPlanAsset?:(assetId:string)=>void;sourceKey?:string}) {
  const client=useQueryClient(),query=useQuery({queryKey:["biomedical-accounts"],queryFn:()=>read<Payload>()});
  const [search,setSearch]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function addAccounts() {
    setBusy(true);setError("");setNotice("");
    const confirmed:string[]=[];
    try {
      for(const {source,saved} of query.data?.accounts || []) {
        if(sourceKey && source.key!==sourceKey)continue;
        if(saved) continue;
        const response=await read<{account:SavedBiomedicalAccount|null}>({source:source.key,revision:source.revision});
        if(!response.account?.contractId) throw new Error("The save was not confirmed. Refresh the account status before retrying.");
        confirmed.push(source.name);
      }
      setNotice(confirmed.length?`${confirmed.join(" and ")} saved with assets, locations, agreements and billing terms.`:"Both prepared accounts are already saved.");
    } catch(e) {setError(`${e instanceof Error?e.message:"The save could not be confirmed."}${confirmed.length?` Already saved: ${confirmed.join(", ")}. Retry adds only the remaining account.`:""}`);}
    finally {await query.refetch();void client.invalidateQueries({queryKey:["assets"]});void client.invalidateQueries({queryKey:["accounts"]});void client.invalidateQueries({queryKey:["locations"]});setBusy(false);}
  }
  return <section className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Biomedical/PM Accounts</h1><p className="mt-2 text-slate-600">Open a facility, find the equipment, and plan service. Agreements and billing terms stay with the account.</p></div>
      {query.data?.canImport&&query.data.accounts.some(a=>!a.saved)?<Button disabled={busy} onClick={()=>void addAccounts()}>{busy?"Adding accounts…":"Add prepared accounts"}</Button>:null}</header>
    {query.isPending?<p role="status">Loading your accounts…</p>:null}
    {query.isError?<div role="alert" className="rounded-lg bg-red-50 p-4">{query.error.message}<Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>:null}
    {error?<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{error}</p>:null}
    {notice?<p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">{notice}</p>:null}
    {query.data?.accounts.some(a=>!a.saved)?<p className="rounded-lg border border-blue-200 bg-blue-50 p-4">The source packages below are ready. {query.data.canImport?"Choose Add prepared accounts to save the original PDFs, assets, locations and terms in this company.":"An administrator can add these prepared accounts."} No invoice is issued by this step.</p>:null}
    <label className="block font-medium">Find an asset by tag, model or serial number<input className="mt-2 w-full rounded-lg border px-3 py-3 text-base" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type any part of the equipment details"/></label>
    {query.data?.accounts.filter(a=>!sourceKey||a.source.key===sourceKey).map(({source,saved})=>{
      const terms=saved?.terms || source.terms;
      const location=saved?.location as {address1:string;address2:string;city:string;state:string;postalCode:string}|undefined;
      const address=location || source.address;
      const assetList=saved?saved.assets.map(a=>({id:String(a.id),assetTag:String(a.assetTag),model:String(a.model),serialNumber:String(a.serialNumber||""),equipmentType:String(a.description||""),excluded:a.status==="inventory_reference"})):source.assets.map(a=>({...a,id:"",excluded:a.coverage==="excluded_outlet_reference"}));
      const visible=assetList.filter(a=>`${a.assetTag} ${a.model} ${a.serialNumber} ${a.equipmentType}`.toLowerCase().includes(search.toLowerCase()));
      return <article key={source.key} className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{saved?.name || source.name}</h2><p className="mt-1 text-slate-600">{address.address1}, {address.address2} · {address.city}, {address.state} {address.postalCode}</p><a className="text-sm text-blue-700 underline" href={source.address.sourceUrl} target="_blank" rel="noreferrer">Facility website</a></div><div><span className={`rounded-full px-3 py-1 text-sm ${saved?"bg-emerald-100 text-emerald-900":"bg-blue-100 text-blue-900"}`}>{saved?"Saved account":"Prepared — not imported"}</span><p className="mt-3 font-semibold">{money(terms.annualFeeCents)} annually · Net {terms.paymentTermsDays}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-4">{source.documents.map(document=><a key={document.role} className="min-h-11 rounded-lg border px-3 py-2.5 text-blue-800 underline" href={`/api/biomedical-accounts?source=${source.key}&document=${document.role}`} target="_blank" rel="noreferrer">{document.role==="agreement"?"Signed agreement & inventory":"Previous PM report"}</a>)}</div>
        <details className="mt-4 rounded-lg bg-slate-50 p-4"><summary className="cursor-pointer font-semibold">Billing terms · {terms.agreementNumber}</summary><div className="mt-3 space-y-2 text-sm leading-6">
          <p>Effective {terms.effectiveDate} · {terms.termMonths} months · {terms.autoRenew?"renewal terms require review":"no automatic renewal"}. {terms.invoiceTrigger} Payment terms: Net {terms.paymentTermsDays}.</p>
          {terms.cArmFeeCents?<p>Routine PM: {money(terms.routinePmFeeCents)}. Two enrolled C-arms: {money(terms.cArmFeeCents)}. Ordinary covered C-arm repairs, normal travel and covered parts are included.</p>:null}
          <p>Included annual PM: {terms.annualPmCycles} scheduled cycle and its normal travel. Routine corrective work: {money(terms.correctiveLaborCentsPerHour)}/hour, {terms.minimumMinutes}-minute minimum, then {terms.incrementMinutes}-minute increments. Direct corrective travel: {money(terms.travelCentsPerHour)}/hour plus {money(terms.mileageCentsPerMile)}/mile. Parts: cost + {terms.partsMarkupPercent}%, minimum {money(terms.minimumPartsMarkupCents)} markup; freight and tax additional. Tolls and parking at actual cost.</p>
          <p>Corrective work outside coverage needs separate customer authorization. Outlet/receptacle testing is excluded even though it appears in the historical inventory.</p>
          <p className="font-medium">These terms are {saved?"saved to the service contract":"extracted and ready to save"}. Final charges still need billing review; this page does not issue invoices or charge for covered visits.</p>
        </div></details>
        <details className="mt-4" open={Boolean(search)}><summary className="cursor-pointer py-2 font-semibold">{assetList.length} inventory entries · view equipment and plan service</summary>
          <p className="my-2 text-sm text-slate-600">Original tags and serials are preserved. Prior PM reports are historical; no current inspection result is implied. Manufacturer and risk class remain unassessed where the source does not provide them.</p>
          {!visible.length?<p className="py-4">No equipment matches that search.</p>:null}
          <div className="divide-y">{visible.map(a=><div key={a.assetTag} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="font-semibold">{a.equipmentType} · {a.model}</p><p className="break-words text-sm text-slate-600">Tag {a.assetTag} · Serial {a.serialNumber || "Not recorded"}</p>{a.excluded?<p className="text-sm text-amber-800">Reference only — outlet testing is excluded from the agreement.</p>:null}</div>{saved&&onPlanAsset&&!a.excluded?<Button variant="outline" onClick={()=>onPlanAsset(a.id)}>Plan service</Button>:null}</div>)}</div>
        </details>
      </article>;
    })}
  </section>;
}
