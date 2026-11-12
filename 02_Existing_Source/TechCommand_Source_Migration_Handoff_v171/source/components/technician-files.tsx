"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";

type Document = { id: string; title: string; attachmentId: string; status: string; fileName: string };
export function TechnicianFiles({ technicianId, name, role }: { technicianId: string; name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(["owner_administrator", "finance"].includes(role) ? "employee_other" : "credential");
  const [expiresOn, setExpiresOn] = useState("");
  const [saved, setSaved] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const canUpload = ["owner_administrator", "operations_administrator", "biomedical_lead", "finance", "technician"].includes(role);
  const restricted = ["owner_administrator", "finance"].includes(role);
  const categories = ["credential", "training", "license", "insurance", "w9", "contract", "other", ...(restricted ? ["w4", "w2", "i9", "pay_stub", "direct_deposit", "employment_agreement", "employee_other"] : [])];
  const docs = useQuery({ queryKey: ["documents", "technician", technicianId], enabled: open, queryFn: async () => portalJson<{documents: Document[]}>(await portalFetch(`/api/documents?scopeType=technician&scopeId=${encodeURIComponent(technicianId)}`), "Unable to load technician files.") });
  const upload = useMutation({ mutationFn: async () => {
    if (!file || !file.size) throw new Error("Choose a non-empty file first.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
    if (title.trim().length < 2) throw new Error("Enter a document title with at least two characters.");
    const form = new FormData();
    form.set("file", file); form.set("scopeType", "technician"); form.set("scopeId", technicianId); form.set("title", title.trim()); form.set("category", category); form.set("expiresOn", expiresOn);
    const data = await portalJson<{document: {id: string}}>(await portalFetch("/api/documents", {method: "POST", body: form}), "Unable to save this technician file.");
    if (!data.document?.id) throw new Error("Save was not confirmed. Refresh the file list before retrying.");
  }, onSuccess: async () => {
    setSaved(`${file?.name} saved to ${name}.`); setFile(null); setTitle(""); setExpiresOn(""); if (input.current) input.current.value = "";
    await client.invalidateQueries({queryKey: ["documents"]});
  }, onError: () => { void client.invalidateQueries({queryKey: ["documents", "technician", technicianId]}); } });
  return <Sheet open={open} onOpenChange={(value) => { if (!upload.isPending) setOpen(value); }}><SheetTrigger asChild><Button variant="outline" className="h-7 px-2 text-xs">Employee files</Button></SheetTrigger><SheetContent className="overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Employee files · {name}</SheetTitle><SheetDescription>Upload a complete employee packet as one PDF, or add individual documents to this technician. Tax, identity and payroll categories require Owner Administrator or Finance access.</SheetDescription></SheetHeader><div className="space-y-5 p-5">
    {canUpload ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setSaved(""); upload.mutate(); }}><label className="block space-y-2 text-sm font-medium">Choose file<Input ref={input} type="file" disabled={upload.isPending} accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); setTitle(next?.name || ""); setSaved(""); upload.reset(); }}/></label><p className="text-sm text-slate-500">PDF, Word, Excel, CSV, text or images. Maximum 20 MB. Spreadsheets here are saved as files.</p><label className="block space-y-2 text-sm font-medium">Title<Input value={title} disabled={upload.isPending} onChange={(event) => setTitle(event.target.value)}/></label><label className="block space-y-2 text-sm font-medium">Category<Select value={category} disabled={upload.isPending} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{categories.map(value => <SelectItem key={value} value={value}>{value === "employee_other" ? "Complete employee file / personnel packet (restricted)" : value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></label><label className="block space-y-2 text-sm font-medium">Expiration date (optional)<Input type="date" value={expiresOn} disabled={upload.isPending} onChange={(event) => setExpiresOn(event.target.value)}/></label>{upload.error ? <p role="alert" className="text-sm text-red-700">{upload.error.message}</p> : null}{saved ? <p role="status" className="text-sm text-green-800">{saved}</p> : null}<Button disabled={!file || upload.isPending} type="submit">{upload.isPending ? "Saving file…" : "Upload file"}</Button></form> : null}
    <div className="border-t pt-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Saved files</h3><Button variant="ghost" disabled={docs.isFetching} onClick={() => docs.refetch()}>Refresh</Button></div>{docs.isPending ? <p>Loading files…</p> : docs.error ? <p role="alert" className="text-sm text-red-700">{docs.error.message}</p> : <ul className="divide-y">{docs.data?.documents.filter(doc => doc.status !== "deleted").map(doc => <li key={doc.id} className="py-3"><a className="break-all font-medium text-blue-700 underline" href={`/api/attachments?attachmentId=${encodeURIComponent(doc.attachmentId)}`} target="_blank" rel="noreferrer">{doc.title}</a><p className="break-all text-sm text-slate-500">{doc.fileName}</p></li>)}{!docs.data?.documents.some(doc => doc.status !== "deleted") ? <li className="py-3 text-sm text-slate-500">No saved files for this technician.</li> : null}</ul>}</div>
  </div></SheetContent></Sheet>;
}
