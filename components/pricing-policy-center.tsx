"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { RateSheetImport } from "@/components/rate-sheet-import";
import { applyRateProposals } from "@/lib/rate-sheet";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultServiceRules } from "@/lib/techflex-pricing";

type Policy = {
  accountId: string;
  recordVersion: number;
  policyStatus?: string | null;
  accountName: string;
  targetGrossMarginBps: number;
  mileageRateCents: number;
  consumerMileageRateCents: number;
  consumerFreeMiles: number;
  fuelPerDriveHourCents: number;
  technicianHourlyCostCents: number;
  operatingAllowancePerHourCents: number;
  additionalTechnicianFeeCents: number;
  stairsFeeCents: number;
  serviceRules: Record<string, Record<string, number>>;
  updatedAt?: string | null;
};
type Form = {
  expectedVersion: number;
  sourceDocumentId?: string;
  targetGrossMarginPercent: number;
  mileageRate: number;
  consumerMileageRate: number;
  consumerFreeMiles: number;
  fuelPerDriveHour: number;
  technicianHourlyCost: number;
  operatingAllowancePerHour: number;
  additionalTechnicianFee: number;
  stairsFee: number;
  serviceRules: Record<string, Record<string, number>>;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return portalJson<T>(response, "Pricing policy could not be saved.");
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}
function toForm(policy: Policy): Form {
  return {
    expectedVersion: policy.recordVersion,
    targetGrossMarginPercent: policy.targetGrossMarginBps / 100,
    mileageRate: policy.mileageRateCents / 100,
    consumerMileageRate: policy.consumerMileageRateCents / 100,
    consumerFreeMiles: policy.consumerFreeMiles ?? 10,
    fuelPerDriveHour: policy.fuelPerDriveHourCents / 100,
    technicianHourlyCost: policy.technicianHourlyCostCents / 100,
    operatingAllowancePerHour: policy.operatingAllowancePerHourCents / 100,
    additionalTechnicianFee: policy.additionalTechnicianFeeCents / 100,
    stairsFee: policy.stairsFeeCents / 100,
    serviceRules: policy.serviceRules || defaultServiceRules,
  };
}

const ruleFields = [
  ["evaluation", "Diagnostic / evaluation", "base", "Base"],
  ["repair_single", "Single-part repair", "base", "Base"],
  ["repair_multi", "Multi-part repair", "base", "Base"],
  ["repair_multi", "Multi-part repair", "extraPart", "Each extra part"],
  ["frame_repair", "Frame repair", "base", "Base"],
  ["hourly_service", "Hourly service", "hourly", "Per hour"],
  ["biomed_service_call", "Biomedical service call", "hourly", "Per hour"],
  ["consumer_install", "Consumer install", "base", "Base"],
  ["wgd_basic", "WGD basic ≤225 lb", "perLbAtOrBelow225", "Per lb"],
  ["wgd_basic", "WGD basic >225 lb", "perLbAbove225", "Per lb"],
  ["wgd_complex", "WGD complex ≤225 lb", "perLbAtOrBelow225", "Per lb"],
  ["wgd_complex", "WGD complex >225 lb", "perLbAbove225", "Per lb"],
  ["bed_delivery", "Bed delivery", "minimum", "Minimum"],
  ["bed_delivery", "Bed delivery ≤225 lb", "perLbAtOrBelow225", "Per lb"],
  ["bed_delivery", "Bed delivery >225 lb", "perLbAbove225", "Per lb"],
  ["biomed_pm_a", "Biomedical PM Tier A", "perAsset", "Per asset"],
  ["biomed_pm_b", "Biomedical PM Tier B", "perAsset", "Per asset"],
  ["biomed_pm_c", "Biomedical PM Tier C", "perAsset", "Per asset"],
  ["biomed_pm_d", "Biomedical PM Tier D", "perAsset", "Per asset"],
  ["biomed_pm_a", "Tier A facility minimum", "facilityMinimum", "Minimum"],
  ["biomed_pm_b", "Tier B facility minimum", "facilityMinimum", "Minimum"],
  ["biomed_pm_c", "Tier C facility minimum", "facilityMinimum", "Minimum"],
  ["biomed_pm_d", "Tier D facility minimum", "facilityMinimum", "Minimum"],
] as const;

