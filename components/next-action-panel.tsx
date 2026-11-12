"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orderHref, type OrderTarget } from "@/lib/order-navigation";

type Action = {
  id: string;
  title: string;
  detail: string;
  priority: "urgent" | "high" | "normal";
  module: string;
  actionLabel: string;
  dueAt: string | null;
  target?: OrderTarget;
};

type Payload = {
  primary: Action | null;
  actions: Action[];
  summary: { total: number; urgent: number; high: number };
  error?: string;
};

async function loadActions() {
  const response = await fetch("/api/next-actions", { cache: "no-store" });
  const data = (await response.json()) as Payload;
  if (!response.ok) throw new Error(data.error || "Next actions could not be loaded.");
  return data;
}

function dueLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: value.includes("T") ? "numeric" : undefined, minute: value.includes("T") ? "2-digit" : undefined }).format(date);
}

export function NextActionPanel({ onNavigate, compact = false }: { onNavigate: (module: string) => void; compact?: boolean }) {
  const query = useQuery({ queryKey: ["next-actions"], queryFn: loadActions, refetchInterval: 60_000, refetchOnWindowFocus: true });
  if (query.isLoading) return <div className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Prioritizing your next actions…</div>;
  if (query.error) return <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="flex items-center gap-2"><CircleAlert className="size-4" />{query.error.message}</span><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw />Retry</Button></div>;
  const data = query.data!;
  if (!data.primary) return <section className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><span className="grid size-10 place-items-center rounded-xl bg-white text-emerald-700"><CheckCircle2 /></span><div><p className="font-bold">You’re clear for now</p><p className="mt-0.5 text-sm text-emerald-800/80">No role-specific actions are currently waiting. The queue refreshes automatically.</p></div></section>;
  const primary = data.primary;
  function openAction(action: Action) {
    if (action.target) window.location.hash = orderHref(action.target).slice(1);
    else onNavigate(action.module);
  }
  const rest = data.actions.slice(1, compact ? 3 : 5);
  return <section className="overflow-hidden rounded-2xl border border-cyan-300/30 bg-[radial-gradient(circle_at_90%_0%,rgba(34,211,238,.2),transparent_20rem),linear-gradient(115deg,#061827,#0a2945_58%,#0b5366)] text-white shadow-lg shadow-slate-900/10">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-cyan-200"><Sparkles className="size-4" />Needs addressed</p><div className="flex gap-2"><Badge className="border-red-300/20 bg-red-400/15 text-red-100">{data.summary.urgent} urgent</Badge><Badge className="border-amber-300/20 bg-amber-400/15 text-amber-100">{data.summary.high} high</Badge></div></div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black sm:text-2xl">{primary.title}</h2>{primary.dueAt ? <Badge variant="outline" className="border-white/20 text-cyan-100">Due {dueLabel(primary.dueAt)}</Badge> : null}</div><p className="mt-2 text-sm leading-6 text-blue-100/80">{primary.detail}</p></div><Button onClick={() => openAction(primary)} className="shrink-0 bg-white text-slate-950 hover:bg-cyan-50">{primary.actionLabel}<ArrowRight /></Button></div>
    </div>
    {rest.length ? <div className="grid border-t border-white/10 bg-black/10 sm:grid-cols-2">{rest.map((action) => <button type="button" key={action.id} onClick={() => openAction(action)} className="flex items-center gap-3 border-b border-white/10 px-5 py-3 text-left transition hover:bg-white/5 sm:odd:border-r"><span className={`size-2 shrink-0 rounded-full ${action.priority === "urgent" ? "bg-red-400" : action.priority === "high" ? "bg-amber-300" : "bg-cyan-300"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{action.title}</span><span className="mt-0.5 block text-xs text-blue-100/60">{action.actionLabel}{action.dueAt ? ` · ${dueLabel(action.dueAt)}` : ""}</span></span><ArrowRight className="size-4 text-cyan-200/60" /></button>)}</div> : null}
  </section>;
}
