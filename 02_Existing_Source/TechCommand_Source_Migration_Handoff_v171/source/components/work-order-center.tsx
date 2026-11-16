"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assetServiceIntake } from "@/lib/asset-service-intake";
import { AssetServiceDraft } from "@/components/asset-service-draft";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  CheckCircle2,
  ClipboardPaste,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Inbox,
  ListChecks,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  calculatePricing,
  defaultPricingPolicy,
  type PricingPolicy,
} from "@/lib/techflex-pricing";
import {
  evaluateIntake,
  type IntakeData,
  type IntakeNoticeType,
} from "@/lib/intake-completeness";
import {
  ManualIntakeInbox,
  type ManualIntakeRecord,
} from "@/components/manual-intake-inbox";
import { CompletionReviewCenter } from "@/components/completion-review-center";
import { type OrderTarget, orderHref, orderTargetFromValue } from "@/lib/order-navigation";
import { portalFetch, portalJson, PortalResponseError } from "@/lib/portal-fetch";

type Account = { id: string; name: string; accountType: string };
type Location = {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  accessInstructions?: string | null;
};
type Technician = {
  id: string;
  name: string;
  technicianCode: string;
  payoutRate: number;
};
type Customer = {
  id: string;
  accountId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};
type Asset = {
  id: string;
  accountId: string;
  locationId: string;
  assetTag: string;
  description?: string | null;
  manufacturer: string;
  model: string;
  serialNumber?: string | null;
};
type WorkOrder = {
  id: string;
  technicianId: string | null;
  externalId: string;
  externalSource: string;
  serviceType: string;
  status: string;
  summary: string;
  accountName: string;
  locationName: string;
  city: string;
  state: string;
  technicianName: string | null;
  technicianPayCents: number | null;
  acceptedPriceCents: number;
  grossMarginBasisPoints: number;
  scheduledStart: string | null;
};
type PolicyRow = {
  accountId: string;
  accountType: string;
  targetGrossMarginBps: number;
  mileageRateCents: number;
  consumerMileageRateCents: number;
  consumerFreeMiles: number;
  fuelPerDriveHourCents: number;
  technicianHourlyCostCents: number;
  operatingAllowancePerHourCents: number;
  additionalTechnicianFeeCents: number;
  stairsFeeCents: number;
  serviceRules: PricingPolicy["serviceRules"];
};

const serviceLabels: Record<string, string> = {
  evaluation: "Diagnostic / evaluation",
  repair_single: "Single-part repair",
  repair_multi: "Multi-part repair",
  frame_repair: "Frame repair",
  hourly_service: "Hourly service",
  biomed_service_call: "Biomedical service call",
  consumer_install: "Consumer installation",
  wgd_basic: "White-glove delivery · basic",
  wgd_complex: "White-glove delivery · complex",
  bed_delivery: "Hospital / adjustable bed",
  biomed_pm_a: "Biomedical PM · Tier A",
  biomed_pm_b: "Biomedical PM · Tier B",
  biomed_pm_c: "Biomedical PM · Tier C",
  biomed_pm_d: "Biomedical PM · Tier D",
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return portalJson<T>(response,"The work order could not be processed.");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}
function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type WorkOrderForm = {
  accountId: string;
  locationId: string;
  customerId: string;
  assetId: string;
  technicianId: string;
  externalSource: string;
  externalId: string;
  noticeType: IntakeNoticeType;
  sourceDetailUrl: string;
  responseRequirement: string;
  responseDueAt: string;
  serviceType: string;
  summary: string;
  rawText: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  customerComplaint: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  reimbursement: number | null;
  recommendedBid?: number | null;
  proposedBid?: number | null;
  roundTripMiles: number | null;
  driveHours: number;
  onsiteHours: number;
  technicianCount: number | null;
  weightLb: number;
  partsCount: number;
  stairsCount: number;
  hotelCost: number;
  partsCost: number;
  assetCount: number;
  shipmentStatus: string;
  accessInstructions: string;
  scheduledStart: string;
};

const initialForm: WorkOrderForm = {
  accountId: "",
  locationId: "",
  customerId: "none",
  assetId: "none",
  technicianId: "unassigned",
  externalSource: "manual",
  externalId: "",
  noticeType: "new_assignment",
  sourceDetailUrl: "",
  responseRequirement: "",
  responseDueAt: "",
  serviceType: "",
  summary: "",
  rawText: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  serviceAddress: "",
  customerComplaint: "",
  equipmentType: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  reimbursement: null,
  roundTripMiles: null,
  driveHours: 0,
  onsiteHours: 1,
  technicianCount: null,
  weightLb: 0,
  partsCount: 1,
  stairsCount: 0,
  hotelCost: 0,
  partsCost: 0,
  assetCount: 1,
  shipmentStatus: "unknown",
  accessInstructions: "",
  scheduledStart: "",
};

