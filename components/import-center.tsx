"use client";

import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { scopedAssetRows } from "@/lib/asset-intake";
import { parseCsv, rowsToObjects } from "@/lib/import-parsing";
import { blankImportTemplate, companyReferenceCsv, correctionOnlyCsv, importTemplateColumns } from "@/lib/import-templates";
import { suggestImportMapping, validateImportMapping } from "@/lib/import-mapping";
import { ImportMappingPanel, type ImportMappingProfile } from "@/components/import-mapping-panel";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Download, FileArchive, FileSpreadsheet, History, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Cell = string | number | boolean | null;
type ImportType = "accounts" | "locations" | "assets" | "work_orders" | "technician_pay";
type ImportRecord = { id: string; importType: string; source: string; fileName: string | null; status: string; rowCount: number; successCount: number; errorCount: number; createdCount: number; updatedCount: number; skippedCount: number; startedAt: string; errors?: {row:number;message:string}[] };
type Named = { id: string; externalId?: string | null; accountId?: string; accountName?: string; name?: string; assetTag?: string; manufacturer?: string; model?: string };
type WorkOrder = { id: string; externalId: string; accountName: string; summary: string };
type SpinLifeDraft = { workOrder: string; customerName: string; serviceAddress: string; email: string; phone: string; jobType: string; authorization: string; createdOn: string; product: string; manufacturer: string; model: string; specifications: string; jobNotes: string; assignedTo: string };
type AssetPreviewField = { field: string; label: string; current: string | number | null; incoming: string | number | null; blockedReason: string | null };
type AssetPreviewRow = { row: number; status: "new" | "changed" | "unchanged" | "conflict" | "error"; defaultAction: "create" | "skip"; assetTag: string; assetId: string | null; expectedRecordVersion: number | null; fields: AssetPreviewField[]; issue?: string | null };
type AssetDecision = { row: number; action: "create" | "update" | "skip"; assetId: string | null; expectedRecordVersion: number | null; fields: string[] };

const requirements: Record<ImportType, string> = {
  accounts: "Account Name. Account ID is recommended for matching future imports. Optional: Type, Billing Email, Terms Days, Service Level.",
  locations: "Account ID (recommended), Location Name, Address, City, State, ZIP. Account must already exist. Location ID is recommended for matching future imports.",
  assets: "Account ID and Location ID (recommended), Asset Tag, Manufacturer, Model. Names remain supported when unique. Optional: serial, risk, PM due date.",
  work_orders: "Account ID and Location ID (recommended), Work Order ID. Names remain supported when unique. Optional: service, status, schedule, price.",
  technician_pay: "Technician Code, Work Order ID. Optional: revenue, payout rate, payout, status.",
};

