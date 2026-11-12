"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, FlaskConical, Rocket, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

const defaultRules = {
  repair: { base: 165 },
  delivery: { base: 145 },
  installation: { base: 185 },
  biomedical_pm: { base: 175 },
};
type Account = { id: string; name: string };
type Launch = {
  id: string;
  accountId: string;
  accountName: string;
  version: number;
  status: string;
  contractAttachmentId: string | null;
  updatedAt: string;
  configuration: { permittedServices: string[] };
};

type Simulation = {
  permitted: boolean;
  decision: "authorized" | "hold_for_counteroffer" | "out_of_scope";
  offeredAmount: number;
  requiredBid: number;
  contractPrice: number;
  modeledDirectCosts: number;
  projectedMarginPercent: number;
  targetMarginPercent: number;
  requiredTechnicianCount: number;
  billableMiles: number;
  warnings: string[];
};

export function PartnerLaunchStudio({ accounts }: { accounts: Account[] }) {
  const client = useQueryClient();
  const [contract, setContract] = useState<File | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [scenario, setScenario] = useState({ launchId: "", serviceType: "repair", offeredAmount: 300, roundTripMiles: 80, driveHours: 2, onsiteHours: 1, technicianCount: 1, weightLb: 0, partsCount: 1, stairsCount: 0, hotelCost: 0, partsCost: 0, assetCount: 0 });
  const [form, setForm] = useState({
    accountId: "",
    services: "repair, delivery, installation",
    territories: "Approved service regions and assigned locations",
    sla: "Response and scheduling deadlines follow the signed agreement",
    documentation:
      "Work-order number, required unit photos, serial/model, diagnostics, technician narrative, and signature",
    communications:
      "Portal messages and status notifications to approved partner contacts",
    integrationMethod: "portal",
    targetMargin: 40,
    mileageRate: 0.77,
    techCost: 25,
  });
  const query = useQuery({
    queryKey: ["partner-launches"],
    queryFn: async () => {
      const response = await portalFetch("/api/partner-launches");
      const data = await portalJson<{
        launches?: Launch[];
      }>(response, "Partner launches could not be loaded.");
      return data.launches || [];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!form.accountId) throw new Error("Select the partner account.");
      let contractAttachmentId: string | null = null;
      if (contract) {
        const body = new FormData();
        body.set("entityType", "account");
        body.set("entityId", form.accountId);
        body.set("category", "partner_contract");
        body.set("file", contract);
        const uploaded = await portalFetch("/api/attachments", {
          method: "POST",
          body,
        });
        const uploadedData = await portalJson<{
          attachment?: { id: string };
        }>(uploaded, "Contract upload failed.");
        if (!uploadedData.attachment)
          throw new Error("The contract upload did not return a save confirmation. Keep the file selected and check the account before retrying.");
        contractAttachmentId = uploadedData.attachment.id;
      }
      const configuration = {
        dataClassification: "non_phi_work_order_only",
        permittedServices: form.services
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        territories: form.territories,
        sla: form.sla,
        documentation: form.documentation,
        communications: form.communications,
        integrationMethod: form.integrationMethod,
        pricing: {
          targetGrossMarginPercent: form.targetMargin,
          mileageRate: form.mileageRate,
          consumerMileageRate: 0.67,
          consumerFreeMiles: 10,
          fuelPerDriveHour: 10,
          technicianHourlyCost: form.techCost,
          operatingAllowancePerHour: 10,
          additionalTechnicianFee: 65,
          stairsFee: 100,
          serviceRules: defaultRules,
        },
      };
      const response = await portalFetch("/api/partner-launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          contractAttachmentId,
          configuration,
        }),
      });
      await portalJson<{ launch?: { id: string } }>(response, "Draft could not be saved.");
    },
    onSuccess: () => {
      toast.success("Partner launch draft saved");
      setContract(null);
      client.invalidateQueries({ queryKey: ["partner-launches"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "submit" | "activate";
    }) => {
      const response = await portalFetch("/api/partner-launches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await portalJson<Record<string, unknown>>(response, "Launch status could not be changed.");
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["partner-launches"] });
      toast.success("Partner launch status updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const simulate = useMutation({
    mutationFn: async () => {
      if (!scenario.launchId) throw new Error("Select a contract version to test.");
      const response = await portalFetch("/api/partner-launches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "simulate", id: scenario.launchId, scenario: { ...scenario, launchId: undefined } }) });
      const data = await portalJson<{ simulation?: Simulation }>(response, "The scenario could not be tested.");
      if (!data.simulation) throw new Error("The scenario result could not be confirmed. Keep the draft open and try again.");
      return data.simulation;
    },
    onSuccess: (result) => setSimulation(result),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-cyan-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Rocket className="size-5 text-cyan-700" />
            <h3 className="font-bold">Partner Launch Studio</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Turn a signed agreement into a versioned operating configuration.
            Drafts never change live pricing or access until the Owner
            Administrator activates them.
          </p>
        </div>
        <Badge className="bg-cyan-700">Non-PHI</Badge>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Partner account</Label>
            <Select
              value={form.accountId}
              onValueChange={(accountId) => setForm({ ...form, accountId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Connection method</Label>
            <Select
              value={form.integrationMethod}
              onValueChange={(integrationMethod) =>
                setForm({ ...form, integrationMethod })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portal">Partner portal</SelectItem>
                <SelectItem value="api">Account-scoped API</SelectItem>
                <SelectItem value="manual_import">Controlled import</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Permitted services (comma separated)</Label>
            <Input
              value={form.services}
              onChange={(e) => setForm({ ...form, services: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Territories and locations</Label>
            <Textarea
              value={form.territories}
              onChange={(e) =>
                setForm({ ...form, territories: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>SLA and scheduling</Label>
            <Textarea
              value={form.sla}
              onChange={(e) => setForm({ ...form, sla: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Required documentation</Label>
            <Textarea
              value={form.documentation}
              onChange={(e) =>
                setForm({ ...form, documentation: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Communications</Label>
            <Textarea
              value={form.communications}
              onChange={(e) =>
                setForm({ ...form, communications: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Minimum gross margin %</Label>
            <Input
              type="number"
              min={40}
              max={90}
              value={form.targetMargin}
              onChange={(e) =>
                setForm({ ...form, targetMargin: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Technician cost / hour</Label>
            <Input
              type="number"
              min={0}
              value={form.techCost}
              onChange={(e) =>
                setForm({ ...form, techCost: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Mileage rate</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.mileageRate}
              onChange={(e) =>
                setForm({ ...form, mileageRate: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Signed contract (PDF/image)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setContract(e.target.files?.[0] || null)}
            />
          </div>
          <Button
            className="sm:col-span-2"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <FileUp />
            {create.isPending ? "Saving…" : "Save versioned draft"}
          </Button>
        </div>
        <div>
          <h4 className="font-bold">Review and activation queue</h4>
          <div className="mt-3 space-y-3">
            {query.data?.map((item) => (
              <article key={item.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.accountName}</p>
                    <p className="text-xs text-slate-500">
                      Version {item.version} ·{" "}
                      {new Date(item.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {item.status}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  {item.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        transition.mutate({ id: item.id, action: "submit" })
                      }
                    >
                      <CheckCircle2 />
                      Submit for owner review
                    </Button>
                  )}
                  {item.status === "review" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        transition.mutate({ id: item.id, action: "activate" })
                      }
                    >
                      <ShieldCheck />
                      Owner activate
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!query.isLoading && !query.data?.length && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No partner launch drafts yet.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FlaskConical className="size-5 text-violet-700" /><h4 className="font-bold">Partner Integration Simulator</h4></div><p className="mt-1 text-sm text-slate-600">Test a contract version without changing live pricing, access, or work orders.</p></div><Badge variant="outline" className="border-violet-200 bg-white text-violet-700">Safe sandbox</Badge></div>
        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2 md:col-span-2"><Label>Contract version</Label><Select value={scenario.launchId} onValueChange={(launchId) => { const launch = query.data?.find((item) => item.id === launchId); setScenario({ ...scenario, launchId, serviceType: launch?.configuration.permittedServices[0] || scenario.serviceType }); setSimulation(null); }}><SelectTrigger><SelectValue placeholder="Select saved version" /></SelectTrigger><SelectContent>{query.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.accountName} · v{item.version} · {item.status}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2 md:col-span-1"><Label>Service key</Label><Input value={scenario.serviceType} onChange={(e) => setScenario({ ...scenario, serviceType: e.target.value })} /></div>
          <div className="space-y-2"><Label>Partner offer</Label><Input type="number" min={0} value={scenario.offeredAmount} onChange={(e) => setScenario({ ...scenario, offeredAmount: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Round-trip miles</Label><Input type="number" min={0} value={scenario.roundTripMiles} onChange={(e) => setScenario({ ...scenario, roundTripMiles: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Drive hours</Label><Input type="number" min={0} step="0.25" value={scenario.driveHours} onChange={(e) => setScenario({ ...scenario, driveHours: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>On-site hours</Label><Input type="number" min={0.5} step="0.25" value={scenario.onsiteHours} onChange={(e) => setScenario({ ...scenario, onsiteHours: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Requested crew</Label><Input type="number" min={1} max={10} value={scenario.technicianCount} onChange={(e) => setScenario({ ...scenario, technicianCount: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Equipment weight</Label><Input type="number" min={0} value={scenario.weightLb} onChange={(e) => setScenario({ ...scenario, weightLb: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Parts cost</Label><Input type="number" min={0} value={scenario.partsCost} onChange={(e) => setScenario({ ...scenario, partsCost: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Hotel cost</Label><Input type="number" min={0} value={scenario.hotelCost} onChange={(e) => setScenario({ ...scenario, hotelCost: Number(e.target.value) })} /></div>
          <Button className="self-end bg-violet-700 hover:bg-violet-800" onClick={() => simulate.mutate()} disabled={simulate.isPending}><FlaskConical />{simulate.isPending ? "Testing…" : "Run simulation"}</Button>
        </div>
        {simulation ? <div className={`mt-5 rounded-xl border p-4 ${simulation.decision === "authorized" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Simulated decision</p><p className="mt-1 text-lg font-black capitalize">{simulation.decision.replaceAll("_", " ")}</p></div><div className="text-right"><p className="text-xs text-slate-500">Protected minimum</p><p className="text-2xl font-black">${simulation.requiredBid.toFixed(2)}</p></div></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Offer</p><p className="font-bold">${simulation.offeredAmount.toFixed(2)}</p></div><div><p className="text-slate-500">Direct costs</p><p className="font-bold">${simulation.modeledDirectCosts.toFixed(2)}</p></div><div><p className="text-slate-500">Projected margin</p><p className="font-bold">{simulation.projectedMarginPercent.toFixed(1)}%</p></div><div><p className="text-slate-500">Required crew</p><p className="font-bold">{simulation.requiredTechnicianCount}</p></div></div>{simulation.warnings.length ? <div className="mt-4 space-y-1 border-t border-black/10 pt-3">{simulation.warnings.map((warning) => <p key={warning} className="flex gap-2 text-sm text-amber-900"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{warning}</p>)}</div> : null}</div> : null}
      </div>
    </section>
  );
}
