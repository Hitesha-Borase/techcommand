"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Check, CircleAlert, FileText, LoaderCircle, LockKeyhole,
  MapPin, MessageSquareText, Route, Sparkles, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { JobCopilotGuide } from "@/components/job-copilot-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { extractEvidenceText, normalizeAddress } from "@/lib/bid-evidence";
import { intakePricingAmounts } from "@/lib/account-pricing";
import { type PricingPolicy, calculatePricing } from "@/lib/techflex-pricing";
import { captureOperationalEvent, errorKind, sizeBucket } from "@/lib/analytics-client";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import {
  clearBidWorkspaceDraft,
  loadBidWorkspaceDraft,
  saveBidWorkspaceDraft,
  type BidWorkspaceFields,
} from "@/lib/bid-workspace-draft";

const TECHFLEX_MAIN_HUB = "611 Park Meadow Road, Suite B, Westerville, Ohio 43081";

type BidFields = BidWorkspaceFields;
type Account = { id: string; name: string; accountType: string };
type Technician = { id: string; name: string; technicianCode: string; dispatchAddress1?: string | null; dispatchAddress2?: string | null; dispatchCity?: string | null; dispatchState?: string | null; dispatchPostalCode?: string | null };
type Readiness = { mainBusinessHub: string; aiReady: boolean; mapsReady: boolean };

const initial: BidFields = {
  externalSource: "manual", clientAccountName: "", externalId: "", customerName: "",
  customerPhone: "", customerEmail: "", serviceAddress: "",
  serviceType: "repair_single", summary: "", customerComplaint: "", equipmentType: "",
  manufacturer: "", model: "", serialNumber: "", sourceAssignedTechnician: "",
  sourceDispatchAddress: "",
  authorization: 0, onsiteHours: 1, technicianCount: 1, weightLb: 0,
  partsCount: 1, stairsCount: 0,
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  return portalJson<T>(response, "The request could not be completed.");
}

