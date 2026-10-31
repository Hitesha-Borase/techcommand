"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DispatchRoute } from "@/components/dispatch-center";
import { GoogleRouteEstimates } from "@/components/google-route-estimates";
import { clearRoutePlanDraft, loadRoutePlanDraft, saveRoutePlanDraft } from "@/lib/route-plan-draft";
import { clearRouteNavigation, loadRouteNavigation, saveRouteNavigation } from "@/lib/route-navigation";
import { formatProjectedTime, navigationUrl, routeEstimateErrors, routeTimeline, routeTotals, validDriveMinutes, validServiceMinutes, type NavigationApp, type PlannedStop } from "@/lib/route-planner";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

function initial(route: DispatchRoute) {
  return route.stops.filter(stop => stop.stopId).map(stop => ({ stopId: stop.stopId!,
    serviceMinutes: route.planning?.stops.find(item => item.stopId === stop.stopId)?.serviceMinutes ??
      (stop.plannedArrival && stop.plannedDeparture ? Math.max(1, Math.round((Date.parse(stop.plannedDeparture) - Date.parse(stop.plannedArrival)) / 60000)) || 60 : 60),
    driveMinutes: stop.driveMinutes ?? null }));
}
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function TechnicianRoutePlanner({ route, actorUserId }: { route: DispatchRoute; actorUserId: string }) {
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<PlannedStop[]>(() => initial(route));
  const [version, setVersion] = useState(route.version);
  const [startAddress, setStartAddress] = useState(route.planning?.startAddress || route.startLocation?.address || "");
  const [startTime, setStartTime] = useState(route.planning?.startTime || "08:00");
  const [includeReturn, setIncludeReturn] = useState(route.planning?.includeReturn ?? false);
  const [returnAddress, setReturnAddress] = useState(route.planning?.returnAddress || "");
  const [returnMinutes, setReturnMinutes] = useState<number | null>(route.planning?.returnMinutes ?? null);
  const [app, setApp] = useState<NavigationApp>("google");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [current, setCurrent] = useState(0);
  useEffect(() => { try { const value = localStorage.getItem("techcommand.navigation-app");
    if (value === "apple" || value === "google" || value === "waze") setApp(value);
  } catch { /* Optional device preference. */ } }, []);
  useEffect(() => { try {
    const restored = loadRoutePlanDraft(sessionStorage, actorUserId, route.id, initial(route).map(stop => stop.stopId));
    if (restored.status === "restored") {
      const draft = restored.draft;
      setStops(draft.stops); setVersion(draft.version); setStartAddress(draft.startAddress); setStartTime(draft.startTime);
      setIncludeReturn(draft.includeReturn); setReturnAddress(draft.returnAddress); setReturnMinutes(draft.returnMinutes);
      setDirty(true); setCurrent(0);
      setDraftMessage(draft.version === route.version
        ? "Recovered unsaved route changes from this tab. Review and save when ready."
        : "Recovered unsaved route changes from this tab. Dispatch has changed the route, so compare before saving.");
    } else if (restored.status === "expired") setDraftMessage("An older unsaved route draft expired and was removed from this tab.");
    else if (restored.status === "discarded") setDraftMessage("An unsaved draft no longer matched this route and was removed safely.");
    if (restored.status !== "restored") {
      const stopIds = initial(route).map(stop => stop.stopId);
      const selected = loadRouteNavigation(sessionStorage, actorUserId, route.id, route.version, stopIds);
      if (selected) setCurrent(stopIds.indexOf(selected));
    }
  } catch { setDraftMessage("This browser could not check for an unsaved route draft."); }
  }, [actorUserId, route.id]);
  useEffect(() => {
    if (!dirty) return;
    try {
      saveRoutePlanDraft(sessionStorage, actorUserId, { routeId: route.id, version, stops, startAddress, startTime,
        includeReturn, returnAddress, returnMinutes });
      setDraftMessage(currentMessage => currentMessage.startsWith("Recovered") ? currentMessage : "Unsaved changes are protected in this tab for up to 12 hours.");
    } catch { setDraftMessage("These changes are not protected yet. Complete the highlighted route values and keep this tab open."); }
  }, [actorUserId, dirty, includeReturn, returnAddress, returnMinutes, route.id, startAddress, startTime, stops, version]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeClosing = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);
  function reload() {
    try { clearRoutePlanDraft(sessionStorage, actorUserId, route.id); } catch { /* Best-effort device cleanup. */ }
    try { clearRouteNavigation(sessionStorage, actorUserId, route.id); } catch { /* Optional navigation selection. */ }
    setStops(initial(route)); setVersion(route.version);
    setStartAddress(route.planning?.startAddress || route.startLocation?.address || "");
    setStartTime(route.planning?.startTime || "08:00");
    setIncludeReturn(route.planning?.includeReturn ?? false); setReturnAddress(route.planning?.returnAddress || "");
    setReturnMinutes(route.planning?.returnMinutes ?? null); setDirty(false); setMessage(""); setDraftMessage(""); setCurrent(0);
  }
  function move(index: number, delta: number) {
    const next = [...stops]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    // Every leg refers to its predecessor; do not reuse a previous sequence's estimates.
    setStops(next.map(stop => ({ ...stop, driveMinutes: null }))); setReturnMinutes(null);
    try { clearRouteNavigation(sessionStorage, actorUserId, route.id); } catch { /* Optional navigation selection. */ }
    setDirty(true); setCurrent(0); setMessage("Stop order changed. Recheck driving estimates for the new sequence.");
  }
  async function save() {
    if (estimateErrors.length || (includeReturn && !returnAddress.trim())) return;
    setSaving(true); setMessage("");
    try {
      const response = await portalFetch("/api/dispatch", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", routeId: route.id, version, stops, startAddress, startTime, includeReturn, returnAddress, returnMinutes }) });
      const data = await portalJson<{ version?: number }>(response, "Route plan could not be saved.");
      if (!Number.isInteger(data.version)) throw new Error("Save confirmation was incomplete. Refresh and compare before retrying.");
      try { clearRoutePlanDraft(sessionStorage, actorUserId, route.id); } catch { /* The cloud save is authoritative. */ }
      setVersion(data.version!); setDirty(false); setDraftMessage(""); setMessage("Route plan saved. Customer appointment times were not changed.");
      try { saveRouteNavigation(sessionStorage, actorUserId, route.id, data.version!, stops[current].stopId); }
      catch { /* Saving the route does not depend on device storage. */ }
      await queryClient.invalidateQueries({ queryKey: ["dispatch"] });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Route could not be saved. Your draft is still here.");
      await queryClient.invalidateQueries({ queryKey: ["dispatch"] }); }
    finally { setSaving(false); }
  }
  const totals = routeTotals(stops, includeReturn, returnMinutes);
  const estimateErrors = routeEstimateErrors(stops, includeReturn, returnMinutes);
  const timeline = routeTimeline(stops, startTime, includeReturn, returnMinutes);
  const target = route.stops.find(stop => stop.stopId === stops[current]?.stopId);
  const href = navigationUrl(app, target?.address || "");
  const stale = version !== route.version;
  const navigationReady = !dirty && !stale && !saving && estimateErrors.length === 0;
  const lastAddress = route.stops.find(stop => stop.stopId === stops.at(-1)?.stopId)?.address;
  const returnCheck = lastAddress?.trim() ? navigationUrl("google", returnAddress, lastAddress) : null;
  function selectNavigationStop(index: number) {
    if (!navigationReady || !stops[index]) return;
    setCurrent(index);
    try { saveRouteNavigation(sessionStorage, actorUserId, route.id, version, stops[index].stopId); }
    catch { setMessage("This browser cannot remember the selected stop. Check your selection when you return from Maps."); }
  }
  return <article className="space-y-5 rounded-xl border bg-white p-5">
    <div><h2 className="text-lg font-bold">Plan my route</h2>
      <p className="mt-1 text-sm text-slate-600">Choose your stop order and time on site. Visit estimates are planning time, not billable or approved labor.</p></div>
    {stale && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">Dispatch has a newer route. Your draft is preserved. Compare it with the current assignments before replacing this draft.</p>}
    <div className="grid gap-4 md:grid-cols-3">
      <label className="space-y-2 text-sm font-medium">Route start address
        <Input value={startAddress} maxLength={500} disabled={saving} onChange={e => { setStartAddress(e.target.value); setStops(stops.map((s, i) => i ? s : { ...s, driveMinutes: null })); setDirty(true); }} placeholder="Starting address for drive estimates" /></label>
      <label className="space-y-2 text-sm font-medium">Start the day at
        <Input aria-label="Route start time" type="time" step={300} value={startTime} disabled={saving}
          onChange={e => { setStartTime(e.target.value); setDirty(true); }} /></label>
      <div className="space-y-2 text-sm font-medium"><span>Navigation app</span>
        <Select value={app} onValueChange={value => { setApp(value as NavigationApp); try { localStorage.setItem("techcommand.navigation-app", value); } catch {} }}>
          <SelectTrigger aria-label="Navigation app"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="google">Google Maps</SelectItem><SelectItem value="apple">Apple Maps</SelectItem><SelectItem value="waze">Waze</SelectItem>
          </SelectContent></Select></div>
    </div>
    <GoogleRouteEstimates route={route} stops={stops} version={version} startAddress={startAddress} startTime={startTime}
      includeReturn={includeReturn} returnAddress={returnAddress} disabled={saving || stale} />
    <p className="text-sm text-slate-600">Saved manual plan: enter your own driving estimates below. “Check drive” opens the leg in Google Maps. Only the address is sent to the navigation provider.</p>
    <ol className="space-y-3">{stops.map((stop, index) => {
      const job = route.stops.find(job => job.stopId === stop.stopId);
      const projection = timeline.stops[index];
      const previous = index ? route.stops.find(job => job.stopId === stops[index - 1].stopId)?.address : startAddress;
      const check = navigationUrl("google", job?.address || "", previous);
      return <li key={stop.stopId} className="space-y-3 rounded-xl border bg-slate-50 p-4">
        <div className="flex items-start gap-3"><span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-800">{index + 1}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{job?.locationName || "Assignment changed — refresh route"}</p><p className="text-sm text-slate-600">{job?.address}</p>
            <p className="text-sm text-slate-500">{job?.externalId} · {job?.assignmentStatus}</p></div>
          <Button size="icon" variant="outline" aria-label={`Move stop ${index + 1} up`} disabled={saving || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
          <Button size="icon" variant="outline" aria-label={`Move stop ${index + 1} down`} disabled={saving || index === stops.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">On-site minutes<Input aria-label={`On-site minutes stop ${index + 1}`} aria-invalid={!validServiceMinutes(stop.serviceMinutes)} type="number" min={1} max={720} step={1} value={stop.serviceMinutes || ""} disabled={saving}
            onChange={e => { setStops(stops.map(s => s.stopId === stop.stopId ? { ...s, serviceMinutes: Number(e.target.value) } : s)); setDirty(true); }} /></label>
          <label className="space-y-1 text-sm">Drive minutes to this stop<Input aria-label={`Drive minutes stop ${index + 1}`} aria-invalid={stop.driveMinutes !== null && !validDriveMinutes(stop.driveMinutes)} type="number" min={0} max={1440} step={1} placeholder="Not estimated" value={stop.driveMinutes ?? ""} disabled={saving}
            onChange={e => { setStops(stops.map(s => s.stopId === stop.stopId ? { ...s, driveMinutes: e.target.value === "" ? null : Number(e.target.value) } : s)); setDirty(true); }} /></label>
          {check && previous?.trim() && <Button asChild variant="outline" className="self-end"><a href={check} target="_blank" rel="noreferrer">Check drive</a></Button>}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
          <div><p className="text-slate-500">Projected arrival</p><p className="font-semibold">{projection?.arrivalMinutes == null ? "Waiting on drive time" : formatProjectedTime(projection.arrivalMinutes)}</p></div>
          <div><p className="text-slate-500">Projected departure</p><p className="font-semibold">{projection?.departureMinutes == null ? "Waiting on drive time" : formatProjectedTime(projection.departureMinutes)}</p></div>
        </div></li>;
    })}</ol>
    {!stops.length && <p>No stops are assigned to this route yet.</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeReturn} disabled={saving} onChange={e => { setIncludeReturn(e.target.checked); setDirty(true); }} />Include a return trip after the last stop</label>
    {includeReturn && <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Return address<Input value={returnAddress} maxLength={500} aria-invalid={!returnAddress.trim()} disabled={saving} onChange={e => { setReturnAddress(e.target.value); setReturnMinutes(null); setDirty(true); }} /></label>
      <label className="space-y-1 text-sm">Return drive minutes<Input type="number" min={0} max={1440} step={1} aria-invalid={returnMinutes !== null && !validDriveMinutes(returnMinutes)} value={returnMinutes ?? ""} disabled={saving} placeholder="Not estimated" onChange={e => { setReturnMinutes(e.target.value === "" ? null : Number(e.target.value)); setDirty(true); }} /></label>
      {returnCheck && <Button asChild variant="outline"><a href={returnCheck} target="_blank" rel="noreferrer">Check return drive</a></Button>}
    </div>}
    {includeReturn && !returnAddress.trim() && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">Enter the return destination or turn off the return trip before saving.</p>}
    {estimateErrors.length > 0 && <ul role="alert" className="list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm">{estimateErrors.map(error => <li key={error}>{error}</li>)}</ul>}
    <div className="grid gap-3 rounded-xl bg-blue-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-sm">On-site time</p><p className="text-xl font-bold">{totals.onsite === null ? "Incomplete" : duration(totals.onsite)}</p></div>
      <div><p className="text-sm">{totals.missing ? "Drive time entered so far" : "Estimated drive time"}</p><p className="text-xl font-bold">{duration(totals.drive)}</p></div>
      <div><p className="text-sm">Estimated day total</p><p className="text-xl font-bold">{totals.total === null ? "Incomplete" : duration(totals.total)}</p></div>
      <div><p className="text-sm">Projected finish</p><p className="text-xl font-bold">{timeline.finishMinutes === null ? "Incomplete" : formatProjectedTime(timeline.finishMinutes)}</p></div>
    </div>
    <p className="text-sm text-slate-600">Timeline starts at {startTime || "an unset time"}. {totals.missing ? `${totals.missing} driving estimate(s) still needed. ` : ""}{includeReturn ? "Includes return travel. " : "Ends at the last stop; return travel excluded. "}Breaks and delays are not included. This projection does not reschedule customer appointments.</p>
    {!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">Choose a route start time to save this plan.</p>}
    {draftMessage && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">{draftMessage}</p>}
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={saving || stale || !stops.length || !startAddress.trim() || estimateErrors.length > 0 || (includeReturn && !returnAddress.trim()) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)} onClick={save}>{saving ? "Saving…" : "Save route plan"}</Button>
      <Button variant="outline" disabled={saving} onClick={() => { if (!dirty || window.confirm("Replace this unsaved draft with the latest saved route?")) reload(); }}>Use latest saved route</Button></div>
    <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Start route</h3>
      <p className="text-sm text-slate-600">Save your plan, then select the next stop. Navigation starts from your current location. This tab remembers your selection while the saved plan stays the same. Come back here to select each following stop; this does not change job status.</p>
      <Select value={String(current)} disabled={!navigationReady || !stops.length} onValueChange={v => selectNavigationStop(Number(v))}><SelectTrigger aria-label="Next navigation stop"><SelectValue /></SelectTrigger>
        <SelectContent>{stops.map((s, i) => <SelectItem key={s.stopId} value={String(i)}>{i + 1}. {route.stops.find(j => j.stopId === s.stopId)?.locationName || "Stop unavailable"}</SelectItem>)}</SelectContent></Select>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!navigationReady || current === 0} onClick={() => selectNavigationStop(current - 1)}>Select previous stop</Button>
        <Button variant="outline" disabled={!navigationReady || current >= stops.length - 1} onClick={() => selectNavigationStop(current + 1)}>Select next stop</Button></div>
      {navigationReady && !href && stops.length > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">This stop is missing its service address. Ask dispatch to update the location before navigating.</p>}
      {href && navigationReady ? <Button asChild className="w-full"><a href={href} onClick={() => selectNavigationStop(current)} target="_blank" rel="noreferrer"><Navigation />Navigate to stop {current + 1}</a></Button> : <Button disabled className="w-full">{navigationReady && !href ? "Address needed for navigation" : "Save the current plan to navigate"}</Button>}
      {includeReturn && returnAddress.trim() && navigationReady && <Button asChild variant="outline" className="w-full"><a href={navigationUrl(app, returnAddress)!} target="_blank" rel="noreferrer">Navigate to return destination</a></Button>}
    </div>
  </article>;
}
