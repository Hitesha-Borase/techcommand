"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  capturePageView,
  captureOperationalEvent,
  errorKind,
  setAnalyticsClient,
  resetPortalAnalytics,
} from "@/lib/analytics-client";
import { privacyAnalyticsConfig } from "@/lib/analytics-privacy";

type AnalyticsConfig = {
  enabled: boolean;
  projectToken?: string;
  host?: string;
};

export function PostHogAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    void fetch("/api/analytics/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<AnalyticsConfig>;
      })
      .then(async (config) => {
        if (!active || !config?.enabled || !config.projectToken || !config.host) return;
        const posthog = (await import("posthog-js")).default;
        if (!active) return;
        posthog.init(config.projectToken, {
          api_host: config.host,
          defaults: "2026-05-30",
          ...privacyAnalyticsConfig(config.projectToken),
          loaded: () => {
            if (!active) return;
            setAnalyticsClient(posthog);
            capturePageView(window.location.pathname);
          },
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      resetPortalAnalytics();
      setAnalyticsClient(null);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    capturePageView(pathname);
  }, [pathname]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      captureOperationalEvent("portal_client_error", {
        error_area: "window",
        error_kind: errorKind(event.error),
      });
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      captureOperationalEvent("portal_client_error", {
        error_area: "unhandled_promise",
        error_kind: errorKind(event.reason),
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("techcommand:session-required", resetPortalAnalytics);
    const onNavigation = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link) return;
      try {
        const url = new URL(link.getAttribute("href") || "", window.location.origin);
        if (url.origin === window.location.origin && url.pathname === "/signout-with-chatgpt") resetPortalAnalytics();
      } catch { /* Invalid links are not analytics failures. */ }
    };
    document.addEventListener("click", onNavigation, true);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("techcommand:session-required", resetPortalAnalytics);
      document.removeEventListener("click", onNavigation, true);
    };
  }, []);

  return null;
}
