"use client";

import { Component, useEffect, useState, type ReactNode } from "react";

export function PortalRecoveryScreen({ startup = false }: { startup?: boolean }) {
  return <section role={startup ? "status" : "alert"} style={{ minHeight: "100dvh", background: "#eef4f8", color: "#0f172a", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 480, background: "white", padding: 28, borderRadius: 16, boxShadow: "0 8px 30px #0f172a12" }}>
      <p style={{ fontWeight: 700, color: "#0369a1" }}>TechCommand OS</p>
      <h1 style={{ fontSize: 24, marginTop: 12 }}>{startup ? "Opening your dashboard…" : "Your dashboard needs to reload"}</h1>
      <p style={{ lineHeight: 1.6, marginTop: 12 }}>{startup ? "If this screen stays here, check your connection and refresh. If needed, open TechCommand directly in Safari, Chrome or Edge." : "The portal encountered a display problem. Your saved jobs and local drafts have not been deleted. Reload to try again; check the job record before repeating a save."}</p>
      <nav aria-label="Portal recovery" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/" style={{ padding: "14px 20px", borderRadius: 8, background: "#0369a1", color: "white", fontWeight: 700 }}>Reload dashboard</a>
        <a href="/login" style={{ padding: "14px 20px", border: "1px solid #94a3b8", borderRadius: 8, color: "#0369a1", fontWeight: 700 }}>Sign in</a>
      </nav>
    </div>
  </section>;
}

export class PortalErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PortalRecoveryScreen /> : this.props.children; }
}

// Server-rendered recovery content remains visible even if a stale bundle,
// blocked script, or unsupported browser prevents React from starting at all.
export function PortalStartup() {
  const [started, setStarted] = useState(false);
  useEffect(() => { setStarted(true); }, []);
  return started ? null : <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}><PortalRecoveryScreen startup /></div>;
}
