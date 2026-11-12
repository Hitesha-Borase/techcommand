"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, ClipboardList, DollarSign, Loader2, LockKeyhole, MessageSquareText, Plus, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_BRAND } from "@/lib/platform-brand";
import { NextActionPanel } from "@/components/next-action-panel";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type Quote = { id?: string; estimateNumber?: string; totalCents: number; expiresAt?: string; requiredTechnicianCount: number; lineItems: { description: string; amountCents: number }[] };
type PartnerPayload = {
  identity: { displayName: string; email: string; role: string };
  account: { id: string; name: string };
  locations: { id: string; name: string; address1: string; city: string; state: string; postalCode: string }[];
  jobs: { id: string; requestNumber: string; locationName: string; serviceType: string; summary: string; priority: string; status: string; scheduledStart: string | null; estimateId: string | null; estimateNumber: string | null; quoteStatus: string | null; quoteTotalCents: number | null; quoteExpiresAt: string | null; createdAt: string }[];
  messages: { id: string; workOrderId: string | null; subject: string; body: string; createdAt: string; senderName: string; senderRole: string }[];
  error?: string;
};

const serviceTypes = [
  ["evaluation", "Evaluation / diagnosis"], ["repair_single", "Single-part repair"], ["repair_multi", "Multi-part repair"],
  ["frame_repair", "Frame repair"], ["hourly_service", "Hourly field service"], ["consumer_install", "Equipment installation"],
  ["wgd_basic", "Basic delivery / setup"], ["wgd_complex", "Complex delivery / setup"], ["bed_delivery", "Bed delivery"],
  ["biomed_service_call", "Biomedical service call"], ["biomed_pm_a", "Biomedical PM — Tier A"], ["biomed_pm_b", "Biomedical PM — Tier B"],
  ["biomed_pm_c", "Biomedical PM — Tier C"], ["biomed_pm_d", "Biomedical PM — Tier D"],
] as const;

