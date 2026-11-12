"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetScanInput } from "@/components/asset-scan-input";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { captureOperationalEvent } from "@/lib/analytics-client";
import type { AssetScanResult, ScannedAsset, ScannedJob } from "@/lib/asset-scanning";

export function AssetIdentityCard({ asset }: { asset: ScannedAsset }) {
  return <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
    <p className="text-sm font-semibold text-cyan-800">{asset.accountName} · {asset.locationName}</p>
    <h3 className="mt-2 text-lg font-bold">{asset.manufacturer} {asset.model}</h3>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-slate-500">Asset ID</dt><dd className="break-all font-mono font-bold">{asset.assetTag}</dd></div>
      <div><dt className="text-slate-500">Serial number</dt><dd className="break-all font-mono font-bold">{asset.serialNumber || "Not recorded — capture before technical service"}</dd></div>
      <div><dt className="text-slate-500">Department / location</dt><dd>{asset.departmentName || "Not recorded"} · {asset.city}, {asset.state}</dd></div>
      <div><dt className="text-slate-500">Equipment status</dt><dd className="font-semibold">{asset.status.replaceAll("_", " ")}</dd></div>
      <div><dt className="text-slate-500">Last PM recorded</dt><dd>{asset.lastPmOn || "Not recorded"}</dd></div>
      <div><dt className="text-slate-500">Next PM recorded</dt><dd>{asset.nextPmDueOn || "Not established"}</dd></div>
    </dl>
  </div>;
}