function ImportStatus({ item }: { item: ImportRecord }) {
  const processing = item.status === "processing";
  const hasErrors = item.errorCount > 0;
  return <>
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
      processing ? "border-blue-200 bg-blue-50 text-blue-800" : hasErrors ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"
    }`}>
      {processing || hasErrors ? <CircleAlert className="size-3"/> : <CheckCircle2 className="size-3"/>}
      {processing ? `${item.successCount + item.errorCount} of ${item.rowCount} checked · choose the same file to resume` : item.importType === "assets" ? `${item.createdCount} created · ${item.updatedCount} updated · ${item.skippedCount} skipped${hasErrors ? ` · ${item.errorCount} errors` : ""}` : `${item.successCount} saved${hasErrors ? ` · ${item.errorCount} errors` : ""}`}
    </span>
    {item.errors?.length ? <details className="mt-2 text-sm"><summary className="cursor-pointer text-blue-700">View row errors</summary><ul className="mt-2 max-h-48 space-y-1 overflow-auto">{item.errors.map(e=><li key={e.row}>Row {e.row}: {e.message}</li>)}</ul></details> : null}
  </>;
}

const categoryOptions: Record<string, { value: string; label: string }[]> = {
  work_order: [
    { value: "completed_work_order", label: "Completed work order" }, { value: "service_report", label: "Service report" },
    { value: "customer_signature", label: "Customer signature" }, { value: "bill_of_lading", label: "Bill of lading" },
    { value: "invoice", label: "Invoice" }, { value: "service_document", label: "Other service document" },
  ],
  technician: [
    { value: "w4", label: "W-4" }, { value: "w2", label: "W-2" }, { value: "i9", label: "I-9" },
    { value: "pay_stub", label: "Pay statement" }, { value: "direct_deposit", label: "Direct deposit" },
    { value: "employment_agreement", label: "Employment agreement" }, { value: "credential", label: "Credential" },
    { value: "training", label: "Training" }, { value: "employee_other", label: "Other employee record" },
  ],
  account: [{ value: "contract", label: "Contract" }, { value: "rate_sheet", label: "Rate sheet" }, { value: "insurance", label: "Insurance" }, { value: "other", label: "Other" }],
  customer: [{ value: "customer_document", label: "Customer document" }, { value: "service_document", label: "Service document" }, { value: "other", label: "Other" }],
  asset: [{ value: "service_document", label: "Service record" }, { value: "other", label: "Manual or other" }],
  location: [{ value: "service_document", label: "Location service document" }, { value: "other", label: "Other" }],
  organization: [{ value: "intake_document", label: "General intake" }, { value: "policy", label: "Policy" }, { value: "procedure", label: "Procedure" }, { value: "license", label: "License" }, { value: "insurance", label: "Insurance" }, { value: "w9", label: "W-9" }, { value: "accreditation", label: "Accreditation" }, { value: "other", label: "Other" }],
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return portalJson<T>(response, "The request could not be completed.");
}

function spinLifeDraft(text: string): SpinLifeDraft {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const match = (pattern: RegExp) => clean.match(pattern)?.[1]?.trim() || "";
  const email = match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const phone = match(/(\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})/);
  const workOrder = match(/Work\s*Order\s*#?\s*([A-Z0-9-]+)/i);
  const model = match(/Model\s*(?:No\.?|Number|#)?\s*[:.]?\s*([A-Z0-9-]+)/i);
  const authorization = match(/Job\s*Pays\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const createdOn = match(/Job\s*Created\s*On[\s\S]{0,60}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const customerBlock = match(/Customer\s*Information\s*([\s\S]*?)(?:Primary\s*Product|Job\s*Details|Assigned\s*To)/i);
  const customerLines = customerBlock.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => !line.includes("@") && !/\d{3}.?\d{3}.?\d{4}/.test(line));
  const customerName = customerLines.find((line) => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(line)) || match(/Customer\s*Information[^\n]*\n([A-Za-z][A-Za-z .'-]+?)(?:\s+Assigned\s*To)?\s*$/im);
  const addressLine = customerLines.find((line) => /^\d+\s+/.test(line)) || match(/\n(\d+\s+[A-Za-z0-9 .'-]+?)(?=\s+\d+\s+|\n)/);
  const cityLine = customerLines.find((line) => /,\s*[A-Z]{2}\s+\d{5}/.test(line)) || match(/\n([A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5})\b/);
  const productBlock = match(/Primary\s*Product\s*([\s\S]*?)(?:Job\s*Details|Product\s*Specifications)/i);
  const productLines = productBlock.split("\n").map((line) => line.trim()).filter(Boolean);
  const product = productLines.find((line) => !/^By\s+/i.test(line) && !/Model/i.test(line)) || lines.find((line) => /(?:VivaLift|lift chair|power chair|scooter)/i.test(line))?.split(/\s{2,}|\s+Install\b/i)[0] || "";
  const manufacturer = match(/\bBy\s+([^\n]+?)(?:\s+issues?\.|$)/im) || (["Pride", "Golden", "Invacare", "Drive", "Joerns", "Permobil"].find((name) => clean.toLowerCase().includes(name.toLowerCase())) || "");
  return {
    workOrder, customerName, serviceAddress: [addressLine, cityLine].filter(Boolean).join(", "), email, phone,
    jobType: match(/Job\s*Type\s*([A-Za-z ]+)/i).split("\n")[0] || "Repair", authorization, createdOn,
    product, manufacturer, model,
    specifications: match(/Product\s*Specifications\s*([\s\S]*?)(?:Job\s*Details|Assigned\s*To|Job\s*Type)/i).slice(0, 1000),
    jobNotes: match(/Job\s*Notes\s*([\s\S]*?)(?:Repair\s*Parts|Work\s*Order)/i).slice(0, 3000),
    assignedTo: match(/Assigned\s*To\s*([^\n]+(?:\n[^\n]+)?)/i).slice(0, 500),
  };
}

export function ImportCenter({ role, userId, initialType = "accounts", onOpenAssets }: { role: string; userId: string; initialType?: ImportType; onOpenAssets?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const spinLifeInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState<ImportType>(initialType);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceRows, setRows] = useState<Record<string, Cell>[]>([]);
  const [assetAccountId, setAssetAccountId] = useState("");
  const [assetLocationId, setAssetLocationId] = useState("");
  const rows = useMemo(() => importType === "assets" ? scopedAssetRows(sourceRows, assetAccountId, assetLocationId) : sourceRows, [sourceRows, importType, assetAccountId, assetLocationId]);
  const [importRequestId, setImportRequestId] = useState(() => crypto.randomUUID());
  const [importNeedsRetry, setImportNeedsRetry] = useState(false);
  const [mappingProfile, setMappingProfile] = useState<ImportMappingProfile | null>(null);
  const [mappingDraftActive, setMappingDraftActive] = useState(false);
  const [assetPreview, setAssetPreview] = useState<AssetPreviewRow[]>([]);
  const [assetDecisions, setAssetDecisions] = useState<Record<number, AssetDecision>>({});
  const [parseError, setParseError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [importResult,setImportResult] = useState<{successCount:number;errorCount:number;createdCount:number;updatedCount:number;skippedCount:number;errors:{row:number;message:string}[];submittedRows:Record<string, Cell>[]} | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [spinlife, setSpinlife] = useState<SpinLifeDraft | null>(null);
  const [form, setForm] = useState({ scopeType: "organization", scopeId: "techflex", category: "intake_document", title: "", effectiveOn: "", expiresOn: "" });
  const isSpreadsheet = Boolean(selectedFile && /\.(csv|xlsx)$/i.test(selectedFile.name));
  const isImage = Boolean(selectedFile && /^image\//.test(selectedFile.type));
  const canManageEmployeeFiles = role === "owner_administrator" || role === "finance";
  const history = useQuery({ queryKey: ["imports"], queryFn: () => json<{ imports: ImportRecord[] }>("/api/imports") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => json<{ accounts: Named[] }>("/api/accounts") });
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => json<{ customers: Named[] }>("/api/customers") });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: () => json<{ technicians: Named[] }>("/api/technicians") });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => json<{ locations: Named[] }>("/api/locations") });
  const assets = useQuery({ queryKey: ["assets"], queryFn: () => json<{ assets: Named[] }>("/api/assets") });
  const workOrders = useQuery({ queryKey: ["work-orders"], queryFn: () => json<{ workOrders: WorkOrder[] }>("/api/work-orders") });
  const options: Record<string, Named[]> = {
    account: accounts.data?.accounts || [], customer: customers.data?.customers || [], technician: technicians.data?.technicians || [], location: locations.data?.locations || [], asset: assets.data?.assets || [],
    work_order: (workOrders.data?.workOrders || []).map((item) => ({ id: item.id, name: `${item.externalId} · ${item.accountName} · ${item.summary}` })),
  };
  const categories = form.scopeType === "technician" && !canManageEmployeeFiles ? categoryOptions.technician.filter((item) => ["credential", "training"].includes(item.value)) : categoryOptions[form.scopeType];
  const headers = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
  const normalizedHeaders = useMemo(() => headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")), [headers]);
  const missingExactReferences = rows.length > 0 && (
    (importType === "locations" && !normalizedHeaders.includes("account_id")) ||
    (["assets", "work_orders"].includes(importType) && (!normalizedHeaders.includes("account_id") || !normalizedHeaders.includes("location_id")))
  );
  const directColumnsReady = useMemo(() => {
    const direct = Object.fromEntries(importTemplateColumns[importType].filter((target) => normalizedHeaders.includes(target)).map((target) => [target, target]));
    const suggested = suggestImportMapping(headers, importType);
    return validateImportMapping(headers, importType, direct).ready && Object.entries(suggested).every(([target, source]) => target === source);
  }, [headers, importType, normalizedHeaders]);
  const columnsReady = !mappingDraftActive && (directColumnsReady || Boolean(mappingProfile));

  function downloadCsv(fileName: string, contents: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetAssetReview() { setAssetPreview([]); setAssetDecisions({}); setImportRequestId(crypto.randomUUID()); }

  function clearFile() { setSelectedFile(null); setRows([]); setParseError(""); setImportNeedsRetry(false); setMappingProfile(null); setMappingDraftActive(false); resetAssetReview(); setOcrText(""); setSpinlife(null); setOcrProgress(null); setForm((current) => ({ ...current, title: "" })); if (inputRef.current) inputRef.current.value = ""; if (spinLifeInputRef.current) spinLifeInputRef.current.value = ""; }

  function changeImportType(value: ImportType) {
    setImportType(value);
    setImportResult(null);
    setImportNeedsRetry(false);
    setMappingProfile(null);
    setMappingDraftActive(false);
    resetAssetReview();
  }

  async function archive(file: File, values = form) {
    const body = new FormData(); Object.entries(values).forEach(([key, value]) => body.set(key, value)); body.set("title", values.title.trim() || file.name.replace(/\.[^.]+$/, "").replaceAll("_", " ")); body.set("file", file);
    const response = await portalFetch("/api/documents", { method: "POST", body });
    if (response.status === 409) {
      const data = await portalJson<{ error?: string }>(response, "File upload could not be confirmed.", [409]);
      if (data.error === "This file is already attached to the selected record. Refresh saved files before retrying. If it was deleted, check the Document Vault trash for recovery.") return;
      throw new Error(data.error || "A conflicting file save needs review. Refresh saved files before retrying.");
    }
    const data = await portalJson<{ document?: { id?: string } }>(response, "File upload failed.");
    if (!data.document?.id) throw new Error("The upload did not return a saved document. Keep this form open and check saved files before retrying.");
  }

  const previewAssets = useMutation({
    mutationFn: async () => {
      if (!selectedFile || importType !== "assets") throw new Error("Choose a biomedical asset spreadsheet.");
      if (!columnsReady) throw new Error("Map and save the required columns before reviewing assets.");
      const data = await json<{ preview: AssetPreviewRow[] }>("/api/imports", {
        method: "POST",
        body: JSON.stringify({
          mode: "preview",
          importType,
          source: selectedFile.name.toLowerCase().endsWith(".csv") ? "csv" : "excel",
          fileName: selectedFile.name,
          mappingProfileId: mappingProfile?.id,
          mappingProfileVersion: mappingProfile?.recordVersion,
          rows,
        }),
      });
      return data.preview;
    },
    onSuccess: (preview) => {
      setAssetPreview(preview);
      setAssetDecisions(Object.fromEntries(preview.map((item) => [item.row, {
        row: item.row,
        action: item.status === "new" ? "create" : "skip",
        assetId: item.assetId,
        expectedRecordVersion: item.expectedRecordVersion,
        fields: [],
      }])));
      setImportRequestId(crypto.randomUUID());
      toast.success("Asset rows are ready for review", { description: "Confirm every Create, selected-field Update, or Skip decision before importing." });
    },
    onError: (error) => toast.error(error.message),
  });

  function toggleAssetField(item: AssetPreviewRow, field: string, selected: boolean) {
    setAssetDecisions((current) => {
      const prior = current[item.row] || { row: item.row, action: "skip" as const, assetId: item.assetId, expectedRecordVersion: item.expectedRecordVersion, fields: [] };
      const fields = selected ? [...new Set([...prior.fields, field])] : prior.fields.filter((value) => value !== field);
      return { ...current, [item.row]: { ...prior, action: fields.length ? "update" : "skip", fields } };
    });
    setImportRequestId(crypto.randomUUID());
  }

  function setAssetCreate(item: AssetPreviewRow, create: boolean) {
    setAssetDecisions((current) => ({ ...current, [item.row]: {
      row: item.row,
      action: create ? "create" : "skip",
      assetId: null,
      expectedRecordVersion: null,
      fields: [],
    } }));
    setImportRequestId(crypto.randomUUID());
  }

  const importMutation = useMutation({
    mutationFn: async () => { if (!selectedFile) throw new Error("Choose a spreadsheet."); if (!columnsReady) throw new Error("Map and save the required partner columns before importing."); if (importType === "assets" && (assetPreview.length !== rows.length || Object.keys(assetDecisions).length !== rows.length)) throw new Error("Review every asset row before importing."); const submittedRows = rows; await archive(selectedFile, { ...form, scopeType: "organization", scopeId: "techflex", category: "intake_spreadsheet", title: `${selectedFile.name} source import` }); const data = await json<{ import: { successCount: number; errorCount: number; createdCount:number; updatedCount:number; skippedCount:number; errors:{row:number;message:string}[] } }>("/api/imports", { method: "POST", body: JSON.stringify({ mode: "apply", importId: importRequestId, importType, source: selectedFile.name.toLowerCase().endsWith(".csv") ? "csv" : "excel", fileName: selectedFile.name, mappingProfileId: mappingProfile?.id, mappingProfileVersion: mappingProfile?.recordVersion, rows: submittedRows, assetDecisions: importType === "assets" ? Object.values(assetDecisions).sort((a,b) => a.row - b.row) : undefined }) }); return { ...data, submittedRows }; },
    onSuccess: async (data) => { setImportNeedsRetry(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ["imports"] }), queryClient.invalidateQueries({ queryKey: ["documents"] }), queryClient.invalidateQueries({ queryKey: ["accounts"] }), queryClient.invalidateQueries({ queryKey: ["locations"] }), queryClient.invalidateQueries({ queryKey: ["technician-pay"] }), queryClient.invalidateQueries({ queryKey: ["assets"] }), queryClient.invalidateQueries({ queryKey: ["work-orders"] }), queryClient.invalidateQueries({ queryKey: ["finance"] })]); setImportResult({ ...data.import, submittedRows: data.submittedRows }); if (data.import.errorCount) toast.warning("Some rows need correction", { description: `${data.import.successCount} saved · ${data.import.errorCount} not imported. Download only the rejected rows below.` }); else { toast.success(importType === "assets" ? `${data.import.createdCount} created · ${data.import.updatedCount} updated · ${data.import.skippedCount} skipped` : "Spreadsheet archived and records imported"); clearFile(); } },
    onError: (error) => { setImportNeedsRetry(true); toast.error(error.message, { description: "The file remains selected. Retry safely to continue from the last confirmed row without importing confirmed rows twice." }); },
  });
  const documentUpload = useMutation({ mutationFn: async () => { if (!selectedFile) throw new Error("Choose a file."); await archive(selectedFile); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["documents"] }); toast.success("File indexed in the Document Vault"); clearFile(); }, onError: (error) => toast.error(error.message) });
  const extractSpinLife = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !isImage) throw new Error("Choose a SpinLife screenshot.");
      setOcrProgress(0);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: (message) => { if (message.status === "recognizing text" && typeof message.progress === "number") setOcrProgress(Math.round(message.progress * 100)); } });
      try { const result = await worker.recognize(selectedFile); return result.data.text; } finally { await worker.terminate(); }
    },
    onSuccess: (text) => { setOcrText(text); const draft = spinLifeDraft(text); setSpinlife(draft); setForm((current) => ({ ...current, title: draft.workOrder ? `SpinLife work order ${draft.workOrder}` : "SpinLife work order screenshot" })); setOcrProgress(100); toast.success("SpinLife fields extracted", { description: "Review highlighted information before creating the intake." }); },
    onError: (error) => { setOcrProgress(null); toast.error(error.message); },
  });
  const approveSpinLife = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !spinlife?.workOrder) throw new Error("Confirm the SpinLife work-order number.");
      const response = await portalFetch("/api/intakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ externalSource: "spinlife", externalId: spinlife.workOrder, noticeType: "new_assignment", serviceType: /repair/i.test(spinlife.jobType) ? "repair_single" : "evaluation", summary: `${spinlife.jobType || "Service"}: ${spinlife.product || "equipment"}`, rawText: ocrText, customerName: spinlife.customerName, customerPhone: spinlife.phone, customerEmail: spinlife.email, serviceAddress: spinlife.serviceAddress, customerComplaint: spinlife.jobNotes, equipmentType: spinlife.product, manufacturer: spinlife.manufacturer, model: spinlife.model, authorization: Number(spinlife.authorization.replace(/[^\d.]/g, "")) || null, shipmentStatus: /shipp/i.test(spinlife.jobNotes) ? "parts_shipping_to_customer" : "unknown", accessInstructions: spinlife.assignedTo ? `SpinLife Assigned To: ${spinlife.assignedTo}` : null, onsiteHours: 1, driveHours: 0, weightLb: 0, partsCount: /parts?/i.test(spinlife.jobNotes) ? 1 : 0, stairsCount: 0, hotelCost: 0, partsCost: 0, assetCount: 1 }) });
      const result = await portalJson<{ intake?: { id: string }; existingIntakeId?: string; error?: string }>(response, "The intake could not be created.", [409]);
      const intakeId = result.intake?.id || result.existingIntakeId;
      if (!response.ok && response.status !== 409) throw new Error(result.error || "The intake could not be created.");
      if (!intakeId) throw new Error(result.error || "The intake record could not be identified.");
      await archive(selectedFile, { ...form, scopeType: "work_order_intake", scopeId: intakeId, category: "source_work_order", title: `SpinLife work order ${spinlife.workOrder}` });
      return { duplicate: response.status === 409, workOrder: spinlife.workOrder };
    },
    onSuccess: async (result) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["work-order-intakes"] }), queryClient.invalidateQueries({ queryKey: ["documents"] }), queryClient.invalidateQueries({ queryKey: ["admin-tasks"] })]); toast.success(result.duplicate ? "Screenshot linked to existing intake" : "SpinLife intake created", { description: `${result.workOrder} is ready for operational review.` }); clearFile(); },
    onError: (error) => toast.error(error.message),
  });

  async function loadFile(file?: File) {
    if (!file || readingFile || importMutation.isPending || documentUpload.isPending || extractSpinLife.isPending) return; setParseError(""); setRows([]); setImportResult(null); setImportNeedsRetry(false); setMappingProfile(null); setMappingDraftActive(false); resetAssetReview(); setOcrText(""); setSpinlife(null); setOcrProgress(null); setSelectedFile(file); setForm((current) => ({ ...current, title: file.name.replace(/\.[^.]+$/, "").replaceAll("_", " ") }));
    if (file.size > 20 * 1024 * 1024) { setParseError("Files are limited to 20 MB."); return; }
    if (!/\.(csv|xlsx)$/i.test(file.name)) return;
    setReadingFile(true);
    try { const matrix = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : await (await import("read-excel-file/browser")).readSheet(file); const parsed = rowsToObjects(matrix as Cell[][]); if (!parsed.length) throw new Error("The file has headers but no data rows."); if (parsed.length > 1000) throw new Error("This intake accepts 1,000 rows at a time. Split larger files into batches."); setRows(parsed); } catch (error) { setParseError(error instanceof Error ? error.message : "The file could not be read."); } finally {setReadingFile(false);}
  }

  return <div className="space-y-5">
    {importResult ? <section role="status" className="rounded-xl border bg-white p-5"><h2 className="font-bold">{importType === "assets" ? `Import finished: ${importResult.createdCount} created · ${importResult.updatedCount} updated · ${importResult.skippedCount} skipped · ${importResult.errorCount} errors` : `Import finished: ${importResult.successCount} saved · ${importResult.errorCount} not imported`}</h2>{importResult.errors.length ? <><p className="mt-2 text-sm text-slate-600">This batch is closed. Download the rejected rows, correct them, then choose that correction file to start a new import. Successfully saved rows are excluded and will not be replayed.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { const correction = correctionOnlyCsv(importResult.submittedRows, importResult.errors); downloadCsv(`techcommand-${importType}-rows-to-correct.csv`, correction.contents); if (correction.protectedCellCount) toast.info("Spreadsheet formulas were made safe", { description: `${correction.protectedCellCount} cell${correction.protectedCellCount === 1 ? "" : "s"} beginning with =, +, - or @ received a leading apostrophe. Review those cells while correcting the file.` }); }}><Download/>Download {importResult.errorCount} row{importResult.errorCount === 1 ? "" : "s"} to correct</Button><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload/>Choose corrected file</Button></div><ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">{importResult.errors.map(e=><li key={e.row}><strong>Original row {e.row}:</strong> {e.message}</li>)}</ul></> : null}</section> : null}

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><article className="rounded-xl border bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-slate-900">Central file intake</h2><p className="mt-1 text-sm text-slate-500">One controlled entry point for business files and structured data.</p></div><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{isSpreadsheet ? <FileSpreadsheet className="size-5" /> : <FileArchive className="size-5" />}</span></div>
      {importType === "assets" && importResult && importResult.successCount > 0 && onOpenAssets ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold">Your reviewed import decisions were saved.</p><p className="mt-1 text-sm">Open the registry to verify newly created pending assets and review updates. Importing inventory does not establish service readiness, a PM result, or technical authorization.</p><Button className="mt-3" onClick={onOpenAssets}>Review biomedical assets</Button></div> : null}
      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-bold text-slate-900">Start with a clean spreadsheet</p><p className="mt-1 text-xs leading-5 text-slate-600">Choose what you are importing, download its blank template, then use the reference file to copy exact account and location IDs. This prevents records with similar names from being mixed up.</p><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><Select value={importType} onValueChange={(value) => changeImportType(value as ImportType)}><SelectTrigger className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="accounts">Accounts</SelectItem><SelectItem value="locations">Locations</SelectItem><SelectItem value="assets">Biomedical assets</SelectItem><SelectItem value="work_orders">Work orders</SelectItem><SelectItem value="technician_pay">Technician pay</SelectItem></SelectContent></Select><Button variant="outline" className="w-full bg-white sm:w-auto" onClick={() => downloadCsv(`techcommand-${importType}-template.csv`, blankImportTemplate(importType))}><Download/>Blank template</Button><Button variant="outline" className="w-full bg-white sm:w-auto" disabled={accounts.isLoading || locations.isLoading || !(accounts.data?.accounts.length)} onClick={() => downloadCsv("techcommand-account-location-references.csv", companyReferenceCsv(accounts.data?.accounts || [], locations.data?.locations || []))}><Download/>Account/location IDs</Button></div></div>
      {importType === "assets" ? <div className="mt-4 space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4"><h3 className="font-bold">Which facility is this asset list for?</h3><p className="text-sm text-slate-600">For a single-facility list without account or location columns, select the facility here. Existing references in the file are preserved and must still be mapped.</p><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm font-semibold">Paying account<Select disabled={importMutation.isPending} value={assetAccountId} onValueChange={value => {setAssetAccountId(value);setAssetLocationId("");setMappingProfile(null);resetAssetReview();}}><SelectTrigger><SelectValue placeholder="Choose account"/></SelectTrigger><SelectContent>{accounts.data?.accounts.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1 text-sm font-semibold">Service facility<Select disabled={!assetAccountId || importMutation.isPending} value={assetLocationId} onValueChange={value => {setAssetLocationId(value);setMappingProfile(null);resetAssetReview();}}><SelectTrigger><SelectValue placeholder="Choose facility"/></SelectTrigger><SelectContent>{locations.data?.locations.filter(item => item.accountId === assetAccountId).map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label></div><p className="text-sm text-slate-600">Importing creates inventory for review. Each device still needs its own verified serial, applicable PM procedure, measurements and service record.</p></div> : null}
      <label onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); if (event.dataTransfer.files.length !== 1) {setParseError("Drop one file at a time so every row can be reviewed."); return;} void loadFile(event.dataTransfer.files[0]);}} className="mt-5 block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center"><Upload className="mx-auto size-6 text-blue-600"/><span className="mt-2 block text-sm font-semibold">{selectedFile?.name || (importType === "assets" ? "Drop a biomedical asset list or choose a file" : "Drop a business file or choose a file")}</span><span className="mt-1 block text-xs text-slate-500">Excel, CSV, PDF, images, TXT, DOC, or DOCX · maximum 20 MB</span><input ref={inputRef} className="hidden" type="file" disabled={readingFile || importMutation.isPending || documentUpload.isPending} accept=".xlsx,.csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.txt,.doc,.docx" onChange={(event) => loadFile(event.target.files?.[0])}/></label>
      {parseError ? <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0"/>{parseError}</div> : null}
      {selectedFile && !parseError ? <div className="mt-5 space-y-4">{isSpreadsheet ? <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900"><strong>Importing as {importType.replaceAll("_", " ")}.</strong> {requirements[importType]} The original spreadsheet is archived in the Document Vault. If processing is interrupted, use <strong>Retry safely</strong> or choose the same unchanged file again; confirmed rows will not be imported twice.</div> : <><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold text-slate-700">File belongs to<Select value={form.scopeType} onValueChange={(value) => setForm({ ...form, scopeType: value, scopeId: value === "organization" ? "techflex" : "", category: value === "technician" && !canManageEmployeeFiles ? "credential" : categoryOptions[value][0].value })}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="organization">TechFlex company</SelectItem><SelectItem value="work_order">Work order</SelectItem><SelectItem value="account">Client account</SelectItem><SelectItem value="customer">Customer</SelectItem><SelectItem value="technician">Employee / technician</SelectItem><SelectItem value="location">Service location</SelectItem><SelectItem value="asset">Equipment asset</SelectItem></SelectContent></Select></label><label className="space-y-1.5 text-sm font-semibold text-slate-700">Document category<Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></label></div>{form.scopeType !== "organization" ? <label className="block space-y-1.5 text-sm font-semibold text-slate-700">Attach to record<Select value={form.scopeId} onValueChange={(value) => setForm({ ...form, scopeId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select record"/></SelectTrigger><SelectContent>{(options[form.scopeType] || []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.assetTag || `${item.manufacturer} ${item.model}`}</SelectItem>)}</SelectContent></Select></label> : null}<label className="block space-y-1.5 text-sm font-semibold text-slate-700">Document title<Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold text-slate-700">Document date<Input type="date" value={form.effectiveOn} onChange={(event) => setForm({ ...form, effectiveOn: event.target.value })}/></label><label className="space-y-1.5 text-sm font-semibold text-slate-700">Expiration date<Input type="date" value={form.expiresOn} onChange={(event) => setForm({ ...form, expiresOn: event.target.value })}/></label></div>{form.scopeType === "technician" ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Employee tax, identity, and payroll files are restricted to Finance and the Owner Administrator.</div> : null}</>}
        {isSpreadsheet ? <ImportMappingPanel importType={importType} sourceHeaders={headers} directReady={directColumnsReady} userId={userId} onProfileChange={profile => {setMappingProfile(profile);resetAssetReview();}} onDraftChange={active => {setMappingDraftActive(active);resetAssetReview();}}/> : null}
        {isSpreadsheet && importType === "assets" ? <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Review each asset row</h3><p className="mt-1 text-xs leading-5 text-slate-600">Blank cells preserve saved values. Location changes use Placement and configuration history. Governed risk and interval values use the category-policy workflow.</p></div><Button type="button" variant="outline" disabled={!rows.length || !columnsReady || previewAssets.isPending || importMutation.isPending} onClick={() => previewAssets.mutate()}>{previewAssets.isPending ? "Comparing assets…" : assetPreview.length ? "Refresh comparison" : "Compare with registry"}</Button></div>{assetPreview.length ? <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">{assetPreview.map(item => { const decision=assetDecisions[item.row]; return <article key={item.row} className="rounded-lg border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Row {item.row} · {item.assetTag || "unmatched row"}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold uppercase">{decision?.action || "skip"}</span></div>{item.status === "new" ? <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={decision?.action === "create"} onChange={event => setAssetCreate(item,event.target.checked)}/>Create this new asset with risk left unassessed when the file is blank</label> : null}{item.status === "changed" ? <div className="mt-3 space-y-2">{item.fields.map(field => <label key={field.field} className={`block rounded-md border p-2 text-sm ${field.blockedReason ? "bg-slate-50 text-slate-500" : "cursor-pointer"}`}><span className="flex gap-2"><input type="checkbox" disabled={Boolean(field.blockedReason)} checked={Boolean(decision?.fields.includes(field.field))} onChange={event => toggleAssetField(item,field.field,event.target.checked)}/><span><strong>{field.label}</strong>: {String(field.current ?? "Not recorded")} → {String(field.incoming ?? "Not recorded")}{field.blockedReason ? <span className="mt-1 block text-xs text-amber-700">{field.blockedReason}</span> : null}</span></span></label>)}</div> : null}{item.issue ? <p className="mt-2 text-xs text-amber-800">{item.issue}</p> : null}</article>;})}</div> : <p className="text-xs text-slate-600">Nothing is written during comparison. Import stays disabled until every row has a current review decision.</p>}</div> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={clearFile}><X/>Clear</Button><Button disabled={isSpreadsheet ? importMutation.isPending || Boolean(importResult) || !rows.length || !columnsReady || (importType === "assets" && assetPreview.length !== rows.length) : documentUpload.isPending || !form.scopeId || !form.title} onClick={() => isSpreadsheet ? importMutation.mutate() : documentUpload.mutate()}><Upload/>{isSpreadsheet ? importMutation.isPending ? "Archiving and importing…" : importResult ? "Import finished — use correction file" : importNeedsRetry ? "Retry safely" : importType === "assets" ? "Archive and apply reviewed decisions" : "Archive and import" : documentUpload.isPending ? "Uploading…" : "Upload and index"}</Button></div></div> : null}
    </article><article className="rounded-xl border bg-[#102748] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-200">One intake workflow</p><h2 className="mt-2 text-xl font-bold">Store once. Process once.</h2><div className="mt-5 space-y-4">{[["1","Validate","File type, size, checksum, and permissions"],["2","Store","Original retained securely in R2"],["3","Index","D1 metadata links the correct business record"],["4","Use","Structured records power search and statistics"]].map(([step,title,detail]) => <div key={step} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-blue-200">{step}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-blue-100/70">{detail}</p></div></div>)}</div></article></section>
    <article className="rounded-xl border border-blue-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-blue-600">SpinLife automation</p><h2 className="mt-1 font-bold">Extract a work order from a screenshot</h2><p className="mt-1 text-sm text-slate-500">Upload here, then review the extracted fields before creating an operational intake.</p></div>{spinlife ? <Button variant="outline" disabled={extractSpinLife.isPending} onClick={() => extractSpinLife.mutate()}>{extractSpinLife.isPending ? `Reading screenshot${ocrProgress === null ? "…" : ` · ${ocrProgress}%`}` : "Run extraction again"}</Button> : null}</div>
      <label className="mt-5 block cursor-pointer rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50"><Upload className="mx-auto size-6 text-blue-600"/><span className="mt-2 block text-sm font-semibold text-slate-900">{isImage && selectedFile ? selectedFile.name : "Choose a SpinLife screenshot"}</span><span className="mt-1 block text-xs text-slate-500">PNG, JPG, JPEG, or WEBP · maximum 20 MB</span><input ref={spinLifeInputRef} className="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => loadFile(event.target.files?.[0])}/></label>
      {isImage && selectedFile && !spinlife ? <div className="mt-4 flex justify-end"><Button disabled={extractSpinLife.isPending} onClick={() => extractSpinLife.mutate()}>{extractSpinLife.isPending ? `Reading screenshot${ocrProgress === null ? "…" : ` · ${ocrProgress}%`}` : "Extract SpinLife work order"}</Button></div> : null}
      {spinlife ? <div className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([
        ["Work order", "workOrder"], ["Customer", "customerName"], ["Phone", "phone"], ["Email", "email"],
        ["Job type", "jobType"], ["Job pays", "authorization"], ["Created on", "createdOn"], ["Product", "product"],
        ["Manufacturer", "manufacturer"], ["Model", "model"]
      ] as const).map(([label, key]) => <label key={key} className="space-y-1.5 text-sm font-semibold text-slate-700">{label}<Input value={spinlife[key]} onChange={(event) => setSpinlife({ ...spinlife, [key]: event.target.value })}/></label>)}</div><label className="block space-y-1.5 text-sm font-semibold text-slate-700">Customer service address<Input value={spinlife.serviceAddress} onChange={(event) => setSpinlife({ ...spinlife, serviceAddress: event.target.value })}/></label><div className="grid gap-4 lg:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold text-slate-700">Job notes<textarea className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" value={spinlife.jobNotes} onChange={(event) => setSpinlife({ ...spinlife, jobNotes: event.target.value })}/></label><label className="space-y-1.5 text-sm font-semibold text-slate-700">Assigned-to information <span className="font-normal text-amber-700">· verify classification</span><textarea className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" value={spinlife.assignedTo} onChange={(event) => setSpinlife({ ...spinlife, assignedTo: event.target.value })}/></label></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="max-w-2xl text-xs leading-5 text-amber-900">Approval checks for an existing SpinLife work order, saves this screenshot in the Document Vault, and creates a review task. Pricing and dispatch remain blocked until an administrator confirms missing account, location, mileage, and scheduling information.</p><Button disabled={approveSpinLife.isPending || !spinlife.workOrder} onClick={() => approveSpinLife.mutate()}><CheckCircle2/>{approveSpinLife.isPending ? "Creating intake…" : "Approve and create intake"}</Button></div></div> : null}
    </article>
    {rows.length ? <article className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><h2 className="font-bold">Preflight preview</h2><p className="mt-1 text-xs text-slate-500">First five data rows before anything is written.</p>{missingExactReferences ? <div role="alert" className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0"/><p><strong>Exact IDs are missing.</strong> Name matching will work only when each company and location name is unique. Use the blank template and account/location reference file above to avoid a preventable row error.</p></div> : null}</div><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50">{headers.slice(0,8).map((header) => <TableHead key={header}>{header.toUpperCase()}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(0,5).map((row,index) => <TableRow key={index}>{headers.slice(0,8).map((header) => <TableCell key={header} className="max-w-56 truncate">{String(row[header] ?? "")}</TableCell>)}</TableRow>)}</TableBody></Table></div></article> : null}
    <article className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center gap-3 border-b p-5"><History className="size-5 text-blue-600"/><div><h2 className="font-bold">Structured import history</h2><p className="mt-1 text-xs text-slate-500">Spreadsheet processing batches; all source files remain available in the Document Vault.</p></div></div>{history.isLoading ? <div className="p-8 text-center text-sm text-slate-500">Loading import history…</div> : null}{!history.isLoading && !history.data?.imports.length ? <div className="p-8 text-center text-sm text-slate-500">No structured imports yet.</div> : null}{history.data?.imports.length ? <Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="pl-5">FILE / SOURCE</TableHead><TableHead>CATEGORY</TableHead><TableHead>ROWS</TableHead><TableHead>RESULT</TableHead><TableHead>STARTED</TableHead></TableRow></TableHeader><TableBody>{history.data.imports.map((item) => <TableRow key={item.id}><TableCell className="pl-5"><p className="font-semibold">{item.fileName || item.source}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.source.replaceAll("_"," ")}</p></TableCell><TableCell className="capitalize">{item.importType.replaceAll("_"," ")}</TableCell><TableCell>{item.rowCount}</TableCell><TableCell><ImportStatus item={item}/></TableCell><TableCell className="text-slate-500">{new Date(`${item.startedAt}Z`).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table> : null}</article>
  </div>;
}
