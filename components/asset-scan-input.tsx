"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseAssetScan, scannerPermissionMessage } from "@/lib/asset-scanning";
import { readAssetBarcodes } from "@/lib/asset-barcode-reader";

export function AssetScanInput({ onScan, disabled = false, label = "Asset tag", testOnly = false }: {
  onScan: (value: string) => void; disabled?: boolean; label?: string; testOnly?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const session = useRef(0);
  const busy = useRef(false);
  const last = useRef({ value: "", time: 0 });
  const [value, setValue] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [message, setMessage] = useState("");
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [focused, setFocused] = useState(false);
  const onScanRef = useRef(onScan); onScanRef.current = onScan;

  function stop() {
    session.current += 1;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false); setReading(false); busy.current = false;
  }
  useEffect(() => () => { session.current += 1; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  function accept(raw: string, keyboard = false) {
    if (disabled) return false;
    try {
      const parsed = parseAssetScan(raw, keyboard ? { prefix, suffix } : {});
      const code = parsed.kind === "asset_id" ? `techflex:asset:${parsed.value}` : parsed.value;
      if (last.current.value === code && Date.now() - last.current.time < 1500) return false;
      last.current = { value: code, time: Date.now() };
      setValue(""); setMessage(testOnly ? `Scanner received: ${code}. Nothing was saved.` : "Tag received. Checking the asset…");
      stop(); onScanRef.current(code); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check the tag and try again."); return false; }
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setMessage(scannerPermissionMessage(null)); return; }
    stop(); const run = session.current; setCamera(true); setMessage("Starting camera…");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } });
      if (run !== session.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (!video.current) { stop(); return; }
      video.current.srcObject = media; await video.current.play();
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Camera canvas unavailable");
      setMessage("Point at one barcode. Keep the complete bars and surrounding white space visible.");
      const read = async () => {
        if (run !== session.current || !video.current) return;
        const current = video.current;
        if (current.videoWidth && current.readyState >= 2) {
          const scale = Math.min(1, 1600 / Math.max(current.videoWidth, current.videoHeight));
          canvas.width = Math.round(current.videoWidth * scale); canvas.height = Math.round(current.videoHeight * scale);
          context.drawImage(current, 0, 0, canvas.width, canvas.height);
          try {
            const results = await readAssetBarcodes(context.getImageData(0, 0, canvas.width, canvas.height));
            if (run !== session.current) return;
            if (results.length === 1 && accept(results[0].value)) return;
            if (results.length > 1) setMessage("More than one barcode is visible. Cover the other labels and scan only the asset tag.");
          } catch { if (run === session.current) { stop(); setMessage(scannerPermissionMessage(null)); } return; }
        }
        if (run === session.current) window.setTimeout(() => { void read(); }, 400);
      };
      void read();
    } catch (error) { if (run === session.current) { stop(); setMessage(scannerPermissionMessage(error)); } }
  }
  async function readPhoto(file?: File) {
    if (!file || busy.current) return;
    stop(); const run = session.current; busy.current = true; setReading(true); setMessage("Reading the barcode on this device…");
    try {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("Choose an image up to 10 MB, or use the scanner/manual entry.");
      const bitmap = await createImageBitmap(file);
      if (run !== session.current) { bitmap.close(); return; }
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { bitmap.close(); throw new Error("Image reading is unavailable. Enter the tag manually."); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const results = await readAssetBarcodes(context.getImageData(0, 0, canvas.width, canvas.height));
      if (run !== session.current) return;
      if (results.length !== 1) throw new Error(results.length ? "More than one barcode found. Photograph only the asset tag." : "No supported barcode found. Try a closer, well-lit photo or enter the printed tag number.");
      accept(results[0].value);
    } catch (error) { if (run === session.current) setMessage(error instanceof Error ? error.message : "Photo could not be read. Enter the tag manually."); }
    finally { if (run === session.current) { busy.current = false; setReading(false); } }
  }

  return <div className="space-y-3">
    <form onSubmit={event => { event.preventDefault(); accept(value, true); }} className="space-y-2">
      <label className="block space-y-2 text-sm font-semibold">{label}
        <Input ref={input} type="text" inputMode="text" autoComplete="off" autoCorrect="off" spellCheck={false}
          value={value} disabled={disabled || camera || reading} maxLength={256} placeholder="Scan here or type the full tag number"
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => setValue(event.target.value)}
          onKeyDown={event => { if (event.key === "Tab" && event.currentTarget.value) { event.preventDefault(); accept(event.currentTarget.value, true); } }} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || camera || reading || !value.trim()}><ScanLine />{testOnly ? "Test scan" : "Find asset"}</Button>
        <Button type="button" variant="outline" onClick={() => input.current?.focus()} disabled={disabled || camera || reading}>Use scanner</Button>
        <Button type="button" variant="outline" onClick={() => { void startCamera(); }} disabled={disabled || camera || reading}><Camera />Camera</Button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
          <Upload className="size-4" />Barcode photo
          <input className="sr-only" aria-label="Read a barcode photo" type="file" accept="image/*" capture="environment" disabled={disabled || camera || reading}
            onChange={event => { void readPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>
    </form>
    <div hidden={!camera} className="space-y-2"><video ref={video} muted playsInline className="max-h-72 w-full rounded-xl bg-slate-950" /><Button type="button" variant="outline" onClick={stop}><Square />Stop camera</Button></div>
    <p className="text-sm text-slate-600">{focused ? "Scanner ready. Scan one tag; Enter or Tab submits it." : "USB/Bluetooth scanners: select Use scanner, then scan. You can also type the tag."}</p>
    {message && <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm">{message}</p>}
    <details className="text-sm text-slate-600"><summary className="cursor-pointer font-semibold">Scanner setup</summary>
      <p className="mt-2">Use keyboard/HID mode and an Enter or Tab ending. Only this field receives scans. Code 39 (IntelliScanner), Code 128 and QR are supported for image reading. A number-only sticker needs manual entry.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Scanner prefix, if configured<Input value={prefix} maxLength={20} onChange={event => setPrefix(event.target.value)} placeholder="Usually blank" /></label>
        <label>Scanner suffix, if configured<Input value={suffix} maxLength={20} onChange={event => setSuffix(event.target.value)} placeholder="Usually blank; Enter/Tab handled" /></label>
      </div>
      <p className="mt-2">Barcode photos and camera frames stay on this device. An asset lookup requires an internet connection.</p>
    </details>
  </div>;
}
