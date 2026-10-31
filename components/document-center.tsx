"use client";

/* Authenticated vault previews intentionally use a native image element. */
/* eslint-disable @next/next/no-img-element */

import { EmployeeFileUpload } from "@/components/employee-file-upload";
import { portalFetch } from "@/lib/portal-fetch";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BriefcaseBusiness, Building2, ChevronRight, Clock3, Download, FileText, Folder, HardDrive, RotateCcw, Search, ShieldCheck, Stethoscope, Trash2, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Doc = { id: string; scopeType: string; scopeId: string | null; scopeLabel?: string | null; category: string; title: string; effectiveOn?: string | null; expiresOn?: string | null; deletedAt?: string | null; status: string; createdAt: string; attachmentId: string; fileName: string; contentType: string; sizeBytes: number };
type ViewKey = "all" | "recent" | "work_orders" | "accounts" | "equipment" | "company" | "employees" | "expiring" | "archived" | "trash";


const viewLabels: Record<ViewKey, string> = { all: "All documents", recent: "Recent documents", work_orders: "Work orders", accounts: "Customers & accounts", equipment: "Equipment & locations", company: "Finance & company", employees: "Employee & Technician Files", expiring: "Expiring documents", archived: "Archived documents", trash: "Trash Bin" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, init); const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Documents could not be loaded."); return data;
}

function isEmployee(item: Doc) { return item.scopeType === "technician"; }
function createdTime(item: Doc) { return new Date(item.createdAt.endsWith("Z") ? item.createdAt : `${item.createdAt}Z`).getTime(); }
function matchesDocumentView(item: Doc, key: ViewKey, now: number) {
  const thirtyDays = 30 * 86400000;
  if (key === "trash") return item.status === "deleted";
  if (item.status === "deleted") return false;
  if (key === "recent") return now - createdTime(item) <= thirtyDays;
    if (key === "work_orders") return item.scopeType === "work_order" || item.scopeType === "work_order_intake";
  if (key === "accounts") return item.scopeType === "account" || item.scopeType === "customer";
  if (key === "equipment") return item.scopeType === "asset" || item.scopeType === "location";
  if (key === "company") return item.scopeType === "organization";
  if (key === "employees") return isEmployee(item);
  if (key === "expiring") return Boolean(item.expiresOn && new Date(item.expiresOn).getTime() <= now + thirtyDays);
  if (key === "archived") return item.status === "archived";
  return item.status === "current";
}

