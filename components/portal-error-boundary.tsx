"use client";

import { Component, useEffect, useState, type ReactNode } from "react";

export function PortalRecoveryScreen({ startup = false, error }: { startup?: boolean; error?: unknown }) {
  const err = error as { message?: string; stack?: string } | undefined;
  const msg = typeof error === "string" ? error : (err?.message || (error ? String(error) : ""));
  return <section role={startup ? "status" : "alert"} style={{ minHeight: "100dvh", background: "#eef4f8", color: "#0f172a", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 480, background: "white", padding: 28, borderRadius: 16, boxShadow: "0 8px 30px #0f172a12" }}>
      <p style={{ fontWeight: 700, color: "#0369a1" }}>TechCommand OS</p>
      <h1 style={{ fontSize: 24, marginTop: 12 }}>{startup ? "Opening your dashboard…" : "Your dashboard needs to reload"}</h1>
      <p style={{ lineHeight: 1.6, marginTop: 12 }}>{startup ? "If this screen stays here, check your connection and refresh. If needed, open TechCommand directly in Safari, Chrome or Edge." : "The portal encountered a display problem. Your saved jobs and local drafts have not been deleted. Reload to try again; check the job record before repeating a save."}</p>
      {msg ? (
        <pre style={{ marginTop: 16, padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: 200 }}>
          {msg}
          {err?.stack ? `\n\n${err.stack}` : ""}
        </pre>
      ) : null}
      <nav aria-label="Portal recovery" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.assign("/");
            }
          }}
          style={{ padding: "14px 20px", borderRadius: 8, background: "#0369a1", color: "white", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14 }}
        >
          Reload dashboard
        </button>
        <a href="/login" style={{ padding: "14px 20px", border: "1px solid #94a3b8", borderRadius: 8, color: "#0369a1", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>Sign in</a>
      </nav>
    </div>
  </section>;
}

export class PortalErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; error?: unknown }> {
  state = { failed: false, error: undefined };
  static getDerivedStateFromError(error: unknown) { return { failed: true, error: error || "Display reload required" }; }
  componentDidCatch(error: unknown, errorInfo: any) {
    console.error("PortalErrorBoundary caught error:", error, errorInfo);
  }
  render() { return this.state.failed ? <PortalRecoveryScreen error={this.state.error} /> : this.props.children; }
}

// Server-rendered recovery content remains visible even if a stale bundle,
// blocked script, or unsupported browser prevents React from starting at all.
export function PortalStartup() {
  const [started, setStarted] = useState(false);
  useEffect(() => { setStarted(true); }, []);
  return started ? null : <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}><PortalRecoveryScreen startup /></div>;
}
