"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { TechnicianFiles } from "@/components/technician-files";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmployeeFileUpload({ role }: { role: string }) {
  const [selectedId, setSelectedId] = useState("");
  const allowed = ["owner_administrator", "operations_administrator", "finance", "dispatcher"].includes(role);
  const roster = useQuery({ queryKey: ["employee-file-roster"], enabled: allowed, queryFn: async () => portalJson<{ technicians: { id: string; name: string; email: string; technicianCode: string }[] }>(await portalFetch("/api/technicians"), "Unable to load technicians. Please retry.") });
  const person = roster.data?.technicians.find(item => item.id === selectedId);
  if (!allowed) return null;
  return <section className="border-b bg-blue-50/60 p-5" aria-label="Employee & Technician Files">
    <h3 className="font-bold text-slate-900">Employee &amp; Technician Files</h3>
    <p className="mt-1 text-sm text-slate-700">Select a person, then open Employee files to upload their complete personnel packet or individual documents.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="w-full space-y-2 text-sm font-medium sm:max-w-md">Employee or contractor
        <Select value={selectedId} onValueChange={setSelectedId} disabled={roster.isPending || !!roster.error}>
          <SelectTrigger className="mt-2 w-full"><SelectValue placeholder={roster.isPending ? "Loading technicians…" : "Select technician"}/></SelectTrigger>
          <SelectContent>{roster.data?.technicians.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.technicianCode} · {item.email}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      {person ? <TechnicianFiles key={person.id} technicianId={person.id} name={person.name} role={role}/> : null}
    </div>
    {roster.error ? <p role="alert" className="mt-3 text-sm text-red-700">{roster.error.message} <Button variant="outline" onClick={() => roster.refetch()}>Retry</Button></p> : null}
    {roster.data && !roster.data.technicians.length ? <p className="mt-3 text-sm">Add the person in Technicians first, then return here to upload their file.</p> : null}
    <p className="mt-3 text-sm text-slate-600">Complete personnel packets are restricted to Owner Administrator and Finance. Use one PDF up to 20 MB, or upload documents individually.</p>
  </section>;
}
