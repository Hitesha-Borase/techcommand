"use client";

import {
  ArrowDownRight,
  ArrowUpLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const PLATFORM_TOUR_STEPS = [
  {
    module: "command",
    section: "Operate",
    title: "Command Center",
    detail: "Start with today’s workload, exceptions, routes, workforce readiness, money waiting on action, and the clearest next step.",
    points: ["Live operating totals", "Priority and data-quality queues", "Shortcuts into the work"],
  },
  {
    module: "command",
    target: "copilot",
    section: "Operate",
    title: "AI Copilot",
    detail: "Ask plain-language questions using only the records and guidance the signed-in role is allowed to see. Recommendations never silently change a record.",
    points: ["Screen-aware prompts", "Sources and cautions", "Human-reviewed next actions"],
  },
  {
    module: "work-orders",
    section: "Operate",
    title: "Work Orders",
    detail: "Create, review, price, assign, track, and complete every service request in one traceable record.",
    points: ["Manual and imported intake", "Required-information holds", "Status and service history"],
  },
  {
    module: "schedule",
    section: "Operate",
    title: "Schedule",
    detail: "Place qualified technicians on the right date and protect completed or otherwise locked work from accidental rescheduling.",
    points: ["Availability and crew needs", "Appointment timing", "Conflict-safe changes"],
  },
  {
    module: "dispatch",
    section: "Operate",
    title: "Dispatch & Routes",
    detail: "Build technician routes from the correct dispatch origin, keep every crew member synchronized, and surface travel gaps before departure.",
    points: ["Primary and support technicians", "Stops, miles, and drive time", "Safe reassignment"],
  },
  {
    module: "accounts",
    section: "CRM & Operations",
    title: "Accounts",
    detail: "Keep each manufacturer, retailer, facility, and direct account tied to its contract rules, billing terms, locations, and service history.",
    points: ["Contract and rate context", "Billing requirements", "Account-scoped records"],
  },
  {
    module: "customers",
    section: "CRM & Operations",
    title: "Customers",
    detail: "Find the service recipient and their work without turning the platform into a clinical chart. TechCommand remains intentionally non-PHI.",
    points: ["Contact and service context", "Work-order history", "Privacy-conscious boundaries"],
  },
  {
    module: "contacts",
    section: "CRM & Operations",
    title: "Contacts",
    detail: "Organize the people connected to accounts and locations so the right operational contact is easy to identify.",
    points: ["Account relationships", "Location relationships", "Clear communication ownership"],
  },
  {
    module: "partners",
    section: "CRM & Operations",
    title: "Partner Portal",
    detail: "Configure named partner access, allowed locations and actions, then give each partner a clean account-scoped experience.",
    points: ["Role and location boundaries", "Contract-limited actions", "No access to internal payroll or HR"],
  },
  {
    module: "locations",
    section: "CRM & Operations",
    title: "Locations",
    detail: "Maintain service sites, departments, access notes, assets, contacts, and history without confusing two locations that share a name.",
    points: ["Exact account references", "Department structure", "Site-level service history"],
  },
  {
    module: "support",
    section: "CRM & Operations",
    title: "Field Knowledge",
    detail: "Give technicians approved diagnostic guidance and manufacturer support paths while clearly flagging when an exact manual or bulletin is required.",
    points: ["Model and symptom guidance", "Evidence recommendations", "No invented procedures"],
  },
  {
    module: "assets",
    section: "Biomedical",
    title: "Biomedical Assets",
    detail: "Anchor serials, models, maintenance intervals, service records, documents, and compliance history to the equipment itself.",
    points: ["Asset identity", "Lifecycle history", "PM and safety context"],
  },
  {
    module: "pm",
    section: "Biomedical",
    title: "Biomedical PM",
    status: "planned",
    detail: "The architecture is reserved for risk-based preventive-maintenance schedules by contract, location, department, and asset. The full workspace is still planned.",
    points: ["Risk and interval scheduling", "Facility inventory", "Completion evidence"],
  },
  {
    module: "technicians",
    section: "Resources",
    title: "Technicians",
    detail: "Onboard technicians and contractors, review coverage and qualifications, manage files, and see compensation readiness without exposing private details broadly.",
    points: ["Skills, territory, and availability", "Credentials and employee files", "Assignments and payout readiness"],
  },
  {
    module: "parts",
    section: "Resources",
    title: "Parts & Inventory",
    status: "planned",
    detail: "The planned inventory workspace will connect stock, van inventory, shipments, RMAs, warranties, and installed parts to the work order.",
    points: ["Stock and van inventory", "Order and shipment trail", "Installed-part history"],
  },
  {
    module: "documents",
    section: "Resources",
    title: "Document Vault",
    detail: "Store operational and restricted employee documents with clear categories, access rules, expiration tracking, duplicate protection, and trash recovery.",
    points: ["Employee and technician files", "Job and account documents", "Restricted access and audit history"],
  },
  {
    module: "knowledge",
    section: "Resources",
    title: "Ask TechFlex",
    detail: "Search approved internal knowledge and support material so answers stay grounded in the company’s current operating guidance.",
    points: ["Approved knowledge", "Practical field answers", "Controlled guidance"],
  },
  {
    module: "finance",
    section: "Resources",
    title: "Estimates & Billing",
    detail: "Move accepted pricing through estimates, invoices, collections, and technician payouts without retyping the same work.",
    points: ["Pricing and margin gates", "Invoices and balances", "Approved payout trail"],
  },
  {
    module: "field-training",
    section: "Control",
    title: "Schools & Field Training",
    detail: "Coordinate school partnerships, supervised field learning, mentor observations, verified hours, and competency progress.",
    points: ["Student and school records", "Mentor verification", "Evidence-based progression"],
  },
  {
    module: "compliance",
    section: "Control",
    title: "Compliance & Audits",
    detail: "Review credentials, inspections, completion evidence, corrections, and signed audit history without rewriting prior decisions.",
    points: ["Actionable compliance queues", "Review and correction trail", "Immutable attribution"],
  },
  {
    module: "reports",
    section: "Control",
    title: "Reports",
    status: "planned",
    detail: "The planned reporting workspace will consolidate revenue, margin, utilization, SLAs, PM compliance, and technician performance.",
    points: ["Operational performance", "Financial health", "Compliance and concentration"],
  },
  {
    module: "automations",
    section: "Control",
    title: "Integrations & Automation",
    detail: "Plan each company connection in plain language, verify prerequisites, and distinguish a saved plan from a tested exchange.",
    points: ["Partner portal, API, webhook, or file path", "Visible failures and retry", "No fabricated provider approval"],
  },
  {
    module: "imports",
    section: "Control",
    title: "Imports & Sync",
    detail: "Bring in spreadsheets with downloadable templates, exact account and location references, row-level validation, and safe interruption recovery.",
    points: ["CSV and spreadsheet mapping", "Duplicate and ambiguity protection", "Resume without starting over"],
  },
  {
    module: "access",
    section: "Control",
    title: "Users & Access",
    detail: "Give each administrator, technician, partner, school coordinator, or auditor only the work their role requires.",
    points: ["Role-based modules", "Account and location scope", "Traceable access changes"],
  },
  {
    module: "settings",
    section: "Control",
    title: "System Settings",
    status: "planned",
    detail: "The planned settings workspace will centralize editable roles, service categories, rate cards, workflow rules, and document templates.",
    points: ["Configuration without code", "Controlled policy changes", "Versioned operating rules"],
  },
  {
    module: "demo",
    section: "Control",
    title: "Demo Center",
    detail: "Return here for the full platform tour, the shorter partner operating-model overview, and presentation materials that use fictional data.",
    points: ["Safe demonstration data", "Full tour and short overview", "No live customer screen sharing"],
  },
] as const;

export type PlatformTourStep = (typeof PLATFORM_TOUR_STEPS)[number];

export function PlatformTourGuide({
  index,
  onMove,
  onExit,
}: {
  index: number;
  onMove: (index: number) => void;
  onExit: () => void;
}) {
  const step = PLATFORM_TOUR_STEPS[index];
  const last = index === PLATFORM_TOUR_STEPS.length - 1;
  const pointsToCopilot = "target" in step && step.target === "copilot";
  return (
    <aside
      className={`fixed inset-x-3 z-50 mx-auto max-w-xl rounded-2xl border border-cyan-300 bg-[#071d31] text-white shadow-2xl shadow-slate-950/35 sm:inset-x-auto sm:left-[278px] sm:mx-0 sm:w-[min(520px,calc(100vw-320px))] ${pointsToCopilot ? "top-24 bottom-auto" : "bottom-3 sm:bottom-5"}`}
      aria-live="polite"
      aria-label="Full platform guided tour"
    >
      {pointsToCopilot ? (
        <ArrowDownRight className="absolute -bottom-7 right-5 size-9 text-cyan-400 drop-shadow" aria-hidden="true" />
      ) : (
        <ArrowUpLeft className="absolute -top-7 left-5 size-9 text-cyan-400 drop-shadow" aria-hidden="true" />
      )}
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">
            Full platform tour · {step.section}
          </p>
          <p className="mt-1 text-sm font-extrabold">
            {index + 1} of {PLATFORM_TOUR_STEPS.length} · {step.title}
          </p>
        </div>
        <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={onExit} aria-label="Exit full platform tour">
          <X />
        </Button>
      </div>
      <div className="px-4 py-4 sm:px-5">
        {"status" in step && step.status === "planned" ? (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-200">
            <CircleDashed className="size-3.5" /> Planned workspace
          </span>
        ) : (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
            <CheckCircle2 className="size-3.5" /> Available in the current platform
          </span>
        )}
        <p className="text-sm leading-6 text-slate-200">{step.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {step.points.map((point) => (
            <span key={point} className="rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
              {point}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <Progress value={((index + 1) / PLATFORM_TOUR_STEPS.length) * 100} className="bg-white/10" />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ChevronLeft /> Back
          </Button>
          {last ? (
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onExit}>
              <CheckCircle2 /> Finish tour
            </Button>
          ) : (
            <Button className="flex-1 bg-cyan-600 hover:bg-cyan-700" onClick={() => onMove(index + 1)}>
              Next workspace <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
