"use client";

import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDot,
  CloudCog,
  Database,
  FileCheck2,
  GraduationCap,
  Handshake,
  LockKeyhole,
  MapPinned,
  ReceiptText,
  RefreshCw,
  Route,
  ShieldCheck,
  Smartphone,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_BRAND } from "@/lib/platform-brand";

const workflow = [
  "Partner intake",
  "Margin-safe quote",
  "Dispatch",
  "Guided field work",
  "QA approval",
  "Invoice & payout",
  "Reconciliation",
];

const domains = [
  {
    title: "Accounts & service network",
    icon: Building2,
    detail: "Partner accounts, authorized contacts, locations, customer references, service rules, and account-level access boundaries.",
    records: ["Account", "Location", "Contact", "Customer reference"],
  },
  {
    title: "Work execution",
    icon: Wrench,
    detail: "Intake, estimates, assignments, routes, evidence, diagnostics, signatures, service reports, parts, and completion QA.",
    records: ["Work order", "Assignment", "Completion", "Attachment"],
  },
  {
    title: "Equipment intelligence",
    icon: Activity,
    detail: "Assets, manufacturer and model identity, serial history, PM schedules, visit history, procedures, and knowledge records.",
    records: ["Asset", "Asset visit", "PM schedule", "Procedure"],
  },
  {
    title: "Workforce development",
    icon: GraduationCap,
    detail: "Technician profiles, credentials, CEUs, guided training, competency scoring, pay progression, and verified mentorship outcomes.",
    records: ["Technician", "Credential", "Training attempt", "Compensation review"],
  },
  {
    title: "Financial control",
    icon: ReceiptText,
    detail: "Pricing policies, direct costs, 40% margin gates, estimates, invoices, payments, technician payouts, and weekly statements.",
    records: ["Pricing policy", "Invoice", "Payment", "Payout"],
  },
  {
    title: "Governance & integrations",
    icon: ShieldCheck,
    detail: "Role assignments, scoped partner access, audit history, durable sync outbox, imports, API credentials, and request logs.",
    records: ["Membership", "Audit event", "Sync event", "API request"],
  },
];

const capabilities = [
  ["Partner experience", Handshake, "Clients submit scoped requests, preview protected pricing, approve quotes, track jobs, and communicate without seeing internal economics."],
  ["Guided technician mode", Smartphone, "Mobile steps require equipment identity, job-specific evidence, diagnostics, service narrative, signature, and validation."],
  ["Dispatch intelligence", Route, "Crew requirements, conflicts, mileage, drive time, stop order, and technician-specific routes are persisted."],
  ["Offline resilience", CloudCog, "Draft reports and evidence queues recover locally during connectivity loss and replay safely after reconnection."],
  ["Training & progression", BookOpenCheck, "Knowledge checks, QA outcomes, CEU gates, competency scores, tenure, and mentorship support explainable advancement."],
  ["Financial closeout", FileCheck2, "QA approval creates service-report, invoice, payout, ledger, accounting, and customer follow-up events as one controlled transition."],
] as const;

const controls = [
  "Individual authenticated identities; no shared portal password",
  "Server-side role and account/location authorization",
  "Internal cost, margin, payroll, and employee files excluded from client responses",
  "Account-scoped partner API keys stored as hashes and shown only once",
  "Idempotency and audit records for machine-submitted work orders",
  "Non-PHI operating policy using work-order references instead of patient identity",
];

const launchGates = [
  "Complete a real end-to-end pilot work order",
  "Verify backup restoration and incident-response ownership",
  "Finish external security and dependency testing",
  "Activate production Google and QuickBooks credentials",
  "Complete device-level offline interruption testing",
  "Approve privacy, retention, terms, and partner data agreements",
];