export function DocumentCenter({ role }: { role: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewKey>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const documents = useQuery({ queryKey: ["documents"], queryFn: () => api<{ documents: Doc[] }>("/api/documents") });
  const all = useMemo(() => documents.data?.documents || [], [documents.data?.documents]);
  const canSeeEmployeeFiles = true;
  const canDelete = ["owner_administrator", "operations_administrator", "biomedical_lead", "finance"].includes(role);
  const [now] = useState(() => Date.now());

  const counts = useMemo(() => Object.fromEntries((["all", "recent", "work_orders", "accounts", "equipment", "company", "employees", "expiring", "archived", "trash"] as ViewKey[]).map((key) => [key, all.filter((item) => matchesDocumentView(item, key, now)).length])), [all, now]);
  const viewDocuments = all.filter((item) => matchesDocumentView(item, view, now));
  const categories = [...new Set(viewDocuments.map((item) => item.category))].sort();
  const visible = viewDocuments.filter((item) => (category === "all" || item.category === category) && Object.values(item).join(" ").toLowerCase().includes(search.toLowerCase()));
  const selected = all.find((item) => item.id === selectedId) || null;
  const remove = useMutation({
    mutationFn: (documentId: string) => api(`/api/documents?documentId=${encodeURIComponent(documentId)}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Moved to Trash Bin", { description: "The file can be restored for 30 days before permanent deletion." });
    },
    onError: (error) => toast.error(error.message),
  });
  const restore = useMutation({
    mutationFn: (documentId: string) => api("/api/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, action: "restore" }) }),
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document restored", { description: "The file is back in its original Vault location." });
    },
    onError: (error) => toast.error(error.message),
  });

  const folders: { key: ViewKey; label: string; icon: typeof Folder; restricted?: boolean; manageOnly?: boolean }[] = [
    { key: "all", label: "All documents", icon: HardDrive }, { key: "recent", label: "Recent", icon: Clock3 },
    { key: "work_orders", label: "Work orders", icon: Wrench }, { key: "accounts", label: "Customers & accounts", icon: BriefcaseBusiness },
    { key: "equipment", label: "Equipment & locations", icon: Stethoscope }, { key: "company", label: "Finance & company", icon: Building2 },
    { key: "employees", label: "Employee files", icon: Users, restricted: true }, { key: "expiring", label: "Expiring", icon: Clock3 },
    { key: "archived", label: "Archived", icon: Archive }, { key: "trash", label: "Trash Bin", icon: Trash2, manageOnly: true },
  ];

  function chooseView(key: ViewKey) { setView(key); setCategory("all"); setSelectedId(null); }

  return <div className="overflow-hidden rounded-xl border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-blue-700"/><h2 className="font-bold">Document Vault</h2></div><p className="mt-1 text-sm text-slate-500">Central access to every document you are authorized to view.</p></div><div className="flex min-w-64 flex-1 items-center rounded-lg border bg-slate-50 px-3 sm:max-w-md"><Search className="size-4 text-slate-400"/><input className="h-10 w-full bg-transparent px-2 text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search work order, customer, employee, filename…"/></div></div>
    <EmployeeFileUpload role={role}/>
    <div className="grid min-h-[650px] lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_330px]">
      <aside className="border-b bg-slate-50/70 p-3 lg:border-b-0 lg:border-r"><p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-[.12em] text-slate-400">Library</p><nav className="space-y-1">{folders.filter((folder) => (!folder.restricted || canSeeEmployeeFiles) && (!folder.manageOnly || canDelete)).map((folder) => { const Icon = folder.icon; return <button key={folder.key} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${view === folder.key ? "bg-blue-700 font-semibold text-white" : "text-slate-700 hover:bg-white"}`} onClick={() => chooseView(folder.key)}><Icon className="size-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{folder.label}</span><span className={`text-xs ${view === folder.key ? "text-blue-100" : "text-slate-400"}`}>{counts[folder.key] || 0}</span></button>})}</nav><div className="mt-5 border-t px-3 pt-4"><p className="text-xs leading-5 text-slate-500">Employee files can be uploaded using the person selector above. Other files are added through <strong>Imports &amp; Sync</strong>. Deleted files remain in the Trash Bin for 30 days.</p></div></aside>
      <main className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"><div className="flex items-center gap-2 text-sm"><button className="text-slate-500 hover:text-blue-700" onClick={() => chooseView("all")}>Document Vault</button><ChevronRight className="size-4 text-slate-300"/><span className="font-semibold">{viewLabels[view]}</span></div><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-52"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All document types</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div>
        {documents.error ? <div role="alert" className="p-5 text-red-700">{documents.error.message}<Button variant="outline" onClick={() => documents.refetch()}>Retry</Button></div> : documents.isLoading ? <div className="p-12 text-center text-sm text-slate-500">Loading authorized documents…</div> : visible.length ? <div className="divide-y">{visible.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`grid w-full gap-2 px-5 py-4 text-left hover:bg-blue-50/50 sm:grid-cols-[minmax(0,1fr)_170px_110px] ${selectedId === item.id ? "bg-blue-50" : ""}`}><div className="flex min-w-0 gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileText className="size-5"/></span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.title}</p><p className="mt-1 truncate text-xs text-slate-500">{item.fileName}</p></div></div><div><p className="truncate text-sm font-medium">{item.scopeLabel || "TechFlex company"}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.category.replaceAll("_", " ")}</p></div><div className="text-xs text-slate-500"><p>{item.effectiveOn || new Date(createdTime(item)).toLocaleDateString()}</p><p className="mt-1">{(item.sizeBytes / 1024).toFixed(0)} KB</p></div></button>)}</div> : <div className="grid min-h-80 place-items-center p-8 text-center"><div><Folder className="mx-auto size-9 text-slate-300"/><p className="mt-3 font-semibold text-slate-700">No documents in this view</p><p className="mt-1 text-sm text-slate-500">Use Employee & Technician Files above to select a person and upload their documents. For other records, use Imports & Sync.</p></div></div>}
      </main>
      <aside className="hidden border-l bg-slate-50/40 xl:block">{selected ? <div className="sticky top-0"><div className="border-b p-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">Document details</p><h3 className="mt-2 font-bold text-slate-900">{selected.title}</h3><p className="mt-1 break-all text-xs text-slate-500">{selected.fileName}</p></div>{selected.status === "deleted" ? <div className="grid h-40 place-items-center border-b bg-slate-100 p-5 text-center"><div><Trash2 className="mx-auto size-9 text-slate-400"/><p className="mt-2 text-sm font-semibold text-slate-600">In Trash Bin</p><p className="mt-1 text-xs text-slate-500">Permanently deleted 30 days after {selected.deletedAt ? new Date(`${selected.deletedAt}Z`).toLocaleDateString() : "deletion"}.</p></div></div> : selected.contentType === "application/pdf" ? <iframe title={selected.title} className="h-64 w-full border-b bg-white" src={`/api/attachments?attachmentId=${selected.attachmentId}`}/> : selected.contentType.startsWith("image/") ? <div className="border-b bg-slate-100 p-3"><img className="mx-auto max-h-60 rounded object-contain" src={`/api/attachments?attachmentId=${selected.attachmentId}`} alt={selected.title}/></div> : <div className="grid h-40 place-items-center border-b bg-slate-100"><FileText className="size-12 text-slate-300"/></div>}<dl className="space-y-4 p-5 text-sm"><div><dt className="text-xs font-semibold text-slate-400">Filed under</dt><dd className="mt-1 font-medium">{selected.scopeLabel || "TechFlex company"}</dd></div><div className="grid grid-cols-2 gap-4"><div><dt className="text-xs font-semibold text-slate-400">Category</dt><dd className="mt-1 capitalize">{selected.category.replaceAll("_", " ")}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Status</dt><dd className="mt-1 capitalize">{selected.status}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Document date</dt><dd className="mt-1">{selected.effectiveOn || "—"}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Expires</dt><dd className="mt-1">{selected.expiresOn || "No expiration"}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Uploaded</dt><dd className="mt-1">{new Date(createdTime(selected)).toLocaleDateString()}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Size</dt><dd className="mt-1">{(selected.sizeBytes / 1024).toFixed(0)} KB</dd></div></div></dl><div className="space-y-2 border-t p-5">{selected.status !== "deleted" ? <Button className="w-full" asChild><a href={`/api/attachments?attachmentId=${selected.attachmentId}`}><Download/>Open or download</a></Button> : null}{canDelete && selected.status === "deleted" ? <Button className="w-full" disabled={restore.isPending} onClick={() => restore.mutate(selected.id)}><RotateCcw/>{restore.isPending ? "Restoring…" : "Restore document"}</Button> : null}{canDelete && selected.status !== "deleted" ? <AlertDialog><AlertDialogTrigger asChild><Button className="w-full" variant="destructive"><Trash2/>Move to Trash Bin</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move this document to the Trash Bin?</AlertDialogTitle><AlertDialogDescription>{selected.title} will be removed from active Vault views and permanently deleted after 30 days unless restored.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate(selected.id)}>{remove.isPending ? "Moving…" : "Move to Trash Bin"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></div> : <div className="grid min-h-[500px] place-items-center p-8 text-center"><div><FileText className="mx-auto size-9 text-slate-300"/><p className="mt-3 font-semibold text-slate-700">Select a document</p><p className="mt-1 text-sm text-slate-500">Details and preview will appear here.</p></div></div>}</aside>
    </div>
  </div>;
}