function numeric(value: string) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function money(value: number) { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function mergeFields(current: BidFields, update: Partial<Record<keyof BidFields, unknown>>): BidFields {
  const next = { ...current };
  for (const [key, value] of Object.entries(update)) {
    if (value !== null && value !== undefined && key in next) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

async function analyzableFile(file: File) {
  if (file.type !== "image/heic" && file.type !== "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("conversion failed");
    return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    throw new Error(`${file.name} is an iPhone HEIC image that this browser could not convert. Save or share it as JPEG/PDF, then add it again.`);
  }
}

function technicianOrigin(technician: Technician | undefined) {
  if (!technician) return "";
  return [technician.dispatchAddress1, technician.dispatchAddress2, technician.dispatchCity, technician.dispatchState, technician.dispatchPostalCode].filter((value): value is string => Boolean(value?.trim())).join(", ");
}

async function verifiedRoute(origin: string, destination: string) {
  return json<{ roundTripMiles: number; driveHours: number; source: string }>("/api/bid-intelligence", {
    method: "POST", body: JSON.stringify({ action: "route", origin, destination }),
  });
}

async function uploadEvidence(file: File, intakeId: string) {
  const common = { entityType: "work_order_intake", entityId: intakeId, category: "client_work_order", fileName: file.name, contentType: file.type, sizeBytes: file.size };
  if (file.size <= 20 * 1024 * 1024) {
    const body = new FormData();
    body.set("entityType", common.entityType); body.set("entityId", intakeId); body.set("category", common.category); body.set("file", file);
    const response = await portalFetch("/api/attachments", { method: "POST", body });
    await portalJson<{ attachment: { id: string } }>(response, "Evidence upload failed.");
    return;
  }
  const initialized = await json<{ uploadId: string; attachmentId: string; storageKey: string; safeName: string; partSize: number }>("/api/attachments", {
    method: "POST", body: JSON.stringify({ action: "multipart_init", ...common }),
  });
  const parts: Array<{ partNumber: number; etag: string }> = [];
  try {
    for (let offset = 0, partNumber = 1; offset < file.size; offset += initialized.partSize, partNumber += 1) {
      const params = new URLSearchParams({ uploadId: initialized.uploadId, storageKey: initialized.storageKey, entityType: common.entityType, entityId: intakeId, partNumber: String(partNumber) });
      const response = await portalFetch(`/api/attachments?${params}`, { method: "PUT", body: file.slice(offset, offset + initialized.partSize) });
      const part = await portalJson<{ partNumber?: number; etag?: string }>(response, `Upload part ${partNumber} failed.`);
      if (!part.partNumber || !part.etag) throw new Error(`Upload part ${partNumber} did not return a save confirmation.`);
      parts.push({ partNumber: part.partNumber, etag: part.etag });
    }
    await json("/api/attachments", { method: "POST", body: JSON.stringify({ action: "multipart_complete", ...common, ...initialized, parts }) });
  } catch (error) {
    await portalFetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "multipart_abort", ...common, ...initialized }) }).catch(() => undefined);
    throw error;
  }
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`space-y-1.5 text-sm font-semibold text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

export function BidIntelligenceWorkspace({ trigger, actorUserId, onImportAssets, onPricing }: { trigger: ReactNode; actorUserId: string; onImportAssets?: () => void; onPricing?: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingAnalysis = useRef(false);
  const savedIntake = useRef<{id: string; fingerprint: string} | null>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [guideRevision, setGuideRevision] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [fields, setFields] = useState<BidFields>(initial);
  const [roundTripMiles, setRoundTripMiles] = useState(0);
  const [driveHours, setDriveHours] = useState(0);
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routedOrigin, setRoutedOrigin] = useState("");
  const [routedDestination, setRoutedDestination] = useState("");
  const [refinement, setRefinement] = useState("");
  const [finalBidAmount, setFinalBidAmount] = useState<number | null>(null);
  const [pricingNote, setPricingNote] = useState("");
  const [autosaved, setAutosaved] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [draftRecoveryMessage, setDraftRecoveryMessage] = useState("");
  const readiness = useQuery({ queryKey: ["bid-intelligence-readiness"], queryFn: () => json<Readiness>("/api/bid-intelligence"), enabled: open });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => json<{ accounts: Account[] }>("/api/accounts"), enabled: open });
  const pricing = useQuery({ queryKey: ["bid-account-pricing", accountId], queryFn: () => json<{ policy: PricingPolicy; source: string }>(`/api/bid-intelligence?accountId=${encodeURIComponent(accountId)}`), enabled: open && Boolean(accountId) });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: () => json<{ technicians: Technician[] }>("/api/technicians"), enabled: open });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      try { saveBidWorkspaceDraft(localStorage, actorUserId, { accountId, technicianId, fields, routeOrigin, roundTripMiles, driveHours, finalBidAmount, pricingNote });
      setAutosaved(true); setDraftStorageError(false); window.setTimeout(() => setAutosaved(false), 900); } catch { setAutosaved(false); setDraftStorageError(true); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [actorUserId, open, accountId, technicianId, fields, routeOrigin, roundTripMiles, driveHours, finalBidAmount, pricingNote]);

  const selectedAccount = accounts.data?.accounts.find((item) => item.id === accountId);
  const result = useMemo(() => calculatePricing({
    serviceType: fields.serviceType, reimbursement: fields.authorization, roundTripMiles,
    driveHours, onsiteHours: fields.onsiteHours, technicianCount: fields.technicianCount,
    weightLb: fields.weightLb, partsCount: fields.partsCount, stairsCount: fields.stairsCount,
    hotelCost: 0, partsCost: 0, assetCount: 1,
    consumerPricing: selectedAccount?.accountType === "direct_customer",
  }, pricing.data?.policy), [fields, roundTripMiles, driveHours, selectedAccount?.accountType, pricing.data]);

  const extract = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error("Choose at least one screenshot, photo, or PDF first.");
      const analysisFiles = await Promise.all(files.map(analyzableFile));
      let next: Partial<BidFields>;
      if (readiness.data?.aiReady) {
        const body = new FormData(); analysisFiles.forEach((file) => body.append("files", file));
        const response = await portalFetch("/api/bid-intelligence", { method: "POST", body });
        const data = await portalJson<{ fields?: Partial<BidFields> }>(response, "The work order could not be extracted.");
        if (!data.fields) throw new Error("The work order extraction did not return any fields. Keep the files selected and try again.");
        next = data.fields;
      } else {
        const images = analysisFiles.filter((file) => file.type.startsWith("image/"));
        if (!images.length) throw new Error("PDF extraction activates when the OpenAI project key is connected. Add screenshots or enter the bid manually for now.");
        const { createWorker } = await import("tesseract.js"); const worker = await createWorker("eng");
        try {
          const texts: string[] = [];
          for (const image of images) texts.push((await worker.recognize(image)).data.text);
          next = extractEvidenceText(texts.join("\n\n--- NEXT EVIDENCE FILE ---\n\n"));
          if (analysisFiles.some((file) => file.type === "application/pdf"))
            next.warnings = [...(next.warnings || []), "PDF content was stored but not scanned because AI extraction is not connected."];
        } finally { await worker.terminate(); }
      }
      const destination = String(next.serviceAddress || "").trim();
      const savedTechnicianOrigin = technicianOrigin(technicians.data?.technicians.find((item) => item.id === technicianId));
      const proposedOrigin = savedTechnicianOrigin || String(next.sourceDispatchAddress || "").trim();
      let route = null;
      if (readiness.data?.mapsReady && destination && proposedOrigin) {
        try { route = await verifiedRoute(proposedOrigin, destination); }
        catch { next.warnings = [...(next.warnings || []), "The work order was read, but travel could not be calculated. Confirm travel separately."]; }
      }
      return { fields: next, route, proposedOrigin };
    },
    onMutate: () => captureOperationalEvent("bid_extraction_started", {
      file_count: files.length,
      source: readiness.data?.aiReady ? "openai" : "device_ocr",
    }),
    onSuccess: ({ fields: next, route, proposedOrigin }) => {
      setFields(mergeFields(initial, next));
      setFinalBidAmount(null);
      setGuideRevision(value => value + 1);
      setRouteOrigin(proposedOrigin);
      if (next.clientAccountName) {
        const sought = next.clientAccountName.toLowerCase();
        const exact = accounts.data?.accounts.filter(item => item.name.toLowerCase() === sought) || [];
        const matches = exact.length ? exact : accounts.data?.accounts.filter(item => item.name.toLowerCase().includes(sought) || sought.includes(item.name.toLowerCase())) || [];
        setAccountId(matches.length === 1 ? matches[0].id : "");
        if (matches.length > 1) setFields(current => ({...current, warnings: [...(current.warnings || []), "More than one paying account matches this paperwork. Select the correct account."]}));
      }
      if (route && next.serviceAddress) {
        setRoundTripMiles(route.roundTripMiles); setDriveHours(route.driveHours); setRoutedOrigin(proposedOrigin); setRoutedDestination(next.serviceAddress);
      } else if (next.serviceAddress) {
        setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination("");
      }
      toast.success(readiness.data?.aiReady ? `${files.length} evidence file${files.length === 1 ? "" : "s"} reconciled` : `${files.length} image${files.length === 1 ? "" : "s"} scanned`, { description: route ? "Fields and road mileage were updated. Confirm the result before saving." : "Fields were updated. Confirm the destination and mileage before saving." });
      captureOperationalEvent("bid_extraction_completed", {
        file_count: files.length,
        source: readiness.data?.aiReady ? "openai" : "device_ocr",
        route_status: route ? "calculated" : "manual_required",
        warning_count: next.warnings?.length || 0,
      });
    },
    onError: (error) => {
      toast.error(error.message);
      captureOperationalEvent("bid_extraction_failed", { error_area: "extraction", error_kind: errorKind(error) });
    },
  });
  useEffect(() => {
    if (!open || !pendingAnalysis.current || !files.length || !readiness.isSuccess || extract.isPending) return;
    pendingAnalysis.current = false;
    extract.mutate();
  }, [open, files, readiness.isSuccess, extract.isPending, extract.mutate]);

  const calculateRoute = useMutation({
    mutationFn: () => verifiedRoute(routeOrigin, fields.serviceAddress),
    onSuccess: (data) => { const confirmedOrigin = routeOrigin; setRoundTripMiles(data.roundTripMiles); setDriveHours(data.driveHours); setRoutedOrigin(confirmedOrigin); setRoutedDestination(fields.serviceAddress); toast.success("Road mileage verified from the confirmed origin"); captureOperationalEvent("bid_route_completed", { route_status: "calculated" }); },
    onError: (error) => { toast.error(error.message); captureOperationalEvent("bid_route_failed", { error_area: "routing", error_kind: errorKind(error) }); },
  });
  const refine = useMutation({
    mutationFn: () => json<{ fields: Partial<BidFields> }>("/api/bid-intelligence", { method: "POST", body: JSON.stringify({ action: "refine", instruction: refinement, current: fields }) }),
    onSuccess: (data) => {
      setFields((current) => mergeFields(current, data.fields)); setRefinement("");
      const destination = String(data.fields.serviceAddress || "").trim();
      if (destination && normalizeAddress(destination) !== normalizeAddress(routedDestination)) {
        setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination("");
        const nextOrigin = routeOrigin || String(data.fields.sourceDispatchAddress || "").trim();
        setRouteOrigin(nextOrigin);
        if (readiness.data?.mapsReady && nextOrigin) void verifiedRoute(nextOrigin, destination).then((route) => {
          setRoundTripMiles(route.roundTripMiles); setDriveHours(route.driveHours); setRoutedOrigin(nextOrigin); setRoutedDestination(destination);
          toast.success("Adjusted destination and mileage recalculated");
        }).catch((error: Error) => toast.error(error.message));
      }
      toast.success("Proposed adjustments applied", { description: "Review all fields before saving." });
      captureOperationalEvent("bid_refinement_completed", { source: "openai" });
    },
    onError: (error) => { toast.error(error.message); captureOperationalEvent("bid_refinement_failed", { error_area: "refinement", error_kind: errorKind(error) }); },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Select the paying account before saving.");
      if (!pricing.data || pricing.isFetching || pricing.isError) throw new Error("Wait for this account’s pricing rules to load, then review the estimate.");
      if (!fields.externalId.trim() && !files.length) throw new Error("Enter a work-order number or attach source evidence.");
      if (!fields.serviceAddress.trim()) throw new Error("Confirm the actual service destination before saving the bid.");
      if (!routeOrigin.trim()) throw new Error("Confirm the route origin before saving the bid.");
      if (readiness.data?.mapsReady && normalizeAddress(routedDestination) !== normalizeAddress(fields.serviceAddress)) throw new Error("The service destination changed. Recalculate road mileage before saving.");
      if (readiness.data?.mapsReady && normalizeAddress(routedOrigin) !== normalizeAddress(routeOrigin)) throw new Error("The route origin changed. Recalculate road mileage before saving.");
      const input = {
          accountId: accountId || null, technicianId: technicianId || null,
          externalSource: fields.externalSource || "manual", externalId: fields.externalId || null,
          noticeType: "new_assignment", serviceType: fields.serviceType, summary: fields.summary || `${fields.serviceType.replaceAll("_", " ")} service request`,
          rawText: `Bid workspace sources: ${files.map((file) => file.name).join(", ") || "manual entry"}. Confirmed route origin: ${routeOrigin}. Technician profile origins are administrator-managed and remain manually reviewable. Source technician reference: ${fields.sourceAssignedTechnician || "none"}. Algorithm recommendation: ${money(result.requiredBid)}. Human-selected bid: ${money(finalBidAmount ?? result.requiredBid)}. Pricing note: ${pricingNote || "recommended baseline accepted"}.`,
          customerName: fields.customerName || null, customerPhone: fields.customerPhone || null,
          customerEmail: fields.customerEmail || null, serviceAddress: fields.serviceAddress || null,
          customerComplaint: fields.customerComplaint || null, equipmentType: fields.equipmentType || null,
          manufacturer: fields.manufacturer || null, model: fields.model || null, serialNumber: fields.serialNumber || null,
          ...intakePricingAmounts(fields.authorization, result.requiredBid, finalBidAmount), roundTripMiles, driveHours, onsiteHours: fields.onsiteHours,
          technicianCount: result.requiredTechnicianCount, weightLb: fields.weightLb, partsCount: fields.partsCount,
          stairsCount: fields.stairsCount, hotelCost: 0, partsCost: 0, assetCount: 1,
          accessInstructions: `Actual assigned technician: ${technicians.data?.technicians.find((item) => item.id === technicianId)?.name || "unassigned"}. Source assignment is reference-only and does not control route origin.`,
      };
      const fingerprint = JSON.stringify(input);
      let intakeId = savedIntake.current?.fingerprint === fingerprint ? savedIntake.current.id : null;
      if (!intakeId) {
        const response = await portalFetch("/api/intakes", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
        });
        const data = await portalJson<{ intake?: { id: string }; existingIntakeId?: string; error?: string }>(response, "The bid intake could not be saved.", [409]);
        if (response.status === 409) throw new Error("This work order already has an intake. Your current edits have not been saved. Open the existing intake in Work Orders to compare and update it; this draft is still available.");
        if (!data.intake?.id) throw new Error("The saved intake could not be identified. Keep this draft and check Work Orders before retrying.");
        intakeId = data.intake.id;
        savedIntake.current = {id: intakeId, fingerprint};
      }
      for (const file of files) await uploadEvidence(file, intakeId);
      return { intakeId };
    },
    onSuccess: async ({ intakeId }) => {
      savedIntake.current = null;
      try { clearBidWorkspaceDraft(localStorage, actorUserId); } catch { /* Saved server-side; device storage can be unavailable. */ } await Promise.all([queryClient.invalidateQueries({ queryKey: ["work-order-intakes"] }), queryClient.invalidateQueries({ queryKey: ["admin-tasks"] })]);
      toast.success("Bid evidence and protected estimate saved", { description: `Intake ${intakeId.slice(0, 8)} is ready for review.` });
      captureOperationalEvent("bid_intake_saved", {
        file_count: files.length,
        outcome: "saved",
        route_status: routedDestination ? "verified" : "manual",
      });
      setFiles([]); setFields(initial); setAccountId(""); setTechnicianId(""); setRouteOrigin(""); setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination(""); setFinalBidAmount(null); setPricingNote(""); setDraftRecoveryMessage("");
    },
    onError: (error) => { toast.error(error.message); captureOperationalEvent("bid_intake_failed", { error_area: "save", error_kind: errorKind(error) }); },
  });

  function chooseFiles(next: FileList | File[]) {
    if (extract.isPending || refine.isPending || save.isPending) { toast.info("Finish the current step before adding more files."); return; }
    const incoming = Array.from(next).map((file) => (!file.type || file.type === "application/octet-stream") && /\.pdf$/i.test(file.name) ? new File([file], file.name, { type: "application/pdf", lastModified: file.lastModified }) : file);
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const unsupported = incoming.find((file) => !allowed.includes(file.type));
    if (unsupported) { toast.error(`${unsupported.name} is not a supported PDF or image.`); return; }
    captureOperationalEvent("bid_evidence_selected", {
      file_count: incoming.length,
      file_type_categories: [...new Set(incoming.map((file) => file.type === "application/pdf" ? "pdf" : "image"))],
      total_size_bucket: sizeBucket(incoming.reduce((sum, file) => sum + file.size, 0)),
    });
    const combined = [...files, ...incoming.filter((file) => !files.some((saved) => saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified))];
    if (combined.length > 10) { toast.error("Add up to 10 files from one work order."); return; }
    if (combined.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { toast.error("Choose a set totaling 20 MB or less for extraction."); return; }
    if (combined.length === files.length) return;
    pendingAnalysis.current = true;
    extract.reset();
    setFiles(combined);
  }
  function changeOpen(next: boolean) {
    if (next) {
      captureOperationalEvent("bid_workspace_opened");
      try {
        const recovered = loadBidWorkspaceDraft(localStorage, actorUserId);
        if (recovered.status === "restored") {
          const draft = recovered.draft;
          setFields(mergeFields(initial, draft.fields));
          setAccountId(draft.accountId); setTechnicianId(draft.technicianId);
          setRouteOrigin(draft.routeOrigin);
          setFinalBidAmount(draft.finalBidAmount); setPricingNote(draft.pricingNote);
          setRoundTripMiles(draft.roundTripMiles); setDriveHours(draft.driveHours);
          setDraftRecoveryMessage("Recovered your device-saved bid draft. Review the account, authorization and route before saving.");
        } else if (recovered.status === "expired") {
          setDraftRecoveryMessage("An older bid draft expired and was removed from this device.");
        } else if (recovered.status === "discarded") {
          setDraftRecoveryMessage("An invalid bid draft was removed. Start again from the source paperwork.");
        } else {
          setDraftRecoveryMessage("");
        }
      } catch { setDraftRecoveryMessage("This browser could not check for your saved bid draft. Keep this form open while working."); }
    }
    setOpen(next);
  }
  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); chooseFiles(event.dataTransfer.files); }
  const update = <K extends keyof BidFields>(key: K, value: BidFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "serviceAddress") {
      setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination("");
    }
  };

  return <Sheet open={open} onOpenChange={changeOpen}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
      <SheetHeader className="border-b px-6 pb-5 pt-6">
        <SheetTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-5 text-cyan-600"/>Start a work order</SheetTitle>
        <SheetDescription>Drop the paperwork. Copilot fills the details for you to review, then prepares the job for dispatch.</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-6 py-5">
        {(onImportAssets || onPricing) ? <div className="flex flex-wrap gap-2">{onImportAssets ? <Button type="button" variant="outline" onClick={() => {changeOpen(false);onImportAssets();}}>Biomedical asset list</Button> : null}{onPricing ? <Button type="button" variant="outline" onClick={() => {changeOpen(false);onPricing();}}>Upload partner rate sheet</Button> : null}</div> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`rounded-xl border p-3 text-xs ${readiness.data?.aiReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><Bot className="mb-2 size-4"/><strong>AI extraction</strong><p className="mt-1">{readiness.data?.aiReady ? "Configured · each upload is checked" : "Image OCR available · PDF AI not configured"}</p></div>
          <div className={`rounded-xl border p-3 text-xs ${readiness.data?.mapsReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><Route className="mb-2 size-4"/><strong>Road mileage</strong><p className="mt-1">{readiness.data?.mapsReady ? "Configured · verify the returned route" : "Enter travel estimates manually"}</p></div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><LockKeyhole className="mb-2 size-4"/><strong>Technician-based origin</strong><p className="mt-1">The selected technician&apos;s saved dispatch profile fills the route origin and remains editable.</p></div>
        </div>

        <section className="rounded-xl border bg-white p-4">
          <div><h3 className="font-bold text-slate-900">1. Drop the work order</h3><p className="mt-1 text-xs text-slate-500">Add up to 10 screenshots, photos, or PDFs from the same work order. Copilot starts reading automatically. Use one customer and work-order number per intake.</p></div>
          <label onDragOver={(event) => event.preventDefault()} onDrop={drop} className="mt-4 block cursor-pointer rounded-xl border-2 border-dashed border-cyan-200 bg-cyan-50/40 p-6 text-center hover:border-cyan-400">
            {files.length ? <FileText className="mx-auto size-6 text-cyan-700"/> : <Upload className="mx-auto size-6 text-cyan-700"/>}
            <span className="mt-2 block text-sm font-bold text-slate-900">{files.length ? `${files.length} evidence file${files.length === 1 ? "" : "s"} selected` : "Drop a work order here or choose files"}</span>
            <span className="mt-1 block text-xs text-slate-500">PDF, JPEG, PNG, WEBP, or iPhone HEIC · Up to 20 MB combined</span>
            <input ref={inputRef} className="hidden" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { if (event.target.files) chooseFiles(event.target.files); event.target.value = ""; }}/>
          </label>
          {files.length ? <div className="mt-3 space-y-2">{files.map((file, index) => <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0 truncate"><FileText className="mr-2 inline size-4 text-cyan-700"/>{file.name} <span className="text-xs text-slate-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${file.name}`} disabled={extract.isPending || save.isPending} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X/></Button></div>)}</div> : null}
          {files.length ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{readiness.data?.aiReady ? "AI will reconcile every selected file into one record." : "Basic OCR can combine images now; PDF reading needs the OpenAI connection."}</span><Button variant="outline" disabled={extract.isPending} onClick={() => extract.mutate()}>{extract.isPending ? <LoaderCircle className="animate-spin"/> : <Sparkles/>}{extract.isPending ? `Reading ${files.length} file${files.length === 1 ? "" : "s"}…` : readiness.data?.aiReady ? "Read files again" : "Scan images again"}</Button></div> : null}
        </section>

        {extract.isPending ? <p role="status" className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">Copilot is reading the paperwork. The details will appear below for your review.</p> : null}
        {extract.error ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{extract.error.message} Your files are still selected. Retry or complete the fields manually.</p> : null}
        {readiness.isError ? <p role="alert" className="text-sm text-amber-900">We could not check extraction availability. <button type="button" className="underline" onClick={() => readiness.refetch()}>Try again</button></p> : null}
        <fieldset className="space-y-5" disabled={extract.isPending || refine.isPending || save.isPending}>
        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-900">2. Confirm the work order</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Client account"><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Select paying account"/></SelectTrigger><SelectContent>{accounts.data?.accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Account name found in evidence"><Input value={fields.clientAccountName} onChange={(event) => update("clientAccountName", event.target.value)} placeholder="Used to match the paying account"/></Field>
            <Field label="Assignment source"><Input value={fields.externalSource} onChange={event => update("externalSource", event.target.value)} placeholder="SpinLife, Pride, a dispatcher or other partner"/></Field>
            <Field label="Work-order number"><Input value={fields.externalId} onChange={(event) => update("externalId", event.target.value)}/></Field>
            <Field label="Customer / facility"><Input value={fields.customerName} onChange={(event) => update("customerName", event.target.value)}/></Field>
            <Field label="Customer phone"><Input value={fields.customerPhone} onChange={(event) => update("customerPhone", event.target.value)}/></Field>
            <Field label="Customer email"><Input type="email" value={fields.customerEmail} onChange={(event) => update("customerEmail", event.target.value)}/></Field>
            <Field label="Job type"><Select value={fields.serviceType} onValueChange={(value) => update("serviceType", value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[
              ["evaluation","Diagnostic / evaluation"],["repair_single","Single-part repair"],["repair_multi","Multi-part repair"],["frame_repair","Frame repair"],["hourly_service","Hourly service"],["biomed_service_call","Biomedical service"],["consumer_install","Consumer installation"],["wgd_basic","White-glove delivery"],["wgd_complex","Complex white-glove delivery"],["bed_delivery","Bed delivery"],["biomed_pm_c","Biomedical PM · Tier C"],
            ].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Source-assigned technician (reference only)"><Input value={fields.sourceAssignedTechnician} onChange={(event) => update("sourceAssignedTechnician", event.target.value)}/></Field>
            <Field label="Source dispatch address found"><Input value={fields.sourceDispatchAddress} onChange={(event) => update("sourceDispatchAddress", event.target.value)} placeholder="Proposed origin for non-Ohio work"/></Field>
            {([['Equipment type', 'equipmentType'], ['Manufacturer', 'manufacturer'], ['Model', 'model'], ['Serial number', 'serialNumber']] as const).map(([label, key]) => <Field key={key} label={label}><Input value={fields[key]} onChange={event => update(key, event.target.value)} placeholder={key === 'serialNumber' ? 'Verify from the unit label' : ''}/></Field>)}
            <Field label="Service summary" wide><Input value={fields.summary} onChange={(event) => update("summary", event.target.value)}/></Field>
            <Field label="Reported issue" wide><textarea className="min-h-20 w-full rounded-md border px-3 py-2 text-sm font-normal outline-none focus:border-cyan-500" value={fields.customerComplaint} onChange={(event) => update("customerComplaint", event.target.value)}/></Field>
          </div>
          {fields.warnings?.length ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-bold">Items to confirm</p><ul className="mt-1 list-disc space-y-1 pl-4">{fields.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-900">3. Choose the technician and travel</h3>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><MapPin className="mr-2 inline size-4"/><strong>Main business hub:</strong> {TECHFLEX_MAIN_HUB}. It is available as a technician origin but is never forced onto every job.</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Actual assigned technician"><Select value={technicianId} onValueChange={(value) => { setTechnicianId(value); const origin = technicianOrigin(technicians.data?.technicians.find((item) => item.id === value)); setRouteOrigin(origin); setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination(""); }}><SelectTrigger><SelectValue placeholder="Choose technician"/></SelectTrigger><SelectContent>{technicians.data?.technicians.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.technicianCode}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Actual service destination"><Input value={fields.serviceAddress} onChange={(event) => update("serviceAddress", event.target.value)} placeholder="Street, city, state ZIP"/></Field>
            <Field label="Actual route origin"><Input value={routeOrigin} onChange={(event) => { setRouteOrigin(event.target.value); setRoundTripMiles(0); setDriveHours(0); setRoutedOrigin(""); setRoutedDestination(""); }} placeholder="Saved technician origin or manual override"/></Field>
            <Field label="Verified round-trip miles"><Input type="number" min="0" step="0.1" value={roundTripMiles} onChange={(event) => setRoundTripMiles(numeric(event.target.value))}/></Field>
            <Field label="Verified round-trip drive hours"><Input type="number" min="0" step="0.25" value={driveHours} onChange={(event) => setDriveHours(numeric(event.target.value))}/></Field>
          </div>
          {fields.serviceAddress && !routedDestination ? <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0"/>The destination has not been route-verified. {readiness.data?.mapsReady ? "Recalculate before saving." : "Enter verified round-trip mileage and drive time manually until Google Routes is connected."}</div> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="outline" asChild><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: routeOrigin, destination: fields.serviceAddress, travelmode: "driving" })}`}><MapPin/>Open route</a></Button><Button disabled={!readiness.data?.mapsReady || !routeOrigin || !fields.serviceAddress || calculateRoute.isPending} onClick={() => calculateRoute.mutate()}><Route/>{calculateRoute.isPending ? "Calculating…" : "Recalculate mileage"}</Button></div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-900">4. Review partner rates and the proposed bid</h3>
          <p className="mt-2 text-sm text-slate-600" role="status">{!accountId ? "Select a paying account to load its rates." : pricing.isFetching ? "Loading this account’s rates…" : pricing.isError ? "Account rates could not be loaded; saving is paused." : pricing.data?.source === "account" ? `Using saved rates for ${selectedAccount?.name}.` : "This account has no saved rate table. These are TechFlex defaults; confirm the partner agreement before dispatch."}</p>
          {pricing.isError ? <Button type="button" variant="outline" onClick={() => pricing.refetch()}>Retry account rates</Button> : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Partner-authorized amount $"><Input type="number" min="0" step="0.01" value={fields.authorization} onChange={(event) => update("authorization", numeric(event.target.value))}/></Field>
            <Field label="On-site hours"><Input type="number" min="0" step="0.25" value={fields.onsiteHours} onChange={(event) => update("onsiteHours", numeric(event.target.value))}/></Field>
            <Field label="Technicians"><Input type="number" min="1" max="10" value={fields.technicianCount} onChange={(event) => update("technicianCount", Math.max(1, numeric(event.target.value)))}/></Field>
            <Field label="Weight (lb)"><Input type="number" min="0" value={fields.weightLb} onChange={(event) => update("weightLb", numeric(event.target.value))}/></Field>
            <Field label="Parts count"><Input type="number" min="0" value={fields.partsCount} onChange={(event) => update("partsCount", numeric(event.target.value))}/></Field>
            <Field label="Stair count"><Input type="number" min="0" value={fields.stairsCount} onChange={(event) => update("stairsCount", numeric(event.target.value))}/></Field>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border"><div className="grid gap-2 bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">Rate-card calculation</p><p className="font-bold">{money(result.contractPrice)}</p></div><div><p className="text-xs text-slate-500">Complete direct costs</p><p className="font-bold">{money(result.modeledDirectCosts)}</p></div><div><p className="text-xs text-slate-500">Required minimum</p><p className="font-bold">{money(result.requiredBid)}</p></div></div><div className="flex items-end justify-between gap-3 bg-[#071a32] p-4 text-white"><div><p className="text-xs font-semibold text-cyan-200">Recommended bid</p><p className="mt-1 text-2xl font-black">{money(result.requiredBid)}</p></div><span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">40% floor enforced</span></div></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Proposed bid to partner"><div className="flex gap-2"><Input type="number" min="0" step="0.01" value={finalBidAmount ?? result.requiredBid} onChange={(event) => setFinalBidAmount(numeric(event.target.value))}/><Button type="button" variant="outline" onClick={() => setFinalBidAmount(null)}>Use recommended</Button></div></Field>
            <Field label="Pricing decision note"><Input value={pricingNote} onChange={(event) => setPricingNote(event.target.value)} placeholder="Optional reason, agreement, or exception"/></Field>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">The proposed bid is a request, not partner approval. The original authorized amount stays separate, and a shortfall remains held for review.</p>
        </section>

        <JobCopilotGuide phase="intake" autoKey={guideRevision ? String(guideRevision) : undefined} disabled={extract.isPending || save.isPending || !open}
          context={{ serviceType: fields.serviceType, equipmentType: fields.equipmentType, manufacturer: fields.manufacturer, model: fields.model, serialNumber: fields.serialNumber, summary: fields.summary, complaint: fields.customerComplaint }} />

        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <div className="flex items-center gap-2"><MessageSquareText className="size-5 text-violet-700"/><h3 className="font-bold text-slate-900">AI refinement</h3></div>
          <p className="mt-1 text-xs text-slate-600">Example: “This is a two-tech bed delivery, add 90 minutes onsite, and use the destination in the document.” Changes remain reviewable before saving.</p>
          <textarea className="mt-3 min-h-20 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-violet-500" value={refinement} onChange={(event) => setRefinement(event.target.value)} placeholder="Describe the adjustment…"/>
          {draftRecoveryMessage ? <p role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{draftRecoveryMessage}</p> : null}
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{draftStorageError ? "Device save unavailable — keep this form open" : autosaved ? "Draft saved privately for your signed-in account" : "Draft fields save for your account on this device; files must be reselected after reload"}</span><Button variant="outline" disabled={!readiness.data?.aiReady || !refinement.trim() || refine.isPending} onClick={() => refine.mutate()}><Bot/>{refine.isPending ? "Applying…" : "Apply AI adjustment"}</Button></div>
          {!readiness.data?.aiReady ? <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0"/>The refinement assistant will activate after the OpenAI project credential is connected. Manual fields and protected pricing work now.</div> : null}
        </section>

        <Button className="w-full" size="lg" disabled={save.isPending || extract.isPending || !accountId || pricing.isFetching || !pricing.data || pricing.isError} onClick={() => save.mutate()}>{save.isPending ? <LoaderCircle className="animate-spin"/> : <Check/>}{save.isPending ? "Saving intake and evidence…" : "Save for dispatch review"}</Button>
        <p className="text-center text-sm text-slate-500">Next: review this intake, confirm authorization, then create and assign the work order.</p>
        </fieldset>
      </div>
    </SheetContent>
  </Sheet>;
}
