"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudCog, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { portalFetch } from "@/lib/portal-fetch";
import { connectionStatus, connectionPurpose, friendlyRequirement, modeLabels, setupRequest } from "@/lib/integration-guidance";

type Connection = {
  integrationKey: string; provider: string; displayName: string; recommendedMode: string;
  availableFlows: string[]; status: string; connectionMode: string; configured: boolean;
  runtimeReady: boolean; missing: string[]; ownerRole: string; dataFlows: string[];
  transactionVerified: boolean; notes: string; enabled: boolean;
  lastSyncAt: string | null; lastSuccessAt: string | null; lastError: string | null; queue: number; retryable: number;
};
async function api<T>(body?: Record<string, unknown>) {
  const response = await portalFetch("/api/integrations/connections", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The connection could not be updated. Please try again.");
  return data;
}
const selectClass = "w-full rounded-md border bg-white p-2 text-sm";
export function IntegrationAutomationStudio({ onNavigate }: { onNavigate?: (module: string) => void }) {
  const client = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ enabled: true, connectionMode: "", ownerRole: "operations_administrator", dataFlows: [] as string[], notes: "" });
  const query = useQuery({ queryKey: ["integration-connections"], queryFn: () => api<{ connections: Connection[]; viewerRole: string }>() });
  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ passed?: boolean; missing?: string[]; retried?: number }>(body),
    onSuccess: async (data, variables) => {
      await client.invalidateQueries({ queryKey: ["integration-connections"] });
      if (variables.action === "test") {
        if (data.passed) toast.success("Required settings are present. A live workflow test is still needed.");
        else toast.warning("Setup is incomplete. Review the requirements below.");
      } else if (variables.action === "retry") toast.success(`${data.retried || 0} failed event(s) queued again. Processing is still required.`);
      else toast.success("Connection plan saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const connections = query.data?.connections || [];
  const selected = connections.find(item => item.integrationKey === selectedKey);
  const visible = connections.filter(item => `${item.displayName} ${item.provider} ${connectionPurpose(item.integrationKey)}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "attention" && connectionStatus(item) === "Needs attention" || filter === "setup" && !item.runtimeReady || filter === "paused" && !item.enabled));
  function configure(item: Connection) {
    action.reset(); setSelectedKey(item.integrationKey);
    setForm({ enabled: item.enabled, connectionMode: item.connectionMode, ownerRole: item.ownerRole, dataFlows: item.dataFlows, notes: item.notes });
  }
  return <div className="space-y-5">
    <section className="rounded-2xl bg-slate-900 p-6 text-white">
      <h2 className="text-2xl font-bold">Connections</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Choose a company or service, select the information you want to share, and follow the setup checklist. An API is simply a direct connection between two systems.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {onNavigate && query.data && query.data.viewerRole !== "finance" && <Button onClick={() => onNavigate("partners")}>Set up a company in Partner Portal</Button>}
        {onNavigate && <Button variant="secondary" onClick={() => onNavigate("imports")}>Import a spreadsheet</Button>}
        <Button variant="secondary" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className="size-4" />Refresh status</Button>
      </div>
      <p className="mt-3 text-xs text-slate-300">Partner Portal supports company access and API credentials. Each service below has its own setup requirements.</p>
    </section>
    <div className="flex flex-wrap gap-3">
      <div className="min-w-56 flex-1"><Label htmlFor="connection-search">Find a company or service</Label><Input id="connection-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search connections…" /></div>
      <div><Label htmlFor="connection-filter">Show</Label><select id="connection-filter" className={selectClass} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All connections</option><option value="attention">Needs attention</option><option value="setup">Setup incomplete</option><option value="paused">Paused</option></select></div>
    </div>
    {query.isLoading && <p role="status">Loading connections…</p>}
    {query.isError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">{query.error.message}<Button variant="outline" className="ml-3" onClick={() => query.refetch()}>Try again</Button></div>}
    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {visible.map(item => <article key={item.integrationKey} className="flex flex-col rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2"><CloudCog className="size-6 text-cyan-800" /><Badge variant="outline">{connectionStatus(item)}</Badge></div>
        <h3 className="mt-4 font-bold">{item.displayName}</h3><p className="mt-2 text-sm text-slate-600">{connectionPurpose(item.integrationKey)}</p>
        <p className="my-4 text-sm"><b>Next step:</b> {!item.enabled ? "Review the plan when you’re ready to resume." : item.retryable > 0 ? "Review failed activity before retrying." : item.missing.length ? "Open setup to review what’s needed." : "Coordinate a live workflow test with the connection owner."}</p>
        {item.queue > 0 && <p className="mb-3 text-xs text-slate-600">{item.queue} event(s) waiting for processing · {item.retryable} eligible to retry</p>}
        <Button variant="outline" className="mt-auto" disabled={action.isPending} onClick={() => configure(item)}>{item.configured ? "Manage connection" : "Start setup"}</Button>
      </article>)}
    </section>
    {!query.isLoading && !query.isError && !visible.length && <p className="rounded-xl border border-dashed p-6 text-center">No connections match. Try another search or choose All connections.</p>}
    <Sheet open={Boolean(selectedKey)} onOpenChange={open => { if (!open && !action.isPending) setSelectedKey(null); }}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader className="border-b px-6 pb-5 pt-6"><SheetTitle>{selected?.displayName}</SheetTitle><SheetDescription>Save your plan, gather the requirements, then check setup. Saving a plan does not activate a connection.</SheetDescription></SheetHeader>
      {selected && <form className="space-y-6 p-6" onSubmit={event => { event.preventDefault(); action.mutate({ action: "save", integrationKey: selected.integrationKey, ...form }); }}>
        <fieldset disabled={action.isPending} className="space-y-4"><legend className="mb-3 font-bold">1. Choose what to share</legend>
          <p className="text-sm text-slate-600">Select at least one type of information for the connection plan.</p>
          {[...new Set([...selected.availableFlows, ...form.dataFlows])].map(flow => <label key={flow} className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-cyan-700" checked={form.dataFlows.includes(flow)} onChange={event => setForm({ ...form, dataFlows: event.target.checked ? [...form.dataFlows, flow] : form.dataFlows.filter(value => value !== flow) })} />{flow}</label>)}
          <div><Label htmlFor="connection-owner">Who will manage this connection?</Label><select id="connection-owner" className={selectClass} value={form.ownerRole} onChange={event => setForm({ ...form, ownerRole: event.target.value })}><option value="owner_administrator">Owner administrator</option><option value="operations_administrator">Operations administrator</option><option value="finance">Finance</option></select></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} /><span>Include this connection in the operating plan<span className="block text-xs text-slate-500">Unchecking marks the plan as paused. It does not revoke provider access or stop external systems.</span></span></label>
        </fieldset>
        <section className="space-y-3"><h3 className="font-bold">2. Gather setup requirements</h3><p className="text-sm text-slate-600">Your platform administrator and the company’s technical contact may need to complete these items.</p>
          {selected.missing.length ? <ul className="list-disc space-y-2 rounded-lg bg-amber-50 p-4 pl-8 text-sm text-amber-950">{selected.missing.map(value => <li key={value}>{friendlyRequirement(value)}</li>)}</ul> : <p className="rounded-lg bg-blue-50 p-3 text-sm">Required settings are present. This does not verify access or a successful exchange.</p>}
          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Request details from the company</summary><Textarea aria-label="Company setup request" readOnly value={setupRequest(selected.displayName, form.dataFlows)} className="my-3 min-h-56" /><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(setupRequest(selected.displayName, form.dataFlows)); toast.success("Request copied. Share it with your company contact."); } catch { toast.error("Copy unavailable. Select and copy the request above."); } }}><Copy className="size-4" />Copy request</Button></details>
          <details className="space-y-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Technical details and notes</summary><div className="mt-3"><Label htmlFor="connection-mode">Planned connection method</Label><select disabled={action.isPending} id="connection-mode" className={selectClass} value={form.connectionMode} onChange={event => setForm({ ...form, connectionMode: event.target.value })}>{[...new Set([selected.recommendedMode, form.connectionMode, "manual_review", "controlled_import", "api_webhook"])].map(value => <option key={value} value={value}>{modeLabels[value] || value.replaceAll("_", " ")}</option>)}</select></div><p className="text-xs text-slate-500">Changing this plan does not implement the chosen method.</p>{selected.missing.length > 0 && <p className="break-words text-xs text-slate-500">Technical requirements: {selected.missing.join("; ")}</p>}<Label htmlFor="connection-notes">Notes — do not enter passwords or secret keys</Label><Textarea id="connection-notes" disabled={action.isPending} maxLength={1500} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Company contact, approvals, and rollout notes" /></details>
        </section>
        <section className="space-y-3"><h3 className="font-bold">3. Save and check setup</h3><Badge variant="outline">{connectionStatus(selected)}</Badge><p className="text-sm text-slate-600">Check setup only checks prerequisites. Have the connection owner confirm an approved real workflow before relying on automated exchanges. Past activity does not verify every workflow.</p>
          {selected.lastError && <p role="status" className="break-words rounded-lg bg-amber-50 p-3 text-sm">{selected.lastError.startsWith("Missing:") ? "Some setup requirements are still missing. Review step 2." : selected.lastError}</p>}
          {selected.lastSuccessAt && <p className="text-xs text-slate-500">Last recorded success: {selected.lastSuccessAt}</p>}
          {action.isError && <p role="alert" className="text-sm text-red-700">{action.error.message} Your entries are still here.</p>}
          <Button type="submit" className="w-full" disabled={action.isPending || !form.dataFlows.length}>{action.isPending && action.variables?.action === "save" ? "Saving…" : "Save connection plan"}</Button>
          {!form.dataFlows.length && <p className="text-sm text-amber-800">Select at least one information type in step 1.</p>}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "test", integrationKey: selected.integrationKey })}>Check setup requirements</Button>{selected.retryable > 0 && <Button type="button" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "retry", integrationKey: selected.integrationKey })}>Retry {selected.retryable} failed event(s)</Button>}</div>
        </section>
      </form>}
    </SheetContent></Sheet>
  </div>;
}