function parseIntake(text: string) {
  const labeled = (...labels: string[]) => {
    const value = text.match(
      new RegExp(
        `(?:^|\\n)\\s*(?:${labels.join("|")})\\s*:\\s*([^\\r\\n]+)`,
        "i",
      ),
    )?.[1];
    if (!value || /^(?:not provided|unknown|n\/a|none)$/i.test(value.trim()))
      return "";
    return value.trim();
  };
  const workOrder =
    labeled("work order", "work-order number", "wo") ||
    text.match(
      /(?:work\s*order|wo|job)(?:\s*(?:#|number|no\.?))?\s*[:#-]?\s*([A-Z0-9]+(?:[-][A-Z0-9]+)+)/i,
    )?.[1] ||
    text.match(/\b(\d{6,}[A-Z]?(?:-\d+)?)\b/)?.[1] ||
    "";
  const reimbursementText =
    labeled(
      "authorization amount",
      "authorized total",
      "reimbursement",
      "amount",
    ) ||
    text.match(
      /(?:reimbursement|authorized|authorization|total|amount|rate)\s*(?:amount)?\s*[:$]?\s*\$([\d,]+(?:\.\d{1,2})?)/i,
    )?.[1] ||
    "";
  const reimbursement = reimbursementText
    ? Number(reimbursementText.replace(/[^\d.]/g, ""))
    : null;
  const milesText =
    labeled("round-trip miles", "round trip miles", "rt miles", "mileage") ||
    text.match(
      /(?:round[ -]?trip|rt)\s*miles?(?:age)?\s*[:]?[ ]*([\d.]+)/i,
    )?.[1] ||
    "";
  const miles = milesText ? Number(milesText.replace(/[^\d.]/g, "")) : null;
  const weight = Number(
    labeled("weight", "product weight")?.match(/[\d.]+/)?.[0] ||
      text.match(/(?:weight|wt)\s*[:]?\s*([\d.]+)\s*(?:lb|lbs|pounds)/i)?.[1] ||
      0,
  );
  const serial =
    labeled("serial number", "serial", "s\/n", "sn") ||
    text.match(
      /(?:serial|s\/n|sn)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]+)/i,
    )?.[1] ||
    "";
  const model =
    labeled("model", "model number") ||
    text.match(/model\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]+)/i)?.[1] ||
    "";
  const lower = text.toLowerCase();
  const externalSource = lower.includes("spinlife")
    ? "spinlife"
    : lower.includes("invacare")
      ? "invacare"
      : lower.includes("onpoint")
        ? "onpoint"
        : lower.includes("direct customer")
          ? "direct"
          : "manual";
  const noticeType: IntakeNoticeType = /cancel(?:led|lation|ed)?/i.test(text)
    ? "cancellation"
    : /needs scheduled|scheduling reminder|appointment date missing|do not have a date/i.test(
          text,
        )
      ? "scheduling_reminder"
      : /authorization update|revised authorization/i.test(text)
        ? "authorization_update"
        : /new assignment|assigned to|work order assignment/i.test(text)
          ? "new_assignment"
          : "general_update";
  let serviceType = "";
  if (
    lower.includes("preventive maintenance") ||
    lower.includes("biomed") ||
    /\bpm\b/i.test(text)
  )
    serviceType = "biomed_pm_c";
  else if (lower.includes("white glove") || lower.includes("wgd"))
    serviceType = lower.includes("complex") ? "wgd_complex" : "wgd_basic";
  else if (
    lower.includes("bed") &&
    (lower.includes("delivery") || lower.includes("install"))
  )
    serviceType = "bed_delivery";
  else if (lower.includes("evaluation") || lower.includes("diagnostic"))
    serviceType = "evaluation";
  else if (lower.includes("multiple parts") || lower.includes("multi-part"))
    serviceType = "repair_multi";
  else if (lower.includes("repair")) serviceType = "repair_single";
  const manufacturer =
    labeled("manufacturer", "brand") ||
    [
      "Golden",
      "Pride",
      "Invacare",
      "Drive",
      "Joerns",
      "Arjo",
      "Midmark",
      "EDAN",
      "Permobil",
    ].find((name) => lower.includes(name.toLowerCase())) ||
    "";
  const detailUrl =
    labeled("fast link", "fast detail link", "source link", "portal link") ||
    text.match(/https?:\/\/fast\.spinlife\.com\/[^\s<>"']+/i)?.[0] ||
    "";
  const responseRequirement =
    labeled("response deadline", "deadline", "response requirement") ||
    text.match(/within\s+\d+\s+business day[^.\n]*/i)?.[0] ||
    "";
  const serviceDescription = labeled(
    "service description",
    "job summary",
    "service requested",
  );
  return {
    externalSource,
    externalId: workOrder,
    noticeType,
    sourceDetailUrl: detailUrl,
    responseRequirement,
    summary: serviceDescription,
    customerName: labeled("customer", "customer name", "facility contact"),
    customerPhone: labeled("customer phone", "phone", "telephone"),
    customerEmail: labeled("customer email", "email"),
    serviceAddress: labeled(
      "service address",
      "customer address",
      "address",
      "location",
    ),
    customerComplaint: labeled(
      "customer complaint",
      "complaint",
      "reported issue",
      "problem",
    ),
    equipmentType: labeled("equipment", "equipment type", "product"),
    reimbursement,
    roundTripMiles: miles,
    weightLb: weight,
    serialNumber: serial,
    model,
    serviceType,
    manufacturer,
    shipmentStatus: labeled(
      "shipment status",
      "parts status",
      "product status",
    ),
    accessInstructions: labeled(
      "access instructions",
      "site instructions",
      "delivery conditions",
    ),
  };
}

function policyFromRow(row?: PolicyRow): PricingPolicy {
  return row
    ? {
        targetGrossMargin: Math.max(0.4, row.targetGrossMarginBps / 10000),
        mileageRate: row.mileageRateCents / 100,
        consumerMileageRate: row.consumerMileageRateCents / 100,
        consumerFreeMiles: row.consumerFreeMiles ?? 10,
        fuelPerDriveHour: row.fuelPerDriveHourCents / 100,
        technicianHourlyCost: row.technicianHourlyCostCents / 100,
        operatingAllowancePerHour: row.operatingAllowancePerHourCents / 100,
        additionalTechnicianFee: row.additionalTechnicianFeeCents / 100,
        stairsFee: row.stairsFeeCents / 100,
        serviceRules: row.serviceRules,
      }
    : defaultPricingPolicy;
}

function isoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function address(parts: Array<string | null | undefined>) {
  return parts.filter((part) => part?.trim()).join(", ");
}

function intakePayload(form: WorkOrderForm): IntakeData {
  const { reimbursement, ...rest } = form;
  return {
    ...rest,
    accountId: form.accountId || null,
    locationId: form.locationId || null,
    customerId: form.customerId === "none" ? null : form.customerId,
    assetId: form.assetId === "none" ? null : form.assetId,
    technicianId: form.technicianId === "unassigned" ? null : form.technicianId,
    externalId: form.externalId || null,
    sourceDetailUrl: form.sourceDetailUrl || null,
    responseRequirement: form.responseRequirement || null,
    responseDueAt: isoOrNull(form.responseDueAt),
    serviceType: form.serviceType || null,
    summary: form.summary || null,
    rawText: form.rawText || null,
    customerName: form.customerName || null,
    customerPhone: form.customerPhone || null,
    customerEmail: form.customerEmail || null,
    serviceAddress: form.serviceAddress || null,
    customerComplaint: form.customerComplaint || null,
    equipmentType: form.equipmentType || null,
    manufacturer: form.manufacturer || null,
    model: form.model || null,
    serialNumber: form.serialNumber || null,
    authorization: reimbursement,
    roundTripMiles: form.roundTripMiles,
    technicianCount: form.technicianCount,
    shipmentStatus: form.shipmentStatus || null,
    accessInstructions: form.accessInstructions || null,
    scheduledStart: isoOrNull(form.scheduledStart),
  };
}

function formFromIntake(data: IntakeData): WorkOrderForm {
  return {
    accountId: data.accountId || "",
    locationId: data.locationId || "",
    customerId: data.customerId || "none",
    assetId: data.assetId || "none",
    technicianId: data.technicianId || "unassigned",
    externalSource: data.externalSource || "manual",
    externalId: data.externalId || "",
    noticeType: data.noticeType || "general_update",
    sourceDetailUrl: data.sourceDetailUrl || "",
    responseRequirement: data.responseRequirement || "",
    responseDueAt: localDateTime(data.responseDueAt),
    serviceType: data.serviceType || "",
    summary: data.summary || "",
    rawText: data.rawText || "",
    customerName: data.customerName || "",
    customerPhone: data.customerPhone || "",
    customerEmail: data.customerEmail || "",
    serviceAddress: data.serviceAddress || "",
    customerComplaint: data.customerComplaint || "",
    equipmentType: data.equipmentType || "",
    manufacturer: data.manufacturer || "",
    model: data.model || "",
    serialNumber: data.serialNumber || "",
    reimbursement: data.authorization ?? null,
    recommendedBid: data.recommendedBid ?? null,
    proposedBid: data.proposedBid ?? null,
    roundTripMiles: data.roundTripMiles ?? null,
    driveHours: data.driveHours ?? 0,
    onsiteHours: data.onsiteHours ?? 1,
    technicianCount: data.technicianCount ?? null,
    weightLb: data.weightLb ?? 0,
    partsCount: data.partsCount ?? 0,
    stairsCount: data.stairsCount ?? 0,
    hotelCost: data.hotelCost ?? 0,
    partsCost: data.partsCost ?? 0,
    assetCount: data.assetCount ?? 1,
    shipmentStatus: data.shipmentStatus || "unknown",
    accessInstructions: data.accessInstructions || "",
    scheduledStart: localDateTime(data.scheduledStart),
  };
}

export function WorkOrderCenter({ initialAssetId, onAssetLoaded, initialTarget, onOpenSpinLife }: { initialAssetId?: string; onAssetLoaded?: () => void; initialTarget?: OrderTarget | null; onOpenSpinLife?: (id:string)=>void }) {
  const queryClient = useQueryClient();
  const loadedAsset = useRef("");
  const intakeRequestId = useRef("");
  const [assetStartError, setAssetStartError] = useState("");
  const [assetDraftMode, setAssetDraftMode] = useState(false);
  const [tab, setTab] = useState("queue");
  const [recordError, setRecordError] = useState("");
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRetry, setRecordRetry] = useState(0);
  const [focusedOrders, setFocusedOrders] = useState<WorkOrder[] | null>(null);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [editReimbursement, setEditReimbursement] = useState<string>("");
  const [editTechnicianId, setEditTechnicianId] = useState<string>("");
  const [editScheduledStart, setEditScheduledStart] = useState<string>("");

  function openEditModal(order: WorkOrder) {
    setEditingOrder(order);
    setEditReimbursement(order.acceptedPriceCents ? String(order.acceptedPriceCents / 100) : "150");
    setEditTechnicianId(order.technicianId || "unassigned");
    setEditScheduledStart(order.scheduledStart ? order.scheduledStart.slice(0, 16) : "");
  }

  const updateWorkOrder = useMutation({
    mutationFn: async () => {
      if (!editingOrder) return;
      const res = await fetch("/api/work-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingOrder.id,
          reimbursement: Number(editReimbursement) || 0,
          technicianId: editTechnicianId === "unassigned" ? null : editTechnicianId,
          scheduledStart: editScheduledStart || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update work order");
      return data;
    },
    onSuccess: async (data) => {
      toast.success(
        data?.status === "pricing_review"
          ? "Work order updated (still in Pricing Review)"
          : "Work order authorized and updated successfully!"
      );
      setEditingOrder(null);
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatch"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Update failed");
    },
  });
  const [form, setForm] = useState(initialForm);
  const [activeIntakeId, setActiveIntakeId] = useState<string | null>(null);
  const [activeIntakeVersion, setActiveIntakeVersion] = useState<number | undefined>();
  const [savedIntakeSignature, setSavedIntakeSignature] = useState<
    string | null
  >(null);
  const [result, setResult] = useState<{
    externalId: string;
    status: string;
    instructions: string[];
    pricing: {
      requiredBid: number;
      technicianPay: number;
      grossMargin: number;
      marginFloor: number;
      offeredRevenue: number;
      technicianLabor: number;
      driveTimeLabor: number;
      roundTripMileage: number;
      otherExpenses: number;
      projectedMargin: number;
      decision: string;
    };
    counterofferMessage: string | null;
  } | null>(null);
  const [completionOrder, setCompletionOrder] = useState<WorkOrder | null>(
    null,
  );
  const [completionResult, setCompletionResult] = useState<{
    externalId: string;
    invoiceNumber: string;
    totalCents: number;
    summary: string;
    accountName: string;
    locationName: string;
    location: string;
    technicianName?: string | null;
    findings: string;
    workPerformed: string;
    recommendation?: string | null;
    customerSignatureName: string;
    checklist: { label: string; complete: boolean }[];
  } | null>(null);
  const [report, setReport] = useState({
    findings: "",
    workPerformed: "",
    recommendation: "",
    assetDisposition: "returned_to_service",
    customerSignatureName: "",
    checklist: [] as { label: string; complete: boolean }[],
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => json<{ accounts: Account[] }>("/api/accounts"),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => json<{ locations: Location[] }>("/api/locations"),
  });
  const technicians = useQuery({
    queryKey: ["technicians"],
    queryFn: () => json<{ technicians: Technician[] }>("/api/technicians"),
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => json<{ customers: Customer[] }>("/api/customers"),
  });
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: () => json<{ assets: Asset[] }>("/api/assets"),
  });
  const queue = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => json<{ workOrders: WorkOrder[] }>("/api/work-orders"),
  });
  useEffect(() => {
    if (!initialTarget) return;
    let cancelled=false;
    async function loadRecord() {
      setRecordLoading(true);setRecordError("");
      try {
        let workOrderId=initialTarget!.kind==="work_order"?initialTarget!.id:null;
        if(initialTarget!.kind==="intake") {
          const {intake}=await json<{intake:ManualIntakeRecord}>(`/api/intakes?id=${encodeURIComponent(initialTarget!.id)}`);
          if(cancelled)return;
          if(intake.convertedWorkOrderId) workOrderId=intake.convertedWorkOrderId;
          else if(intake.status==="archived") throw new Error("This intake is archived. It has not been reopened or duplicated.");
          else if(intake.editor==="spinlife" && onOpenSpinLife) {onOpenSpinLife(intake.id);return;}
          else {resumeIntake(intake);return;}
        }
        if(workOrderId) {
          const result=await json<{workOrders:WorkOrder[]}>(`/api/work-orders?id=${encodeURIComponent(workOrderId)}`);
          if(cancelled)return;
          if(!result.workOrders.length) throw new Error("The linked work order is not available to your account. No new record was created.");
          setFocusedOrders(result.workOrders);setTab("queue");
        }
      } catch(error) {if(!cancelled)setRecordError((error as Error).message);}
      finally {if(!cancelled)setRecordLoading(false);}
    }
    void loadRecord();return()=>{cancelled=true;};
  },[initialTarget?.id,initialTarget?.kind,recordRetry]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initialAssetId || loadedAsset.current === initialAssetId || !assets.data || !locations.data) return;
    const asset = assets.data.assets.find(item => item.id === initialAssetId);
    const location = locations.data.locations.find(item => item.id === asset?.locationId);
    let cancelled=false;
    void Promise.resolve().then(()=>{
      if(cancelled)return;
      if (!asset || !location) { setAssetStartError("This asset or facility is no longer available. Refresh the registry and select it again."); return; }
      try {
        const next = formFromIntake(assetServiceIntake(asset, location));
        setAssetDraftMode(true);
        intakeRequestId.current = crypto.randomUUID();
        loadedAsset.current = initialAssetId;
        setForm(next); setActiveIntakeId(null); setActiveIntakeVersion(undefined); setSavedIntakeSignature(null); setResult(null); setTab("intake"); setAssetStartError("");
        onAssetLoaded?.();
      } catch (error) {setAssetStartError(error instanceof Error ? error.message : "The asset could not be loaded.");}
    });
    return()=>{cancelled=true;};
  }, [initialAssetId, assets.data, locations.data, onAssetLoaded]);
  const accountPolicy = useQuery({ queryKey: ["bid-account-pricing", form.accountId], enabled: Boolean(form.accountId),
    queryFn: () => json<{policy: PricingPolicy; source: string}>(`/api/bid-intelligence?accountId=${encodeURIComponent(form.accountId)}`),
  });
  const preview = useMemo(
    () =>
      calculatePricing(
        {
          ...form,
          serviceType: form.serviceType || "repair_single",
          reimbursement: form.reimbursement ?? 0,
          roundTripMiles: form.roundTripMiles ?? 0,
          technicianCount: form.technicianCount ?? 1,
          consumerPricing: accounts.data?.accounts.find(item => item.id === form.accountId)?.accountType === "direct_customer",
        },
        accountPolicy.data?.policy,
      ),
    [form, accountPolicy.data, accounts.data],
  );
  const intakeEvaluation = useMemo(
    () => evaluateIntake(intakePayload(form)),
    [form],
  );
  const intakeSignature = useMemo(
    () => JSON.stringify(intakePayload(form)),
    [form],
  );
  const intakeHasUnsavedChanges = intakeSignature !== savedIntakeSignature;
  useEffect(() => {
    if (!form.accountId && accounts.data?.accounts && accounts.data.accounts.length === 1) {
      setForm((current) => ({
        ...current,
        accountId: accounts.data.accounts[0].id,
      }));
    }
  }, [accounts.data, form.accountId]);
  const availableLocations = useMemo(() => {
    const all = locations.data?.locations ?? [];
    if (!form.accountId) return all;
    return all.filter((location) => location.accountId === form.accountId);
  }, [locations.data, form.accountId]);
  const availableCustomers = useMemo(() => {
    const all = customers.data?.customers ?? [];
    if (!form.accountId) return all;
    return all.filter((customer) => customer.accountId === form.accountId);
  }, [customers.data, form.accountId]);
  const availableAssets = useMemo(() => {
    const all = assets.data?.assets ?? [];
    return all.filter((asset) => {
      if (form.accountId && asset.accountId !== form.accountId) return false;
      return true;
    });
  }, [assets.data, form.accountId]);
  const create = useMutation({
    mutationFn: () =>
      json<{
        workOrder: {
          externalId: string;
          status: string;
          instructions: string[];
        };
        pricing: {
          requiredBid: number;
          technicianPay: number;
          grossMargin: number;
          marginFloor: number;
          offeredRevenue: number;
          technicianLabor: number;
          driveTimeLabor: number;
          roundTripMileage: number;
          otherExpenses: number;
          projectedMargin: number;
          decision: string;
        };
        counterofferMessage: string | null;
      }>("/api/work-orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          intakeId: activeIntakeId,
          customerId: form.customerId === "none" ? null : form.customerId,
          assetId: form.assetId === "none" ? null : form.assetId,
          technicianId:
            form.technicianId === "unassigned" ? null : form.technicianId,
          scheduledStart: form.scheduledStart
            ? new Date(form.scheduledStart).toISOString()
            : null,
          sourceDetailUrl: form.sourceDetailUrl || null,
          responseRequirement: form.responseRequirement || null,
          responseDueAt: isoOrNull(form.responseDueAt),
          reimbursement: form.reimbursement ?? 0,
          roundTripMiles: form.roundTripMiles ?? 0,
          technicianCount: form.technicianCount ?? 1,
        }),
      }),
    onSuccess: async (data) => {
      setResult({
        ...data.workOrder,
        pricing: data.pricing,
        counterofferMessage: data.counterofferMessage,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["technician-pay"] }),
        queryClient.invalidateQueries({ queryKey: ["work-order-intakes"] }),
      ]);
      setActiveIntakeId(null);
      setSavedIntakeSignature(null);
      toast.success("Work order processed", {
        description: data.workOrder.externalId,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const saveIntake = useMutation({
    mutationFn: () => {
      intakeRequestId.current ||= crypto.randomUUID();
      return json<{
        intake: {
          id: string;
          status: string;
          blockingCount: number;
          recordVersion?: number;
          data: IntakeData;
        };
      }>("/api/intakes", {
        method: activeIntakeId ? "PATCH" : "POST",
        body: JSON.stringify(
          activeIntakeId
            ? {
                id: activeIntakeId,
                expectedVersion: activeIntakeVersion,
                action: "update",
                data: intakePayload(form),
              }
            : {...intakePayload(form), requestId: intakeRequestId.current},
        ),
      });
    },
    onSuccess: async (data) => {
      const enrichedForm = formFromIntake(data.intake.data);
      setActiveIntakeId(data.intake.id);
      setActiveIntakeVersion(data.intake.recordVersion);
      setForm(enrichedForm);
      setSavedIntakeSignature(JSON.stringify(intakePayload(enrichedForm)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-order-intakes"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
      ]);
      toast.success(
        assetDraftMode ? "Service request saved" : data.intake.blockingCount
          ? "Intake saved with follow-up prompts"
          : "Intake ready for pricing",
        {
          description: assetDraftMode ? "Reopen it in Work orders → Intake inbox. No invoice or completed visit was created." : data.intake.blockingCount
            ? `${data.intake.blockingCount} critical field${data.intake.blockingCount === 1 ? "" : "s"} still required`
            : "Critical data complete",
        },
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const complete = useMutation({
    mutationFn: () =>
      json<{ completion: typeof completionResult }>("/api/work-orders", {
        method: "PATCH",
        body: JSON.stringify({ id: completionOrder?.id, ...report }),
      }),
    onSuccess: async (data) => {
      setCompletionResult(data.completion);
      setCompletionOrder(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["technician-pay"] }),
      ]);
      toast.success("Service report submitted and invoice drafted", {
        description: data.completion?.invoiceNumber,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  async function downloadPacket() {
    if (!completionResult) return;
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 46;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = 730;
    const newPage = () => {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = 740;
    };
    const lines = (value: string, max = 84) => {
      const words = value.replace(/\s+/g, " ").trim().split(" ");
      const out: string[] = [];
      let line = "";
      for (const word of words) {
        if (`${line} ${word}`.trim().length > max) {
          if (line) out.push(line);
          line = word;
        } else line = `${line} ${word}`.trim();
      }
      if (line) out.push(line);
      return out;
    };
    const draw = (
      value: string,
      options: {
        size?: number;
        isBold?: boolean;
        color?: ReturnType<typeof rgb>;
        gap?: number;
      } = {},
    ) => {
      const size = options.size ?? 10;
      for (const line of lines(value, size >= 16 ? 62 : 88)) {
        if (y < 60) newPage();
        page.drawText(line, {
          x: margin,
          y,
          size,
          font: options.isBold ? bold : regular,
          color: options.color ?? rgb(0.08, 0.14, 0.25),
        });
        y -= options.gap ?? size + 5;
      }
    };
    page.drawRectangle({
      x: 0,
      y: 750,
      width: pageWidth,
      height: 42,
      color: rgb(0.04, 0.15, 0.29),
    });
    page.drawText("TECHFLEX MOBILITY SOLUTIONS", {
      x: margin,
      y: 766,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y = 718;
    draw("SERVICE REPORT & INVOICE PACKET", {
      size: 18,
      isBold: true,
      color: rgb(0.08, 0.37, 0.94),
      gap: 28,
    });
    draw(
      `Work order: ${completionResult.externalId}    Invoice: ${completionResult.invoiceNumber}`,
      { isBold: true },
    );
    draw(
      `Account: ${completionResult.accountName}    Location: ${completionResult.locationName} · ${completionResult.location}`,
    );
    draw(
      `Technician: ${completionResult.technicianName || "Assigned technician"}    Authorized total: ${money(completionResult.totalCents / 100)}`,
    );
    y -= 8;
    const section = (title: string, body: string) => {
      draw(title.toUpperCase(), {
        size: 11,
        isBold: true,
        color: rgb(0.08, 0.37, 0.94),
        gap: 18,
      });
      draw(body || "None documented.");
      y -= 8;
    };
    section("Service summary", completionResult.summary);
    section("Findings", completionResult.findings);
    section("Work performed", completionResult.workPerformed);
    section("Recommendations", completionResult.recommendation || "None");
    draw("COMPLETION CHECKLIST", {
      size: 11,
      isBold: true,
      color: rgb(0.08, 0.37, 0.94),
      gap: 18,
    });
    completionResult.checklist.forEach((item) =>
      draw(`[${item.complete ? "X" : " "}] ${item.label}`),
    );
    y -= 8;
    section("Customer acknowledgement", completionResult.customerSignatureName);
    draw(
      "Generated by TechFlex Command Center. Draft invoice remains subject to administrative review.",
      { size: 8, color: rgb(0.4, 0.45, 0.55) },
    );
    const bytes = await pdf.save();
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `TechFlex_${completionResult.externalId}_Service_Report.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function startNewIntake() {
    setAssetDraftMode(false);
    intakeRequestId.current = crypto.randomUUID();
    setActiveIntakeId(null);
    setActiveIntakeVersion(undefined);
    setSavedIntakeSignature(null);
    setForm(initialForm);
    setResult(null);
    setTab("intake");
  }
  function resumeIntake(record: ManualIntakeRecord) {
    if(record.editor==="spinlife" && onOpenSpinLife) {onOpenSpinLife(record.id);return;}
    setAssetDraftMode(Boolean(record.data.assetId));
    const nextForm = formFromIntake(record.data);
    setActiveIntakeId(record.id);
    setActiveIntakeVersion(record.recordVersion);
    setSavedIntakeSignature(JSON.stringify(intakePayload(nextForm)));
    setResult(null);
    setForm(nextForm);
    setTab("intake");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function extract() {
    const parsed = parseIntake(form.rawText);
    const matchedAccount = accounts.data?.accounts.find((account) => {
      const source = parsed.externalSource.toLowerCase();
      return account.name.toLowerCase().includes(source);
    });
    setForm((current) => ({
      ...current,
      ...parsed,
      accountId: current.accountId || matchedAccount?.id || "",
      summary:
        current.summary ||
        parsed.summary ||
        (parsed.serviceType
          ? `${serviceLabels[parsed.serviceType] || "Service"} · ${parsed.manufacturer || "Equipment"} ${parsed.model}`.trim()
          : ""),
      customerComplaint:
        current.customerComplaint ||
        parsed.customerComplaint ||
        current.rawText
          .match(/(?:complaint|issue|problem)\s*[:]\s*([^\n]+)/i)?.[1]
          ?.trim() ||
        "",
    }));
    toast.success("Intake fields extracted", {
      description: "Review the highlighted information before saving.",
    });
  }

  const displayedOrders=focusedOrders || queue.data?.workOrders || [];
  const saveTarget=saveIntake.error instanceof PortalResponseError ? orderTargetFromValue((saveIntake.error.details as {target?:unknown})?.target) : null;
  return (
    <div className="space-y-5">
      {recordLoading?<p role="status">Opening the exact saved record…</p>:null}
      {recordError?<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">{recordError}<Button variant="outline" onClick={()=>setRecordRetry(n=>n+1)}>Retry opening saved record</Button></div>:null}
      {saveIntake.isError?<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>{saveIntake.error.message}</p>{saveTarget?<a className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={orderHref(saveTarget)} target="_blank" rel="noopener noreferrer">Open saved record in a new tab — keep these entries here</a>:null}</div>:null}
      {focusedOrders?<div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4">Showing the existing work order. Its intake was not recreated. <Button variant="outline" onClick={()=>setFocusedOrders(null)}>Show all work orders</Button></div>:null}
      {initialAssetId && (assetStartError || assets.isError || locations.isError) ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{assetStartError || "The asset details could not be loaded. Your existing work is preserved."}</p><Button variant="outline" onClick={() => {void assets.refetch(); void locations.refetch();}}>Retry asset details</Button></div> : null}
      {initialAssetId && !assetStartError && (assets.isLoading || locations.isLoading) ? <p role="status" className="text-sm">Preparing the asset’s service request…</p> : null}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="queue">
              <ListChecks /> Live queue
            </TabsTrigger>
            <TabsTrigger value="review">
              <FileCheck2 /> Submission inbox
            </TabsTrigger>
            <TabsTrigger value="inbox">
              <Inbox /> Intake inbox
            </TabsTrigger>
            <TabsTrigger value="intake">
              <ClipboardPaste /> Paste or enter work order
            </TabsTrigger>
          </TabsList>
          <Button onClick={startNewIntake} disabled={saveIntake.isPending}>
            <Plus /> New intake
          </Button>
        </div>
        <TabsContent value="queue" className="mt-5 space-y-4">
          <article className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b p-5">
              <h2 className="font-bold text-slate-900">
                Live work-order pipeline
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Every job, its offered reimbursement, technician allocation,
                margin, and current owner.
              </p>
            </div>
            {queue.isLoading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Loading live work orders…
              </div>
            ) : null}
            {!queue.isLoading && !displayedOrders.length ? (
              <div className="p-12 text-center">
                <ClipboardPaste className="mx-auto size-8 text-slate-300" />
                <p className="mt-3 font-bold">No live work orders yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Paste the first open assignment and the system will price and
                  categorize it.
                </p>
              </div>
            ) : null}
            {displayedOrders.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="pl-5">WORK ORDER</TableHead>
                    <TableHead>SERVICE / LOCATION</TableHead>
                    <TableHead>TECHNICIAN</TableHead>
                    <TableHead>OFFERED</TableHead>
                    <TableHead>TECH PAY</TableHead>
                    <TableHead>MARGIN</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-5">
                        <p className="font-mono text-xs font-bold">
                          {order.externalId}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.accountName}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold">
                          {serviceLabels[order.serviceType] ||
                            order.serviceType}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.locationName} · {order.city}, {order.state}
                        </p>
                      </TableCell>
                      <TableCell>
                        {order.technicianName || (
                          <span className="font-semibold text-amber-700">
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold">
                        {money((order.acceptedPriceCents || 0) / 100)}
                      </TableCell>
                      <TableCell>
                        {order.status === "pricing_review" ? (
                          <span className="font-semibold text-amber-700">
                            Held
                          </span>
                        ) : order.technicianPayCents == null ? (
                          "—"
                        ) : (
                          money(order.technicianPayCents / 100)
                        )}
                      </TableCell>
                      <TableCell>
                        {order.status === "pricing_review" ? (
                          <span className="font-bold text-amber-700">
                            Not authorized
                          </span>
                        ) : (
                          <span
                            className={`font-bold ${order.grossMarginBasisPoints >= 4000 ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {(order.grossMarginBasisPoints / 100).toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => openEditModal(order)}
                          title="Click to edit work order"
                          className="cursor-pointer group"
                        >
                        <Badge variant="outline" className={`capitalize transition ${order.status === "pricing_review" ? "bg-amber-50 text-amber-800 border-amber-300 group-hover:bg-amber-100" : "group-hover:bg-slate-100"}`}>
                          <Pencil className="size-2.5 mr-1 inline opacity-70" />
                          {order.status.replaceAll("_", " ")}
                        </Badge></button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditModal(order)}
                            className="h-7.5 gap-1 border-slate-200 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50"
                          >
                            <Pencil className="size-3" /> Edit
                          </Button>
                        {["completed","technician_submitted"].includes(order.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTab("review")}
                          >
                            <FileCheck2 /> Review
                          </Button>
                        ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </article>
          {editingOrder ? (
            <Dialog open={Boolean(editingOrder)} onOpenChange={(open) => !open && setEditingOrder(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>Edit Work Order</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {editingOrder.externalId}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Update client reimbursement, assigned technician, or scheduled date to authorize this work order and enable dispatch.
                  </DialogDescription>
                </DialogHeader>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateWorkOrder.mutate();
                  }}
                  className="space-y-4 py-2"
                >
                  <div className="rounded-lg border bg-slate-50 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Service type:</span>
                      <span className="font-semibold">{serviceLabels[editingOrder.serviceType] || editingOrder.serviceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account:</span>
                      <span className="font-semibold">{editingOrder.accountName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Location:</span>
                      <span className="font-semibold">{editingOrder.locationName || `${editingOrder.city}, ${editingOrder.state}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current status:</span>
                      <Badge variant="outline" className="capitalize text-[11px] h-5">
                        {editingOrder.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">
                      Client reimbursement ($)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={editReimbursement}
                      onChange={(e) => setEditReimbursement(e.target.value)}
                      placeholder="e.g. 150.00"
                      className="font-semibold text-slate-900"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Enter authorized reimbursement amount (e.g. $150 or more). Once covered, status changes to Authorized and enables dispatch.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">
                      Assigned technician
                    </label>
                    <Select
                      value={editTechnicianId}
                      onValueChange={setEditTechnicianId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Leave unassigned</SelectItem>
                        {technicians.data?.technicians.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} · {t.technicianCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">
                      Scheduled start (Date &amp; Time)
                    </label>
                    <Input
                      type="datetime-local"
                      value={editScheduledStart}
                      onChange={(e) => setEditScheduledStart(e.target.value)}
                    />
                  </div>

                  <DialogFooter className="mt-4 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingOrder(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateWorkOrder.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {updateWorkOrder.isPending ? "Saving…" : "Save & Authorize"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
          {completionResult ? (
            <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div>
                <p className="font-bold text-emerald-950">
                  {completionResult.externalId} completed ·{" "}
                  {completionResult.invoiceNumber} drafted
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  The PDF service report and invoice packet is ready.
                </p>
              </div>
              <Button onClick={downloadPacket}>
                <Download /> Download PDF packet
              </Button>
            </article>
          ) : null}
        </TabsContent>
        <TabsContent value="review" className="mt-5">
          <CompletionReviewCenter />
        </TabsContent>
        <TabsContent value="inbox" className="mt-5">
          <ManualIntakeInbox onResume={resumeIntake} />
        </TabsContent>
        <TabsContent value="intake" className="mt-5 space-y-5">
          {assetDraftMode ? <AssetServiceDraft value={form}
            account={accounts.data?.accounts.find(a=>a.id===form.accountId)?.name || ""}
            equipment={[form.equipmentType, form.manufacturer, form.model, form.serialNumber ? `Serial ${form.serialNumber}` : "Serial not recorded"].filter(Boolean).join(" · ")}
            address={form.serviceAddress} pending={saveIntake.isPending}
            saved={Boolean(activeIntakeId)&&!intakeHasUnsavedChanges}
            error={saveIntake.isError?saveIntake.error.message:undefined}
            onChange={patch=>{saveIntake.reset();setForm(current=>({...current,...patch}));}}
            onSave={()=>saveIntake.mutate()}/> : null}
          <details open={assetDraftMode ? undefined : true} className="space-y-5">
            {assetDraftMode ? <summary className="cursor-pointer rounded-lg border bg-white px-4 py-3 font-medium">Optional details and dispatch review</summary> : <summary className="hidden">Intake details</summary>}
            {assetDraftMode ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">These legacy dispatch and pricing controls are not required to save the request. The pricing preview does not apply Biomedical/PM agreement coverage. Review the signed contract before processing covered work; saving here never issues an invoice.</p> : null}
          <fieldset disabled={saveIntake.isPending} className="min-w-0 space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <article className="rounded-xl border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold">
                      {activeIntakeId
                        ? `Continue ${form.externalId || "manual intake"}`
                        : "Paste the external work order"}
                    </h2>
                    {activeIntakeId ? (
                      <Badge variant="outline">Saved intake</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Paste email, FaST, portal, or copy-ready text. Recognized
                    fields are filled automatically; the administrator verifies
                    and supplies the rest.
                  </p>
                </div>
                <ClipboardPaste className="size-5 text-blue-600" />
              </div>
              <Textarea
                className="mt-4 min-h-56 font-mono text-sm"
                value={form.rawText}
                onChange={(event) =>
                  setForm({ ...form, rawText: event.target.value })
                }
                placeholder="Paste the complete work-order text here…"
              />
              <Button
                variant="outline"
                className="mt-3"
                onClick={extract}
                disabled={!form.rawText.trim()}
              >
                <Sparkles /> Extract work-order details
              </Button>
            </article>
            <article className="rounded-xl border bg-[#102748] p-5 text-white">
              <div className="flex items-center gap-2">
                <Calculator className="size-5 text-blue-300" />
                <h2 className="font-bold">Live financial guardrail</h2>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-xs text-blue-200">Offered job payment</p>
                  <p className="mt-1 text-xl font-bold">
                    {form.reimbursement == null
                      ? "Not entered"
                      : money(form.reimbursement)}
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-xs text-blue-200">
                    Authorized technician pay
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {money(preview.technicianPay)}
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-xs text-blue-200">Required TechFlex bid</p>
                  <p className="mt-1 text-xl font-bold">
                    {money(preview.requiredBid)}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-3 ${preview.counteroffer ? "bg-amber-400/20" : "bg-emerald-400/15"}`}
                >
                  <p className="text-xs text-blue-100">Pricing decision</p>
                  <p className="mt-1 text-sm font-bold">
                    {preview.counteroffer
                      ? `Counter at ${money(preview.counteroffer)}`
                      : "Margin protected"}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100">
                <div className="flex justify-between gap-4"><span>Technician labor</span><span>{money(preview.technicianLabor)}</span></div>
                <div className="mt-1 flex justify-between gap-4"><span>Drive-time labor</span><span>{money(preview.driveTimeLabor)}</span></div>
                <div className="mt-1 flex justify-between gap-4"><span>Round-trip mileage</span><span>{money(preview.roundTripMileage)}</span></div>
                <div className="mt-1 flex justify-between gap-4"><span>Other expenses</span><span>{money(preview.otherExpenses)}</span></div>
                <div className="mt-2 flex justify-between gap-4 border-t border-white/15 pt-2 font-bold"><span>Projected margin</span><span className={preview.projectedMargin < 0 ? "text-amber-300" : "text-emerald-300"}>{money(preview.projectedMargin)}</span></div>
              </div>
              <p className="mt-4 text-xs leading-5 text-blue-100/70">
                The offered amount is not approved TechFlex revenue. This account’s {(preview.marginFloor * 100).toFixed(0)}% target
                is enforced. Technician pay is held until reimbursement meets
                the required bid. This job requires{" "}
                {preview.requiredTechnicianCount} technician
                {preview.requiredTechnicianCount === 1 ? "" : "s"}; beds default
                to two and freight over 500 lb requires three.
              </p>
            </article>
          </section>
          <article
            className={`rounded-xl border p-5 ${
              form.noticeType === "cancellation"
                ? "border-red-200 bg-red-50/70"
                : intakeEvaluation.blockers.length
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-emerald-200 bg-emerald-50/70"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2">
                  {form.noticeType === "cancellation" ? (
                    <CircleAlert className="size-5 text-red-700" />
                  ) : intakeEvaluation.blockers.length ? (
                    <CircleAlert className="size-5 text-amber-700" />
                  ) : (
                    <CheckCircle2 className="size-5 text-emerald-700" />
                  )}
                  <h2 className="font-bold text-slate-950">
                    {form.noticeType === "cancellation"
                      ? "Cancellation control"
                      : intakeEvaluation.blockers.length
                        ? `${intakeEvaluation.blockers.length} critical intake field${intakeEvaluation.blockers.length === 1 ? "" : "s"} missing`
                        : "Critical intake data complete"}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {form.noticeType === "cancellation"
                    ? "Save this notice for administrative review. It will not enter pricing or dispatch as a new job."
                    : intakeEvaluation.blockers.length
                      ? "Save the record now if needed. The portal will generate the exact follow-up task and keep it out of pricing and dispatch until these fields are supplied."
                      : "Save the verified intake, then release it into the pricing engine. Recommended items can still be completed before field service."}
                </p>
              </div>
              <div className="min-w-48 rounded-xl border bg-white/80 p-3">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Intake readiness</span>
                  <span>{intakeEvaluation.score}%</span>
                </div>
                <Progress value={intakeEvaluation.score} className="mt-2 h-2" />
              </div>
            </div>
            {intakeEvaluation.blockers.length ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {intakeEvaluation.blockers.map((issue) => (
                  <div
                    key={issue.key}
                    className="rounded-lg border border-amber-200 bg-white/80 p-3"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {issue.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {issue.reason}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            {intakeEvaluation.warnings.length ? (
              <div className="mt-4 border-t border-slate-200/80 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Recommended before field completion
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {intakeEvaluation.warnings.map((issue) => (
                    <span
                      key={issue.key}
                      title={issue.reason}
                      className="rounded-md border bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >
                      {issue.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!accountPolicy.data || accountPolicy.isFetching || accountPolicy.isError) {toast.error("Wait for the selected account’s rates to load before creating the job."); return;}
              create.mutate();
            }}
          >
            <article className="rounded-xl border bg-white p-5">
              <h2 className="font-bold">Required intake fields</h2>
              {form.proposedBid != null ? <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">Intake proposed bid: {money(form.proposedBid)}. Recorded partner authorization: {money(form.reimbursement || 0)}. A proposed amount is not approval.</p> : null}
              {accountPolicy.isError ? <p role="alert" className="mt-2 text-sm text-red-700">Account rates could not be loaded. <Button type="button" variant="outline" onClick={() => accountPolicy.refetch()}>Retry account rates</Button></p> : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Client / account">
                  <Select
                    value={form.accountId}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        accountId: value,
                        locationId: "",
                        customerId: "none",
                        assetId: "none",
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.data?.accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Service location">
                  <Select
                    value={form.locationId}
                    onValueChange={(value) => {
                      const location = availableLocations.find(
                        (item) => item.id === value,
                      );
                      setForm({
                        ...form,
                        locationId: value,
                        accountId: form.accountId || location?.accountId || "",
                        assetId: "none",
                        serviceAddress: location
                          ? address([
                              location.address1,
                              location.address2,
                              location.city,
                              location.state,
                              location.postalCode,
                            ])
                          : form.serviceAddress,
                        accessInstructions:
                          form.accessInstructions ||
                          location?.accessInstructions ||
                          "",
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLocations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} · {location.city}{!form.accountId && location.accountName ? ` (${location.accountName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Customer / service recipient">
                  <Select
                    value={form.customerId}
                    onValueChange={(value) => {
                      const customer = availableCustomers.find(
                        (item) => item.id === value,
                      );
                      setForm({
                        ...form,
                        customerId: value,
                        accountId: form.accountId || customer?.accountId || "",
                        customerName: customer?.name || form.customerName,
                        customerPhone: customer
                          ? customer.phone || ""
                          : form.customerPhone,
                        customerEmail: customer
                          ? customer.email || ""
                          : form.customerEmail,
                        serviceAddress:
                          form.serviceAddress ||
                          address([
                            customer?.address1,
                            customer?.address2,
                            customer?.city,
                            customer?.state,
                            customer?.postalCode,
                          ]),
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked yet</SelectItem>
                      {availableCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                          {customer.phone ? ` · ${customer.phone}` : ""}
                          {!form.accountId && (customer as unknown as { accountName?: string }).accountName ? ` (${(customer as unknown as { accountName?: string }).accountName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Linked equipment asset">
                  <Select
                    value={form.assetId}
                    onValueChange={(value) => {
                      const asset = (assets.data?.assets ?? []).find(
                        (item) => item.id === value,
                      );
                      const matchingLocation = (locations.data?.locations ?? []).find(
                        (loc) => loc.id === asset?.locationId,
                      );
                      setForm({
                        ...form,
                        assetId: value,
                        accountId: form.accountId || asset?.accountId || "",
                        locationId: form.locationId || asset?.locationId || "",
                        serviceAddress: form.serviceAddress || (matchingLocation ? address([
                          matchingLocation.address1,
                          matchingLocation.address2,
                          matchingLocation.city,
                          matchingLocation.state,
                          matchingLocation.postalCode,
                        ]) : form.serviceAddress),
                        equipmentType: asset?.description || form.equipmentType,
                        manufacturer: asset?.manufacturer || form.manufacturer,
                        model: asset?.model || form.model,
                        serialNumber: asset ? asset.serialNumber || "" : form.serialNumber,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Not linked / create later
                      </SelectItem>
                      {availableAssets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.assetTag} · {asset.manufacturer} {asset.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Work-order number">
                  <Input
                    required
                    value={form.externalId}
                    onChange={(event) =>
                      setForm({ ...form, externalId: event.target.value })
                    }
                    placeholder="Include full suffix"
                  />
                </Field>
                <Field label="Source">
                  <Select
                    value={form.externalSource}
                    onValueChange={(value) =>
                      setForm({ ...form, externalSource: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!["manual", "spinlife", "invacare", "onpoint", "direct", "partner_api"].includes(form.externalSource) ? <SelectItem value={form.externalSource}>{form.externalSource}</SelectItem> : null}
                      <SelectItem value="manual">Manual entry</SelectItem>
                      <SelectItem value="spinlife">SpinLife</SelectItem>
                      <SelectItem value="invacare">Invacare</SelectItem>
                      <SelectItem value="onpoint">OnPoint Warranty</SelectItem>
                      <SelectItem value="direct">Direct customer</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Notice type">
                  <Select
                    value={form.noticeType}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        noticeType: value as IntakeNoticeType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_assignment">
                        New assignment
                      </SelectItem>
                      <SelectItem value="scheduling_reminder">
                        Scheduling reminder
                      </SelectItem>
                      <SelectItem value="cancellation">Cancellation</SelectItem>
                      <SelectItem value="authorization_update">
                        Authorization update
                      </SelectItem>
                      <SelectItem value="general_update">
                        General update
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Service type">
                  <Select
                    value={form.serviceType}
                    onValueChange={(value) =>
                      setForm({ ...form, serviceType: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(serviceLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Assigned technician">
                  <Select
                    value={form.technicianId}
                    onValueChange={(value) =>
                      setForm({ ...form, technicianId: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">
                        Leave unassigned
                      </SelectItem>
                      {technicians.data?.technicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.name} · {tech.technicianCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Scheduled start">
                  <Input
                    type="datetime-local"
                    value={form.scheduledStart}
                    onChange={(event) =>
                      setForm({ ...form, scheduledStart: event.target.value })
                    }
                  />
                </Field>
                <Field label="Exact response due">
                  <Input
                    type="datetime-local"
                    value={form.responseDueAt}
                    onChange={(event) =>
                      setForm({ ...form, responseDueAt: event.target.value })
                    }
                  />
                </Field>
                <Field label="Client reimbursement">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.reimbursement ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        reimbursement:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Source portal detail link">
                  <Input
                    type="url"
                    value={form.sourceDetailUrl}
                    onChange={(event) =>
                      setForm({ ...form, sourceDetailUrl: event.target.value })
                    }
                    placeholder="https://fast.spinlife.com/…"
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Job summary">
                  <Input
                    required
                    value={form.summary}
                    onChange={(event) =>
                      setForm({ ...form, summary: event.target.value })
                    }
                  />
                </Field>
                <Field label="Customer complaint">
                  <Input
                    value={form.customerComplaint}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        customerComplaint: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Response requirement">
                  <Input
                    value={form.responseRequirement}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        responseRequirement: event.target.value,
                      })
                    }
                    placeholder="Example: Schedule within 1 business day"
                  />
                </Field>
              </div>
              {form.sourceDetailUrl ? (
                <a
                  href={form.sourceDetailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:underline"
                >
                  Open the source work order <ExternalLink className="size-4" />
                </a>
              ) : null}
              <div className="mt-5 border-t pt-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Customer details from the source
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    These values preserve the notice even before a permanent
                    customer file is linked.
                  </p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Customer / facility name">
                    <Input
                      value={form.customerName}
                      onChange={(event) =>
                        setForm({ ...form, customerName: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Customer phone">
                    <Input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(event) =>
                        setForm({ ...form, customerPhone: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Customer email">
                    <Input
                      type="email"
                      value={form.customerEmail}
                      onChange={(event) =>
                        setForm({ ...form, customerEmail: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Complete service address">
                    <Input
                      value={form.serviceAddress}
                      onChange={(event) =>
                        setForm({ ...form, serviceAddress: event.target.value })
                      }
                      placeholder="Street, city, state, ZIP"
                    />
                  </Field>
                </div>
              </div>
            </article>
            <article className="rounded-xl border bg-white p-5">
              <h2 className="font-bold">Equipment and pricing inputs</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Equipment type">
                  <Input
                    value={form.equipmentType}
                    onChange={(event) =>
                      setForm({ ...form, equipmentType: event.target.value })
                    }
                    placeholder="Lift chair, hospital bed, patient lift…"
                  />
                </Field>
                <Field label="Manufacturer">
                  <Input
                    value={form.manufacturer}
                    onChange={(event) =>
                      setForm({ ...form, manufacturer: event.target.value })
                    }
                  />
                </Field>
                <Field label="Model">
                  <Input
                    value={form.model}
                    onChange={(event) =>
                      setForm({ ...form, model: event.target.value })
                    }
                  />
                </Field>
                <Field label="Serial number">
                  <Input
                    value={form.serialNumber}
                    onChange={(event) =>
                      setForm({ ...form, serialNumber: event.target.value })
                    }
                  />
                </Field>
                <Field label="Round-trip miles">
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.roundTripMiles ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        roundTripMiles:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Drive hours">
                  <Input
                    type="number"
                    min={0}
                    step="0.25"
                    value={form.driveHours}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        driveHours: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="On-site hours">
                  <Input
                    type="number"
                    min={0}
                    step="0.25"
                    value={form.onsiteHours}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        onsiteHours: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Technicians required">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.technicianCount ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        technicianCount:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Weight (lb)">
                  <Input
                    type="number"
                    min={0}
                    value={form.weightLb}
                    onChange={(event) =>
                      setForm({ ...form, weightLb: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Parts count">
                  <Input
                    type="number"
                    min={0}
                    value={form.partsCount}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        partsCount: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Stair flights">
                  <Input
                    type="number"
                    min={0}
                    value={form.stairsCount}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        stairsCount: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Hotel cost">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.hotelCost}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        hotelCost: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Parts / direct cost">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.partsCost}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        partsCost: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                {form.serviceType.startsWith("biomed_pm") ? (
                  <Field label="Assets in PM batch">
                    <Input
                      type="number"
                      min={1}
                      value={form.assetCount}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          assetCount: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                ) : null}
                <Field label="Shipment / parts status">
                  <Select
                    value={form.shipmentStatus}
                    onValueChange={(value) =>
                      setForm({ ...form, shipmentStatus: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Not confirmed</SelectItem>
                      <SelectItem value="awaiting_product">
                        Awaiting product
                      </SelectItem>
                      <SelectItem value="awaiting_parts">
                        Awaiting parts
                      </SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="ready_to_schedule">
                        Ready to schedule
                      </SelectItem>
                      <SelectItem value="not_applicable">
                        Not applicable
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Site access, stairs, doorway, parking, dock, or other instructions">
                  <Textarea
                    className="min-h-24"
                    value={form.accessInstructions}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        accessInstructions: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  {form.noticeType === "cancellation" ||
                  intakeEvaluation.blockers.length ? (
                    <CircleAlert className="size-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  )}{" "}
                  {form.noticeType === "cancellation"
                    ? "Cancellation records are reviewed and closed; they are never dispatched as new work."
                    : intakeEvaluation.blockers.length
                      ? "This intake will stay out of pricing and dispatch until all critical prompts are cleared."
                      : preview.counteroffer
                        ? "Intake is complete; pricing will hold the job at the exact counteroffer shown above."
                        : "Intake and pricing are inside the account guardrails."}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => saveIntake.mutate()}
                    disabled={
                      saveIntake.isPending ||
                      (!form.externalId.trim() && !form.rawText.trim())
                    }
                  >
                    <Save />
                    {saveIntake.isPending
                      ? "Saving…"
                      : activeIntakeId
                        ? "Save intake updates"
                        : "Save intake and prompts"}
                  </Button>
                  {form.noticeType !== "cancellation" ? (
                    <Button
                      type="submit"
                      disabled={
                        create.isPending || !accountPolicy.data || accountPolicy.isFetching || accountPolicy.isError ||
                        !activeIntakeId ||
                        intakeHasUnsavedChanges ||
                        intakeEvaluation.blockers.length > 0
                      }
                    >
                      {create.isPending
                        ? "Processing…"
                        : intakeHasUnsavedChanges || !activeIntakeId
                          ? "Save verified intake first"
                          : "Process and create work order"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          </form>
          </fieldset>
          </details>
          {result ? (
            <article
              className={`rounded-xl border p-5 ${result.pricing.decision === "authorized" ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}
            >
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 size-5 text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-950">
                    {result.externalId} is now in the pipeline
                  </h2>
                  <p className="mt-1 text-sm text-slate-800">
                    Status: {result.status.replaceAll("_", " ")} · Required bid{" "}
                    {money(result.pricing.requiredBid)} · Technician allocation{" "}
                    {money(result.pricing.technicianPay)} · Floor{" "}
                    {(result.pricing.marginFloor * 100).toFixed(0)}%
                  </p>
                  {result.counterofferMessage ? (
                    <div className="mt-4 rounded-xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Client counteroffer draft
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(result.counterofferMessage || "")
                              .then(() => toast.success("Counteroffer copied"))
                          }
                        >
                          <Copy /> Copy
                        </Button>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {result.counterofferMessage}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
                      <UserRoundCheck className="size-4" /> Technician
                      instruction checklist generated
                    </p>
                    <ul className="mt-2 grid gap-2 md:grid-cols-2">
                      {result.instructions.map((instruction) => (
                        <li
                          key={instruction}
                          className="flex gap-2 text-sm text-slate-800"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                          {instruction}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </TabsContent>
      </Tabs>
      <Sheet
        open={Boolean(completionOrder)}
        onOpenChange={(open) => {
          if (!open) setCompletionOrder(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b px-6 pb-5 pt-6">
            <SheetTitle>Complete {completionOrder?.externalId}</SheetTitle>
            <SheetDescription>
              Every required checkpoint must be confirmed. Submission creates
              the service report and draft invoice.
            </SheetDescription>
          </SheetHeader>
          <form
            className="space-y-5 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              complete.mutate();
            }}
          >
            <WorkOrderFiles workOrderId={completionOrder?.id} />
            <label className="block space-y-1.5 text-sm font-semibold">
              Equipment disposition
              <Select
                value={report.assetDisposition}
                onValueChange={(value) =>
                  setReport({ ...report, assetDisposition: value })
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
                  ].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Technical findings
              <Textarea
                required
                minLength={10}
                className="min-h-28"
                value={report.findings}
                onChange={(event) =>
                  setReport({ ...report, findings: event.target.value })
                }
                placeholder="What was inspected, measured, reproduced, and diagnosed?"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Work performed and final test
              <Textarea
                required
                minLength={10}
                className="min-h-28"
                value={report.workPerformed}
                onChange={(event) =>
                  setReport({ ...report, workPerformed: event.target.value })
                }
                placeholder="What was repaired, adjusted, assembled, tested, and confirmed?"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Recommendations / parts needed
              <Textarea
                className="min-h-24"
                value={report.recommendation}
                onChange={(event) =>
                  setReport({ ...report, recommendation: event.target.value })
                }
              />
            </label>
            <div>
              <p className="text-sm font-bold">Required completion checklist</p>
              <div className="mt-3 space-y-2">
                {report.checklist.map((item, index) => (
                  <label
                    key={item.label}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={item.complete}
                      onChange={(event) =>
                        setReport({
                          ...report,
                          checklist: report.checklist.map(
                            (current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, complete: event.target.checked }
                                : current,
                          ),
                        })
                      }
                      className="mt-0.5 size-4 accent-blue-600"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block space-y-1.5 text-sm font-semibold">
              Customer acknowledgement name
              <Input
                required
                value={report.customerSignatureName}
                onChange={(event) =>
                  setReport({
                    ...report,
                    customerSignatureName: event.target.value,
                  })
                }
              />
            </label>
            <Button
              className="w-full"
              type="submit"
              disabled={
                complete.isPending ||
                report.checklist.some((item) => !item.complete)
              }
            >
              {complete.isPending
                ? "Submitting…"
                : "Submit report and generate invoice"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WorkOrderFiles({ workOrderId }: { workOrderId?: string }) {
  const files = useQuery({
    queryKey: ["attachments", workOrderId],
    enabled: Boolean(workOrderId),
    queryFn: () =>
      json<{
        attachments: {
          id: string;
          fileName: string;
          category: string;
          sizeBytes: number;
        }[];
      }>(`/api/attachments?entityType=work_order&entityId=${workOrderId}`),
  });
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-blue-600" />
        <div><p className="text-sm font-bold">Photos and work-order files</p><p className="mt-0.5 text-xs text-slate-500">Business documents are filed through Imports &amp; Sync. Required field evidence remains part of technician completion.</p></div>
      </div>
      <div className="mt-3 space-y-1">
        {files.data?.attachments.map((item) => (
          <a
            key={item.id}
            href={`/api/attachments?attachmentId=${item.id}`}
            className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs hover:text-blue-700"
          >
            <span className="truncate">{item.fileName}</span>
            <span className="ml-3 shrink-0 text-slate-400">
              {item.category.replaceAll("_", " ")} ·{" "}
              {(item.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </a>
        ))}
        {!files.data?.attachments.length ? (
          <p className="text-xs text-slate-500">
            No files uploaded yet. Capture required evidence before completion.
          </p>
        ) : null}
      </div>
    </div>
  );
}
