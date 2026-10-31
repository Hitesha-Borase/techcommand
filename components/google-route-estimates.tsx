"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DispatchRoute } from "@/components/dispatch-center";
import { estimateMatchesPlan, googleEstimateRequestSchema, googleEstimateResultSchema, type GoogleEstimateResult } from "@/lib/google-route-estimate";
import { formatProjectedTime, routeTimeline, routeTotals, validServiceMinutes, type PlannedStop } from "@/lib/route-planner";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function GoogleRouteEstimates({ route, stops, version, startAddress, startTime, includeReturn, returnAddress, disabled }: {
  route: DispatchRoute; stops: PlannedStop[]; version: number; startAddress: string; startTime: string;
  includeReturn: boolean; returnAddress: string; disabled: boolean;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ fingerprint: string; data: GoogleEstimateResult } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const input = { routeId: route.id, version, startAddress, includeReturn, returnAddress: includeReturn ? returnAddress : "",
    stops: stops.map(stop => ({ stopId: stop.stopId, address: route.stops.find(item => item.stopId === stop.stopId)?.address || "" })) };
  const fingerprint = JSON.stringify(input);
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  useEffect(() => {
    let active = true;
    void portalFetch("/api/dispatch/estimate").then(response => portalJson<{ configured: boolean; paused: boolean }>(response, "Connection status is unavailable."))
      .then(data => { if (active) { setConfigured(data.configured === true); setPaused(data.paused === true); } })
      .catch(() => { if (active) setConfigured(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    epoch.current += 1;
    controller.current?.abort();
    setResult(null); setBusy(false); setMessage("");
    return () => { epoch.current += 1; controller.current?.abort(); };
  }, [fingerprint, route.version]);
  useEffect(() => {
    // A restored browser page must not silently resurrect old estimates after navigation.
    const clear = () => { epoch.current += 1; controller.current?.abort(); setResult(null); setBusy(false); };
    window.addEventListener("pagehide", clear);
    window.addEventListener("techcommand:session-required", clear);
    return () => { window.removeEventListener("pagehide", clear); window.removeEventListener("techcommand:session-required", clear); };
  }, []);

  async function calculate() {
    if (busy || disabled) return;
    const parsed = googleEstimateRequestSchema.safeParse(input);
    if (!parsed.success) { setMessage("Enter the start address, check each service address and add a return destination if needed."); return; }
    const attempt = ++epoch.current;
    const snapshot = fingerprint;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true); setResult(null); setMessage("");
    try {
      const response = await portalFetch("/api/dispatch/estimate", { method: "POST", signal: controller.current.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = googleEstimateResultSchema.parse(await portalJson<unknown>(response, "Driving estimates could not be calculated."));
      if (epoch.current !== attempt || fingerprintRef.current !== snapshot) return;
      if (!estimateMatchesPlan(data, parsed.data)) throw new Error("The estimate no longer matches this route. Calculate again after reviewing the stops.");
      setConfigured(true); setResult({ fingerprint: snapshot, data });
    } catch (error) {
      if (epoch.current === attempt && fingerprintRef.current === snapshot)
        setMessage(error instanceof Error && error.name !== "ZodError" ? error.message : "The driving estimates were incomplete. Your manual plan is unchanged.");
    } finally { if (epoch.current === attempt) setBusy(false); }
  }
  const data = result?.fingerprint === fingerprint && !disabled ? result.data : null;
  const projectedStops = data ? stops.map((stop, index) => ({ ...stop, driveMinutes: data.stops[index].driveMinutes })) : [];
  const totals = routeTotals(projectedStops, includeReturn, data?.returnMinutes ?? null);
  const timeline = routeTimeline(projectedStops, startTime, includeReturn, data?.returnMinutes ?? null);
  const ready = stops.length > 0 && stops.every(stop => validServiceMinutes(stop.serviceMinutes)) &&
    googleEstimateRequestSchema.safeParse(input).success && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

  return <section aria-label="Google driving estimates" className="ph-no-capture space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4" data-ph-sensitive>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Calculate driving time</h3><p className="mt-1 text-sm text-slate-600">Uses your chosen stop order and optional return trip. No live traffic.</p></div>
      <Button variant="outline" disabled={disabled || busy || !ready || configured === false} onClick={calculate}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Route />}{busy ? "Calculating…" : "Get Google estimates"}
      </Button>
    </div>
    {configured === false && <p role="status" className="text-sm text-amber-900">{paused ? "Your administrator has paused Google driving estimates." : "Google Routes is awaiting your administrator's secure API connection."} Manual estimates and navigation are available below.</p>}
    {!ready && configured !== false && <p className="text-sm text-slate-600">Complete the start address, service addresses and on-site times to calculate.</p>}
    <p className="text-sm text-slate-600">Only the route addresses are sent to Google when you request an estimate. Results are shown for this view; recalculate after reopening or changing the route. Saved manual estimates, billing and appointments stay unchanged.</p>
    {message && <p role="alert" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    {data && <div className="space-y-3 rounded-lg border bg-white p-4" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Google driving estimates</p><span translate="no" className="whitespace-nowrap text-sm font-normal not-italic text-[#5e5e5e]">Google Maps</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div><p className="text-sm text-slate-600">Driving</p><p className="text-lg font-bold">{duration(totals.drive)}</p></div>
        <div><p className="text-sm text-slate-600">Your on-site time</p><p className="text-lg font-bold">{totals.onsite === null ? "Incomplete" : duration(totals.onsite)}</p></div>
        <div><p className="text-sm text-slate-600">Estimated day total</p><p className="text-lg font-bold">{totals.total === null ? "Incomplete" : duration(totals.total)}</p></div>
        <div><p className="text-sm text-slate-600">Projected finish</p><p className="text-lg font-bold">{timeline.finishMinutes === null ? "Incomplete" : formatProjectedTime(timeline.finishMinutes)}</p></div>
      </div>
      <ol className="space-y-2 text-sm">{data.stops.map((stop, index) => <li key={stop.stopId} className="flex flex-wrap justify-between gap-2 border-t pt-2">
        <span>Stop {index + 1} · {stop.driveMinutes} min drive</span><span>Arrival {timeline.stops[index]?.arrivalMinutes == null ? "incomplete" : formatProjectedTime(timeline.stops[index].arrivalMinutes!)}</span>
      </li>)}</ol>
      {includeReturn && <p className="text-sm">Return drive: {data.returnMinutes} min</p>}
      {data.warnings.map((warning, index) => <p key={index} className="text-sm text-amber-900">{warning}</p>)}
      <p className="text-sm text-slate-600">Driving estimates exclude traffic, breaks and delays. On-site time is your planned duration.</p>
    </div>}
    <p className="text-sm text-slate-600"><a className="underline" href="https://www.google.com/intl/en_US/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps terms</a>{" · "}<a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy policy</a></p>
  </section>;
}
