"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MonitorPlay,
  PackageCheck,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SpinLifeWorkflowDemo } from "@/components/spinlife-workflow-demo";

const tabs = [
  "Partner",
  "Work orders",
  "Assets",
  "Field workflow",
  "QA",
  "Billing",
  "Integrations",
] as const;
type Tab = (typeof tabs)[number];

const workOrders = [
  ["NSM-10482-2", "Power wheelchair repair", "Columbus", "QA review", "$785"],
  ["NSM-10477-1", "Lift installation", "Dayton", "Scheduled", "$1,140"],
  [
    "NSM-10469-3",
    "Diagnostic evaluation",
    "Cincinnati",
    "Quote approval",
    "$265",
  ],
  ["NSM-10451-1", "Preventive maintenance", "Toledo", "Completed", "$520"],
];

const storySteps: Array<{
  tab: Tab;
  eyebrow: string;
  title: string;
  narrative: string;
  proof: string;
}> = [
  {
    tab: "Partner",
    eyebrow: "1 · Secure entry",
    title: "One partnership, one protected workspace",
    narrative:
      "Northstar is fictional, but the boundary is real: named users see only their account, assigned locations, quotes, jobs, files, and messages.",
    proof:
      "Internal costs, payroll, HR, margins, and every other partner remain outside the client response.",
  },
  {
    tab: "Work orders",
    eyebrow: "2 · Controlled intake",
    title: "Every request becomes one traceable record",
    narrative:
      "Portal, API, and controlled imports all converge on the same validated work-order pipeline without bypassing pricing or documentation rules.",
    proof:
      "Duplicate requests use idempotency controls; incomplete records remain held instead of quietly advancing.",
  },
  {
    tab: "Work orders",
    eyebrow: "3 · Protected pricing",
    title: "The system prices the agreement—not somebody’s memory",
    narrative:
      "Account rules calculate service, travel, crew, stairs, parts, and direct cost before a quote can be accepted.",
    proof:
      "Any offer below the configured 40% gross-margin floor is held for a calculated counteroffer.",
  },
  {
    tab: "Field workflow",
    eyebrow: "4 · Guided execution",
    title: "A technician is shown the next required step",
    narrative:
      "Training Mode turns each assignment into short sections: identify, photograph, diagnose, perform, test, sign, and review.",
    proof:
      "Device autosave, offline recovery, required evidence, and knowledge checks reduce avoidable rework.",
  },
  {
    tab: "Assets",
    eyebrow: "5 · Permanent history",
    title: "The unit—not a patient—anchors the service record",
    narrative:
      "Work-order number, serial, model, photos, diagnostics, parts, and service history remain connected to the asset lifecycle.",
    proof:
      "The current system is intentionally non-PHI; patient names and clinical information are prohibited.",
  },
  {
    tab: "QA",
    eyebrow: "6 · Evidence gate",
    title: "Completion is reviewed before money records exist",
    narrative:
      "Administrative QA approves complete work, returns exact corrections, or places the record on hold for an external question.",
    proof:
      "Final approval rechecks documentation, technician attribution, and margin before closing the operational loop.",
  },
  {
    tab: "Billing",
    eyebrow: "7 · Financial closeout",
    title: "One approval creates the full financial trail",
    narrative:
      "Service report, invoice, technician payout, spreadsheet event, accounting event, and customer follow-up are committed together.",
    proof:
      "A failed connector cannot erase the transaction; the durable queue preserves it for visible retry.",
  },
  {
    tab: "Integrations",
    eyebrow: "8 · Partnership options",
    title: "Start simple, then automate without rebuilding",
    narrative:
      "A partner can begin with its secure portal, move through controlled file imports, and later adopt an account-scoped API.",
    proof:
      "The agreement controls permitted services, locations, communication, pricing, and data access at every maturity level.",
  },
];

