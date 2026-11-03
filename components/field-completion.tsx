"use client";
import { FieldNotesBox } from "@/components/field-notes-box";
const AcademyJobCheck = lazy(() => import("@/components/academy-job-check").then(m => ({default:m.AcademyJobCheck})));
import {dmeFamilies} from "@/lib/academy-catalog";
import type {AcademyFieldMode} from "@/lib/academy";

const ReportWordingReview = lazy(() => import("@/components/report-wording-review").then(m => ({default:m.ReportWordingReview})));
import { reportWritingFingerprint, type WritingReview, type RecordedFact } from "@/lib/report-writing";

import {
  lazy, Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Camera,
  Check,
  CircleAlert,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  PackagePlus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { ScheduledJob } from "@/components/dispatch-center";
const WorkOrderAiIntake = lazy(() => import("@/components/work-order-ai-intake").then(m => ({default:m.WorkOrderAiIntake})));
import { VoiceNote } from "@/components/voice-note";
const JobCopilotGuide = lazy(() => import("@/components/job-copilot-guide").then(m => ({default:m.JobCopilotGuide})));
const GuidedServiceSteps = lazy(() => import("@/components/guided-service-steps").then(m => ({default:m.GuidedServiceSteps})));
import { WorkOrderAssetProgress, type EquipmentSaveHandle } from "@/components/work-order-asset-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  completionDraftKey,
  loadCompletionDraft,
  loadPendingCompletionSubmission,
  queueFileUpload,
  queueJsonRequest,
  removeCompletionDraft,
  removePendingCompletionSubmission,
  saveCompletionDraft,
  savePendingCompletionSubmission,
} from "@/lib/offline-client";
import { workOrderPacketName, resolvedCheck, isSpinLife, partnerCheckProblems } from "@/lib/spinlife-document-policy";
import { PortalResponseError, portalFetch, portalJson } from "@/lib/portal-fetch";

type ChecklistItem = { key: string; label: string; complete: boolean; notApplicable?: boolean; reason?: string; result?: string };
type DiagnosticStep = { label: string; complete: boolean; result: string };
type PartUsed = { description: string; partNumber: string; quantity: number };
type Attachment = {
  id: string;
  fileName: string;
  category: string;
  sizeBytes: number;
  contentType?: string;
};
type EvidenceRequirement = {
  category: string;
  label: string;
  minimum: number;
  guidance: string;
};
type Report = {
  documentDetails?: {fieldNotes?: string; dmeFamilyId?:string;actualOnsiteMinutes?: number | null; workOrderDate: string; photoLayout: "detail" | "gallery"; photoCaptions: Record<string,string>};
  id: string | null;
  reportVersion: number;
  recordVersion: number;
  workOrderRecordVersion: number;
  reportPdfAttachmentId: string | null;
  qaStatus: string;
  qaNotes: string;
  customerComplaint: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  findings: string;
  workPerformed: string;
  testResults: string;
  recommendation: string;
  assetDisposition: string;
  checklist: ChecklistItem[];
  diagnosticSteps: DiagnosticStep[];
  partsUsed: PartUsed[];
  customerSignatureName: string;
  signatureAttachmentId: string | null;
};
type CompletionPayload = {
  workOrder: {
    id: string;
    externalId: string;
    accountName: string;
    serviceType: string;
    summary: string;
    locationName: string;
    locationType?: string | null;
    locationAddress: string;
    customerName: string | null;
    selectedAssetCount: number;
    status: string;
    completedAt: string | null;
    instructions: string[];
    grossMarginBasisPoints: number;
  };
  technician: { id: string; technicianName: string };
  report: Report;
  reportRevisions: Array<{
    reportVersion: number;
    sourceReportRecordVersion: number;
    submittedAt: string;
    evidenceFileCount: number;
    assetCount: number;
    customerSignatureRecorded: boolean;
  }>;
  attachments: Attachment[];
  evidenceRequirements: EvidenceRequirement[];
  evidenceCounts: Record<string, number>;
  missingEvidence: EvidenceRequirement[];
  training: {
    enabled: boolean;
    proficiencyLevel: string;
    guidedJobsCompleted: number;
    qaPassStreak: number;
    competencyScore: number;
    lesson: {
      moduleKey: string;
      version: number;
      title: string;
      objective: string;
      coaching: Record<"identify" | "evidence" | "service" | "signature" | "review", string>;
      questions: { id: string; prompt: string; options: string[]; rationale: string }[];
    };
    latestAttempt: { id: string; scorePercent: number; passed: boolean; createdAt: string } | null;
    equipmentGuidance: { id: string; title: string; diagnosticSteps: string[]; supportPhone: string | null; supportEmail: string | null; sourceUrl: string | null; sourceVerifiedOn: string | null }[];
  };
};
type AiCompletionReview = WritingReview;

const standardStages = [
  { title: "Identify", icon: ShieldCheck },
  { title: "Evidence", icon: Camera },
  { title: "Service", icon: Wrench },
  { title: "Signature", icon: FileSignature },
  { title: "Review", icon: ClipboardCheck },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return portalJson<T>(response, "The completion could not be saved.");
}

type CompletionSaveResult = {
  reportId?: string;
  reportVersion?: number;
  status: string;
  recordVersion?: number;
  workOrderRecordVersion?: number;
};

type CompletionSubmissionBody = {
  action: "submit";
  requestId: string;
  workOrderId: string;
  technicianId: string;
  expectedReportVersion: number;
  expectedWorkOrderVersion: number;
  report: Report;
  trainingAttemptId: string | null;
};

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function detectBarcode(file: File) {
  const Detector = (
    window as unknown as {
      BarcodeDetector?: new () => {
        detect(source: ImageBitmap): Promise<Array<{ rawValue: string }>>;
      };
    }
  ).BarcodeDetector;
  if (!Detector || !file.type.startsWith("image/")) return null;
  try {
    const image = await createImageBitmap(file);
    const results = await new Detector().detect(image);
    image.close();
    return results[0]?.rawValue?.trim() || null;
  } catch {
    return null;
  }
}

async function compressEvidenceImage(file: File) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) return file;
    return new File(
      [blob],
      file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg",
      { type: "image/jpeg", lastModified: file.lastModified },
    );
  } catch {
    return file;
  }
}

function SignaturePad({
  onInkChange,
}: {
  onInkChange: (hasInk: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawing.current = true;
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineWidth = 4;
    context.lineCap = "round";
    context.strokeStyle = "#102a56";
    context.lineTo(current.x, current.y);
    context.stroke();
    onInkChange(true);
  }

  function stop() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onInkChange(false);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={900}
        height={260}
        className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        aria-label="Customer signature pad"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={clear}
      >
        <RotateCcw /> Clear signature
      </Button>
    </div>
  );
}

