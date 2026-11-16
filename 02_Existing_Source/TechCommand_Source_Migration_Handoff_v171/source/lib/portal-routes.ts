export type DashboardKey =
  | "admin"
  | "finance"
  | "biomedical"
  | "technician"
  | "dispatch"
  | "partner"
  | "auditor"
  | "schools";

export type ModuleKey =
  | "command"
  | "spinlife"
  | "work-orders"
  | "schedule"
  | "dispatch"
  | "accounts"
  | "customers"
  | "contacts"
  | "partners"
  | "locations"
  | "assets"
  | "biomedical-accounts"
  | "support"
  | "pm"
  | "technicians"
  | "parts"
  | "finance"
  | "field-training"
  | "academy"
  | "compliance"
  | "reports"
  | "automations"
  | "imports"
  | "documents"
  | "knowledge"
  | "access"
  | "demo"
  | "settings";

export function getDashboardFromRole(role?: string): DashboardKey {
  if (role === "finance") return "finance";
  if (role === "biomedical_lead") return "biomedical";
  if (role === "technician") return "technician";
  if (role === "dispatcher") return "dispatch";
  if (role === "client_administrator" || role === "client_location_user") return "partner";
  if (role === "auditor") return "auditor";
  if (role === "school_coordinator") return "schools";
  return "admin";
}

// Map each module to its official clean route slug matching the exact menu name
export const MODULE_TO_SLUG: Record<ModuleKey, string> = {
  // DME & Mobility
  "spinlife": "spinlife-work-portal",
  // Operate
  "command": "command-center",
  "work-orders": "work-orders",
  "schedule": "schedule",
  "dispatch": "dispatch-routes",
  // CRM & Operations
  "accounts": "accounts",
  "customers": "customers",
  "contacts": "contacts",
  "partners": "partner-portal",
  "locations": "locations",
  "support": "field-knowledge",
  // Biomedical/PM
  "biomedical-accounts": "biomedical-accounts",
  "assets": "biomedical-assets",
  "pm": "biomedical-pm",
  // Resources
  "technicians": "technicians",
  "parts": "parts-inventory",
  "documents": "document-vault",
  "knowledge": "ask-techflex",
  "finance": "estimates-billing",
  // Control
  "academy": "tech-command-academy",
  "field-training": "schools-field-training",
  "compliance": "compliance-audits",
  "reports": "reports",
  "automations": "integrations-automation",
  "imports": "imports-sync",
  "access": "users-access",
  "demo": "demo-center",
  "settings": "system-settings",
};

// Map slug (both official and shorthands) back to ModuleKey
export const SLUG_TO_MODULE: Record<string, ModuleKey> = {
  // Official slugs
  "spinlife-work-portal": "spinlife",
  "command-center": "command",
  "work-orders": "work-orders",
  "schedule": "schedule",
  "dispatch-routes": "dispatch",
  "accounts": "accounts",
  "customers": "customers",
  "contacts": "contacts",
  "partner-portal": "partners",
  "locations": "locations",
  "field-knowledge": "support",
  "biomedical-accounts": "biomedical-accounts",
  "biomedical-assets": "assets",
  "biomedical-pm": "pm",
  "technicians": "technicians",
  "parts-inventory": "parts",
  "document-vault": "documents",
  "ask-techflex": "knowledge",
  "estimates-billing": "finance",
  "tech-command-academy": "academy",
  "schools-field-training": "field-training",
  "compliance-audits": "compliance",
  "reports": "reports",
  "integrations-automation": "automations",
  "imports-sync": "imports",
  "users-access": "access",
  "demo-center": "demo",
  "system-settings": "settings",

  // Shorthands and aliases
  "spinlife": "spinlife",
  "command": "command",
  "dispatch": "dispatch",
  "partners": "partners",
  "support": "support",
  "assets": "assets",
  "pm": "pm",
  "parts": "parts",
  "documents": "documents",
  "knowledge": "knowledge",
  "finance": "finance",
  "academy": "academy",
  "field-training": "field-training",
  "compliance": "compliance",
  "automations": "automations",
  "imports": "imports",
  "access": "access",
  "demo": "demo",
  "settings": "settings",
};