function Tag({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DemoCenter({ onStartPlatformTour }: { onStartPlatformTour?: () => void }) {
  const [tab, setTab] = useState<Tab>("Partner");
  const [storyStep, setStoryStep] = useState<number | null>(null);
  const [spinLifeOpen, setSpinLifeOpen] = useState(false);
  const setStory = (index: number | null) => {
    setStoryStep(index);
    if (index !== null) setTab(storySteps[index].tab);
  };
  const story = storyStep === null ? null : storySteps[storyStep];
  const activeStoryStep = storyStep ?? 0;
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-[#061827] p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[.14em] text-cyan-200">
              <MonitorPlay className="size-4" /> DEMONSTRATION DATA ONLY
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
              Partner Demo Center
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              A safe, presentation-ready workspace showing how a fictional
              partner request moves through authorization, dispatch, field
              evidence, QA, billing, payment, and integration.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
            <ShieldCheck className="mb-2 size-5 text-cyan-300" />
            Isolated from the live operating database
            <br />
            No real customers, assets, invoices, or PHI
          </div>
        </div>
      </div>

      <SpinLifeWorkflowDemo open={spinLifeOpen} onOpenChange={setSpinLifeOpen} />

      {story ? (
        <section className="overflow-hidden rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-50 via-white to-cyan-50 shadow-lg">
          <div className="flex items-center justify-between border-b border-violet-100 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-violet-700">
              <Play className="size-4 fill-current" />
              Live Story Mode
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Exit story mode"
              onClick={() => setStory(null)}
            >
              <X />
            </Button>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_.75fr] lg:p-7">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-700">
                {story.eyebrow}
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">
                {story.title}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                {story.narrative}
              </p>
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                <b>Proof point:</b> {story.proof}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Presenter controls
              </p>
              <p className="mt-2 text-sm text-slate-600">
                The matching demonstration panel is open below. Use this script
                as your meeting narration.
              </p>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-500">
                  <span>Story progress</span>
                  <span>
                    {activeStoryStep + 1}/{storySteps.length}
                  </span>
                </div>
                <Progress value={((activeStoryStep + 1) / storySteps.length) * 100} />
              </div>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  disabled={activeStoryStep === 0}
                  onClick={() => setStory(Math.max(0, activeStoryStep - 1))}
                >
                  <ChevronLeft />
                  Back
                </Button>
                {activeStoryStep < storySteps.length - 1 ? (
                  <Button
                    className="flex-1"
                    onClick={() => setStory(activeStoryStep + 1)}
                  >
                    Next chapter
                    <ChevronRight />
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800"
                    onClick={() => setStory(0)}
                  >
                    <RotateCcw />
                    Restart
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-5">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-700">
              Complete software walkthrough
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Tour every TechCommand workspace
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A 26-stop guided tour moves through the actual platform, including
              Copilot, technicians, documents, schools, compliance, integrations,
              access, and every planned workspace.
            </p>
          </div>
          <Button
            className="self-start bg-cyan-700 hover:bg-cyan-800"
            onClick={onStartPlatformTour}
            disabled={!onStartPlatformTour}
          >
            <MonitorPlay />
            Start full platform tour
          </Button>
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-5">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">
              SpinLife-specific demonstration
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Follow a work order from intake to completed packet
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Choose a fictional diagnostic, repair, or white-glove job and
              follow extraction, 60% demo allocation, assignment, field work,
              QA, documents, and the simulated FaST return.
            </p>
          </div>
          <Button className="self-start bg-emerald-700 hover:bg-emerald-800" onClick={() => setSpinLifeOpen(true)}>
            <PackageCheck />
            Start SpinLife workflow
          </Button>
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-cyan-50 p-5">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">
              Short partner overview
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Present the TechCommand operating model in eight guided chapters
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This partner overview is not the full all-tab platform tour. Each
              chapter opens a fictional screen and explains one operating control.
            </p>
          </div>
          <Button
            className="self-start bg-violet-700 hover:bg-violet-800"
            onClick={() => setStory(0)}
          >
            <Play className="fill-current" />
            Start Story Mode
          </Button>
        </section>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <a
          href="/demo/TechCommand_Partner_Demonstration.pdf"
          download
          className="rounded-xl border bg-white p-4 transition hover:border-cyan-400 hover:shadow-md"
        >
          <FileText className="size-5 text-cyan-700" />
          <p className="mt-3 text-sm font-extrabold text-slate-900">
            Partner demonstration PDF
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Meeting-ready operating model, controls, billing, security, and
            pilot plan.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            <Download className="size-3.5" /> Download PDF
          </span>
        </a>
        <a
          href="/demo/TechCommand_Partner_Demonstration.pptx"
          download
          className="rounded-xl border bg-white p-4 transition hover:border-cyan-400 hover:shadow-md"
        >
          <BriefcaseBusiness className="size-5 text-cyan-700" />
          <p className="mt-3 text-sm font-extrabold text-slate-900">
            Editable partner presentation
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Twelve-slide PowerPoint for live partner and consultant meetings.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            <Download className="size-3.5" /> Download PowerPoint
          </span>
        </a>
        <a
          href="/demo/TechCommand_Video_Production_Kit.pdf"
          download
          className="rounded-xl border bg-white p-4 transition hover:border-cyan-400 hover:shadow-md"
        >
          <MonitorPlay className="size-5 text-cyan-700" />
          <p className="mt-3 text-sm font-extrabold text-slate-900">
            Video production kit
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Five timed scripts for partner, technician, operations, finance, and
            HR tours.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            <Download className="size-3.5" /> Download scripts
          </span>
        </a>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">
        {tabs.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={tab === item ? "default" : "ghost"}
            onClick={() => setTab(item)}
            className="shrink-0"
          >
            {item}
          </Button>
        ))}
      </div>

      {tab === "Partner" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Northstar Mobility Partners">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Fictional account
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              Regional service program
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>4 approved locations</p>
              <p>3 named partner users</p>
              <p>Net 30 billing</p>
              <p>Portal + controlled import</p>
            </div>
          </Card>
          <Card title="Contract configuration">
            <div className="space-y-3 text-sm">
              <p className="flex justify-between">
                <span>Repairs</span>
                <Tag tone="green">Allowed</Tag>
              </p>
              <p className="flex justify-between">
                <span>Installations</span>
                <Tag tone="green">Allowed</Tag>
              </p>
              <p className="flex justify-between">
                <span>Quote approval</span>
                <b>Required</b>
              </p>
              <p className="flex justify-between">
                <span>Required evidence</span>
                <b>Job-specific</b>
              </p>
              <p className="flex justify-between">
                <span>PHI</span>
                <Tag tone="red">Prohibited</Tag>
              </p>
            </div>
          </Card>
          <Card title="Account boundary">
            <div className="space-y-3 text-sm text-slate-600">
              <p>Partner users see only Northstar records.</p>
              <p>Optional location scope narrows access further.</p>
              <p>
                Internal costs, margin, payroll, HR, and other accounts are
                excluded.
              </p>
              <p>Every approval and message is attributed.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "Work orders" && (
        <Card title="Illustrative work-order pipeline">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  {["Work order", "Service", "Location", "Status", "Quote"].map(
                    (h) => (
                      <th key={h} className="border-b px-3 py-3">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {workOrders.map((row) => (
                  <tr key={row[0]} className="border-b last:border-0">
                    {row.map((v, i) => (
                      <td
                        key={v}
                        className={`px-3 py-4 ${i === 0 ? "font-bold text-slate-900" : "text-slate-600"}`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "Assets" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="DEMO-88214">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-slate-500">Equipment</dt>
              <dd className="font-bold">Powered wheelchair</dd>
              <dt className="text-slate-500">Manufacturer</dt>
              <dd className="font-bold">Apex Mobility (demo)</dd>
              <dt className="text-slate-500">Model</dt>
              <dd className="font-bold">AX-500</dd>
              <dt className="text-slate-500">Location</dt>
              <dd className="font-bold">Northstar - Columbus</dd>
              <dt className="text-slate-500">Next PM</dt>
              <dd className="font-bold">November 15</dd>
            </dl>
          </Card>
          <Card title="Linked asset history">
            <div className="space-y-3">
              {[
                "Original request and authorization",
                "Before, serial, condition, and after photos",
                "Diagnostic responses and parts",
                "Signed service report",
                "Invoice and payment status",
              ].map((x) => (
                <p
                  key={x}
                  className="flex items-center gap-2 text-sm text-slate-600"
                >
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {x}
                </p>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "Field workflow" && (
        <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <Card title="NSM-10482-2">
            <Tag tone="amber">Training Mode</Tag>
            <div className="mt-4 space-y-3">
              {[
                "Verify model and serial",
                "Capture required photos",
                "Complete diagnostics",
                "Record work and parts",
                "Capture signature",
                "Validate and submit",
              ].map((x, i) => (
                <div key={x} className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-full bg-cyan-50 text-xs font-black text-cyan-800">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {x}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Why the guided mode matters">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Explains each step",
                "Requests the right evidence",
                "Blocks incomplete submission",
                "Adds trainee knowledge checks",
                "Auto-saves drafts",
                "Builds competency from QA",
              ].map((x) => (
                <div
                  key={x}
                  className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700"
                >
                  <Wrench className="mb-2 size-4 text-cyan-700" />
                  {x}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "QA" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Administrative QA decision">
            <div className="space-y-3">
              {[
                "Serial photo",
                "Diagnostic answers",
                "Technician narrative",
                "Customer signature",
              ].map((x) => (
                <p
                  key={x}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{x}</span>
                  <Tag tone="green">Complete</Tag>
                </p>
              ))}
              <p className="flex items-center justify-between text-sm">
                <span>Margin recheck</span>
                <Tag tone="green">42.3%</Tag>
              </p>
            </div>
          </Card>
          <Card title="Available decisions">
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                <b className="text-emerald-700">Approve</b> - generate documents
                and financial records.
              </p>
              <p>
                <b className="text-amber-700">Return</b> - specify the exact
                correction required.
              </p>
              <p>
                <b className="text-blue-700">Hold</b> - preserve the submission
                while an external question is resolved.
              </p>
              <p>All decisions preserve user and time attribution.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "Billing" && (
        <Card title="Illustrative accounts receivable">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="border-b p-3">Invoice</th>
                  <th className="border-b p-3">Work order</th>
                  <th className="border-b p-3">Amount</th>
                  <th className="border-b p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3 font-bold">INV-10482-2</td>
                  <td className="p-3">NSM-10482-2</td>
                  <td className="p-3">$785</td>
                  <td className="p-3">
                    <Tag>Due in 18 days</Tag>
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-bold">INV-10471-1</td>
                  <td className="p-3">NSM-10471-1</td>
                  <td className="p-3">$1,240</td>
                  <td className="p-3">
                    <Tag tone="green">Paid</Tag>
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-bold">INV-10433-4</td>
                  <td className="p-3">NSM-10433-4</td>
                  <td className="p-3">$2,835</td>
                  <td className="p-3">
                    <Tag tone="red">12 days overdue</Tag>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Approval creates the report, invoice, payout, ledger event, and
              accounting event together. Connector failures remain visible and
              retryable.
            </p>
          </div>
        </Card>
      )}

      {tab === "Integrations" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Partner portal">
            <p className="text-sm leading-6 text-slate-600">
              Named users submit, approve, message, and download account-scoped
              records. Best for launch.
            </p>
          </Card>
          <Card title="Controlled import">
            <p className="text-sm leading-6 text-slate-600">
              Partner files enter a validation queue before release. Best for
              transitional workflows.
            </p>
          </Card>
          <Card title="Account-scoped API">
            <p className="text-sm leading-6 text-slate-600">
              Revocable credentials, idempotent requests, audit logs, and
              contract-limited actions. Best for mature integration.
            </p>
          </Card>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <b>Presentation rule:</b> Use this Demo Center for meetings and
        recordings. Do not screen-share the live operational modules unless the
        partner is authorized and the visible records have been reviewed.
      </div>
    </div>
  );
}
