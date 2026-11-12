import { ANALYTICS_RELEASE } from "@/lib/analytics-privacy";

export type ServerFailureArea =
  | "api_request"
  | "page_request"
  | "attachment_cleanup"
  | "attachment_commit"
  | "completion_cleanup"
  | "completion_commit"
  | "document_cleanup"
  | "document_commit"
  | "google_email_outbox"
  | "google_sheets_outbox"
  | "payroll_cleanup"
  | "payroll_commit"
  | "route_estimate"
  | "website_intake";

type TelemetryRuntime = {
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
};

const allowedHosts = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"]);
const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorKinds = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AbortError", "TimeoutError", "NetworkError", "QuotaExceededError"]);
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const routeAreas = new Set([
  "access", "accounts", "ai", "analytics", "asset-visits", "assets", "attachments", "bid-intelligence",
  "client-access", "compensation", "completions", "compliance", "contacts", "control-tower", "customer-feedback",
  "customers", "dispatch", "documents", "finance", "imports", "intakes", "integrations", "knowledge", "locations",
  "me", "next-actions", "onboarding", "partner", "partner-launches", "pay", "pricing-intelligence",
  "pricing-policies", "problem-reports", "review-access", "tasks", "technicians", "training", "work-orders",
  "spinlife",
]);

let budgetWindowStartedAt = 0;
let sentInWindow = 0;
const budgetWindowMs = 60_000;
const maxEventsPerWindow = 20;

export function createErrorReference() {
  return crypto.randomUUID();
}

export function validErrorReference(value: string | null | undefined) {
  return typeof value === "string" && referencePattern.test(value) ? value : null;
}

export function safeServerErrorKind(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return errorKinds.has(name) ? name : "UnknownError";
}

/** Log only finite categories. Never serialize exception messages, stacks or supplied values. */
export function safeServerLog(area: ServerFailureArea, error: unknown, reference = createErrorReference()) {
  const event = { event: "server_operation_failed", area, error_kind: safeServerErrorKind(error), reference, release: ANALYTICS_RELEASE };
  try { console.error(JSON.stringify(event)); } catch { /* Logging cannot change the business result. */ }
  return reference;
}

export function routeFailureArea(pathname: string) {
  const match = pathname.match(/^\/api\/([^/]+)(?:\/|$)/);
  return match && routeAreas.has(match[1]) ? match[1] : "other";
}

function reserveTelemetry(now: number) {
  if (!Number.isFinite(now)) return false;
  if (now < budgetWindowStartedAt || now - budgetWindowStartedAt >= budgetWindowMs) {
    budgetWindowStartedAt = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= maxEventsPerWindow) return false;
  sentInWindow += 1;
  return true;
}

export function resetServerTelemetryBudgetForTests() {
  budgetWindowStartedAt = 0;
  sentInWindow = 0;
}

/**
 * Best-effort bounded failure event for Worker waitUntil. It accepts no error
 * object, URL, identity, request body or headers beyond the method.
 */
export async function captureServerFailure(
  request: Request,
  status: number,
  referenceValue: string,
  runtime: TelemetryRuntime,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (status < 500 || status > 599 || !new URL(request.url).pathname.startsWith("/api/")) return false;
  const reference = validErrorReference(referenceValue);
  const projectToken = runtime.POSTHOG_PROJECT_TOKEN?.trim();
  const host = runtime.POSTHOG_HOST?.replace(/\/$/, "") || "https://us.i.posthog.com";
  if (!reference || !projectToken || !allowedHosts.has(host) || !reserveTelemetry(now)) return false;
  const method = methods.has(request.method) ? request.method : "OTHER";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetcher(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: projectToken,
        event: "server_request_failed",
        distinct_id: `techcommand-server-${ANALYTICS_RELEASE}`,
        properties: {
          $process_person_profile: false,
          $geoip_disable: true,
          release: ANALYTICS_RELEASE,
          failure_area: routeFailureArea(new URL(request.url).pathname),
          method,
          status_code: status,
          reference,
        },
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
