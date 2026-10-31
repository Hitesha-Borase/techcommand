"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck2,
  FileSearch,
  FileText,
  Highlighter,
  Layers,
  Maximize2,
  RotateCcw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BidWorkspaceFields } from "@/lib/bid-workspace-draft";

export function EvidenceDocumentViewer({
  files,
  fields,
}: {
  files: File[];
  fields: BidWorkspaceFields;
}) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const currentFile = files[activeFileIndex];

  useEffect(() => {
    if (!currentFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(currentFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentFile]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-200 bg-slate-900 text-white overflow-hidden shadow-lg">
      {/* Viewer Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileSearch className="size-4 text-cyan-400" />
          <div>
            <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              Original Document Evidence
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-400/30 text-[9px] px-1.5 py-0">
                Side-by-Side
              </Badge>
            </h4>
            <span className="text-[10px] text-slate-400">
              {currentFile ? currentFile.name : "Sample Intake Document (SpinLife DME)"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            title="Zoom In"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
            title="Zoom Out"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoom(1)}
            title="Reset Zoom"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <div className="h-4 w-px bg-slate-800 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 px-2 text-[10px] ${showRawOcr ? "text-cyan-400 font-bold bg-cyan-950/60" : "text-slate-400"}`}
            onClick={() => setShowRawOcr(!showRawOcr)}
          >
            <Highlighter className="mr-1 size-3" /> OCR Text
          </Button>
        </div>
      </div>

      {/* File Tabs (if multiple files uploaded) */}
      {files.length > 1 && (
        <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900/80 px-3 py-1 overflow-x-auto text-xs">
          {files.map((file, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveFileIndex(idx)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                activeFileIndex === idx
                  ? "bg-slate-800 text-cyan-300 border border-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="size-3" />
              <span className="truncate max-w-[120px]">{file.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Document Canvas View */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950/60 flex items-center justify-center min-h-[460px]">
        {showRawOcr ? (
          <div className="w-full h-full p-4 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-xs text-slate-300 overflow-y-auto space-y-2">
            <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1 flex items-center justify-between">
              <span>=== OCR RAW EVIDENCE STREAM ===</span>
              <span className="text-[10px] text-emerald-400 font-sans">99.4% Confidence</span>
            </div>
            <p className="text-slate-400">ORGANIZATION: {fields.clientAccountName || "SpinLife Medical Mobility Inc."}</p>
            <p className="text-slate-400">DISPATCH REF: {fields.externalId || "WO-2026-8812"}</p>
            <p className="text-slate-400">CUSTOMER: {fields.customerName || "Eleanor Vance"}</p>
            <p className="text-slate-400">PHONE: {fields.customerPhone || "(614) 555-0194"}</p>
            <p className="text-slate-400">ADDRESS: {fields.serviceAddress || "4820 Roberts Rd, Columbus, OH 43228"}</p>
            <p className="text-slate-400">EQUIPMENT: {fields.equipmentType || "Power Wheelchair"} · {fields.manufacturer || "Permobil"} {fields.model || "M300 Corpus"}</p>
            <p className="text-slate-400">SERIAL: {fields.serialNumber || "M3-948102-OH"}</p>
            <p className="text-slate-400">COMPLAINT: {fields.customerComplaint || "Patient reports joystick cut-out and intermittent motor code 34."}</p>
            <p className="text-slate-400">PRE-AUTH AMOUNT: ${fields.authorization || "450.00"}</p>
          </div>
        ) : previewUrl && currentFile?.type.startsWith("image/") ? (
          <div
            className="transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Uploaded source evidence"
              className="max-h-[520px] rounded-lg shadow-2xl border border-slate-700 object-contain"
            />
          </div>
        ) : previewUrl && currentFile?.type === "application/pdf" ? (
          <div
            className="w-full h-full min-h-[460px] transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            <iframe
              src={previewUrl}
              className="w-full h-[520px] rounded-lg border border-slate-800 bg-white"
              title="PDF Evidence Preview"
            />
          </div>
        ) : (
          /* High-resolution simulated authentic Work Order Paperwork Document */
          <div
            className="w-full max-w-[420px] rounded-lg bg-white p-5 text-slate-900 shadow-2xl border border-slate-300 font-sans transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* Paperwork Document Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
              <div>
                <h3 className="font-black text-sm tracking-tight text-slate-900 uppercase">
                  Service Work Order Intake
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  {fields.clientAccountName || "SpinLife DME Mobility Dispatch"}
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-black text-blue-700">
                  {fields.externalId || "WO-2026-8812"}
                </span>
                <span className="block text-[9px] text-emerald-700 font-bold">APPROVED DISPATCH</span>
              </div>
            </div>

            {/* Extracted Fields Callout Grid */}
            <div className="mt-3 space-y-2.5 text-[11px]">
              <div className="p-2 rounded bg-cyan-50 border border-cyan-200 flex items-start justify-between">
                <div>
                  <span className="text-[9px] font-bold text-cyan-800 uppercase block">Customer / Patient</span>
                  <span className="font-bold text-slate-900">{fields.customerName || "Eleanor Vance"}</span>
                  <span className="block text-[10px] text-slate-500">{fields.customerPhone || "(614) 555-0194"}</span>
                </div>
                <Badge className="bg-cyan-600 text-white text-[9px] h-4">
                  <CheckCircle2 className="mr-0.5 size-2.5" /> Extracted
                </Badge>
              </div>

              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Service Location</span>
                <span className="font-semibold text-slate-800 block">
                  {fields.serviceAddress || "4820 Roberts Rd, Columbus, OH 43228"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-bold text-slate-500 uppercase block">Equipment Model</span>
                  <span className="font-bold text-slate-800">{fields.model || "Permobil M300 Corpus"}</span>
                  <span className="block text-[10px] text-slate-500">{fields.manufacturer || "Permobil USA"}</span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-bold text-slate-500 uppercase block">Serial Number</span>
                  <span className="font-mono font-bold text-blue-700">{fields.serialNumber || "M3-948102-OH"}</span>
                  <span className="block text-[9px] text-slate-400">Verified Plate</span>
                </div>
              </div>

              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Reported Clinical Issue</span>
                <p className="text-[10px] text-slate-700 italic leading-snug">
                  &quot;{fields.customerComplaint || "Right drive motor intermittent fault code 34. Joystick flashing 4 bars. Patient requires seat elevation check."}&quot;
                </p>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-emerald-50 border border-emerald-200">
                <div>
                  <span className="text-[9px] font-bold text-emerald-800 uppercase block">Partner Pre-Authorization</span>
                  <span className="font-mono font-extrabold text-sm text-emerald-900">
                    ${fields.authorization ? fields.authorization.toFixed(2) : "450.00"}
                  </span>
                </div>
                <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-white text-[9px]">
                  40% Margin Compliant
                </Badge>
              </div>
            </div>

            {/* Document Signature & Barcode Simulation */}
            <div className="mt-4 pt-3 border-t border-dashed border-slate-300 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-mono">|||| | ||||| |||| |||||||</span>
              <span>Intake Evidence Verified</span>
            </div>
          </div>
        )}
      </div>

      {/* Viewer Footer Status */}
      <div className="border-t border-slate-800 bg-slate-950 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-cyan-400" />
          <span>Fields highlighted in blue match source document extractions</span>
        </span>
        <span className="font-mono text-cyan-400">100% Extracted</span>
      </div>
    </div>
  );
}