export type RouteResolution = {
  dashboard: DashboardKey;
  module: ModuleKey;
  technicianView?: "spinlife" | "field" | "career";
  pathname: string;
};

/**
 * Build the canonical URL path for a given dashboard and module.
 */
export function getRoutePath(
  dashboard: DashboardKey,
  module: ModuleKey,
  technicianView?: "spinlife" | "field" | "career"
): string {
  if (dashboard === "technician") {
    if (technicianView === "field") return "/technician/field-portal";
    if (technicianView === "career") return "/technician/career-academy";
    return "/technician/spinlife-work-portal";
  }
  if (dashboard === "partner") return "/partner-portal";
  if (dashboard === "auditor") return "/consultant-review";
  if (dashboard === "schools") return "/schools-field-training";

  const slug = MODULE_TO_SLUG[module] || module;
  return `/${dashboard}/${slug}`;
}

/**
 * Resolve an incoming pathname into dashboard, module, and view details.
 */
export function resolveRoute(pathname: string, userRole?: string): RouteResolution {
  const clean = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  const segments = clean ? clean.split("/") : [];
  const defaultDashboard = getDashboardFromRole(userRole);

  if (segments.length === 0) {
    const defaultModule: ModuleKey = defaultDashboard === "finance" ? "finance" : "command";
    const defaultSlug = MODULE_TO_SLUG[defaultModule] || "command-center";
    return {
      dashboard: defaultDashboard,
      module: defaultModule,
      pathname: `/${defaultDashboard}/${defaultSlug}`,
    };
  }

  const first = segments[0]?.toLowerCase() || "";
  const second = segments[1]?.toLowerCase() || "";

  // 1. Technician Dashboard
  if (first === "technician") {
    let techView: "spinlife" | "field" | "career" = "spinlife";
    if (second === "field-portal" || second === "jobs" || second === "field") {
      techView = "field";
    } else if (second === "career-academy" || second === "academy" || second === "career") {
      techView = "career";
    }
    return {
      dashboard: "technician",
      module: "spinlife",
      technicianView: techView,
      pathname: getRoutePath("technician", "spinlife", techView),
    };
  }

  // 2. Specialized Single-Dashboard Routes
  if (first === "partner-portal" || first === "partner" || first === "client-partner") {
    return { dashboard: "partner", module: "partners", pathname: "/partner-portal" };
  }
  if (first === "consultant-review" || first === "auditor" || first === "consultant") {
    return { dashboard: "auditor", module: "compliance", pathname: "/consultant-review" };
  }
  if (first === "schools-field-training" || first === "schools" || first === "school-training") {
    return { dashboard: "schools", module: "field-training", pathname: "/schools-field-training" };
  }

  // 3. Multi-menu Dashboards (admin, finance, biomedical, dispatch)
  const dashboardMap: Record<string, DashboardKey> = {
    admin: "admin",
    finance: "finance",
    biomedical: "biomedical",
    dispatch: "dispatch",
    dispatcher: "dispatch",
  };

  if (dashboardMap[first]) {
    const dash = dashboardMap[first];
    const defaultModForDash = dash === "finance" ? "finance" : "command";
    const defaultSlugForDash = MODULE_TO_SLUG[defaultModForDash] || "command-center";
    const slug = second || defaultSlugForDash;
    const mod = SLUG_TO_MODULE[slug] || defaultModForDash;
    return {
      dashboard: dash,
      module: mod,
      pathname: `/${dash}/${MODULE_TO_SLUG[mod] || slug}`,
    };
  }

  // 4. Direct slug without dashboard prefix (e.g. /customers)
  if (SLUG_TO_MODULE[first]) {
    const mod = SLUG_TO_MODULE[first];
    return {
      dashboard: defaultDashboard,
      module: mod,
      pathname: `/${defaultDashboard}/${MODULE_TO_SLUG[mod] || first}`,
    };
  }

  // Fallback to default dashboard primary view
  const fallbackMod: ModuleKey = defaultDashboard === "finance" ? "finance" : "command";
  return {
    dashboard: defaultDashboard,
    module: fallbackMod,
    pathname: `/${defaultDashboard}/${MODULE_TO_SLUG[fallbackMod] || "command-center"}`,
  };
}