export function FieldCompletion({
  job,
  actorUserId,
  open,
  onOpenChange,
}: {
  job: ScheduledJob | null;
  actorUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [detailedMode, setDetailedMode] = useState(false);
  const [equipmentNotes, setEquipmentNotes] = useState({jobId:"",hasNotes:false});
  const equipmentSave = useRef<EquipmentSaveHandle | null>(null);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const manualSaving = useRef(false);
  const latestReport = useRef<Report | null>(null);
  function serializeWrite<T>(run:()=>Promise<T>):Promise<T> {
    const next = writeChain.current.catch(()=>undefined).then(run);
    writeChain.current=next; return next;
  }
  const [stageState, setStageState] = useState({ jobId: "", value: 0 });
  const [fieldModeState,setFieldModeState]=useState<{jobId:string;mode:AcademyFieldMode|null}>({jobId:"",mode:null});
  const fieldModeJobId=job?.id||"";
  const handleFieldModeChange=useCallback((mode:AcademyFieldMode|null)=>{
    if(!fieldModeJobId)return;
    setFieldModeState(current=>current.jobId===fieldModeJobId&&current.mode===mode?current:{jobId:fieldModeJobId,mode});
  },[fieldModeJobId]);
  const [draft, setDraft] = useState<{
    jobId: string;
    report: Report;
  } | null>(null);
  const [uploading, setUploading] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "local" | "syncing" | "synced" | "offline" | "error">("idle");
  const [autosaveMessage, setAutosaveMessage] = useState("");
  const [pendingSubmission, setPendingSubmission] = useState<{
    jobId: string;
    requestId: string;
    body: CompletionSubmissionBody;
    savedAt: string;
  } | null>(null);
  const [inkState, setInkState] = useState({ jobId: "", value: false });
  const [trainingAnswers, setTrainingAnswers] = useState<Record<string, number>>({});
  const [trainingResult, setTrainingResult] = useState<{
    attemptId: string;
    scorePercent: number;
    passed: boolean;
    results: { id: string; correct: boolean; correctIndex: number; rationale: string }[];
  } | null>(null);
  const [aiReviewState, setAiReviewState] = useState<{
    jobId: string;
    value: AiCompletionReview;
    fingerprint: string;
    evidence: RecordedFact[];
  } | null>(null);
  const versionRef = useRef({ jobId: "", report: 0, workOrder: 0 });
  const query = useQuery({
    queryKey: ["completion", job?.id, job?.technicianId, detailedMode],
    enabled: open && Boolean(job),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const data = await api<CompletionPayload>(
        `/api/completions?workOrderId=${encodeURIComponent(job!.id)}&technicianId=${encodeURIComponent(job!.technicianId)}${detailedMode ? "&guidance=1" : ""}`,
      );
      if (versionRef.current.jobId !== job!.id || data.report.recordVersion >= versionRef.current.report) versionRef.current = {
        jobId: job!.id, report: data.report.recordVersion, workOrder: data.report.workOrderRecordVersion,
      };
      return data;
    },
  });
  const training = query.data?.training;
  const stages = training?.enabled
    ? [
        ...standardStages.slice(0, 4),
        { title: "Coach check", icon: GraduationCap },
        standardStages[4],
      ]
    : standardStages;
  const reviewStage = stages.length - 1;

  const stage = stageState.jobId === job?.id ? stageState.value : job?.serviceType.startsWith("biomed_") ? 2 : 0;
  const report =
    draft && draft.jobId === job?.id ? draft.report : query.data?.report || null;
  latestReport.current = report;
  const signatureInk = inkState.jobId === job?.id && inkState.value;

  useEffect(() => {
    if (!job || !query.data?.report || draft?.jobId === job.id) return;
    const key = completionDraftKey(job.id, job.technicianId);
    void loadCompletionDraft<Report>(actorUserId, key).then((saved) => {
      if (["submitted", "approved"].includes(query.data!.report.qaStatus) && saved?.report.qaStatus !== "draft") {
        void removeCompletionDraft(actorUserId,key).catch(() => undefined);
        return;
      }
      if (!saved) return;
      versionRef.current = {
        jobId: job.id,
        report: saved.report.recordVersion,
        workOrder: saved.report.workOrderRecordVersion,
      };
      setDraft({ jobId: job.id, report: saved.report });
      setAutosaveStatus("local");
      toast.info("Recovered this job's last device-saved draft");
    }).catch(() => {
      setAutosaveStatus("error");
    });
  }, [actorUserId, draft?.jobId, job, query.data]);

  useEffect(() => {
    if (!job) return;
    let current = true;
    const key = completionDraftKey(job.id, job.technicianId);
    void loadPendingCompletionSubmission<CompletionSubmissionBody>(actorUserId, key)
      .then((saved) => {
        if (!current) return;
        if (saved?.body.workOrderId === job.id && saved.body.technicianId === job.technicianId) {
          setPendingSubmission({ jobId: job.id, requestId: saved.requestId, body: saved.body, savedAt: saved.savedAt });
          setAutosaveMessage("A final submission lost its confirmation. Reconnect and resume the exact saved submission; TechCommand will reconcile it without creating another revision.");
          setAutosaveStatus("error");
        } else setPendingSubmission(null);
      })
      .catch(() => {
        if (current) {
          setAutosaveMessage("The device could not check for an interrupted final submission. Keep this work open and retry after browser storage is available.");
          setAutosaveStatus("error");
        }
      });
    return () => { current = false; };
  }, [actorUserId, job, query.data?.report.qaStatus]);

  useEffect(() => {
    if (!open || manualSaving.current || !job || draft?.jobId !== job.id || pendingSubmission?.jobId === job.id || ["submitted", "approved"].includes(draft.report.qaStatus)) return;
    const key = completionDraftKey(job.id, job.technicianId);
    let current = true;
    const status = (value: typeof autosaveStatus) => { if (current) setAutosaveStatus(value); };
    status("syncing");
    const deviceSave = saveCompletionDraft(actorUserId, key, draft.report).then(() => {
      if (current) setAutosaveMessage("");
      status(navigator.onLine ? "syncing" : "offline");
    }).catch(() => status("error"));
    const timer = window.setTimeout(async () => {
      await deviceSave;
      if (!current || manualSaving.current) return;
      await serializeWrite(async () => {
      if (!current || manualSaving.current) return;
      const versions = versionRef.current.jobId === job.id
        ? versionRef.current
        : { jobId: job.id, report: draft.report.recordVersion, workOrder: draft.report.workOrderRecordVersion };
      const body = {
        action: "save_draft",
        workOrderId: job.id,
        technicianId: job.technicianId,
        expectedReportVersion: versions.report,
        expectedWorkOrderVersion: versions.workOrder,
        report: draft.report,
      };
      try {
        if (!navigator.onLine) {
          await queueJsonRequest(actorUserId, "/api/completions", body);
          status("offline");
          return;
        }
        try {
          const saved = await api<CompletionSaveResult>("/api/completions", { method: "POST", body: JSON.stringify(body) });
          if (saved.recordVersion !== undefined && saved.workOrderRecordVersion !== undefined) {
            versionRef.current = { jobId: job.id, report: saved.recordVersion, workOrder: saved.workOrderRecordVersion };
            await saveCompletionDraft(actorUserId, key, { ...(latestReport.current || draft.report), reportVersion: saved.reportVersion ?? draft.report.reportVersion, recordVersion: saved.recordVersion, workOrderRecordVersion: saved.workOrderRecordVersion }).catch(()=>{if(current)setAutosaveMessage("Saved to cloud. A device recovery copy could not be kept.");});
          }
          status("synced");
        } catch (error) {
          if (error instanceof PortalResponseError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
            setAutosaveMessage(error.message);
            status("error");
            return;
          }
          await queueJsonRequest(actorUserId, "/api/completions", body);
          status("offline");
        }
      } catch {
        status("error");
      }
      });
    }, 1600);
    return () => { current = false; window.clearTimeout(timer); };
  }, [actorUserId, draft, job, open, pendingSubmission?.jobId]);

  useEffect(() => {
    if (!job) return;
    const synced = () => {
      setAutosaveStatus("syncing");
      void client.invalidateQueries({ queryKey: ["completion", job.id, job.technicianId] })
        .then(() => setAutosaveStatus("synced"))
        .catch(() => {
          setAutosaveMessage("The queued save finished, but the latest cloud copy could not be reloaded. Keep this form open and use Save draft after the connection stabilizes.");
          setAutosaveStatus("error");
        });
    };
    window.addEventListener("techcommand:sync-complete", synced);
    return () => window.removeEventListener("techcommand:sync-complete", synced);
  }, [client, job]);
  function setStage(value: number | ((current: number) => number)) {
    const next = typeof value === "function" ? value(stage) : value;
    setStageState({ jobId: job?.id || "", value: next });
  }
  function setSignatureInk(value: boolean) {
    setInkState({ jobId: job?.id || "", value });
  }
  function setCurrentReport(value: Report | ((current: Report) => Report)) {
    if (!job || !report) return;
    const edited = typeof value === "function" ? value(latestReport.current || report) : value;
    const next = { ...edited, qaStatus: "draft" };
    latestReport.current = next;
    setDraft({ jobId: job.id, report: next });
  }

  async function uploadFile(
    file: File | Blob,
    category: string,
    name?: string,
    attachmentId = crypto.randomUUID(),
  ) {
    if (!job) throw new Error("Select a work order.");
    const upload = file instanceof File ? file : new File([file], name || "signature.png", { type: file.type });
    if (upload.size > 20 * 1024 * 1024) {
      const common = {
        entityType: "work_order",
        entityId: job.id,
        category,
        fileName: upload.name,
        contentType: upload.type,
        sizeBytes: upload.size,
        attachmentId,
      };
      const initialized = await api<{
        uploadId?: string; attachmentId?: string; storageKey?: string; safeName?: string; partSize?: number; attachment?: Attachment;
      }>("/api/attachments", { method: "POST", body: JSON.stringify({ action: "multipart_init", ...common }) });
      if (initialized.attachment) return initialized.attachment;
      if (!initialized.uploadId || !initialized.attachmentId || !initialized.storageKey || !initialized.safeName || !initialized.partSize)
        throw new Error("The resumable upload could not be initialized. Keep the file selected and try again.");
      const parts: Array<{ partNumber: number; etag: string }> = [];
      try {
        for (let offset = 0, partNumber = 1; offset < upload.size; offset += initialized.partSize, partNumber += 1) {
          const params = new URLSearchParams({
            uploadId: initialized.uploadId,
            storageKey: initialized.storageKey,
            entityType: "work_order",
            entityId: job.id,
            partNumber: String(partNumber),
          });
          const response = await portalFetch(`/api/attachments?${params}`, { method: "PUT", body: upload.slice(offset, offset + initialized.partSize) });
          const result = await portalJson<{ partNumber?: number; etag?: string }>(response, `Upload part ${partNumber} failed.`);
          if (!result.partNumber || !result.etag) throw new Error(`Upload part ${partNumber} did not return a save confirmation.`);
          parts.push({ partNumber: result.partNumber, etag: result.etag });
        }
        const completed = await api<{ attachment: Attachment }>("/api/attachments", {
          method: "POST",
          body: JSON.stringify({ action: "multipart_complete", ...common, ...initialized, parts }),
        });
        return completed.attachment;
      } catch (error) {
        await portalFetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "multipart_abort", ...common, ...initialized }),
        }).catch(() => undefined);
        throw error;
      }
    }
    const body = new FormData();
    body.set("entityType", "work_order");
    body.set("entityId", job.id);
    body.set("category", category);
    body.set("attachmentId", attachmentId);
    body.set("file", upload);
    const response = await portalFetch("/api/attachments", { method: "POST", body });
    const data = await portalJson<{ attachment?: Attachment }>(response, "File upload failed.");
    if (!data.attachment)
      throw new Error("The upload did not return a save confirmation. Keep the file selected and check the work order before retrying.");
    return data.attachment;
  }

  async function capture(file: File, category: string) {
    setUploading(category);
    const attachmentId = crypto.randomUUID();
    let prepared: File | null = null;
    try {
      prepared = await compressEvidenceImage(file);
      if (!navigator.onLine) {
        if (!job) throw new Error("Select a work order.");
        await queueFileUpload(actorUserId, "/api/attachments", prepared, { entityType: "work_order", entityId: job.id, category, attachmentId });
        toast.success(`${pretty(category)} evidence secured on this device`);
        setAutosaveStatus("offline");
        return;
      }
      await uploadFile(prepared, category, undefined, attachmentId);
      if (category === "serial") {
        const barcode = await detectBarcode(file);
        if (barcode) {
          update({ serialNumber: barcode });
          toast.success(`Serial barcode captured: ${barcode}`);
        }
      }
      await client.invalidateQueries({ queryKey: ["completion", job?.id] });
      toast.success(`${pretty(category)} evidence saved`);
    } catch (error) {
      if (job) {
        try {
          await queueFileUpload(actorUserId, "/api/attachments", prepared || await compressEvidenceImage(file), { entityType: "work_order", entityId: job.id, category, attachmentId });
          setAutosaveStatus("offline");
          toast.warning(`${pretty(category)} evidence is saved on this device and queued for retry.`);
        } catch (queueError) {
          toast.error(queueError instanceof Error ? queueError.message : error instanceof Error ? error.message : "Upload failed.");
        }
      } else toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading("");
    }
  }

  async function captureMany(files: FileList, category: string) {
    for (const file of Array.from(files)) await capture(file, category);
  }

  async function signatureBlob() {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[aria-label="Customer signature pad"]',
    );
    if (!canvas) throw new Error("Signature pad is unavailable.");
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Signature capture failed.")),
        "image/png",
      ),
    );
  }

  const save = useMutation({
    mutationFn: async (action: "save_draft" | "submit" | "resume_submit"): Promise<CompletionSaveResult & { report?: Report }> => {
      manualSaving.current = true;
      return await serializeWrite(async () => {
      if (action !== "resume_submit") await equipmentSave.current?.savePending();
      if (!job || !report) throw new Error("Completion data is still loading.");
      if ((action === "submit" || action === "resume_submit") && !navigator.onLine)
        throw new Error("Reconnect before final submission. The exact submission remains secured on this device.");
      if (action === "save_draft" && !navigator.onLine) {
        const versions = versionRef.current.jobId === job.id
          ? versionRef.current
          : { jobId: job.id, report: report.recordVersion, workOrder: report.workOrderRecordVersion };
        await queueJsonRequest(actorUserId, "/api/completions", { action, workOrderId: job.id, technicianId: job.technicianId, expectedReportVersion: versions.report, expectedWorkOrderVersion: versions.workOrder, report });
        return { status: "queued", report };
      }
      if (action === "resume_submit") {
        if (!pendingSubmission || pendingSubmission.jobId !== job.id)
          throw new Error("No interrupted submission is saved for this work order.");
        try {
          const saved = await api<CompletionSaveResult>("/api/completions", {
            method: "POST",
            body: JSON.stringify(pendingSubmission.body),
          });
          return { ...saved, report: pendingSubmission.body.report };
        } catch (error) {
          if (error instanceof PortalResponseError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
            await removePendingCompletionSubmission(actorUserId, completionDraftKey(job.id, job.technicianId));
            setPendingSubmission(null);
          }
          throw error;
        }
      }
      let nextReport = latestReport.current || report;
      if (signatureInk) {
        setUploading("signature");
        const attachment = await uploadFile(
          await signatureBlob(),
          "signature",
          `signature_${job.externalId}.png`,
        );
        nextReport = { ...nextReport, signatureAttachmentId: attachment.id };
        setCurrentReport(nextReport);
        setSignatureInk(false);
      }
      const versions = versionRef.current.jobId === job.id
        ? versionRef.current
        : { jobId: job.id, report: nextReport.recordVersion, workOrder: nextReport.workOrderRecordVersion };
      let body: CompletionSubmissionBody | {
        action: "save_draft";
        workOrderId: string;
        technicianId: string;
        expectedReportVersion: number;
        expectedWorkOrderVersion: number;
        report: Report;
      };
      if (action === "submit") {
        const submitBody: CompletionSubmissionBody = {
            action,
            requestId: crypto.randomUUID(),
            workOrderId: job.id,
            technicianId: job.technicianId,
            expectedReportVersion: versions.report,
            expectedWorkOrderVersion: versions.workOrder,
            report: nextReport,
            trainingAttemptId: trainingResult?.attemptId || training?.latestAttempt?.id || null,
        };
        const savedPending = await savePendingCompletionSubmission(
          actorUserId,
          completionDraftKey(job.id, job.technicianId),
          submitBody.requestId,
          submitBody,
        ).catch(()=>{setAutosaveMessage("Device recovery is unavailable. Keep this screen open until the cloud confirms submission.");return {requestId:submitBody.requestId,savedAt:new Date().toISOString()};});
        setPendingSubmission({ jobId: job.id, requestId: savedPending.requestId, body: submitBody, savedAt: savedPending.savedAt });
        body = submitBody;
      } else body = {
        action,
        workOrderId: job.id,
        technicianId: job.technicianId,
        expectedReportVersion: versions.report,
        expectedWorkOrderVersion: versions.workOrder,
        report: nextReport,
      };
      try {
        const saved = await api<CompletionSaveResult>("/api/completions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return { ...saved, report: nextReport };
      } catch (error) {
        if (action === "submit" && error instanceof PortalResponseError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          await removePendingCompletionSubmission(actorUserId, completionDraftKey(job.id, job.technicianId));
          setPendingSubmission(null);
        }
        throw error;
      }
      });
    },
    onSuccess: async (data) => {
      setUploading("");
      setAutosaveStatus(data.status === "queued" ? "offline" : "synced");
      if (job && data.recordVersion !== undefined && data.workOrderRecordVersion !== undefined) {
        versionRef.current = { jobId: job.id, report: data.recordVersion, workOrder: data.workOrderRecordVersion };
        setDraft({jobId:job.id,report:{...(data.report || report!),id:data.reportId || (data.report || report!).id,qaStatus:data.status === "submitted" ? "submitted" : "draft",reportVersion:data.reportVersion ?? (data.report || report!).reportVersion,recordVersion:data.recordVersion,workOrderRecordVersion:data.workOrderRecordVersion}});
        await saveCompletionDraft(actorUserId, completionDraftKey(job.id, job.technicianId), {
          ...(data.report || report!),
          reportVersion: data.reportVersion ?? (data.report || report!).reportVersion,
          recordVersion: data.recordVersion,
          workOrderRecordVersion: data.workOrderRecordVersion,
        }).catch(()=>setAutosaveMessage("Saved to cloud. A device recovery copy could not be kept."));
      }
      void Promise.all([
        client.invalidateQueries({ queryKey: ["completion", job?.id] }),
        client.invalidateQueries({ queryKey: ["dispatch"] }),
        client.invalidateQueries({ queryKey: ["technician-pay"] }),
      ]);
      toast.success(
        data.status === "submitted"
          ? "Field work complete — copy saved to administrator inbox"
          : data.status === "queued" ? "Draft secured for synchronization" : "Completion draft saved",
      );
      if (data.status === "submitted") {
        if (job) void Promise.all([
          removeCompletionDraft(actorUserId, completionDraftKey(job.id, job.technicianId)),
          removePendingCompletionSubmission(actorUserId, completionDraftKey(job.id, job.technicianId)),
        ]).then(() => setPendingSubmission(null)).catch(() => {
          toast.warning("The submitted report is saved, but its old device recovery copy could not be cleared.");
        });
        onOpenChange(false);
      }
      manualSaving.current = false;
    },
    onError: (error) => {
      manualSaving.current = false;
      setUploading("");
      setAutosaveMessage(error.message);
      setAutosaveStatus("error");
      toast.error(error.message);
    },
  });
  const checkTraining = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error("Select a work order.");
      return api<{
        attemptId: string;
        scorePercent: number;
        passed: boolean;
        results: { id: string; correct: boolean; correctIndex: number; rationale: string }[];
      }>("/api/completions", {
        method: "POST",
        body: JSON.stringify({
          action: "training_check",
          workOrderId: job.id,
          technicianId: job.technicianId,
          answers: trainingAnswers,
        }),
      });
    },
    onSuccess: (result) => {
      setTrainingResult(result);
      if (result.passed) toast.success("Knowledge check passed");
      else toast.error("Review the coaching and try again");
    },
    onError: (error) => toast.error(error.message),
  });
  const reviewWithAi = useMutation({
    mutationFn: async () => {
      if (!job || !report) throw new Error("Completion data is still loading.");
      if (query.data?.workOrder.status === "cancelled") throw new Error("This work order was cancelled.");
      const reviewedJobId = job.id;
      const fingerprint = reportWritingFingerprint(job.id, job.technicianId, report);
      const response = await api<{ review: AiCompletionReview; evidence: RecordedFact[] }>("/api/ai/completion-review", {
        method: "POST",
        body: JSON.stringify({
          workOrderId: job.id,
          technicianId: job.technicianId,
          missingControls: completion.missing,
          report: {
            fieldNotes: report.documentDetails?.fieldNotes || "",
            customerComplaint: report.customerComplaint,
            equipmentType: report.equipmentType,
            manufacturer: report.manufacturer,
            model: report.model,
            serialNumber: report.serialNumber,
            findings: report.findings,
            workPerformed: report.workPerformed,
            testResults: report.testResults,
            recommendation: report.recommendation,
            assetDisposition: report.assetDisposition,
            diagnosticSteps: report.diagnosticSteps,
            partsUsed: report.partsUsed,
          },
        }),
      });
      return {...response, fingerprint, reviewedJobId};
    },
    onSuccess: ({ review, evidence, fingerprint, reviewedJobId }) => {
      setAiReviewState({ jobId: reviewedJobId, value: review, fingerprint, evidence });
      toast.success("Report draft is ready to review");
    },
    onError: (error) => toast.error(error.message),
  });

  const completion = useMemo(() => {
    if (!report || !query.data)
      return { completed: 0, total: 1, missing: [] as string[] };
    const requiredFields: Array<[string, boolean]> = [["Recorded notes", Boolean(
      [report.documentDetails?.fieldNotes,report.findings,report.workPerformed,report.testResults].some(value=>value?.trim())
      || (equipmentNotes.jobId===job?.id && equipmentNotes.hasNotes)
    )]];
    return {
      completed: requiredFields.filter(([, done]) => done).length,
      total: requiredFields.length,
      missing: requiredFields
        .filter(([, done]) => !done)
        .map(([label]) => label),
    };
  }, [query.data, report, equipmentNotes, job?.id]);

  const locked = query.data?.workOrder.status === "cancelled";
  const coachKey = (["identify", "evidence", "service", "signature"] as const)[stage];
  const update = (fields: Partial<Report>) =>
    setCurrentReport((current) => ({ ...current, ...fields }));
  const reportWording = report && job && !locked ? <ReportWordingReview
    key={aiReviewState?.fingerprint || job.id} report={report}
    review={aiReviewState?.jobId === job.id ? aiReviewState.value : undefined}
    facts={aiReviewState?.jobId === job.id ? aiReviewState.evidence : []}
    stale={Boolean(aiReviewState?.jobId === job.id && aiReviewState.fingerprint !== reportWritingFingerprint(job.id, job.technicianId, report))}
    pending={reviewWithAi.isPending} disabled={locked} error={reviewWithAi.error?.message}
    onRequest={() => reviewWithAi.mutate()} onApply={fields => {
      if (!aiReviewState || aiReviewState.jobId !== job.id || aiReviewState.fingerprint !== reportWritingFingerprint(job.id, job.technicianId, report)) {toast.error("The report changed. Refresh the draft before applying wording.");return;}
      update(fields); setAiReviewState(null); toast.success("Reviewed sections added to your report draft");
    }} /> : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDetailedMode(false);
          setStageState({ jobId: job?.id || "", value: 0 });
          setInkState({ jobId: job?.id || "", value: false });
          setTrainingAnswers({});
          setTrainingResult(null);
          setAiReviewState(null);
          setFieldModeState({jobId:"",mode:null});
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-4xl">
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>
              {job ? `Job workflow · ${job.externalId}` : "Job workflow"}
            </SheetTitle>
            {report ? (
              <Badge variant="outline">{pretty(report.qaStatus)}</Badge>
            ) : null}
            {report ? (
              <Badge variant="outline">Report revision {report.reportVersion}</Badge>
            ) : null}
            {training?.enabled ? (
              <Badge className="bg-cyan-700">
                <GraduationCap /> Training Mode
              </Badge>
            ) : null}
          </div>
          <SheetDescription>
            Open the unit, type notes, then Submit & finish. Administrator review and all guidance, photos and detailed fields are optional.
          </SheetDescription>

          <div className="flex items-center gap-2 pt-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              autosaveStatus === "synced"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                : autosaveStatus === "offline" || autosaveStatus === "syncing"
                ? "bg-amber-50 text-amber-800 border border-amber-300 animate-pulse"
                : autosaveStatus === "local"
                ? "bg-cyan-50 text-cyan-800 border border-cyan-300"
                : autosaveStatus === "error"
                ? "bg-red-50 text-red-700 border border-red-300"
                : "bg-slate-50 text-slate-600 border border-slate-200"
            }`}>
              <span className={`size-1.5 rounded-full ${
                autosaveStatus === "synced" ? "bg-emerald-500" : autosaveStatus === "error" ? "bg-red-500" : "bg-amber-500"
              }`} />
              {autosaveStatus === "synced"
                ? "Saved to server"
                : autosaveStatus === "offline" || autosaveStatus === "syncing"
                ? "Waiting to sync"
                : autosaveStatus === "local"
                ? "Saved on this device"
                : autosaveStatus === "error"
                ? "Save not confirmed"
                : "Autosave ready"}
            </span>
          </div>
          {autosaveStatus === "error" && <p role="alert" className="text-sm font-medium text-red-700">{autosaveMessage || "Your latest changes could not be secured. Keep this form open, reconnect or free device storage, then use Save draft. Do not close the form until a save is confirmed."}</p>}
          {pendingSubmission && pendingSubmission.jobId === job?.id ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <CircleAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">Final submission confirmation is pending from {new Date(pendingSubmission.savedAt).toLocaleString()}. Resume sends only the exact device-saved request; changed work must be submitted separately.</span>
            <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate("resume_submit")}>
              {save.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Resume submission
            </Button>
          </div> : null}
        </SheetHeader>
        {job && detailedMode?<div className="mx-5 mt-4"><Suspense fallback={<p>Loading optional guidance…</p>}><AcademyJobCheck workOrderId={job.id} onModeChange={handleFieldModeChange}/></Suspense></div>:null}

        {query.isLoading ? (
          <div className="grid min-h-[55vh] place-items-center text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Loading job
              controls…
            </span>
          </div>
        ) : query.error ? (
          <div className="m-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <CircleAlert className="size-4 shrink-0" /> {query.error.message}
          </div>
        ) : report && query.data ? (
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{query.data.workOrder.locationName} · {query.data.workOrder.summary}</p>
              <Button type="button" variant="outline" onClick={()=>setDetailedMode(value=>!value)}>{detailedMode?"Back to simple notes":"Optional details / photos / signature"}</Button>
            </div>
            {!detailedMode ? <section className="space-y-5">
              {report.qaNotes ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Inbox comments: {report.qaNotes}</p> : null}
              {query.data.workOrder.completedAt || ["submitted","approved"].includes(report.qaStatus) ? <p className="rounded-lg border bg-emerald-50 p-3 text-sm">Field work complete. A copy is in the administrator inbox for optional review. You can add notes and submit an update here.</p> : null}
              <WorkOrderAssetProgress key={job!.id} ref={equipmentSave} workOrderId={job!.id} actorUserId={actorUserId} locked={locked} busy={save.isPending} fieldMode={null} onHasNotesChange={hasNotes=>setEquipmentNotes(current=>current.jobId===job!.id && current.hasNotes===hasNotes?current:{jobId:job!.id,hasNotes})} />
              {query.data.workOrder.selectedAssetCount ? <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold text-sm">Visit notes (optional)</summary><div className="mt-3"><FieldNotesBox value={report.documentDetails?.fieldNotes || ""} serviceType={query.data.workOrder.serviceType} disabled={locked || save.isPending} onChange={fieldNotes=>update({documentDetails:{workOrderDate:"",photoLayout:"detail",photoCaptions:{},...report.documentDetails,fieldNotes}})} label="Additional visit notes" /></div></details> : <FieldNotesBox value={report.documentDetails?.fieldNotes || ""} serviceType={query.data.workOrder.serviceType} disabled={locked || save.isPending} onChange={fieldNotes=>update({documentDetails:{workOrderDate:"",photoLayout:"detail",photoCaptions:{},...report.documentDetails,fieldNotes}})} />}
              {!locked ? <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Camera className="size-4" />{uploading ? "Saving photo…" : "Add photo (optional)"}<input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" disabled={Boolean(uploading) || save.isPending} onChange={event=>{const file=event.target.files?.[0];if(file)void capture(file,query.data!.workOrder.serviceType==="biomed_cataloging"?"serial":"after");event.target.value="";}} /></label> : null}
              {query.data.attachments.length ? <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold text-sm">Saved files ({query.data.attachments.length})</summary><div className="mt-2 space-y-2">{query.data.attachments.map(item=><a className="block text-sm text-blue-700 underline" key={item.id} href={`/api/attachments?attachmentId=${item.id}`}>{item.fileName}</a>)}</div></details> : null}
              {report.id ? <Button asChild variant="outline"><a href={`/api/completions?workOrderId=${encodeURIComponent(job!.id)}&technicianId=${encodeURIComponent(job!.technicianId)}&format=pdf`}>Download saved service report</a></Button> : null}
              {!locked ? <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button type="button" variant="outline" disabled={save.isPending || Boolean(uploading)} onClick={()=>save.mutate("save_draft")}><Save />{save.isPending?"Saving…":"Save notes"}</Button>
                <Button type="button" disabled={save.isPending || Boolean(uploading) || completion.missing.length > 0 || pendingSubmission?.jobId===job?.id} onClick={()=>save.mutate("submit")}><Send />{save.isPending?"Sending…":"Submit & finish"}</Button>
              </div> : null}
              <p className="text-xs text-slate-500">Save notes anytime. Submit & finish completes the visit and copies it to the administrator inbox. You can add details later; no administrator approval is needed.</p>
            </section> : <Suspense fallback={<p>Loading optional details…</p>}>
            <div className={`mb-6 grid gap-1 rounded-xl bg-slate-100 p-1 ${training?.enabled ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-5"}`}>
              {stages.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setStage(index)}
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition ${stage === index ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <Icon className="mx-auto mb-1 size-4" /> {item.title}
                  </button>
                );
              })}
            </div>

            {report.qaStatus === "returned" ? (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">QA correction required</p>
                <p className="mt-1">{report.qaNotes}</p>
              </div>
            ) : null}
            {query.data.reportRevisions.length ? (
              <details className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <summary className="cursor-pointer font-bold text-slate-900">
                  Submitted report history · {query.data.reportRevisions.length} revision{query.data.reportRevisions.length === 1 ? "" : "s"}
                </summary>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Earlier submissions stay in the history. Add notes and submit an update at any time without administrator approval.
                </p>
                <div className="mt-3 space-y-2">
                  {query.data.reportRevisions.map((revision) => (
                    <div key={revision.reportVersion} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                      <strong>Revision {revision.reportVersion}</strong> · {revision.submittedAt.replace("T", " ").replace("Z", " UTC")} · {revision.evidenceFileCount} evidence file{revision.evidenceFileCount === 1 ? "" : "s"} · {revision.assetCount} selected asset{revision.assetCount === 1 ? "" : "s"} · customer signature {revision.customerSignatureRecorded ? "recorded" : "not recorded"}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {locked ? (
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                This work order was cancelled. Existing field entries are retained.
              </div>
            ) : null}
            {training?.enabled && coachKey ? (
              <div className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex gap-3">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-cyan-800" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-800">
                      Field coach · {training.lesson.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-cyan-950">
                      {training.lesson.coaching[coachKey]}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mb-5"><WorkOrderAiIntake key={job?.id} disabled={locked} onUpload={file=>uploadFile(file,"client_work_order")} onExtract={fields=>{
                const next:Partial<Report>={};
                for(const key of ["equipmentType","manufacturer","model","serialNumber","customerComplaint"] as const) if((key==="customerComplaint"||query.data.workOrder.selectedAssetCount<=1)&&!report[key]&&typeof fields[key]==="string")next[key]=fields[key] as string;
                const existing=new Set(report.diagnosticSteps.map(step=>step.label));
                const additions=(Array.isArray(fields.checklistItems)?fields.checklistItems:[]).filter((item):item is string=>typeof item==="string"&&!!item.trim()&&!existing.has(item)).map(label=>({label:label.slice(0,500),complete:false,result:""}));
                if(report.diagnosticSteps.length+additions.length>50)throw new Error("The original is saved, but its checks exceed this report’s 50-question capacity. Existing answers were preserved; review the original requirements before completion.");
                next.diagnosticSteps=[...report.diagnosticSteps,...additions];update(next);
              }}/></div>
            <details open className="mb-5 rounded-xl border bg-white p-3">
              <summary className="cursor-pointer text-base font-semibold text-cyan-900">Copilot and manufacturer support · available at every step</summary>
              <div className="mt-3"><JobCopilotGuide key={job?.id} phase="field" workOrderId={job?.id} technicianId={job?.technicianId}
                autoKey={job?.id} disabled={locked || !open}
                context={{ serviceType: query.data.workOrder.serviceType, equipmentType: report.equipmentType, manufacturer: report.manufacturer, model: report.model, serialNumber: report.serialNumber, summary: query.data.workOrder.summary, complaint: report.customerComplaint, observations: report.diagnosticSteps }}
                onAddQuestions={(steps) => {
                  const existing = new Set(report.diagnosticSteps.map(step => step.label));
                  const additions = steps.filter(step => !existing.has(step.label));
                  if (report.diagnosticSteps.length + additions.length > 50) { toast.error("This report supports up to 50 service questions. Review the existing questions first."); return; }
                  update({ diagnosticSteps: [...report.diagnosticSteps, ...additions] });
                  toast.success(additions.length ? `${additions.length} questions added for you to answer` : "These questions are already in your workflow");
                }} /></div>
            </details>

            <VoiceNote disabled={locked} onText={text=>update({workPerformed:[report.workPerformed,text].filter(Boolean).join("\n").slice(0,10000)})}/>
            {stage === 0 ? (
              <section className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold">
                    Verify the equipment identity
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Asset and intake values are prefilled when available.
                    Confirm them against the physical label.
                  </p>
                </div>
                {query.data.workOrder.selectedAssetCount > 1 ? (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
                    This facility round has {query.data.workOrder.selectedAssetCount} equipment items. Record each label, observation, and disposition in <strong>Service → Equipment progress</strong>; no shared make, model, or serial entry is required here.
                  </div>
                ) : <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["Equipment type", "equipmentType"],
                      ["Manufacturer", "manufacturer"],
                      ["Model", "model"],
                      ["Serial number", "serialNumber"],
                    ] as const
                  ).map(([label, key]) => (
                    <label
                      key={key}
                      className="space-y-1.5 text-sm font-semibold"
                    >
                      {label}
                      <Input
                        disabled={locked}
                        value={report[key]}
                        onChange={(event) =>
                          update({ [key]: event.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>}
                {!query.data.workOrder.serviceType.startsWith("biomed")&&<label className="block space-y-1.5 text-sm font-semibold">Equipment family for career experience (optional)<select disabled={locked} className="min-h-11 w-full rounded border bg-white p-2" value={report.documentDetails?.dmeFamilyId||""} onChange={e=>update({documentDetails:{workOrderDate:"",photoLayout:"detail",photoCaptions:{},...report.documentDetails,dmeFamilyId:e.target.value}})}><option value="">Unclassified — choose later</option>{dmeFamilies.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
                <label className="block space-y-1.5 text-sm font-semibold">
                  Customer complaint
                  <Textarea
                    disabled={locked}
                    className="min-h-28"
                    value={report.customerComplaint}
                    onChange={(event) =>
                      update({ customerComplaint: event.target.value })
                    }
                    placeholder="Confirm the complaint in the customer’s words."
                  />
                </label>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  <p className="font-bold">Site</p>
                  <p className="mt-1 text-slate-600">
                    {query.data.workOrder.locationName}
                  </p>
                  <p className="text-slate-500">
                    {query.data.workOrder.locationAddress}
                  </p>
                </div>
              </section>
            ) : null}

            {stage === 1 ? (
              <section className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold">
                    Capture required evidence
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Camera files are automatically named, time-stamped, and
                    filed under this work order.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {query.data.evidenceRequirements.map((requirement) => {
                    const count =
                      query.data.evidenceCounts[requirement.category] || 0;
                    const done = count >= requirement.minimum;
                    return (
                      <article
                        key={requirement.category}
                        className={`rounded-xl border p-4 ${done ? "border-emerald-200 bg-emerald-50" : "bg-white"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{requirement.label}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {requirement.guidance}
                            </p>
                          </div>
                          <Badge
                            className={done ? "bg-emerald-600" : "bg-slate-600"}
                          >
                            {done ? <Check /> : null} {count}/
                            {requirement.minimum}
                          </Badge>
                        </div>
                        {!locked ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {requirement.category !== "client_work_order" ? <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                              {uploading === requirement.category ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
                              {uploading === requirement.category ? "Saving…" : "Take photo"}
                              <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" disabled={Boolean(uploading)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void capture(file, requirement.category); event.target.value = ""; }}/>
                            </label> : null}
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">
                              <PackagePlus className="size-4" />
                              {requirement.category === "client_work_order" ? "Add PDFs or screenshots" : "Select multiple"}
                              <input className="hidden" type="file" multiple accept={requirement.category === "client_work_order" ? "application/pdf,image/jpeg,image/png,image/webp,image/heic" : "image/jpeg,image/png,image/webp,image/heic"} disabled={Boolean(uploading)} onChange={(event) => { if (event.target.files?.length) void captureMany(event.target.files, requirement.category); event.target.value = ""; }}/>
                            </label>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                {query.data.attachments.length ? (
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <p className="text-sm font-bold">Filed evidence and photo captions</p>
                    <label className="mt-3 block text-sm font-semibold">Photo page layout
                      <select disabled={locked} className="mt-1 block w-full rounded-md border bg-white p-2" value={report.documentDetails?.photoLayout || 'detail'} onChange={e => update({documentDetails:{...report.documentDetails,workOrderDate:report.documentDetails?.workOrderDate || '',photoCaptions:report.documentDetails?.photoCaptions || {},photoLayout:e.target.value as 'detail'|'gallery'}})}>
                        <option value="detail">Large detail photo per page</option><option value="gallery">Gallery — up to six photos per page</option>
                      </select>
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {query.data.attachments
                        .filter((item) => item.category !== "signature")
                        .map((item) => (
                          <div key={item.id} className="rounded-lg bg-white p-3 space-y-2">
                            <a href={`/api/attachments?attachmentId=${item.id}`} className="block truncate text-sm font-semibold text-blue-700">{pretty(item.category)} · {item.fileName}</a>
                            {item.category !== 'client_work_order' && item.contentType?.startsWith('image/') && <Textarea disabled={locked} maxLength={240} aria-label={`Photo caption: ${item.fileName}`} placeholder="Explain what this photo shows and the observed finding (required for SpinLife)." value={report.documentDetails?.photoCaptions?.[item.id] || ''} onChange={e => update({documentDetails:{...report.documentDetails,workOrderDate:report.documentDetails?.workOrderDate || '',photoLayout:report.documentDetails?.photoLayout || 'detail',photoCaptions:{...report.documentDetails?.photoCaptions,[item.id]:e.target.value}}})} />}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {stage === 2 ? (
              <section className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">
                    {job?.serviceType==="biomed_cataloging"?"Catalog the facility equipment":job?.serviceType.startsWith("biomed_pm")?"Preventive maintenance":job?.serviceType==="biomed_repair"?"Corrective repair":"Diagnose, service, and test"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {job?.serviceType==="biomed_cataloging"?"Open each asset, record inventory observations, save, and move to the next. No PM or diagnostic results are implied.":"Record what you actually observed and performed. Save unfinished work at any time."}
                  </p>
                </div>
                <WorkOrderAssetProgress key={job!.id} ref={equipmentSave} actorUserId={actorUserId} onHasNotesChange={hasNotes=>setEquipmentNotes(current=>current.jobId===job!.id && current.hasNotes===hasNotes?current:{jobId:job!.id,hasNotes})} workOrderId={job!.id} locked={locked} busy={save.isPending} fieldMode={fieldModeState.jobId===job!.id?fieldModeState.mode:null} />
                {training?.enabled ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex gap-3">
                      <BrainCircuit className="mt-0.5 size-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="font-bold text-blue-950">Learning objective</p>
                        <p className="mt-1 text-sm leading-6 text-blue-900">{training.lesson.objective}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {training?.equipmentGuidance.length ? (
                  <div className="space-y-3 rounded-xl border p-4">
                    <div>
                      <p className="text-sm font-bold">Approved equipment guidance</p>
                      <p className="mt-1 text-xs text-slate-500">Matched to the recorded manufacturer and model. The current manufacturer procedure controls.</p>
                    </div>
                    {training.equipmentGuidance.map((article) => (
                      <article key={article.id} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm font-bold">{article.title}</p>
                        {article.diagnosticSteps.length ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-600">{article.diagnosticSteps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-blue-700">
                          {article.supportPhone ? <a href={`tel:${article.supportPhone}`}>{article.supportPhone}</a> : null}
                          {article.supportEmail ? <a href={`mailto:${article.supportEmail}`}>{article.supportEmail}</a> : null}
                          {article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noreferrer">Verified source</a> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                <GuidedServiceSteps key={job?.id} steps={report.diagnosticSteps} disabled={locked} fieldMode={fieldModeState.jobId===job?.id?fieldModeState.mode:null} onChange={(diagnosticSteps) => update({ diagnosticSteps })} />
                {reportWording}
                {(
                  [
                    [
                      "Technical findings",
                      "findings",
                      "Record observed symptoms, supported findings and measurements. Keep uncertain causes qualified.",
                    ],
                    [
                      "Work performed",
                      "workPerformed",
                      "Document every repair, adjustment, assembly, and part used.",
                    ],
                    [
                      "Final test results",
                      "testResults",
                      "Record the applicable tests actually performed, readings, units, conditions and limitations.",
                    ],
                    [
                      "Recommendations / follow-up",
                      "recommendation",
                      "State any part, quote, monitoring, or return-visit requirement.",
                    ],
                  ] as const
                ).map(([label, key, placeholder]) => (
                  <label
                    key={key}
                    className="block space-y-1.5 text-sm font-semibold"
                  >
                    {job?.serviceType==="biomed_cataloging"&&key==="testResults"?"Additional observations (optional; no tests implied)":label}
                    <Textarea
                      disabled={locked}
                      className="min-h-28"
                      value={report[key]}
                      onChange={(event) =>
                        update({ [key]: event.target.value })
                      }
                      placeholder={placeholder}
                    />
                  </label>
                ))}
                <label className="block space-y-1.5 text-sm font-semibold">
                  Equipment disposition
                  <Select
                    disabled={locked}
                    value={report.assetDisposition}
                    onValueChange={(value) =>
                      update({ assetDisposition: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "passed",
                        "returned_to_service",
                        "parts_required",
                        "follow_up_required",
                        "quarantined",
                        "retired",
                        "needs_resolution", "needs_review", "delivery_completed",
                        ...(job?.serviceType==="biomed_cataloging"?["cataloged"]:[]),
                      ].filter(value=>job?.serviceType!=="biomed_cataloging"||!["passed","returned_to_service","delivery_completed"].includes(value)).map((value) => (
                        <SelectItem key={value} value={value}>
                          {pretty(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">Parts used</p>
                    {!locked ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update({
                            partsUsed: [
                              ...report.partsUsed,
                              { description: "", partNumber: "", quantity: 1 },
                            ],
                          })
                        }
                      >
                        <PackagePlus /> Add part
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-3">
                    {report.partsUsed.map((part, index) => (
                      <div
                        key={index}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_40px]"
                      >
                        <Input
                          disabled={locked}
                          placeholder="Description"
                          value={part.description}
                          onChange={(event) =>
                            update({
                              partsUsed: report.partsUsed.map(
                                (current, currentIndex) =>
                                  currentIndex === index
                                    ? {
                                        ...current,
                                        description: event.target.value,
                                      }
                                    : current,
                              ),
                            })
                          }
                        />
                        <Input
                          disabled={locked}
                          placeholder="Part number"
                          value={part.partNumber}
                          onChange={(event) =>
                            update({
                              partsUsed: report.partsUsed.map(
                                (current, currentIndex) =>
                                  currentIndex === index
                                    ? {
                                        ...current,
                                        partNumber: event.target.value,
                                      }
                                    : current,
                              ),
                            })
                          }
                        />
                        <Input
                          disabled={locked}
                          type="number"
                          min={1}
                          value={part.quantity}
                          onChange={(event) =>
                            update({
                              partsUsed: report.partsUsed.map(
                                (current, currentIndex) =>
                                  currentIndex === index
                                    ? {
                                        ...current,
                                        quantity: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      }
                                    : current,
                              ),
                            })
                          }
                        />
                        {!locked ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              update({
                                partsUsed: report.partsUsed.filter(
                                  (_, currentIndex) => currentIndex !== index,
                                ),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {!report.partsUsed.length ? (
                      <p className="text-xs text-slate-500">
                        No parts recorded.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold">
                    Required completion checklist
                  </p>
                  <div className="mt-3 space-y-2">
                    {report.checklist.map((item, index) => (
                      <div key={item.key} className="rounded-xl border p-3 text-sm space-y-2">
                        <label className="flex items-start gap-3">
                          <Checkbox disabled={locked || item.notApplicable} checked={item.complete} onCheckedChange={(checked) => update({checklist: report.checklist.map((current,i) => i === index ? {...current, complete: checked === true, notApplicable:false} : current)})} />
                          <span>{item.label}</span>
                        </label>
                        {!['identity','sl_serial','sl_photo','sl_attestation'].includes(item.key) && <label className="flex items-center gap-2 text-slate-600">
                          <Checkbox disabled={locked} checked={Boolean(item.notApplicable)} onCheckedChange={checked => update({checklist:report.checklist.map((current,i) => i === index ? {...current,notApplicable:checked === true,complete:false} : current)})} /> Not applicable
                        </label>}
                        {item.notApplicable ? <Input disabled={locked} aria-label={`N/A reason: ${item.label}`} placeholder="Explain why this does not apply (required)" value={item.reason || ''} onChange={e => update({checklist:report.checklist.map((current,i) => i === index ? {...current,reason:e.target.value} : current)})} /> : item.key.startsWith('sl_') && item.key !== 'sl_attestation' ? <Input disabled={locked} aria-label={`Result: ${item.label}`} placeholder="Result, reading with unit, yes/no, or observation" value={item.result || ''} onChange={e => update({checklist:report.checklist.map((current,i) => i === index ? {...current,result:e.target.value} : current)})} /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {stage === 3 ? (
              <section className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold">
                    Customer acknowledgement
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    The customer confirms the documented service and final
                    condition. A signature file is required.
                  </p>
                </div>
                <label className="block space-y-1.5 text-sm font-semibold">
                  Customer printed name
                  <Input
                    disabled={locked}
                    value={report.customerSignatureName}
                    onChange={(event) =>
                      update({ customerSignatureName: event.target.value })
                    }
                  />
                </label>
                {report.signatureAttachmentId ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
                    <Check className="size-4" /> Signature captured and filed
                  </div>
                ) : locked ? null : (
                  <SignaturePad onInkChange={setSignatureInk} />
                )}
              </section>
            ) : null}

            {training?.enabled && stage === 4 ? (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Training Mode</p>
                  <h2 className="mt-1 text-lg font-bold">Quick field knowledge check</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Answer from the work you just completed. An 80% score is required before this training-mode report can be submitted.</p>
                </div>
                <div className="space-y-4">
                  {training.lesson.questions.map((question, questionIndex) => {
                    const result = trainingResult?.results.find((item) => item.id === question.id);
                    return <article key={question.id} className={`rounded-xl border p-4 ${result ? result.correct ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50" : "bg-white"}`}>
                      <p className="text-sm font-bold">{questionIndex + 1}. {question.prompt}</p>
                      <div className="mt-3 grid gap-2">{question.options.map((option, optionIndex) => <button key={option} type="button" disabled={locked} onClick={() => { setTrainingAnswers((current) => ({ ...current, [question.id]: optionIndex })); setTrainingResult(null); }} className={`rounded-lg border px-3 py-2 text-left text-sm transition ${trainingAnswers[question.id] === optionIndex ? "border-blue-500 bg-blue-50 font-semibold text-blue-900" : "bg-white hover:border-blue-300"}`}>{option}</button>)}</div>
                      {result ? <p className={`mt-3 text-xs font-semibold leading-5 ${result.correct ? "text-emerald-800" : "text-amber-900"}`}>{result.correct ? "Correct. " : `Review: ${question.options[result.correctIndex]}. `}{result.rationale}</p> : null}
                    </article>;
                  })}
                </div>
                <Button type="button" className="w-full bg-cyan-700 hover:bg-cyan-800" disabled={checkTraining.isPending || Object.keys(trainingAnswers).length < training.lesson.questions.length} onClick={() => checkTraining.mutate()}><GraduationCap />{checkTraining.isPending ? "Checking…" : "Check my answers"}</Button>
                {trainingResult ? <div className={`rounded-xl border p-4 text-sm ${trainingResult.passed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-bold">{trainingResult.scorePercent}% · {trainingResult.passed ? "Passed" : "Try again"}</p><p className="mt-1">{trainingResult.passed ? "This optional practice check is complete." : "Use the feedback above, correct your answers, and run the check again."}</p></div> : null}
              </section>
            ) : null}

            {stage === reviewStage ? (
              <section className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold">Submission review</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Submit completes the field visit. Administrator review is optional; your saved service report is available immediately.
                  </p>
                </div>
                <div
                  className={`rounded-xl border p-4 ${completion.missing.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
                >
                  <p className="font-bold">
                    {completion.missing.length
                      ? `${completion.missing.length} remaining note${completion.missing.length === 1 ? "" : "s"} remain`
                      : "Ready to submit"}
                  </p>
                  {completion.missing.length ? (
                    <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                      {completion.missing.map((item) => (
                        <li key={item} className="flex gap-2">
                          <CircleAlert className="mt-0.5 size-4 shrink-0" />{" "}
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm">
                      Notes are ready to submit. The administrator can optionally review or refine the report without holding the job.
                    </p>
                  )}
                </div>
                {reportWording}
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Equipment
                    </p>
                    <p className="mt-2 font-bold">
                      {report.manufacturer} {report.model}
                    </p>
                    <p className="mt-1 font-mono text-xs">
                      S/N {report.serialNumber}
                    </p>
                  </article>
                  <article className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Evidence
                    </p>
                    <p className="mt-2 font-bold">
                      {query.data.evidenceRequirements.length -
                        query.data.missingEvidence.length}{" "}
                      of {query.data.evidenceRequirements.length} categories met
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {query.data.attachments.length} total files
                    </p>
                  </article>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm leading-6">
                  <p>
                    <strong>Findings:</strong>{" "}
                    {report.findings || "Not entered"}
                  </p>
                  <p className="mt-2">
                    <strong>Work:</strong>{" "}
                    {report.workPerformed || "Not entered"}
                  </p>
                  <p className="mt-2">
                    <strong>Test:</strong> {report.testResults || "Not entered"}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  {query.data.workOrder.serviceType.startsWith("biomed") ? <label className="mb-4 block font-semibold">Actual on-site time (minutes)
                    <Input type="number" min={0} max={43200} step={1} disabled={locked} value={report.documentDetails?.actualOnsiteMinutes ?? ""} onChange={e => update({documentDetails:{workOrderDate:report.documentDetails?.workOrderDate || "",photoLayout:report.documentDetails?.photoLayout || "detail",photoCaptions:report.documentDetails?.photoCaptions || {},...report.documentDetails,actualOnsiteMinutes:e.target.value === "" ? null : Number(e.target.value)}})} />
                    <span className="text-sm font-normal">Total actual time at this facility, excluding travel and other facilities. Save even if unfinished. Time appears on the service report; contract coverage and invoice charges are reviewed separately.</span>
                  </label> : null}
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Final completion packet</p>
                  <label className="mt-3 block text-sm font-semibold">Original work-order date
                    <Input type="date" disabled={locked} value={report.documentDetails?.workOrderDate || ''} onChange={e => update({documentDetails:{...report.documentDetails,photoLayout:report.documentDetails?.photoLayout || 'detail',photoCaptions:report.documentDetails?.photoCaptions || {},workOrderDate:e.target.value}})} />
                    <span className="text-xs font-normal">Use the issue date on the incoming order. The service date is recorded separately.</span>
                  </label>
                  <p className="mt-2 break-all font-mono text-sm font-bold text-blue-950">{workOrderPacketName(query.data.workOrder, report.assetDisposition)}</p>
                  <p className="mt-2 text-xs leading-5 text-blue-900">Download your service report from the saved notes at any time. Original photos and partner files remain on the job. Billing documents are handled separately.</p>
                  {report.reportPdfAttachmentId ? <Button className="mt-3" variant="outline" asChild><a href={`/api/attachments?attachmentId=${report.reportPdfAttachmentId}`}><ClipboardCheck/>Open completed packet</a></Button> : null}
                </div>
              </section>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <Button
                type="button"
                variant="outline"
                disabled={stage === 0}
                onClick={() => setStage((value) => Math.max(0, value - 1))}
              >
                <ArrowLeft /> Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {!locked ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() => save.mutate("save_draft")}
                  >
                    <Save /> {save.isPending ? "Saving…" : "Save draft"}
                  </Button>
                ) : null}
                {stage < stages.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() =>
                      setStage((value) =>
                        Math.min(stages.length - 1, value + 1),
                      )
                    }
                  >
                    Next <ArrowRight />
                  </Button>
                ) : !locked ? (
                  <Button
                    type="button"
                    disabled={save.isPending || completion.missing.length > 0 || pendingSubmission?.jobId === job?.id}
                    onClick={() => save.mutate("submit")}
                  >
                    <Send />{" "}
                    {uploading === "signature"
                      ? "Filing signature…"
                      : save.isPending
                        ? "Submitting…"
                        : "Submit & finish"}
                  </Button>
                ) : null}
              </div>
            </div>
            </Suspense>}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