export function ConsultantReviewPortal({ displayName }: { displayName: string }) {
  return (
    <main className="techcommand-canvas min-h-screen text-[#0a1b2f]">
      <header className="border-b border-white/10 bg-[#061827] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="techcommand-mark grid size-11 place-items-center rounded-[14px]">
              <Boxes className="size-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-extrabold tracking-tight">{PLATFORM_BRAND.name}</p>
                <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-black tracking-[.14em] text-cyan-200">{PLATFORM_BRAND.suffix}</span>
              </div>
              <p className="text-xs text-[#87a8c5]">by {PLATFORM_BRAND.publisher}</p>
            </div>
          </div>
          <div className="text-right">
            <Badge className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100">Read-only product review</Badge>
            <p className="mt-1 text-xs text-[#87a8c5]">Prepared for {displayName}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:px-8">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,.25),transparent_26rem),linear-gradient(115deg,#061827,#0a3150_62%,#07546b)] p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Operating-system review</p>
            <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-.04em] sm:text-5xl">One controlled path from service request to collected revenue.</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-blue-100">TechCommand OS connects partner intake, margin-protected pricing, dispatch, guided field execution, quality review, financial closeout, technician development, and integration events in one auditable system.</p>
          </div>
          <div className="grid gap-px bg-slate-200 md:grid-cols-3">
            {[
              ["Review scope", "Architecture + workflows", BriefcaseBusiness],
              ["Data exposure", "No production records", LockKeyhole],
              ["Operating policy", "Non-PHI by design", ShieldCheck],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Icon className="size-4 text-cyan-700" />{String(label)}</div>
                <p className="mt-2 font-bold text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><RefreshCw className="size-5" /></span>
            <div><h2 className="text-xl font-bold">Closed-loop operating workflow</h2><p className="mt-1 text-sm leading-6 text-slate-600">Each transition has its own validation, authorization, and audit boundary.</p></div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            {workflow.map((step, index) => (
              <div key={step} className="relative rounded-xl border bg-slate-50 p-4">
                <p className="text-xs font-black text-cyan-700">{String(index + 1).padStart(2, "0")}</p>
                <p className="mt-2 text-sm font-bold leading-5">{step}</p>
                {index < workflow.length - 1 ? <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden size-5 rounded-full border bg-white p-0.5 text-slate-400 xl:block" /> : null}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3"><Database className="size-5 text-cyan-700" /><div><h2 className="text-xl font-bold">Database architecture</h2><p className="mt-1 text-sm text-slate-600">The reviewer sees the model—not confidential rows.</p></div></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {domains.map((domain) => {
              const Icon = domain.icon;
              return <article key={domain.title} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Icon className="size-5" /></span><div><h3 className="font-bold">{domain.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{domain.detail}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{domain.records.map((record) => <Badge key={record} variant="outline" className="bg-slate-50 text-slate-600">{record}</Badge>)}</div></article>;
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3"><CircleDot className="size-5 text-cyan-700" /><div><h2 className="text-xl font-bold">Product capabilities</h2><p className="mt-1 text-sm text-slate-600">Implemented operating surfaces and their practical business value.</p></div></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map(([title, Icon, detail]) => <article key={title} className="rounded-2xl border bg-white p-5 shadow-sm"><Icon className="size-6 text-blue-700" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></article>)}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-emerald-700" /><h2 className="text-lg font-bold text-emerald-950">Security and governance controls</h2></div>
            <ul className="mt-4 space-y-3">{controls.map((control) => <li key={control} className="flex gap-3 text-sm leading-6 text-emerald-950"><CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-700" /><span>{control}</span></li>)}</ul>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="flex items-center gap-3"><MapPinned className="size-6 text-amber-700" /><h2 className="text-lg font-bold text-amber-950">Launch gates still requiring evidence</h2></div>
            <ul className="mt-4 space-y-3">{launchGates.map((gate) => <li key={gate} className="flex gap-3 text-sm leading-6 text-amber-950"><CircleDot className="mt-1 size-4 shrink-0 text-amber-700" /><span>{gate}</span></li>)}</ul>
          </article>
        </section>

        <section className="rounded-2xl border bg-[#071b2d] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Reviewer boundary</p><h2 className="mt-2 text-xl font-bold">This environment is intentionally read-only.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">It contains no client names, customer identity, work-order contents, technician pay, attachments, passwords, API tokens, or production database rows. Access can be revoked immediately by a TechFlex administrator.</p></div><LockKeyhole className="size-12 shrink-0 text-cyan-300" /></div>
        </section>
      </div>
    </main>
  );
}
