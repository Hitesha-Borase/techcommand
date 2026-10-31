"use client";

import { operationalEvents, safeAnalyticsProperties, safeAnalyticsPath } from "@/lib/analytics-privacy";

export type OperationalEvent =
  | "portal_module_viewed"
  | "platform_tour_step_viewed"
  | "portal_experience_changed"
  | "portal_client_error"
  | "connection_lost"
  | "connection_restored"
  | "offline_sync_completed"
  | "bid_workspace_opened"
  | "bid_evidence_selected"
  | "bid_extraction_started"
  | "bid_extraction_completed"
  | "bid_extraction_failed"
  | "bid_route_completed"
  | "bid_route_failed"
  | "bid_refinement_completed"
  | "bid_refinement_failed"
  | "bid_intake_saved"
  | "bid_intake_failed"
  | "technician_portal_opened"
  | "technician_tab_viewed"
  | "technician_status_updated"
  | "technician_completion_opened"
  | "technician_pay_acknowledged"
  | "asset_scan_resolved"
  | "asset_scan_failed"
  | "asset_label_saved"
  | "asset_label_save_failed";

type SafeValue = string | number | boolean | string[] | null | undefined;
type SafeProperties = Record<string, SafeValue>;

let ready = false;
let analyticsClient: {
  capture: (event: string, properties?: Record<string, unknown>) => unknown;
  identify: (userId: string, properties?: Record<string, unknown>) => unknown;
  reset: () => unknown;
} | null = null;
let currentUserId: string | null = null;
const pendingEvents: Array<{ event: OperationalEvent; properties: Record<string, unknown> }> = [];

function safely(action: () => unknown) {
  try {
    // Monitoring is optional and must never fail a save or create an error loop.
    void Promise.resolve(action()).catch(() => undefined);
  } catch { /* No recursive telemetry or console payload. */ }
}

export function setAnalyticsClient(client: typeof analyticsClient) {
  analyticsClient = client;
  ready = Boolean(client);
  if (!client) return;
  for (const item of pendingEvents.splice(0, pendingEvents.length))
    safely(() => client.capture(item.event, safeAnalyticsProperties(item.properties)));
}

export function analyticsReady() {
  return ready;
}

export function captureOperationalEvent(
  event: OperationalEvent,
  properties: SafeProperties = {},
) {
  if (typeof window === "undefined" || !operationalEvents.has(event)) return;
  const safe = safeAnalyticsProperties(properties);
  if (!ready) {
    if (pendingEvents.length < 100) pendingEvents.push({ event, properties: safe });
    return;
  }
  safely(() => analyticsClient?.capture(event, safe));
}

export function identifyPortalUser(userId: string, _role: string) {
  if (!userId) return;
  if (currentUserId && currentUserId !== userId) resetPortalAnalytics();
  // Local comparison only; no person profile or real user identifier is sent.
  currentUserId = userId;
}

export function resetPortalAnalytics() {
  currentUserId = null;
  pendingEvents.splice(0, pendingEvents.length);
  if (!ready) return;
  safely(() => analyticsClient?.reset());
}

export function capturePageView(pathname: string) {
  if (!ready || !analyticsClient || typeof window === "undefined") return;
  safely(() => analyticsClient?.capture("$pageview", {
    ...safeAnalyticsProperties(), $pathname: safeAnalyticsPath(pathname),
  }));
}

export function errorKind(error: unknown) {
  const kind = error instanceof Error ? error.name : "UnknownError";
  return String(safeAnalyticsProperties({ error_kind: kind }).error_kind || "UnknownError");
}

export function countBucket(value: number) {
  if (value <= 0) return "0";
  if (value === 1) return "1";
  if (value <= 5) return "2-5";
  if (value <= 10) return "6-10";
  return "11+";
}

export function sizeBucket(bytes: number) {
  if (bytes <= 1024 * 1024) return "under_1mb";
  if (bytes <= 10 * 1024 * 1024) return "1mb_to_10mb";
  if (bytes <= 20 * 1024 * 1024) return "10mb_to_20mb";
  return "over_20mb";
}