const money = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function ClientPartnerPortal({ displayName }: { displayName: string }) {
  const client = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [request, setRequest] = useState({ locationId: "", serviceType: "evaluation", summary: "", description: "", priority: "normal", desiredDate: "", roundTripMiles: 0, driveHours: 0, onsiteHours: 1, technicianCount: 1, weightLb: 0, partsCount: 0, stairsCount: 0, assetCount: 0 });
  const [message, setMessage] = useState({ subject: "", body: "", workOrderId: "" });
  const query = useQuery({
    queryKey: ["partner-portal"],
    queryFn: async () => {
      const response = await portalFetch("/api/partner");
      return portalJson<PartnerPayload>(response,"Your partner portal could not be loaded.");
    },
  });
  const post = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await portalFetch("/api/partner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await portalJson<{ quote?: Quote; request?: { requestNumber: string }; message?: unknown }>(response,"The request could not be completed.");
      return { action: body.action, data };
    },
    onSuccess: ({ action, data }) => {
      if (action === "preview_quote") setQuote(data.quote ?? null);
      if (action === "submit_request") { setQuote(data.quote ?? null); toast.success(`Request ${data.request?.requestNumber} created`); client.invalidateQueries({ queryKey: ["partner-portal"] }); setTab("jobs"); }
      if (action === "quote_decision") { toast.success("Quote decision recorded"); client.invalidateQueries({ queryKey: ["partner-portal"] }); }
      if (action === "send_message") { toast.success("Message sent to TechFlex"); setMessage({ subject: "", body: "", workOrderId: "" }); client.invalidateQueries({ queryKey: ["partner-portal"] }); }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedLocation = useMemo(() => query.data?.locations.find((location) => location.id === request.locationId), [query.data, request.locationId]);

  if (query.isLoading) return <div className="techcommand-canvas grid min-h-screen place-items-center text-sm font-semibold text-slate-600"><Loader2 className="mr-2 inline size-4 animate-spin" />Opening your secure partner workspace…</div>;
  if (query.error || !query.data) return <div className="techcommand-canvas grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border bg-white p-7 text-center shadow-xl"><LockKeyhole className="mx-auto size-9 text-cyan-700" /><h1 className="mt-4 text-xl font-bold">Partner access unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{query.error?.message || "Your account scope could not be verified."}</p></div></div>;
  const data = query.data;
  const openJobs = data.jobs.filter((job) => !["completed", "cancelled", "quote_declined"].includes(job.status)).length;
  const awaitingDecision = data.jobs.filter((job) => job.quoteStatus === "presented").length;

  return <div className="techcommand-canvas min-h-screen bg-[#f3f7fa] text-[#092039]">
    <header className="border-b border-cyan-950/20 bg-[radial-gradient(circle_at_80%_-20%,rgba(34,211,238,.28),transparent_28rem),linear-gradient(110deg,#041523,#082c49_65%,#07536b)] text-white shadow-lg">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-cyan-200"><Building2 /></span><div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300">{PLATFORM_BRAND.name} Partner</p><h1 className="mt-1 text-xl font-bold">{data.account.name}</h1><p className="text-xs text-blue-100">Powered by {PLATFORM_BRAND.publisher}</p></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3"><ShieldCheck className="size-5 text-cyan-300" /><div><p className="text-sm font-bold">{data.identity.displayName || displayName}</p><p className="text-xs text-blue-100">Secure account-scoped access</p></div></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border bg-white p-1 shadow-sm md:inline-grid md:w-auto md:grid-cols-4"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="request">Request service</TabsTrigger><TabsTrigger value="jobs">Jobs &amp; quotes</TabsTrigger><TabsTrigger value="messages">Messages</TabsTrigger></TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <NextActionPanel compact onNavigate={setTab} />
          <section className="grid gap-4 md:grid-cols-3">{([ ["Open service requests", openJobs, ClipboardList],["Quotes awaiting decision", awaitingDecision, DollarSign],["Shared messages", data.messages.length, MessageSquareText] ] satisfies Array<[string, number, LucideIcon]>).map(([title,value,Icon]) => <article key={title} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Icon /></span><span className="text-3xl font-black">{value}</span></div><p className="mt-4 text-sm font-semibold text-slate-600">{title}</p></article>)}</section>
          <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-700">Fast lane</p><h2 className="mt-1 text-xl font-bold">Request service and receive pricing immediately</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Choose the site and job type, enter the service details, and TechCommand applies your account-specific rules. Accept only when the quote works for your team.</p></div><Button className="bg-cyan-700 hover:bg-cyan-800" onClick={() => setTab("request")}><Plus />Start request</Button></div></section>
          <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Recent jobs</h3><div className="mt-4 space-y-3">{data.jobs.slice(0,4).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-bold">{job.summary}</p><p className="mt-1 text-xs text-slate-500">{job.requestNumber} · {job.locationName}</p></div><Badge variant="outline">{label(job.status)}</Badge></div>)}{data.jobs.length === 0 && <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">No portal requests yet.</p>}</div></div><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Protection built in</h3><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">{["Only your assigned account and locations are visible.","TechFlex costs, margin, payroll, and employee records stay private.","Every request, quote decision, and message is attributable to an individual login.","Cross-account identifiers are rejected by the server."].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></div></section>
        </TabsContent>

        <TabsContent value="request" className="mt-5"><section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">New service request</h2><p className="mt-1 text-sm text-slate-500">Required service details are priced using your account agreement.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Service location</Label><Select value={request.locationId} onValueChange={(value) => { setRequest({ ...request, locationId: value }); setQuote(null); }}><SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger><SelectContent>{data.locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select>{selectedLocation && <p className="text-xs text-slate-500">{selectedLocation.address1}, {selectedLocation.city}, {selectedLocation.state}</p>}</div>
          <div className="space-y-2"><Label>Service type</Label><Select value={request.serviceType} onValueChange={(value) => { setRequest({ ...request, serviceType: value }); setQuote(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{serviceTypes.map(([value,name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2 sm:col-span-2"><Label>Short description</Label><Input value={request.summary} onChange={(e) => { setRequest({ ...request, summary: e.target.value }); setQuote(null); }} placeholder="Power chair will not power on" /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Equipment, complaint, and access details</Label><Textarea value={request.description} onChange={(e) => setRequest({ ...request, description: e.target.value })} rows={4} placeholder="Include manufacturer, model, serial number, symptoms, contact details, and site instructions." /></div>
          <div className="space-y-2"><Label>Priority</Label><Select value={request.priority} onValueChange={(value) => setRequest({ ...request, priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Requested date</Label><Input type="date" value={request.desiredDate} onChange={(e) => setRequest({ ...request, desiredDate: e.target.value })} /></div>
          <div className="space-y-2"><Label>Estimated round-trip miles</Label><Input type="number" min="0" value={request.roundTripMiles} onChange={(e) => { setRequest({ ...request, roundTripMiles: Number(e.target.value) }); setQuote(null); }} /></div>
          <div className="space-y-2"><Label>Estimated on-site hours</Label><Input type="number" min="0.5" step="0.5" value={request.onsiteHours} onChange={(e) => { setRequest({ ...request, onsiteHours: Number(e.target.value) }); setQuote(null); }} /></div>
          <div className="space-y-2"><Label>Equipment weight (lb)</Label><Input type="number" min="0" value={request.weightLb} onChange={(e) => { setRequest({ ...request, weightLb: Number(e.target.value) }); setQuote(null); }} /></div>
          <div className="space-y-2"><Label>Assets / units</Label><Input type="number" min="0" value={request.assetCount} onChange={(e) => { setRequest({ ...request, assetCount: Number(e.target.value) }); setQuote(null); }} /></div>
        </div><div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => post.mutate({ action: "preview_quote", ...request })} disabled={post.isPending}><DollarSign />Preview quote</Button><Button className="bg-cyan-700 hover:bg-cyan-800" onClick={() => post.mutate({ action: "submit_request", ...request })} disabled={!quote || post.isPending}><Send />Submit with this quote</Button></div></div>
        <aside className="rounded-2xl border bg-[#071b2d] p-6 text-white shadow-xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Instant account quote</p>{quote ? <><p className="mt-3 text-4xl font-black">{money(quote.totalCents)}</p><p className="mt-2 text-sm text-blue-100">Valid for 14 days · {quote.requiredTechnicianCount} technician{quote.requiredTechnicianCount === 1 ? "" : "s"}</p><div className="mt-6 space-y-3 border-t border-white/15 pt-5">{quote.lineItems.map((item) => <div key={item.description} className="flex justify-between gap-4 text-sm"><span className="text-blue-100">{item.description}</span><strong>{money(item.amountCents)}</strong></div>)}</div><p className="mt-6 rounded-lg bg-white/10 p-3 text-xs leading-5 text-blue-100">Pricing is based on submitted details and your account rules. Material changes discovered during verification require a revised quote before work advances.</p></> : <div className="mt-12 text-center"><DollarSign className="mx-auto size-10 text-cyan-300" /><p className="mt-4 font-bold">Complete the request, then preview pricing</p><p className="mt-2 text-sm leading-6 text-blue-100">The total appears here before anything is submitted.</p></div>}</aside></section></TabsContent>

        <TabsContent value="jobs" className="mt-5"><section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Jobs &amp; quotes</h2><p className="mt-1 text-sm text-slate-500">Your portal-originated service history and decisions.</p></div><Button onClick={() => setTab("request")} className="bg-cyan-700 hover:bg-cyan-800"><Plus />New request</Button></div><div className="mt-5 space-y-3">{data.jobs.map((job) => <article key={job.id} className="rounded-xl border p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{job.summary}</h3><Badge variant="outline">{label(job.status)}</Badge></div><p className="mt-1 text-xs text-slate-500">{job.requestNumber} · {job.locationName} · {label(job.serviceType)}</p></div><div className="flex flex-wrap items-center gap-3"><div className="text-right"><p className="text-lg font-black">{money(job.quoteTotalCents)}</p><p className="text-xs text-slate-500">{job.estimateNumber || "Pending quote"}</p></div>{job.quoteStatus === "presented" && <><Button variant="outline" onClick={() => post.mutate({ action: "quote_decision", estimateId: job.estimateId, decision: "declined" })}>Decline</Button><Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => post.mutate({ action: "quote_decision", estimateId: job.estimateId, decision: "accepted" })}><CheckCircle2 />Accept &amp; submit</Button></>}</div></div></article>)}{data.jobs.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No service requests have been submitted from this portal.</p>}</div></section></TabsContent>

          <TabsContent value="messages" className="mt-5"><section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Message TechFlex</h2><div className="mt-4 space-y-4"><div className="space-y-2"><Label>{data.identity.role === "client_location_user" ? "Related job" : "Related job (optional)"}</Label><Select value={message.workOrderId || "general"} onValueChange={(value) => setMessage({ ...message, workOrderId: value === "general" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.identity.role === "client_administrator" && <SelectItem value="general">General account message</SelectItem>}{data.jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.requestNumber} · {job.summary}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Subject</Label><Input value={message.subject} onChange={(e) => setMessage({ ...message, subject: e.target.value })} placeholder="Scheduling, authorization, documentation…" /></div><div className="space-y-2"><Label>Message</Label><Textarea rows={6} value={message.body} onChange={(e) => setMessage({ ...message, body: e.target.value })} /></div><Button className="w-full bg-cyan-700 hover:bg-cyan-800" onClick={() => post.mutate({ action: "send_message", ...message, workOrderId: message.workOrderId || null })} disabled={post.isPending}><Send />Send securely</Button></div></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Shared conversation</h2><div className="mt-4 space-y-3">{data.messages.map((item) => <article key={item.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold">{item.subject}</h3><p className="mt-1 text-xs text-slate-500">{item.senderName} · {new Date(item.createdAt).toLocaleString()}</p></div>{item.workOrderId && <Badge variant="outline">Job</Badge>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.body}</p></article>)}{data.messages.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No shared messages yet.</p>}</div></div></section></TabsContent>
      </Tabs>
    </main>
  </div>;
}