export function AssetScanner({ onViewAsset, onOpenJob, onPlanAsset }: {
  onViewAsset?: (asset: ScannedAsset) => void;
  onOpenJob?: (job: ScannedJob) => void;
  onPlanAsset?: (assetId: string) => void;
}) {
  const [locationId, setLocationId] = useState("");
  const [kind, setKind] = useState("label");
  const [testMode, setTestMode] = useState(false);
  const [result, setResult] = useState<AssetScanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const latest = useRef(0);
  const lastCode = useRef("");
  const assets = useQuery({ queryKey: ["scanner-facilities"], queryFn: async () =>
    portalJson<{ assets: ScannedAsset[] }>(await portalFetch("/api/assets"), "Facilities could not be loaded.") });
  const facilities = [...new Map((assets.data?.assets || []).map(asset => [asset.locationId, { id: asset.locationId, name: `${asset.accountName} · ${asset.locationName}` }])).values()];
  const history = useQuery({ queryKey: ["scan-history", result?.asset.id], enabled: historyOpen && Boolean(result),
    queryFn: async () => portalJson<{ visits: Array<{ id: string; visitedAt: string; visitType: string; disposition: string; workOrderNumber: string | null }> }>(
      await portalFetch(`/api/asset-visits?assetId=${encodeURIComponent(result!.asset.id)}`), "Service history could not be loaded.") });

  function clear() { latest.current += 1; setResult(null); setError(""); setConfirmed(false); setHistoryOpen(false); setLoading(false); }
  async function resolve(code: string, open?: ScannedJob) {
    const run = ++latest.current; lastCode.current = code; setLoading(true); setError("");
    if (!open) { setResult(null); setConfirmed(false); setHistoryOpen(false); }
    try {
      const data = await portalJson<AssetScanResult>(await portalFetch("/api/assets/resolve", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, kind, locationId: locationId || undefined }) }), "Asset lookup failed. Check your connection and retry.");
      if (run !== latest.current) return;
      if (open) {
        const current = data.jobs.find(job => job.id === open.id && job.assignmentId === open.assignmentId);
        if (!current || !current.visitDate || data.asset.id !== result?.asset.id || data.asset.recordVersion !== result.asset.recordVersion || data.asset.status !== "in_service" || ["high", "critical"].includes(data.asset.riskClass)) {
          setResult(data); setConfirmed(false); throw new Error("This asset or assignment changed. Review its current identity and schedule before continuing.");
        }
        onOpenJob?.(current);
      }
      setResult(data);
      captureOperationalEvent("asset_scan_resolved");
    } catch (issue) { if (run === latest.current) { setResult(null); setConfirmed(false); setError(issue instanceof Error ? issue.message : "Asset lookup failed."); captureOperationalEvent("asset_scan_failed", { error_area: "asset_scan" }); } }
    finally { if (run === latest.current) setLoading(false); }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><ScanLine className="size-5 text-cyan-700" />Scan an asset</h2>
      <p className="mt-1 text-sm text-slate-600">Find the equipment, confirm its identity, then open its assigned service.</p></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={testMode} onChange={event => { clear(); setTestMode(event.target.checked); }} />Test scanner only</label>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-semibold">Facility
        <select className="h-10 w-full rounded-lg border bg-white px-3" value={locationId} onChange={event => { clear(); setLocationId(event.target.value); }}>
          <option value="">Any authorized facility</option>{facilities.map(facility => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-sm font-semibold">Label type
        <select className="h-10 w-full rounded-lg border bg-white px-3" value={kind} onChange={event => { clear(); setKind(event.target.value); }}>
          <option value="label">TechCommand / IntelliScanner asset tag</option><option value="facility_label">Facility’s existing asset number</option>
        </select>
      </label>
    </div>
    {kind === "facility_label" && !locationId && <p role="status" className="text-sm text-amber-800">Choose a facility first. Another facility may use the same legacy number.</p>}
    <AssetScanInput key={`${kind}:${locationId}:${testMode}`} testOnly={testMode} disabled={loading || (!testMode && kind === "facility_label" && !locationId)} onScan={code => { if (!testMode) void resolve(code); }} />
    {loading && <p role="status" className="text-sm">Checking current asset and assignment…</p>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}
      <Button type="button" variant="outline" className="ml-2" onClick={() => { void resolve(lastCode.current); }}>Retry lookup</Button></div>}
    {result && <div className="space-y-4 border-t pt-4">
      <AssetIdentityCard asset={result.asset} />
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
        I checked the physical equipment, facility, model and serial number against this record.</label>
      {(["high", "critical"].includes(result.asset.riskClass) || result.asset.status !== "in_service") &&
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{result.asset.status !== "in_service" ? "Equipment is on hold. Review its disposition before service." : "Applicable approved procedure unavailable in this scan flow. Identification and history remain available; technical work requires qualified review and authorization."}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!confirmed} onClick={() => { if (onViewAsset) onViewAsset(result.asset); else setHistoryOpen(true); }}><History />Asset history</Button>
        {onPlanAsset && result.canManageLabels && <Button type="button" variant="outline" disabled={!confirmed} onClick={() => onPlanAsset(result.asset.id)}>Plan PM / service</Button>}
      </div>
      <div className="space-y-2"><h3 className="font-bold">Open work orders</h3>
        {result.jobs.length ? result.jobs.map((job, index) => <div key={`${job.id}:${job.assignmentId || index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div><p className="font-semibold">{job.externalId || "Work order identifier not recorded"}</p><p className="text-sm text-slate-600">{job.serviceType.replaceAll("_", " ")} · {job.visitDate || "Scheduling needed"} · {job.status.replaceAll("_", " ")}</p></div>
          {onOpenJob && <Button type="button" disabled={!confirmed || loading || !job.visitDate || !job.assignmentId || result.asset.status !== "in_service" || ["high", "critical"].includes(result.asset.riskClass)}
            onClick={() => { void resolve(lastCode.current, job); }}>Open assignment <ArrowRight /></Button>}
        </div>) : <p className="text-sm text-slate-600">No active authorized work order is linked to this asset. Ask dispatch to link and schedule the PM assignment. Scanning does not create a visit or charge.</p>}
      </div>
      {historyOpen && <div className="space-y-2"><h3 className="font-bold">Recorded service history</h3>{history.isLoading && <p>Loading…</p>}{history.isError && <p role="alert">{history.error.message}</p>}
        {history.data?.visits.map(visit => <p key={visit.id} className="rounded-lg bg-slate-50 p-3 text-sm">{visit.visitedAt} · {visit.visitType.replaceAll("_", " ")} · {visit.disposition.replaceAll("_", " ")}{visit.workOrderNumber ? ` · ${visit.workOrderNumber}` : ""}</p>)}
        {history.data && !history.data.visits.length && <p className="text-sm">No visits recorded for this asset.</p>}</div>}
    </div>}
  </section>;
}
