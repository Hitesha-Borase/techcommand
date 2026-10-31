"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetScanInput } from "@/components/asset-scan-input";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { captureOperationalEvent } from "@/lib/analytics-client";
import type { ScannedAsset } from "@/lib/asset-scanning";

type Label = { id: string; labelCode: string; source: string; status: string; createdAt: string; retirementReason: string | null; printCount: number; lastPrintedAt: string | null };
export function AssetLabelManager({ asset, onChanged }: { asset: ScannedAsset; onChanged: () => void }) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [source, setSource] = useState("intelliscanner");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retire, setRetire] = useState<Label | null>(null);
  const [reason, setReason] = useState("");
  const [printing, setPrinting] = useState<Label | null>(null);
  const [width, setWidth] = useState("3");
  const [height, setHeight] = useState("1.5");
  const [printReason, setPrintReason] = useState("");
  const [printConfirmed, setPrintConfirmed] = useState(false);
  const [pendingPrint, setPendingPrint] = useState<{ fingerprint: string; id: string } | null>(null);
  // The physical-match attestation must not survive an asset identity revision.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setConfirmed(false); }, [asset.id, asset.recordVersion, asset.locationId, asset.manufacturer, asset.model, asset.serialNumber]);
  const labels = useQuery({ queryKey: ["asset-labels", asset.id], queryFn: async () =>
    portalJson<{ labels: Label[] }>(await portalFetch(`/api/assets/labels?assetId=${encodeURIComponent(asset.id)}`), "Asset labels could not be loaded.") });
  async function save(retiring = false) {
    setBusy(true); setMessage(""); setError("");
    try {
      await portalJson(await portalFetch("/api/assets/labels", { method: retiring ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retiring ? { assetId: asset.id, labelId: retire?.id, reason } : {
          assetId: asset.id, labelCode: code, source, physicalMatch: confirmed, recordVersion: asset.recordVersion,
          locationId: asset.locationId, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber,
        }) }), "The label change could not be confirmed. Refresh the labels before retrying.");
      await client.invalidateQueries({ queryKey: ["asset-labels", asset.id] });
      await client.invalidateQueries({ queryKey: ["assets"] });
      await client.invalidateQueries({ queryKey: ["scanner-facilities"] });
      setCode(""); setConfirmed(false); setRetire(null); setReason(""); onChanged();
      setMessage(retiring ? "Label retired. Its number remains reserved for this equipment." : "Tag linked. Scan it to open this equipment record.");
      captureOperationalEvent("asset_label_saved", { outcome: "saved" });
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Label could not be saved."); captureOperationalEvent("asset_label_save_failed", { error_area: "asset_label" }); }
    finally { setBusy(false); }
  }
  async function printLabel() {
    if (!printing) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const body = {
        assetId: asset.id, labelId: printing.id, expectedRecordVersion: asset.recordVersion,
        widthMils: Math.round(Number(width) * 1000), heightMils: Math.round(Number(height) * 1000), physicalMatch: printConfirmed,
        reason: printing.printCount > 0 ? printReason.trim() : null,
      };
      const fingerprint = JSON.stringify(body);
      const requestId = pendingPrint?.fingerprint === fingerprint ? pendingPrint.id : crypto.randomUUID();
      setPendingPrint({ fingerprint, id: requestId });
      const response = await portalFetch("/api/assets/labels/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...body, requestId,
      }) });
      if (!response.ok) await portalJson(response, "The permanent label PDF could not be prepared.");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `TechFlex-${asset.assetTag}-permanent-label.pdf`;
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
      await client.invalidateQueries({ queryKey: ["asset-labels", asset.id] });
      setPendingPrint(null); setPrinting(null); setPrintReason(""); setPrintConfirmed(false); setMessage("Permanent label PDF prepared. Print at actual size and verify the physical scan before applying it.");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "The permanent label PDF could not be prepared."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border p-4">
    <h3 className="font-bold">Permanent asset tags</h3>
    <p className="text-sm text-slate-600">Link a sticker to this equipment once. The existing asset ID and service history stay intact. Keep permanent tags separate from dated PM stickers.</p>
    {labels.isError && <p role="alert" className="text-sm text-red-800">{labels.error.message}<Button variant="outline" onClick={() => { void labels.refetch(); }}>Retry</Button></p>}
    {labels.data?.labels.map(label => <div key={label.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
      <div><strong className="font-mono">{label.labelCode}</strong> · {label.source} · {label.status}{label.retirementReason && <p>{label.retirementReason}</p>}</div>
      {label.status === "active" && <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setPendingPrint(null); setPrinting(label); setPrintReason(""); setPrintConfirmed(false); }}>Print label{label.printCount > 0 ? ` again (${label.printCount} prior)` : ""}</Button><Button type="button" variant="outline" size="sm" onClick={() => { setRetire(label); setReason(""); }}>Retire label</Button></div>}
    </div>)}
    {printing ? <div className="space-y-3 border-t pt-3"><h4 className="font-semibold">{printing.printCount > 0 ? "Prepare a tracked reprint" : "Prepare first print"}</h4>
      <p className="text-sm">Code 128 will contain the exact active label <strong className="font-mono">{printing.labelCode}</strong>. Enter the actual stock dimensions; the PDF does not configure or certify a printer.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Width in inches<Input inputMode="decimal" value={width} onChange={event => setWidth(event.target.value)} /></label><label className="text-sm font-semibold">Height in inches<Input inputMode="decimal" value={height} onChange={event => setHeight(event.target.value)} /></label></div>
      {printing.printCount > 0 && <label className="block text-sm font-semibold">Reprint reason<Input value={printReason} maxLength={500} onChange={event => setPrintReason(event.target.value)} placeholder="Damaged, unreadable or placement correction" /></label>}
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={printConfirmed} onChange={event => setPrintConfirmed(event.target.checked)} />I confirmed this active label and the equipment identity above, and I will print at actual size and test-scan before applying it.</label>
      <Button type="button" disabled={busy || !printConfirmed || !Number.isFinite(Number(width)) || !Number.isFinite(Number(height)) || Number(width) < 2 || Number(width) > 6 || Number(height) < 1 || Number(height) > 4 || (printing.printCount > 0 && printReason.trim().length < 5)} onClick={() => { void printLabel(); }}>{busy ? "Preparing…" : "Save print event and download PDF"}</Button>
      <Button type="button" variant="ghost" onClick={() => { setPendingPrint(null); setPrinting(null); }}>Cancel</Button>
    </div> : null}
    {retire ? <div className="space-y-3 border-t pt-3"><p className="text-sm">Retire label <strong>{retire.labelCode}</strong>? It will stop opening this asset and can never be reassigned.</p>
      <label className="block text-sm font-semibold">Reason<Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
      <Button type="button" disabled={busy || reason.trim().length < 5} onClick={() => { void save(true); }}>Confirm retirement</Button>
      <Button type="button" variant="ghost" onClick={() => setRetire(null)}>Cancel</Button>
    </div> : <div className="space-y-3 border-t pt-3">
      <label className="block space-y-2 text-sm font-semibold">New tag source<select className="h-10 w-full rounded-lg border px-3" value={source} onChange={event => setSource(event.target.value)}><option value="intelliscanner">IntelliScanner · Code 39 · 7–8 digits</option><option value="custom">Other custom asset tag</option></select></label>
      <AssetScanInput label="Scan the unused sticker" disabled={busy} onScan={value => { setCode(value); setConfirmed(false); setError(""); setMessage(""); }} />
      {code && <div className="space-y-3 rounded-lg bg-cyan-50 p-3"><p className="break-all text-sm">Link <strong className="font-mono">{code}</strong> to <strong>{asset.assetTag}</strong>?</p>
        <p className="text-sm">{asset.locationName} · {asset.manufacturer} {asset.model} · S/N {asset.serialNumber || "not recorded"}</p>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I matched this sticker to the physical equipment shown above. I will capture any missing serial in the service record.</label>
        <Button type="button" disabled={busy || !confirmed} onClick={() => { void save(); }}>{busy ? "Saving…" : "Link tag to this asset"}</Button>
      </div>}
    </div>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <p className="text-sm text-slate-500">Do not cover manufacturer plates, vents or controls. Confirm label material suits the facility cleaning process.</p>
  </section>;
}
