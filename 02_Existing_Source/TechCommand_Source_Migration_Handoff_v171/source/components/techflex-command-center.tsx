"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { portalIdentityQuery } from "@/lib/portal-identity-client";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircuitBoard,
  ClipboardList,
  Cloud,
  HardHat,
  Handshake,
  ContactRound,
  LayoutDashboard,
  MapPin,
  Menu,
  MonitorPlay,
  Package,
  FolderLock,
  ReceiptText,
  Route,
  Search,
  Settings2,
  Stethoscope,
  GraduationCap,
  ShieldCheck,
  Workflow,
  UploadCloud,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { AdministratorOnboarding } from "@/components/administrator-onboarding";
import { BidIntelligenceWorkspace } from "@/components/bid-intelligence-workspace";
const ControlTower = lazy(() => import("@/components/control-tower").then(m => ({default:m.ControlTower})));
import { OperationsCopilot } from "@/components/operations-copilot";
import { PLATFORM_TOUR_STEPS, PlatformTourGuide } from "@/components/platform-tour-guide";
import { PLATFORM_BRAND } from "@/lib/platform-brand";
import { getDashboardFromRole, getRoutePath, resolveRoute, type DashboardKey, type ModuleKey } from "@/lib/portal-routes";
import { captureOperationalEvent, identifyPortalUser } from "@/lib/analytics-client";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { ProblemReporter } from "@/components/problem-reporter";
const ProblemReportCenter = lazy(() => import("@/components/problem-report-center").then(m => ({default:m.ProblemReportCenter})));
const SpinLifePortal = lazy(() => import("@/components/spinlife-portal").then(m => ({default:m.SpinLifePortal})));
const AcademyHub = lazy(() => import("@/components/biomedical-academy").then(m => ({default:m.AcademyHub})));
import type {AcademyTrack} from "@/lib/academy-catalog";
import { orderTargetFromHash, type OrderTarget } from "@/lib/order-navigation";

const FieldTrainingCenter = lazy(() => import("@/components/field-training-center").then(module => ({default: module.FieldTrainingCenter})));
const ComplianceCenter = lazy(() => import("@/components/compliance-center").then(module => ({default: module.ComplianceCenter})));

const AccountCrm = lazy(() =>
  import("@/components/account-crm").then((module) => ({
    default: module.AccountCrm,
  })),
);
const ImportCenter = lazy(() =>
  import("@/components/import-center").then((module) => ({
    default: module.ImportCenter,
  })),
);
const OperationsCenter = lazy(() =>
  import("@/components/operations-center").then((module) => ({
    default: module.OperationsCenter,
  })),
);
const IntegrationAutomationStudio = lazy(() =>
  import("@/components/integration-automation-studio").then((module) => ({
    default: module.IntegrationAutomationStudio,
  })),
);
const TechnicianAdmin = lazy(() =>
  import("@/components/technician-experience").then((module) => ({
    default: module.TechnicianAdmin,
  })),
);
const CompensationProgressCenter = lazy(() =>
  import("@/components/compensation-progress-center").then((module) => ({
    default: module.CompensationProgressCenter,
  })),
);
const TechnicianPortal = lazy(() =>
  import("@/components/technician-field-portal").then((module) => ({
    default: module.TechnicianFieldPortal,
  })),
);
const WorkOrderCenter = lazy(() =>
  import("@/components/work-order-center").then((module) => ({
    default: module.WorkOrderCenter,
  })),
);
const BiomedicalPmReports = lazy(() => import("@/components/biomedical-pm-directory").then(m => ({ default: m.BiomedicalPmDirectory })));
const BiomedicalAssets = lazy(() =>
  import("@/components/biomedical-assets").then((module) => ({
    default: module.BiomedicalAssets,
  })),
);
const BiomedicalAccounts = lazy(() => import("@/components/biomedical-pm-directory").then(module => ({default: module.BiomedicalPmDirectory})));
const FinanceCenter = lazy(() =>
  import("@/components/finance-center").then((module) => ({
    default: module.FinanceCenter,
  })),
);
const EquipmentSupportCenter = lazy(() =>
  import("@/components/equipment-support-center").then((module) => ({
    default: module.EquipmentSupportCenter,
  })),
);
const CustomerCenter = lazy(() =>
  import("@/components/customer-center").then((module) => ({
    default: module.CustomerCenter,
  })),
);
const DocumentCenter = lazy(() =>
  import("@/components/document-center").then((module) => ({
    default: module.DocumentCenter,
  })),
);
const KnowledgeCenter = lazy(() =>
  import("@/components/knowledge-center").then((module) => ({
    default: module.KnowledgeCenter,
  })),
);
const ContactCenter = lazy(() =>
  import("@/components/contact-center").then((module) => ({
    default: module.ContactCenter,
  })),
);
const DispatchCenter = lazy(() =>
  import("@/components/dispatch-center").then((module) => ({
    default: module.DispatchCenter,
  })),
);
const AccessCenter = lazy(() =>
  import("@/components/access-center").then((module) => ({
    default: module.AccessCenter,
  })),
);
const PartsInventoryCenter = lazy(() =>
  import("@/components/parts-inventory-center").then((module) => ({
    default: module.PartsInventoryCenter,
  })),
);
const OperationsReportsCenter = lazy(() =>
  import("@/components/operations-reports-center").then((module) => ({
    default: module.OperationsReportsCenter,
  })),
);
const SystemSettingsCenter = lazy(() =>
  import("@/components/system-settings-center").then((module) => ({
    default: module.SystemSettingsCenter,
  })),
);
const PartnerAccessCenter = lazy(() =>
  import("@/components/partner-access-center").then((module) => ({
    default: module.PartnerAccessCenter,
  })),
);
const ClientPartnerPortal = lazy(() =>
  import("@/components/client-partner-portal").then((module) => ({
    default: module.ClientPartnerPortal,
  })),
);
const ConsultantReviewPortal = lazy(() =>
  import("@/components/consultant-review-portal").then((module) => ({
    default: module.ConsultantReviewPortal,
  })),
);
const DemoCenter = lazy(() =>
  import("@/components/demo-center").then((module) => ({
    default: module.DemoCenter,
  })),
);

