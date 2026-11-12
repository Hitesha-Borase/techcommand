"use client";

import { useState } from "react";
import { AssetScanner } from "@/components/asset-scanner";
import { AssetLabelManager } from "@/components/asset-label-manager";
import { AssetPlacementHistory } from "@/components/asset-placement-history";
import { AssetCategoryHistory } from "@/components/asset-category-history";
import type { ScannedAsset } from "@/lib/asset-scanning";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  CircleAlert,
  History,
  Plus,
  Search,
  ShieldCheck,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Asset = ScannedAsset;
type Account = { id: string; name: string };
type Location = { id: string; accountId: string; name: string; city: string };
type Visit = {
  id: string;
  workOrderId: string | null;
  visitType: string;
  visitedAt: string;
  findings: string;
  workPerformed: string;
  disposition: string;
  technicianName: string | null;
  workOrderNumber: string | null;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Asset record could not be saved.");
  return data;
}

export function BiomedicalAssets({
  onPlanAsset,
  role,
}: {
  onPlanAsset?: (assetId: string) => void;
  role: string;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [visitAsset, setVisitAsset] = useState<Asset | null>(null);
  const [visit, setVisit] = useState({
    visitType: "preventive_maintenance",
    visitedAt: new Date().toISOString().slice(0, 10),
    complaint: "",
    findings: "",
    workPerformed: "",
    parts: "",
    testResults: "",
    disposition: "passed",
    nextAction: "",
  });
  const [search, setSearch] = useState("");
  const [dateRange] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    thirtyDays: new Date(new Date().getTime() + 30 * 86400000)
      .toISOString()
      .slice(0, 10),
  }));
  const [form, setForm] = useState({
    accountId: "",
    locationId: "",
    assetTag: "",
    customerAssetId: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    description: "",
    riskClass: "medium",
    pmIntervalMonths: 12,
    lastPmOn: "",
    nextPmDueOn: "",
  });
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
  });
  const activeVisitAsset = assets.data?.assets.find((asset) => asset.id === visitAsset?.id) || visitAsset;
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/api/accounts"),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ locations: Location[] }>("/api/locations"),
  });
  const visits = useQuery({
    queryKey: ["asset-visits", activeVisitAsset?.id],
    enabled: Boolean(activeVisitAsset),
    queryFn: () =>
      api<{ visits: Visit[] }>(`/api/asset-visits?assetId=${activeVisitAsset?.id}`),
  });
  const create = useMutation({
    mutationFn: () =>
      api("/api/assets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lastPmOn: form.lastPmOn || null,
          nextPmDueOn: form.nextPmDueOn || null,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["assets"] }),
        client.invalidateQueries({ queryKey: ["accounts"] }),
      ]);
      setOpen(false);
      toast.success("Biomedical asset created", { description: form.assetTag });
    },
    onError: (error) => toast.error(error.message),
  });
  const addVisit = useMutation({
    mutationFn: () =>
      api("/api/asset-visits", {
        method: "POST",
        body: JSON.stringify({ ...visit, assetId: activeVisitAsset?.id }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["asset-visits", activeVisitAsset?.id],
      });
      setVisit({
        visitType: "preventive_maintenance",
        visitedAt: new Date().toISOString().slice(0, 10),
        complaint: "",
        findings: "",
        workPerformed: "",
        parts: "",
        testResults: "",
        disposition: "passed",
        nextAction: "",
      });
      toast.success("Permanent asset visit recorded");
    },
    onError: (error) => toast.error(error.message),
  });
  const filtered = (assets.data?.assets ?? []).filter((asset) =>
    Object.values(asset).join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const { today, thirtyDays } = dateRange;
  const overdue = filtered.filter(
    (asset) => asset.nextPmDueOn && asset.nextPmDueOn < today,
  ).length;
  const dueSoon = filtered.filter(
    (asset) =>
      asset.nextPmDueOn &&
      asset.nextPmDueOn >= today &&
      asset.nextPmDueOn <= thirtyDays,
  ).length;
  const highRisk = filtered.filter((asset) =>
    ["high", "critical"].includes(asset.riskClass),
  ).length;
  const validLocations = (locations.data?.locations ?? []).filter(
    (location) => location.accountId === form.accountId,
  );
  const canManageAssets = [
    "owner_administrator",
    "operations_administrator",
    "biomedical_lead",
  ].includes(role);
  return (
    <div className="space-y-5">
      <AssetScanner onViewAsset={setVisitAsset} onPlanAsset={onPlanAsset} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Live assets</p>
          <p className="mt-2 text-3xl font-bold">{filtered.length}</p>
          <p className="mt-2 text-xs text-slate-500">
            Facility and department ownership
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">High / critical risk</p>
          <p className="mt-2 text-3xl font-bold">{highRisk}</p>
          <p className="mt-2 text-xs text-slate-500">
            Priority equipment population
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">PM due in 30 days</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{dueSoon}</p>
          <p className="mt-2 text-xs text-slate-500">
            Upcoming scheduling requirement
          </p>
        </article>
        <article className="rounded-xl border bg-[#102748] p-4 text-white">
          <p className="text-sm text-blue-200">PM overdue</p>
          <p className="mt-2 text-3xl font-bold">{overdue}</p>
          <p className="mt-2 text-xs text-blue-100/70">
            Auto-fed into the morning queue
          </p>
        </article>
      </section>
      <article className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold">Biomedical / HTM asset registry</h2>
            <p className="mt-1 text-sm text-slate-500">
              {role === "technician"
                ? "Equipment linked to your assigned work orders."
                : "Account → facility → department → asset → PM and service history."}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center rounded-lg border bg-slate-50 px-3">
              <Search className="size-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-40 bg-transparent px-2 text-sm outline-none"
                placeholder="Tag, serial, model…"
              />
            </div>
            {canManageAssets ? <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus /> Add asset
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader className="border-b px-6 pb-5 pt-6">
                  <SheetTitle>Add biomedical asset</SheetTitle>
                  <SheetDescription>
                    Create the permanent equipment identity used for PM,
                    repairs, compliance, and service history.
                  </SheetDescription>
                </SheetHeader>
                <form
                  className="space-y-4 p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate();
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">
                      Account
                      <Select
                        value={form.accountId}
                        onValueChange={(value) =>
                          setForm({ ...form, accountId: value, locationId: "" })
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
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Facility
                      <Select
                        value={form.locationId}
                        onValueChange={(value) =>
                          setForm({ ...form, locationId: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {validLocations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name} · {location.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">
                      TechFlex asset tag
                      <Input
                        required
                        value={form.assetTag}
                        onChange={(event) =>
                          setForm({ ...form, assetTag: event.target.value })
                        }
                        placeholder="TF-2900"
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Facility asset ID
                      <Input
                        value={form.customerAssetId}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            customerAssetId: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-1.5 text-sm font-semibold">
                      Manufacturer
                      <Input
                        required
                        value={form.manufacturer}
                        onChange={(event) =>
                          setForm({ ...form, manufacturer: event.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Model
                      <Input
                        required
                        value={form.model}
                        onChange={(event) =>
                          setForm({ ...form, model: event.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Serial number
                      <Input
                        value={form.serialNumber}
                        onChange={(event) =>
                          setForm({ ...form, serialNumber: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="space-y-1.5 text-sm font-semibold">
                    Equipment description
                    <Input
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      placeholder="Patient lift, monitor, scale, exam table…"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">
                      Risk class
                      <Select
                        value={form.riskClass}
                        onValueChange={(value) =>
                          setForm({ ...form, riskClass: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      PM interval months
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={form.pmIntervalMonths}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            pmIntervalMonths: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">
                      Last PM date
                      <Input
                        type="date"
                        value={form.lastPmOn}
                        onChange={(event) =>
                          setForm({ ...form, lastPmOn: event.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Next PM due
                      <Input
                        type="date"
                        value={form.nextPmDueOn}
                        onChange={(event) =>
                          setForm({ ...form, nextPmDueOn: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={
                      create.isPending || !form.accountId || !form.locationId
                    }
                  >
                    {create.isPending ? "Creating…" : "Create asset record"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet> : null}
          </div>
        </div>
        {assets.isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading asset registry…
          </div>
        ) : null}
        {!assets.isLoading && !filtered.length ? (
          <div className="p-12 text-center">
            <Activity className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 font-bold">No live assets yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {canManageAssets
                ? "Add one manually or import the existing facility inventory."
                : "No assets are available for your assigned work."}
            </p>
          </div>
        ) : null}
        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">ASSET</TableHead>
                <TableHead>EQUIPMENT IDENTITY</TableHead>
                <TableHead>FACILITY</TableHead>
                <TableHead>RISK</TableHead>
                <TableHead>PM STATUS</TableHead>
                {onPlanAsset ? <TableHead>SERVICE</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((asset) => {
                const pmTone = !asset.nextPmDueOn
                  ? "text-slate-500"
                  : asset.nextPmDueOn < today
                    ? "text-red-700"
                    : asset.nextPmDueOn <= thirtyDays
                      ? "text-amber-700"
                      : "text-emerald-700";
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="pl-5">
                      <button
                        type="button"
                        onClick={() => setVisitAsset(asset)}
                        className="font-mono text-xs font-bold text-blue-700 hover:underline"
                      >
                        {asset.assetTag}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">
                        {asset.customerAssetId || "No facility ID"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-bold">
                        {asset.manufacturer} {asset.model}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        S/N {asset.serialNumber || "Not recorded"} ·{" "}
                        {asset.description || "Equipment"}
                      </p>
                      {asset.pmDraftJson ? <details className="mt-2 text-sm" onClick={e=>e.stopPropagation()}><summary className="cursor-pointer font-medium text-teal-800">Shared PM draft · revision {asset.pmDraftVersion}</summary><p className="mt-2 text-slate-500">Draft only; verified registry status and dates are unchanged.</p><dl className="mt-2 space-y-2">{Object.entries(JSON.parse(asset.pmDraftJson) as Record<string,string>).filter(([,v])=>v).map(([k,v])=><div key={k}><dt className="font-semibold">{k.replace(/([A-Z])/g,' $1')}</dt><dd className="whitespace-pre-wrap text-slate-600">{v}</dd></div>)}</dl></details>:null}
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">
                        {asset.accountName} · {asset.locationName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {asset.departmentName || "Department not assigned"} ·{" "}
                        {asset.city}, {asset.state}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        <ShieldCheck />
                        {asset.riskClass}
                      </Badge>
                    </TableCell>
                    <TableCell className={pmTone}>
                      <p className="flex items-center gap-1.5 font-bold">
                        {asset.nextPmDueOn && asset.nextPmDueOn < today ? (
                          <CircleAlert className="size-4" />
                        ) : (
                          <CalendarClock className="size-4" />
                        )}
                        {asset.nextPmDueOn || "Not scheduled"}
                      </p>
                      <p className="mt-1 text-xs">
                        Every {asset.pmIntervalMonths || "—"} months
                      </p>
                    </TableCell>
                    {onPlanAsset ? <TableCell><Button type="button" variant="outline" onClick={() => onPlanAsset(asset.id)}>Plan service</Button></TableCell> : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </article>
      <Sheet
        open={Boolean(visitAsset)}
        onOpenChange={(value) => {
          if (!value) setVisitAsset(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b px-6 pb-5 pt-6">
            <SheetTitle className="flex items-center gap-2">
              <History className="size-5 text-blue-600" />
              Asset lifetime record · {activeVisitAsset?.assetTag}
            </SheetTitle>
            <SheetDescription>
              {activeVisitAsset?.manufacturer} {activeVisitAsset?.model} · S/N{" "}
              {activeVisitAsset?.serialNumber || "not recorded"}. Every visit remains
              attached to this equipment identity.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 p-6">
            {canManageAssets && activeVisitAsset && <AssetLabelManager key={activeVisitAsset.id} asset={activeVisitAsset} onChanged={() => toast.success("Asset labels updated")} />}
            {activeVisitAsset ? <AssetPlacementHistory asset={activeVisitAsset} canManage={canManageAssets} /> : null}
            {activeVisitAsset ? <AssetCategoryHistory asset={activeVisitAsset} canManage={canManageAssets} /> : null}
            <div>
              <h3 className="font-bold">Visit timeline</h3>
              <div className="mt-3 space-y-3">
                {visits.data?.visits.length ? (
                  visits.data.visits.map((item) => (
                    <article key={item.id} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold capitalize">
                          {item.visitType.replaceAll("_", " ")}
                        </p>
                        <Badge variant="outline" className="capitalize">
                          {item.disposition.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.visitedAt} · {item.technicianName || "TechFlex"}
                        {item.workOrderNumber
                          ? ` · WO ${item.workOrderNumber}`
                          : ""}
                      </p>
                      <p className="mt-3 text-sm">
                        <strong>Findings:</strong> {item.findings}
                      </p>
                      <p className="mt-2 text-sm">
                        <strong>Work:</strong> {item.workPerformed}
                      </p>
                      {item.visitType === "preventive_maintenance" && item.workOrderId && activeVisitAsset ? (
                        <Button asChild type="button" variant="outline" size="sm" className="mt-3">
                          <a href={`/api/pm-event-sticker?workOrderId=${encodeURIComponent(item.workOrderId)}&assetId=${encodeURIComponent(activeVisitAsset.id)}`}><FileDown /> Reviewed PM event sticker</a>
                        </Button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    No historical visits recorded yet.
                  </p>
                )}
              </div>
            </div>
            {canManageAssets ? <form
              className="space-y-4 border-t pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                addVisit.mutate();
              }}
            >
              <div>
                <h3 className="font-bold">Add verified historical service</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Use this only to transcribe service completed before TechCommand.
                  Current work-order visits are added after report review and approval.
                  This entry does not update PM dates or mark a current inspection complete.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold">
                  Visit type
                  <Select
                    value={visit.visitType}
                    onValueChange={(value) =>
                      setVisit({ ...visit, visitType: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "diagnostic",
                        "repair",
                        "preventive_maintenance",
                        "installation",
                        "inspection",
                        "follow_up",
                      ].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  Visit date
                  <Input
                    type="date"
                    value={visit.visitedAt}
                    onChange={(event) =>
                      setVisit({ ...visit, visitedAt: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-semibold">
                Complaint / reason
                <Textarea
                  value={visit.complaint}
                  onChange={(event) =>
                    setVisit({ ...visit, complaint: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">
                Technical findings
                <Textarea
                  required
                  minLength={5}
                  value={visit.findings}
                  onChange={(event) =>
                    setVisit({ ...visit, findings: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">
                Work performed
                <Textarea
                  required
                  minLength={5}
                  value={visit.workPerformed}
                  onChange={(event) =>
                    setVisit({ ...visit, workPerformed: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold">
                  Parts / materials
                  <Input
                    value={visit.parts}
                    onChange={(event) =>
                      setVisit({ ...visit, parts: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  Measured test results
                  <Input
                    value={visit.testResults}
                    onChange={(event) =>
                      setVisit({ ...visit, testResults: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-semibold">
                Disposition
                <Select
                  value={visit.disposition}
                  onValueChange={(value) =>
                    setVisit({ ...visit, disposition: value })
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
                Next action
                <Textarea
                  value={visit.nextAction}
                  onChange={(event) =>
                    setVisit({ ...visit, nextAction: event.target.value })
                  }
                />
              </label>
              <Button className="w-full" disabled={addVisit.isPending}>
                {addVisit.isPending
                  ? "Recording…"
                  : "Save historical service record"}
              </Button>
            </form> : (
              <p className="border-t pt-5 text-sm text-slate-500">
                This timeline is read-only. Current work is recorded through the assigned
                technician report and approval workflow.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
