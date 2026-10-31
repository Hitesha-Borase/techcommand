import type { CaptureResult, PostHogConfig } from "posthog-js";

declare const __TECHCOMMAND_RELEASE__: string;
export const ANALYTICS_RELEASE = typeof __TECHCOMMAND_RELEASE__ === "string"
  ? __TECHCOMMAND_RELEASE__ : "development-unverified";

export const operationalEvents = new Set([
  "portal_module_viewed", "platform_tour_step_viewed", "portal_experience_changed", "portal_client_error",
  "connection_lost", "connection_restored", "offline_sync_completed", "bid_workspace_opened",
  "bid_evidence_selected", "bid_extraction_started", "bid_extraction_completed", "bid_extraction_failed",
  "bid_route_completed", "bid_route_failed", "bid_refinement_completed", "bid_refinement_failed",
  "bid_intake_saved", "bid_intake_failed", "technician_portal_opened", "technician_tab_viewed",
  "technician_status_updated", "technician_completion_opened", "technician_pay_acknowledged",
  "asset_scan_resolved", "asset_scan_failed", "asset_label_saved", "asset_label_save_failed",
]);

// Values, not just property names, are restricted. No free-text field belongs here.
const enums: Record<string, readonly string[]> = {
  module: ["command", "work-orders", "schedule", "dispatch", "accounts", "customers", "contacts", "partners", "locations", "assets", "support", "pm", "technicians", "technician", "parts", "finance", "field-training", "compliance", "reports", "automations", "imports", "documents", "knowledge", "access", "demo", "settings"],
  role: ["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead", "finance", "technician", "client_administrator", "client_location_user", "auditor", "school_coordinator", "unknown"],
  experience: ["admin", "technician"],
  source: ["openai", "device_ocr"],
  outcome: ["saved"],
  route_status: ["calculated", "manual_required", "verified", "manual"],
  total_size_bucket: ["under_1mb", "1mb_to_10mb", "10mb_to_20mb", "over_20mb"],
  queued_count_bucket: ["0", "1", "2-5", "6-10", "11+"],
  processed_count_bucket: ["0", "1", "2-5", "6-10", "11+"],
  error_area: ["window", "unhandled_promise", "extraction", "routing", "refinement", "save", "asset_scan", "asset_label"],
  error_kind: ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AbortError", "TimeoutError", "NetworkError", "QuotaExceededError", "UnknownError"],
  tab: ["today", "route", "pay", "training", "profile", "assets"],
  status: ["assigned", "accepted", "contacted", "scheduled", "en_route", "arrived", "service_in_progress", "on_site", "in_progress", "paused", "submitted", "completed", "cancelled", "needs_parts", "needs_review", "needs_resolution"],
};

export function safeAnalyticsProperties(input: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = {};
  for (const [key, choices] of Object.entries(enums)) {
    const value = input[key];
    if (typeof value === "string" && choices.includes(value)) result[key] = value;
  }
  for (const key of ["file_count", "warning_count", "step"]) {
    const value = input[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000) result[key] = value;
  }
  if (typeof input.online === "boolean") result.online = input.online;
  if (Array.isArray(input.file_type_categories)) {
    result.file_type_categories = [...new Set(input.file_type_categories.filter(value => value === "pdf" || value === "image"))];
  }
  result.release = ANALYTICS_RELEASE;
  return result;
}

export function safeAnalyticsPath(path: string) {
  // The current app has one page; unknown/deep paths may contain record identifiers.
  return path === "/" ? "/" : "other";
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function scrubAnalyticsEvent(event: CaptureResult | null, projectToken: string): CaptureResult | null {
  if (!event || !uuid.test(event.uuid) || (!operationalEvents.has(event.event) && event.event !== "$pageview")) return null;
  const original = event.properties || {};
  // Anonymous SDK-generated session identity only. Never forward a portal user ID.
  if (typeof original.distinct_id !== "string" || !uuid.test(original.distinct_id)) return null;
  const properties: Record<string, unknown> = {
    ...safeAnalyticsProperties(original),
    token: projectToken, // Public ingestion token is required by the SDK transport.
    distinct_id: original.distinct_id,
    $process_person_profile: false,
    $geoip_disable: true,
  };
  for (const key of ["$device_id", "$session_id", "$window_id"]) {
    const value = original[key];
    if (typeof value === "string" && uuid.test(value)) properties[key] = value;
  }
  if (event.event === "$pageview") properties.$pathname = safeAnalyticsPath(String(original.$pathname || ""));
  // Reconstruct instead of copying: nested metadata, $set, URLs, stacks and SDK
  // enrichment must not escape through new or unexpected keys.
  return { event: event.event, uuid: event.uuid, timestamp: event.timestamp, properties };
}

export function privacyAnalyticsConfig(projectToken: string): Partial<PostHogConfig> {
  return {
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    autocapture: false,
    rageclick: false,
    person_profiles: "never",
    persistence: "memory",
    ip: false,
    save_referrer: false,
    save_campaign_params: false,
    disable_session_recording: true,
    enable_recording_console_log: false,
    capture_performance: false,
    disable_surveys: true,
    advanced_disable_flags: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: {
      maskAllInputs: true, maskTextSelector: "*", maskAllElementAttributes: true,
      blockSelector: "body", captureJsonLd: false, recordHeaders: false, recordBody: false,
    },
    before_send: event => scrubAnalyticsEvent(event, projectToken),
  };
}