type NavItem = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {label: "DME & Mobility", items: [{key: "spinlife", label: "SpinLife Work Portal", icon: ClipboardList}]},
  {
    label: "Operate",
    items: [
      { key: "command", label: "Command Center", icon: LayoutDashboard },
      {
        key: "work-orders",
        label: "Work Orders",
        icon: ClipboardList,
      },
      { key: "schedule", label: "Schedule", icon: CalendarDays },
      { key: "dispatch", label: "Dispatch & Routes", icon: Route },
    ],
  },
  {
    label: "CRM & Operations",
    items: [
      { key: "accounts", label: "Accounts", icon: Building2 },
      { key: "customers", label: "Customers", icon: ContactRound },
      { key: "contacts", label: "Contacts", icon: ContactRound },
      { key: "partners", label: "Partner Portal", icon: Handshake },
      { key: "locations", label: "Locations", icon: MapPin },
      { key: "support", label: "Field Knowledge", icon: Stethoscope },
    ],
  },
  {
    label: "Biomedical/PM",
    items: [
      { key: "biomedical-accounts", label: "Biomedical/PM Accounts", icon: Building2 },
      { key: "assets", label: "Biomedical Assets", icon: Activity },
      { key: "pm", label: "Biomedical PM", icon: CalendarClock, badge: "Accounts" },
    ],
  },
  {
    label: "Resources",
    items: [
      { key: "technicians", label: "Technicians", icon: HardHat },
      { key: "parts", label: "Parts & Inventory", icon: Package },
      { key: "documents", label: "Document Vault", icon: FolderLock },
      { key: "knowledge", label: "Ask TechFlex", icon: BookOpenCheck },
      { key: "finance", label: "Estimates & Billing", icon: ReceiptText },
    ],
  },
  {
    label: "Control",
    items: [
      { key: "academy", label: "Tech Command Academy", icon: GraduationCap },
      { key: "field-training", label: "Schools & Field Training", icon: GraduationCap },
      { key: "compliance", label: "Compliance & Audits", icon: ShieldCheck },
      { key: "reports", label: "Reports", icon: BarChart3 },
      { key: "automations", label: "Integrations & Automation", icon: Workflow },
      { key: "imports", label: "Imports & Sync", icon: UploadCloud },
      { key: "access", label: "Users & Access", icon: UsersRound },
      { key: "demo", label: "Demo Center", icon: MonitorPlay },
      { key: "settings", label: "System Settings", icon: Settings2 },
    ],
  },
];

const moduleNames = Object.fromEntries(
  navGroups.flatMap((group) =>
    group.items.map((item) => [item.key, item.label]),
  ),
) as Record<ModuleKey, string>;