export function PricingPolicyCenter({canEdit = false}: {canEdit?: boolean}) {
  const client = useQueryClient();
  const policies = useQuery({
    queryKey: ["pricing-policies"],
    queryFn: () => json<{ policies: Policy[] }>("/api/pricing-policies"),
  });
  const [accountId, setAccountId] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const selected =
    policies.data?.policies.find((item) => item.accountId === accountId) ||
    policies.data?.policies[0];
  const [drafts, setDrafts] = useState<Record<string, Form>>({});
  const form = selected ? drafts[selected.accountId] || toForm(selected) : null;
  const save = useMutation({
    mutationFn: async () => {
      const savedAccountId = selected!.accountId;
      await json("/api/pricing-policies", { method: "PUT", body: JSON.stringify({ accountId: savedAccountId, ...form }) });
      return savedAccountId;
    },
    onSuccess: async (savedAccountId) => {
      setDrafts(current => { const next = {...current}; delete next[savedAccountId]; return next; });
      await Promise.all([client.invalidateQueries({ queryKey: ["pricing-policies"] }), client.invalidateQueries({ queryKey: ["bid-account-pricing"] })]);
      toast.success("Account pricing rules saved");
    },
    onError: (error) => toast.error(error.message),
  });
  if (policies.isError) return <p role="alert" className="text-sm text-red-700">{policies.error.message} <Button variant="outline" onClick={() => policies.refetch()}>Retry</Button></p>;
  if (!policies.isLoading && !form) return <p className="text-sm">Add an active paying account before setting rates.</p>;
  if (policies.isLoading || !form)
    return (
      <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
        Loading account pricing controls…
      </div>
    );
  const setForm = (next: Form) =>
    setDrafts((current) => ({
      ...current,
      [selected!.accountId]: next,
    }));
  const set = (key: keyof Omit<Form, "serviceRules">, value: string) =>
    setForm({ ...form, [key]: Number(value) });
  const setRule = (service: string, key: string, value: string) =>
    setForm({
      ...form,
      serviceRules: {
        ...form.serviceRules,
        [service]: {
          ...(form.serviceRules[service] || {}),
          [key]: Number(value),
        },
      },
    });
  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-6 text-emerald-700" />
            <div>
              <h2 className="font-bold text-emerald-950">
                40% is an authorization floor
              </h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
                The system calculates the greater of the account contract rate
                or direct costs divided by one minus the target margin. If
                reimbursement is lower, the job is held for a counteroffer and
                no technician payout is authorized.
              </p>
            </div>
          </div>
        </article>
        <article className="rounded-xl border bg-[#102748] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-200">
            Pricing equation
          </p>
          <p className="mt-3 font-mono text-sm">
            minimum = max(contract rule, direct costs ÷ (1 − margin))
          </p>
          <p className="mt-3 text-xs text-blue-100">
            At 40%, every $60 in direct cost requires at least $100 in revenue.
          </p>
        </article>
      </section>
      <article className="rounded-xl border bg-white p-5">{!canEdit ? <p className="mb-4 text-sm text-slate-600">Only an owner or finance administrator can approve partner rates.</p> : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field label="Account">
            <Select
              value={selected?.accountId || ""}
              onValueChange={setAccountId}
              disabled={save.isPending || rateBusy}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {policies.data?.policies.map((policy) => (
                  <SelectItem key={policy.accountId} value={policy.accountId}>
                    {policy.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-4" />
            {selected?.policyStatus === "active" ? "Saved account rules" : "Default or inactive rules — review before use"}
          </div>
        </div>
        <fieldset disabled={save.isPending || !canEdit}>
        {canEdit ? <RateSheetImport key={selected!.accountId} accountId={selected!.accountId} accountName={selected!.accountName} disabled={save.isPending} onBusy={setRateBusy} onApply={(rates, sourceDocumentId) => {
          setForm({ ...applyRateProposals(form, rates), sourceDocumentId });
        }} /> : null}
        {save.error ? <p role="alert" className="mt-4 text-sm text-red-700">{save.error.message} Your draft is still shown. <Button type="button" variant="outline" size="sm" onClick={() => policies.refetch()}>Refresh saved version</Button></p> : null}
        {form.expectedVersion !== selected?.recordVersion ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Saved rates changed. Your draft is kept for comparison. <Button type="button" variant="outline" size="sm" onClick={() => { setDrafts(current => {const next={...current}; delete next[selected!.accountId]; return next;}); save.reset(); }}>Discard draft and load saved rates</Button><details className="mt-2"><summary>Compare current saved rates</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(toForm(selected!), null, 2)}</pre></details></div> : null}
        <fieldset disabled={save.isPending || rateBusy} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Target gross margin (%)">
            <Input
              type="number"
              min={40}
              max={90}
              step="0.1"
              value={form.targetGrossMarginPercent}
              onChange={(e) => set("targetGrossMarginPercent", e.target.value)}
            />
          </Field>
          <Field label="Manufacturer mileage / mile">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.mileageRate}
              onChange={(e) => set("mileageRate", e.target.value)}
            />
          </Field>
          <Field label="Consumer mileage / mile">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.consumerMileageRate}
              onChange={(e) => set("consumerMileageRate", e.target.value)}
            />
          </Field>
          <Field label="Consumer free miles">
            <Input
              type="number"
              min={0}
              step="1"
              value={form.consumerFreeMiles}
              onChange={(e) => set("consumerFreeMiles", e.target.value)}
            />
          </Field>
          <Field label="Fuel / drive hour">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.fuelPerDriveHour}
              onChange={(e) => set("fuelPerDriveHour", e.target.value)}
            />
          </Field>
          <Field label="Technician cost / hour">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.technicianHourlyCost}
              onChange={(e) => set("technicianHourlyCost", e.target.value)}
            />
          </Field>
          <Field label="Operating allowance / hour">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.operatingAllowancePerHour}
              onChange={(e) => set("operatingAllowancePerHour", e.target.value)}
            />
          </Field>
          <Field label="Additional technician fee">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.additionalTechnicianFee}
              onChange={(e) => set("additionalTechnicianFee", e.target.value)}
            />
          </Field>
          <Field label="Stairs fee">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.stairsFee}
              onChange={(e) => set("stairsFee", e.target.value)}
            />
          </Field>
        </fieldset>
        <div className="mt-7">
          <h3 className="font-bold">Editable job-type base rates</h3>
          <p className="mt-1 text-sm text-slate-500">
            These become the contract calculation for this account before the
            margin floor is applied.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ruleFields.map(([service, label, key, unit]) => (
              <label
                key={`${service}-${key}`}
                className="grid grid-cols-[1fr_110px] items-center gap-3 rounded-lg border bg-slate-50 p-3"
              >
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="text-xs text-slate-500">{unit}</span>
                </span>
                <Input
                  className="bg-white"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.serviceRules[service]?.[key] ?? 0}
                  onChange={(event) =>
                    setRule(service, key, event.target.value)
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t pt-5">
          <p className="text-xs text-slate-500">
            A target below 40% is rejected by both the interface and the server.
          </p>
          <Button
            disabled={save.isPending || rateBusy || form.targetGrossMarginPercent < 40 || form.expectedVersion !== selected?.recordVersion}
            onClick={() => save.mutate()}
          >
            <Calculator />
            {save.isPending ? "Saving…" : "Save account rules"}
          </Button>
        </div>
      </fieldset></article>
    </div>
  );
}