const roleModules: Partial<Record<string, ModuleKey[]>> = {
  dispatcher: ["biomedical-accounts", "spinlife", "command", "work-orders", "schedule", "dispatch", "accounts", "customers", "contacts", "locations", "support", "documents", "knowledge", "automations"],
  biomedical_lead: ["academy", "biomedical-accounts", "spinlife", "field-training", "command", "work-orders", "schedule", "dispatch", "accounts", "customers", "contacts", "locations", "assets", "support", "pm", "documents", "knowledge"],
  finance: ["biomedical-accounts", "command", "accounts", "customers", "contacts", "locations", "finance", "reports", "automations", "imports", "documents", "knowledge"],
};

function allowedModulesForRole(role: string | undefined) {
  return new Set(roleModules[role || ""] || navGroups.flatMap((group) => group.items.map((item) => item.key)));
}

function ModuleLoading() {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-xl border bg-white text-sm font-semibold text-slate-500">
      <span className="flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-cyan-600" />
        Loading this workspace…
      </span>
    </div>
  );
}

function Sidebar({
  active,
  onSelect,
  allowedModules,
}: {
  active: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  allowedModules: Set<ModuleKey>;
}) {
  return (
    <div className="techcommand-sidebar flex h-full flex-col text-[#dceaf7]">
      <div className="flex min-h-[92px] items-center gap-3 border-b border-white/10 px-5">
        <div className="techcommand-mark grid size-11 shrink-0 place-items-center rounded-[14px] text-white">
          <CircuitBoard className="size-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[18px] font-extrabold tracking-[-0.035em] text-white">
              {PLATFORM_BRAND.name}
            </p>
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[9px] font-black tracking-[0.15em] text-cyan-200">
              {PLATFORM_BRAND.suffix}
            </span>
          </div>
          <p className="mt-1 truncate text-[10px] font-semibold tracking-[0.055em] text-[#87a8c5]">
            by {PLATFORM_BRAND.publisher}
          </p>
        </div>
      </div>
      <nav
        className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5"
        aria-label="Main navigation"
      >
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6995ad]">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.filter((item) => allowedModules.has(item.key)).map((item) => {
                const Icon = item.icon;
                const selected = active === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-all ${selected ? "bg-gradient-to-r from-cyan-400/20 to-blue-500/15 text-white shadow-[inset_3px_0_0_#35c5dc,0_10px_24px_rgba(0,0,0,.12)]" : "text-[#afc5d9] hover:bg-white/[0.055] hover:text-white"}`}
                  >
                    <Icon
                      className={`size-[17px] ${selected ? "text-cyan-300" : "text-[#6f94ad]"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold text-[#b8cedf]">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#d4e5f2]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-cyan-300" />
            </span>
            Secure workspace online
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[#7899af]">
            {PLATFORM_BRAND.descriptor}
          </p>
        </div>
      </div>
    </div>
  );
}

function FoundationView({ module }: { module: ModuleKey }) {
  const descriptions: Partial<Record<ModuleKey, string>> = {
    accounts:
      "Manufacturers, retailers, facilities, direct customers, contracts, rate cards, billing terms, and contacts.",
    locations:
      "Every service site with departments, access instructions, assets, contacts, SLAs, and complete service history.",
    pm: "Preventive maintenance scheduled by risk class, interval, contract, location, department, and individual asset.",
    technicians:
      "Coverage territories, skills, credentials, availability, assignments, performance, documents, and payouts.",
    parts:
      "Stock, van inventory, purchase orders, shipments, RMAs, warranties, and parts installed on every job.",
    finance:
      "Approved pricing becomes estimates, invoices, account statements, and technician payouts without re-entry.",
    "field-training": "School partnerships, supervised field learning, and verified student progress.",
    academy: "Independent Biomedical and DME career tracks, verified training and equipment-specific competency.",
    compliance:
      "Inspections, required evidence, QA reviews, credentials, recalls, and immutable audit history.",
    reports:
      "Revenue, margin, utilization, SLAs, PM compliance, technician performance, and account concentration.",
    automations:
      "Assignments, reminders, escalations, documents, pricing, invoicing, and client updates from workflow events.",
    imports:
      "Controlled Excel, CSV, Google Sheets, and accounting imports with mapping, exception handling, and audit history.",
    settings:
      "Roles, permissions, service categories, rate cards, status rules, integrations, templates, and editable logic.",
  };
  return (
    <article className="rounded-xl border bg-white p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-700">
        <Workflow className="size-6" />
      </span>
      <h2 className="mt-5 text-xl font-bold text-slate-900">
        {moduleNames[module]}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {descriptions[module]}
      </p>
      <div className="mt-6 max-w-2xl rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        <strong>Framework connected.</strong> This module already has a place in
        the permission model, audit trail, and permanent data architecture. Its
        full workflow comes online in the sequenced build.
      </div>
    </article>
  );
}

export function TechFlexCommandCenter({
  displayName = "",
  email = "",
  todayLabel = "",
  initialPath,
  initialRole,
}: {
  displayName: string;
  email: string;
  todayLabel: string;
  initialPath?: string;
  initialRole?: string;
}) {
  const queryClient = useQueryClient();
  const session = useQuery(portalIdentityQuery);
  const activeRole = session.data?.role || initialRole;
  const initialResolution = typeof window !== "undefined"
    ? resolveRoute(window.location.pathname, activeRole)
    : (initialPath ? resolveRoute(initialPath, activeRole) : resolveRoute(`/${getDashboardFromRole(activeRole)}/command-center`, activeRole));

  const [active, setActive] = useState<ModuleKey>(initialResolution.module);
  const [showOtherAssignments, setShowOtherAssignments] = useState<boolean|null>(
    initialResolution.technicianView === "field" ? true : null
  );
  const [showCareer, setShowCareer] = useState(initialResolution.technicianView === "career");
  const [experience, setExperience] = useState<"admin" | "technician">(
    initialResolution.dashboard === "technician" ? "technician" : "admin"
  );
  const [intakeImportType, setIntakeImportType] = useState<"accounts" | "assets">("accounts");
  const [financeStartTab, setFinanceStartTab] = useState("closeout");
  const [serviceAssetId, setServiceAssetId] = useState("");
  const [recordTarget, setRecordTarget] = useState<OrderTarget | null>(null);
  const [spinlifeRecordId, setSpinlifeRecordId] = useState("");
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [platformTourStep, setPlatformTourStep] = useState<number | null>(null);
  const allowedModules = allowedModulesForRole(session.data?.role);

  function selectModule(key: ModuleKey) {
    if (!allowedModules.has(key)) {
      toast.error("That section is not available for your role.");
      return;
    }
    captureOperationalEvent("portal_module_viewed", {
      module: key,
      role: session.data?.role || "unknown",
      experience,
    });
    setActive(key);
    setRecordTarget(null);
    setSpinlifeRecordId("");

    // Synchronize browser URL to clean route matching user dashboard & menu name
    const targetDashboard = experience === "technician" ? "technician" : getDashboardFromRole(session.data?.role);
    const targetPath = getRoutePath(targetDashboard, key);
    if (typeof window !== "undefined" && window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }

    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setMobileOpen(false);
    setSearch("");
    if (platformTourStep !== null) setPlatformTourStep(null);
  }

  // Handle browser Back / Forward (popstate)
  useEffect(() => {
    function handlePopState() {
      const res = resolveRoute(window.location.pathname, session.data?.role);
      if (res.dashboard === "technician") {
        setExperience("technician");
        if (res.technicianView === "field") {
          setShowOtherAssignments(true);
          setShowCareer(false);
        } else if (res.technicianView === "career") {
          setShowCareer(true);
        } else {
          setShowOtherAssignments(false);
          setShowCareer(false);
        }
      } else {
        setExperience("admin");
        setShowCareer(false);
        if (allowedModules.has(res.module)) {
          setActive(res.module);
        }
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allowedModules, session.data?.role]);

  // Synchronize URL on first mount or when session role arrives
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      const roleDashboard = experience === "technician" ? "technician" : getDashboardFromRole(session.data?.role);
      if (currentPath === "/" || currentPath === "") {
        const canonical = getRoutePath(roleDashboard, active);
        window.history.replaceState(null, "", canonical);
      } else if (session.data?.role) {
        // If current pathname doesn't match user's role dashboard (e.g. /admin/customers when logged in as finance)
        const res = resolveRoute(currentPath, session.data.role);
        if (res.dashboard !== roleDashboard && (res.dashboard === "admin" || !currentPath.startsWith(`/${roleDashboard}`))) {
          const corrected = getRoutePath(roleDashboard, res.module);
          window.history.replaceState(null, "", corrected);
        }
      }
    }
  }, [session.data?.role, active, experience]);

  useEffect(() => {
    if (!session.data) return;
    const role = session.data.role;
    function openSavedRecord() {
      if (window.location.hash === "#pm" && allowedModulesForRole(role).has("pm")) { setActive("pm"); setMobileOpen(false); return; }
      const target = orderTargetFromHash(window.location.hash);
      if (!target) return;
      if (role === "technician" && target.kind === "intake") {
        setSpinlifeRecordId(target.id); setShowOtherAssignments(false); return;
      }
      if (!allowedModulesForRole(role).has("work-orders")) return;
      setRecordTarget(target); setSpinlifeRecordId(""); setActive("work-orders"); setMobileOpen(false);
    }
    openSavedRecord();
    window.addEventListener("hashchange", openSavedRecord);
    return () => window.removeEventListener("hashchange", openSavedRecord);
  }, [session.data?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  function movePlatformTour(index: number) {
    const step = PLATFORM_TOUR_STEPS[index];
    if (!step || !allowedModules.has(step.module as ModuleKey)) {
      toast.error("That tour workspace is not available for this role.");
      return;
    }
    setPlatformTourStep(index);
    setActive(step.module as ModuleKey);
    setMobileOpen(false);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    captureOperationalEvent("platform_tour_step_viewed", {
      step: index + 1,
      module: step.module,
      role: session.data?.role || "unknown",
    });
  }

  useEffect(() => {
    if (!session.data) return;
    identifyPortalUser(session.data.userId, session.data.role);
    captureOperationalEvent("portal_module_viewed", {
      module: session.data.role === "technician" ? "technician" : "command",
      role: session.data.role,
      experience: session.data.role === "technician" ? "technician" : "admin",
    });
  }, [session.data]);

  let content: ReactNode;
  if (active === "command")
    content = (
      <div className="space-y-6">
        <ControlTower
          search={search}
          onNavigate={(module) => selectModule(module as ModuleKey)}
        />
        {session.data?.role === "owner_administrator" || session.data?.role === "operations_administrator" ? <ProblemReportCenter /> : null}
      </div>
    );
  else if (active === "spinlife") content = <SpinLifePortal key={`${session.data?.userId}:${spinlifeRecordId}`} userId={session.data?.userId || ""} initialJobId={spinlifeRecordId} />;
  else if (active === "work-orders") content = <WorkOrderCenter initialTarget={recordTarget} onOpenSpinLife={id=>{setSpinlifeRecordId(id);setRecordTarget(null);setActive("spinlife");}} initialAssetId={serviceAssetId} onAssetLoaded={() => setServiceAssetId("")} />;
  else if (active === "schedule") content = <DispatchCenter mode="schedule" />;
  else if (active === "dispatch") content = <DispatchCenter mode="routes" />;
  else if (active === "accounts") content = <AccountCrm mode="accounts" />;
  else if (active === "customers") content = <CustomerCenter />;
  else if (active === "contacts") content = <ContactCenter />;
  else if (active === "partners") content = <PartnerAccessCenter />;
  else if (active === "locations") content = <AccountCrm mode="locations" />;
  else if (active === "biomedical-accounts") content = <BiomedicalAccounts onPlanAsset={["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead"].includes(session.data?.role || "") ? assetId => {setServiceAssetId(assetId); selectModule("work-orders");} : undefined} />;
  else if (active === "assets") content = <BiomedicalAssets role={session.data?.role || ""} onPlanAsset={["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead"].includes(session.data?.role || "") ? assetId => {setServiceAssetId(assetId); selectModule("work-orders");} : undefined} />;
  else if (active === "pm") content = <BiomedicalPmReports />;
  else if (active === "support") content = <EquipmentSupportCenter />;
  else if (active === "technicians")
    content = (
      <div className="space-y-5">
        <CompensationProgressCenter />
        <TechnicianAdmin />
      </div>
    );
  else if (active === "parts") content = <PartsInventoryCenter />;
  else if (active === "reports") content = <OperationsReportsCenter />;
  else if (active === "settings") content = <SystemSettingsCenter />;
  else if (active === "finance") content = <FinanceCenter initialTab={financeStartTab} role={session.data?.role || ""} />;
  else if (active === "field-training") content = <FieldTrainingCenter />;
  else if (active === "academy") content = <AcademyHub tracks={session.data?.role==="biomedical_lead"?["biomedical"]:["biomedical","dme_mobility"]}/>;
  else if (active === "compliance") content = <ComplianceCenter onNavigate={module => selectModule(module as ModuleKey)} />;
  else if (active === "automations")
    content = (
      <div className="space-y-6">
        <IntegrationAutomationStudio onNavigate={(module) => selectModule(module as ModuleKey)} />
        <OperationsCenter />
      </div>
    );
  else if (active === "imports") content = <ImportCenter role={session.data?.role || ""} userId={session.data?.userId || "unknown"} initialType={intakeImportType} onOpenAssets={allowedModules.has("assets") ? () => selectModule("assets") : undefined} />;
  else if (active === "documents") content = <DocumentCenter role={session.data?.role || ""} />;
  else if (active === "knowledge") content = <KnowledgeCenter />;
  else if (active === "access") content = <AccessCenter />;
  else if (active === "demo") content = <DemoCenter onStartPlatformTour={() => movePlatformTour(0)} />;
  else content = <FoundationView module={active} />;

  const initials = (displayName || identity?.displayName || "TC")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "TC";
  if (session.isLoading)
    return (
      <div className="techcommand-canvas grid min-h-screen place-items-center p-6 text-center text-sm font-semibold text-slate-600">
        Verifying your {PLATFORM_BRAND.name} role…
      </div>
    );
  if (session.error)
    return (
      <div className="techcommand-canvas grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto size-8 text-blue-700" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">
            {PLATFORM_BRAND.name} access required
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {session.error.message}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3"><Button onClick={() => void session.refetch()}>Try again</Button><a className="rounded-lg border px-4 py-2 font-semibold text-blue-700" href="/login">Sign in</a></div>
        </div>
      </div>
    );
  if (!session.data)
    return (
      <div className="techcommand-canvas grid min-h-screen place-items-center p-6 text-center text-sm font-semibold text-slate-600">
        Portal identity was not available. Refresh this page to check access again.
      </div>
    );
  const identity = session.data;
  const actualRole = identity.role;
  const roleLabel = identity.email === "fboyer@ahcc.com" ? "Compliance Administrator" : actualRole
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (actualRole === "school_coordinator") return <><main className="mx-auto max-w-7xl p-4 sm:p-8"><Suspense fallback={<ModuleLoading />}><FieldTrainingCenter /></Suspense></main><ProblemReporter module="Schools & Field Training" reporterId={identity.userId} /></>;
  if (actualRole === "technician")
    return (
      <><Suspense fallback={<ModuleLoading />}>
        {showCareer?<main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8"><Button variant="outline" onClick={()=>{setShowCareer(false); if (typeof window!=="undefined") window.history.pushState(null,"","/technician/spinlife-work-portal");}}>Back to my jobs</Button><AcademyHub tracks={identity.serviceDisciplines.filter((t):t is AcademyTrack=>t==="biomedical"||t==="dme_mobility")}/></main>:(showOtherAssignments ?? !spinlifeRecordId)?<><TechnicianPortal displayName={identity.displayName} userId={identity.userId} onDmeWork={()=>{setShowOtherAssignments(false); if (typeof window!=="undefined") window.history.pushState(null,"","/technician/spinlife-work-portal");}} /></>:<SpinLifePortal key={`${identity.userId}:${spinlifeRecordId}`} userId={identity.userId} initialJobId={spinlifeRecordId} technician onCareer={()=>{setShowCareer(true); if (typeof window!=="undefined") window.history.pushState(null,"","/technician/career-academy");}} onOtherWork={()=>{setShowOtherAssignments(true); if (typeof window!=="undefined") window.history.pushState(null,"","/technician/field-portal");}} />}
      </Suspense><OperationsCopilot module="technician" /><ProblemReporter module="Technician Portal" reporterId={identity.userId} /></>
    );
  if (
    actualRole === "client_administrator" ||
    actualRole === "client_location_user"
  )
    return (
      <><Suspense fallback={<ModuleLoading />}>
        <ClientPartnerPortal displayName={identity.displayName} />
      </Suspense><ProblemReporter module="Partner Portal" reporterId={identity.userId} /></>
    );
  if (actualRole === "auditor")
    return (
      <><Suspense fallback={<ModuleLoading />}>
        <ConsultantReviewPortal displayName={identity.displayName} />
      </Suspense><ProblemReporter module="Consultant Review" reporterId={identity.userId} /></>
    );
  if (experience === "technician")
    return (
      <><Suspense fallback={<ModuleLoading />}>
        {showOtherAssignments ? (
          <TechnicianPortal
            displayName={displayName}
            userId={identity.userId}
            onDmeWork={() => {
              setShowOtherAssignments(false);
              if (typeof window !== "undefined") window.history.pushState(null, "", "/technician/spinlife-work-portal");
            }}
            onExit={() => {
              captureOperationalEvent("portal_experience_changed", {
                role: identity.role,
                experience: "admin",
              });
              setExperience("admin");
              if (typeof window !== "undefined") window.history.pushState(null, "", getRoutePath("admin", active));
            }}
          />
        ) : (
          <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">Technician Preview</span>
                <span className="text-sm font-semibold text-slate-800">DME / Mobility · SpinLife work orders</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  setShowOtherAssignments(true);
                  if (typeof window !== "undefined") window.history.pushState(null, "", "/technician/field-portal");
                }}>Other assignments &amp; routes</Button>
                <Button size="sm" onClick={() => {
                  captureOperationalEvent("portal_experience_changed", {
                    role: identity.role,
                    experience: "admin",
                  });
                  setExperience("admin");
                  if (typeof window !== "undefined") window.history.pushState(null, "", getRoutePath(getDashboardFromRole(identity.role), active));
                }}>Return to admin</Button>
              </div>
            </header>
            <SpinLifePortal
              key={`${identity.userId}:${spinlifeRecordId}:preview`}
              userId={identity.userId}
              initialJobId={spinlifeRecordId}
              technician
              onCareer={() => {
                setShowCareer(true);
                if (typeof window !== "undefined") window.history.pushState(null, "", "/technician/career-academy");
              }}
              onOtherWork={() => {
                setShowOtherAssignments(true);
                if (typeof window !== "undefined") window.history.pushState(null, "", "/technician/field-portal");
              }}
            />
          </div>
        )}
      </Suspense><OperationsCopilot module="technician" /><ProblemReporter module="Technician Preview" reporterId={identity.userId} /></>
    );
  return (
    <div className="techcommand-canvas min-h-screen text-[#0a1b2f] max-w-full overflow-x-hidden">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[210px] xl:w-[235px] 2xl:w-[258px] lg:block">
        <Sidebar active={active} onSelect={selectModule} allowedModules={allowedModules} />
      </aside>
      <div className="lg:pl-[210px] xl:pl-[235px] 2xl:pl-[258px] min-w-0 max-w-full">
        <header className="techcommand-header sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl max-w-full">
          <div className="flex h-15 sm:h-16 xl:h-[70px] items-center gap-1.5 sm:gap-2 xl:gap-2.5 px-2.5 sm:px-3.5 xl:px-6 max-w-full min-w-0">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden shrink-0 size-8 sm:size-8.5"
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-[280px] border-0 p-0"
              >
                <Sidebar active={active} onSelect={selectModule} allowedModules={allowedModules} />
              </SheetContent>
            </Sheet>
            <div className="shrink-0 min-w-0 max-w-[125px] sm:max-w-[155px] xl:max-w-[190px]">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <span className="font-bold text-cyan-700">
                  {PLATFORM_BRAND.name}
                </span>
                <ChevronRight className="size-2.5 shrink-0" />
                <span className="truncate text-slate-700">
                  {moduleNames[active]}
                </span>
              </div>
              <h1 className="mt-0.5 whitespace-nowrap text-sm sm:text-base xl:text-lg font-bold tracking-tight text-slate-900 truncate">
                {moduleNames[active]}
              </h1>
            </div>
            <div className="hidden min-w-[70px] max-w-[120px] lg:max-w-[140px] xl:max-w-[190px] 2xl:max-w-[240px] flex-1 items-center rounded-xl border border-slate-200/90 bg-slate-50/80 px-2 shadow-inner md:flex">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-xs outline-none placeholder:text-slate-400"
                placeholder="Search…"
                aria-label="Search portal"
              />
              <span className="hidden xl:inline shrink-0 rounded border bg-white px-1 py-0.5 text-[9px] font-semibold text-slate-400">
                Filter
              </span>
            </div>
            <div className="flex shrink items-center gap-1 sm:gap-1.5 xl:gap-2 ml-auto min-w-0">
              <Button
                variant="outline"
                size="icon"
                className="size-7.5 sm:size-8 xl:size-8.5 shrink-0"
                aria-label="Notifications"
                onClick={() => selectModule("automations")}
              >
                <Bell className="size-3.5 sm:size-4" />
              </Button>
              <BidIntelligenceWorkspace
                actorUserId={identity.userId}
                onImportAssets={() => {setIntakeImportType("assets"); selectModule("imports");}}
                onPricing={actualRole === "owner_administrator" || actualRole === "finance" ? () => {setFinanceStartTab("pricing"); selectModule("finance");} : undefined}
                trigger={
                  <Button className="hidden h-7.5 sm:h-8 px-2 xl:px-2.5 text-xs bg-gradient-to-r from-[#1467e8] to-[#1598bb] shadow-sm hover:from-[#0f5fdc] hover:to-[#1187a8] sm:inline-flex shrink-0">
                    <Calculator className="mr-1 size-3.5 shrink-0" />
                    <span className="hidden xl:inline">Other job types</span>
                    <span className="xl:hidden">Other jobs</span>
                  </Button>
                }
              />
              {allowedModules.has("spinlife") ? (
                <Button onClick={() => selectModule("spinlife")} className="hidden h-7.5 sm:h-8 px-2 xl:px-2.5 text-xs sm:inline-flex shrink-0">
                  <span className="hidden xl:inline">SpinLife work orders</span>
                  <span className="xl:hidden">SpinLife</span>
                </Button>
              ) : null}
              {actualRole === "owner_administrator" ? (
                <Select
                  value={experience}
                  onValueChange={(value) => {
                    captureOperationalEvent("portal_experience_changed", {
                      role: actualRole,
                      experience: value,
                    });
                    const nextExp = value as "admin" | "technician";
                    setExperience(nextExp);
                    if (typeof window !== "undefined") {
                      if (nextExp === "technician") {
                        window.history.pushState(null, "", "/technician/spinlife-work-portal");
                      } else {
                        window.history.pushState(null, "", getRoutePath(getDashboardFromRole(actualRole), active));
                      }
                    }
                  }}
                >
                  <SelectTrigger
                    className="hidden h-7.5 sm:h-8 w-auto min-w-[105px] max-w-[145px] px-2 bg-white text-xs lg:flex shrink-0"
                    aria-label="Change portal experience"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin experience</SelectItem>
                    <SelectItem value="technician">Technician preview</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <div className="flex items-center gap-1 sm:gap-1.5 border-l border-slate-200/80 pl-1.5 sm:pl-2 shrink-0">
                <span className="grid size-7 sm:size-7.5 place-items-center rounded-full bg-gradient-to-br from-[#0a243d] to-[#1467e8] text-[11px] font-bold text-white shadow-xs ring-1 ring-cyan-200 shrink-0">
                  {initials}
                </span>
                <div className="max-w-[85px] sm:max-w-[105px] xl:max-w-[140px]">
                  <p className="truncate text-[11px] font-bold text-slate-800 leading-tight">
                    {displayName || identity?.displayName}
                  </p>
                  <p
                    className="truncate text-[9px] text-slate-500 leading-none mt-0.5"
                    title={email}
                  >
                    {roleLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-2 md:hidden">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search command center…"
            />
            <BidIntelligenceWorkspace
              actorUserId={identity.userId}
              onImportAssets={() => {setIntakeImportType("assets"); selectModule("imports");}}
              onPricing={actualRole === "owner_administrator" || actualRole === "finance" ? () => {setFinanceStartTab("pricing"); selectModule("finance");} : undefined}
              trigger={
                <Button size="sm">
                  <Calculator /> Other jobs
                </Button>
              }
            />
            {allowedModules.has("spinlife")?<Button size="sm" onClick={()=>selectModule("spinlife")}>SpinLife</Button>:null}
          </div>
        </header>
        <main className="w-full max-w-full min-w-0 px-4 py-5 pb-24 sm:px-6 sm:pb-28 xl:px-8 xl:py-7 xl:pb-28">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-cyan-700">
                {todayLabel}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Good morning, {(displayName || identity?.displayName || "User").split(" ")[0]}. Your operational priorities are ready.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                <span className="size-2 rounded-full bg-cyan-500" /> System live
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await queryClient.invalidateQueries();
                  toast.success("Portal data refreshed");
                }}
              >
                <Cloud /> Refresh data
              </Button>
            </div>
          </div>
          <Suspense fallback={<ModuleLoading />}>{content}</Suspense>
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
      <AdministratorOnboarding
        userId={identity.userId}
        assigned={identity.administratorOnboarding}
        onNavigate={(module) => selectModule(module as ModuleKey)}
      />
      <OperationsCopilot
        module={active}
        onNavigate={(module) => selectModule(module as ModuleKey)}
        spotlight={
          platformTourStep !== null &&
          "target" in PLATFORM_TOUR_STEPS[platformTourStep] &&
          PLATFORM_TOUR_STEPS[platformTourStep].target === "copilot"
        }
      />
      <ProblemReporter module={moduleNames[active]} reporterId={identity.userId} offsetForSidebar />
      {platformTourStep !== null ? (
        <PlatformTourGuide
          index={platformTourStep}
          onMove={movePlatformTour}
          onExit={() => setPlatformTourStep(null)}
        />
      ) : null}
    </div>
  );
}
