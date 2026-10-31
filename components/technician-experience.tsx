"use client";
import { TechnicianDisciplines } from "@/components/technician-disciplines";

import { portalFetch, portalJson } from "@/lib/portal-fetch";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, GraduationCap, MapPin, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
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
import { TechnicianFiles } from "@/components/technician-files";
import { Switch } from "@/components/ui/switch";

type PaySummary = {
  technicianId: string;
  technicianCode: string;
  technicianName: string;
  jobCount: number;
  pendingCents: number;
  paidCents: number;
};
type PayEntry = {
  id: string;
  status: string;
  payoutCents: number;
  grossRevenueCents: number;
  workOrderNumber: string;
  summary: string;
  accountName: string;
  createdAt: string;
};
type TechnicianRecord = {
  serviceDisciplinesJson: string | null;
  recordVersion: number;
  id: string;
  name: string;
  email: string;
  technicianCode: string;
  employmentType: string;
  payoutType: string;
  homePostalCode: string;
  dispatchAddress1: string | null;
  dispatchAddress2: string | null;
  dispatchCity: string | null;
  dispatchState: string | null;
  dispatchPostalCode: string | null;
  calendarStatus: string | null;
  maxRadiusMiles: number;
  payoutRate: number;
  currentHourlyRateCents: number;
  credentialCount: number;
  trainingMode: boolean;
  proficiencyLevel: "trainee" | "guided" | "independent";
  guidedJobsCompleted: number;
  qaPassStreak: number;
  competencyScore: number;
};

async function getPay() {
  const response = await portalFetch("/api/pay");
  const data = await portalJson<{
    summary: PaySummary[];
    entries: PayEntry[];
    error?: string;
  }>(response, "Pay data is unavailable.");
  return data;
}

export function TechnicianAdmin() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    technicianCode: "",
    employmentType: "employee",
    homePostalCode: "",
    dispatchAddress1: "",
    dispatchAddress2: "",
    dispatchCity: "",
    dispatchState: "",
    dispatchPostalCode: "",
    maxRadiusMiles: 200,
    payoutRate: 0.55,
    startingHourlyRate: 22,
  });
  const [employmentTech, setEmploymentTech] = useState<TechnicianRecord | null>(null);
  const [employmentType, setEmploymentType] = useState("contractor");
  const [payRate, setPayRate] = useState(55);
  const [dispatchTech, setDispatchTech] = useState<TechnicianRecord | null>(null);
  const [newLogin, setNewLogin] = useState<{ name: string; username: string; loginReady: boolean; temporaryPassword?: string; warning?: string } | null>(null);
  const [dispatchForm, setDispatchForm] = useState({ dispatchAddress1: "", dispatchAddress2: "", dispatchCity: "", dispatchState: "", dispatchPostalCode: "" });
  const identity = useQuery({ queryKey: ["employment-editor-identity"], queryFn: async () => { const response = await portalFetch("/api/me"); return portalJson<{ identity: { role: string } }>(response,"Unable to check administrator access."); } });
  const canEditEmployment = ["owner_administrator", "operations_administrator"].includes(identity.data?.identity.role || "");
  const pay = useQuery({ queryKey: ["technician-pay"], queryFn: getPay });
  const roster = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const response = await portalFetch("/api/technicians");
      const data = await portalJson<{
        technicians: TechnicianRecord[];
        error?: string;
      }>(response, "Technicians are unavailable.");
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const response = await portalFetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await portalJson<{ technician?: TechnicianRecord; accessSetup: { username: string; loginReady: boolean; temporaryPassword?: string; warning?: string } }>(response,"The technician could not be created.");
      return data;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["technicians"] }),
        queryClient.invalidateQueries({ queryKey: ["technician-pay"] }),
        queryClient.invalidateQueries({ queryKey: ["password-access"] }),
      ]);
      create.reset();
      setOpen(false);
      setNewLogin({ name: form.name, ...data.accessSetup });
      toast.success(data.accessSetup.loginReady ? "Technician profile and login created" : "Technician profile saved — login needs attention", { description: form.name });
      setForm(current => ({ ...current, name: "", email: "", phone: "", technicianCode: "" }));
    },
    onError: (error) => toast.error(error.message),
  });
  const updateEmployment = useMutation({
    mutationFn: async () => {
      if (!employmentTech) throw new Error("Choose a technician.");
      const response = await portalFetch("/api/technicians", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "employment", technicianId: employmentTech.id, recordVersion: employmentTech.recordVersion, employmentType, ...(employmentType === "contractor" ? { payoutRate: payRate / 100 } : { hourlyRate: payRate }) }) });
      await portalJson<{ technician: TechnicianRecord }>(response,"Employment settings could not be saved.");
    },
    onSuccess: async () => {
      setEmploymentTech(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["technicians"] }), queryClient.invalidateQueries({ queryKey: ["technician-pay"] }), queryClient.invalidateQueries({ queryKey: ["compensation"] })]);
      toast.success("Employment and pay settings updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateTraining = useMutation({
    mutationFn: async (input: {
      technicianId: string;
      trainingMode: boolean;
      proficiencyLevel: TechnicianRecord["proficiencyLevel"];
    }) => {
      const response = await portalFetch("/api/technicians", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await portalJson<{ technician: TechnicianRecord }>(response,"Training controls could not be updated.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["technicians"] });
      toast.success("Training controls updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateDispatch = useMutation({
    mutationFn: async () => {
      if (!dispatchTech) throw new Error("Choose a technician.");
      const response = await portalFetch("/api/technicians", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch_profile", technicianId: dispatchTech.id, ...dispatchForm }),
      });
      await portalJson<{ technician: TechnicianRecord }>(response,"The dispatch origin could not be saved.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["technicians"] });
      setDispatchTech(null);
      toast.success("Dispatch origin updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function editDispatch(tech: TechnicianRecord) {
    setDispatchTech(tech);
    setDispatchForm({
      dispatchAddress1: tech.dispatchAddress1 || "",
      dispatchAddress2: tech.dispatchAddress2 || "",
      dispatchCity: tech.dispatchCity || "",
      dispatchState: tech.dispatchState || "",
      dispatchPostalCode: tech.dispatchPostalCode || "",
    });
  }
  function useMainHub() {
    setDispatchForm({ dispatchAddress1: "611 Park Meadow Road", dispatchAddress2: "Suite B", dispatchCity: "Westerville", dispatchState: "OH", dispatchPostalCode: "43081" });
  }
  const totalPending = (pay.data?.summary ?? []).reduce(
    (sum, item) => sum + Number(item.pendingCents || 0),
    0,
  );
  const totalPaid = (pay.data?.summary ?? []).reduce(
    (sum, item) => sum + Number(item.paidCents || 0),
    0,
  );
  const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  return (
    <div className="space-y-5">
      <Sheet open={Boolean(employmentTech)} onOpenChange={(open) => { if (!open) setEmploymentTech(null); }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit employment &amp; pay</SheetTitle><SheetDescription>{employmentTech?.name} — applies to future pay calculations. Existing payout records and pay stubs are retained.</SheetDescription></SheetHeader>
          <form className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); updateEmployment.mutate(); }}>
            <label className="block space-y-2 text-sm font-semibold">Employment type
              <Select value={employmentType} onValueChange={(value) => { setEmploymentType(value); setPayRate(value === "contractor" ? (employmentTech?.payoutRate ? employmentTech.payoutRate * 100 : 55) : (employmentTech?.currentHourlyRateCents ? employmentTech.currentHourlyRateCents / 100 : 22)); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">Employee</SelectItem><SelectItem value="contractor">Contractor</SelectItem></SelectContent></Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold">{employmentType === "contractor" ? "Contractor payout (%)" : "Hourly rate ($)"}<Input type="number" required min={employmentType === "contractor" ? 0 : 7.25} max={employmentType === "contractor" ? 100 : 40} step="0.01" value={payRate} onChange={(event) => setPayRate(Number(event.target.value))} /></label>
            <p className="text-sm text-slate-600">Contractors use percentage pay; employees use hourly pay. Saving records the change in the audit history.</p>
            {updateEmployment.error ? <p role="alert" className="text-sm text-red-700">{updateEmployment.error.message}</p> : null}
            <Button type="submit" disabled={updateEmployment.isPending} className="w-full">{updateEmployment.isPending ? "Saving…" : "Save employment & pay"}</Button>
          </form>
        </SheetContent>
      </Sheet>
      {newLogin ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5" data-private="true">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="font-bold text-slate-950">{newLogin.loginReady ? "Login ready" : "Login needs attention"} for {newLogin.name}</h2>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  {newLogin.loginReady ? "No ChatGPT account or separate Site invitation is needed. Share these details privately. First sign-in prompts a personal password, then opens the technician’s jobs." : "The profile is saved. Do not create it again. Open Users & access → TechCommand logins to finish login setup."}
                </p>
                <p className="mt-2 text-sm">Username: <b>{newLogin.username}</b></p>
                {newLogin.temporaryPassword ? <p className="mt-2 text-sm">Temporary password: <code className="rounded bg-white px-2 py-1">{newLogin.temporaryPassword}</code></p> : null}
                {newLogin.warning ? <p role="alert" className="mt-2 text-sm text-amber-900">{newLogin.warning}</p> : null}
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-amber-300 bg-white"
              disabled={!newLogin.loginReady || !newLogin.temporaryPassword}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`TechCommand login\nhttps://app.techcommandhq.com/login\nUsername: ${newLogin.username}\nTemporary password: ${newLogin.temporaryPassword}\nChoose a personal password at first sign-in. Your technician dashboard shows your jobs and guided workflow.`);
                  toast.success("Technician login details copied");
                } catch { toast.error("Copy is unavailable. Select the login details above and copy them manually."); }
              }}
            >
              <Copy /> Copy login message
            </Button>
            <Button variant="ghost" onClick={() => setNewLogin(null)}>Hide login details</Button>
          </div>
        </section>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Active technicians</p>
          <p className="mt-2 text-3xl font-bold">
            {roster.data?.technicians.length ?? 0}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Profiles linked to role permissions
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Pending technician pay</p>
          <p className="mt-2 text-3xl font-bold">{money(totalPending)}</p>
          <p className="mt-2 text-xs text-slate-500">
            Awaiting admin confirmation
          </p>
        </article>
        <article className="rounded-xl border bg-[#102748] p-4 text-white">
          <p className="text-sm text-blue-200">Paid ledger</p>
          <p className="mt-2 text-3xl font-bold">{money(totalPaid)}</p>
          <p className="mt-2 text-xs text-blue-100/70">
            Permanent job-level record
          </p>
        </article>
      </section>
      <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5">
        <div className="flex gap-3">
          <GraduationCap className="mt-0.5 size-5 shrink-0 text-cyan-800" />
          <div>
            <h2 className="font-bold text-cyan-950">
              Competency-controlled Training Mode
            </h2>
            <p className="mt-1 text-sm leading-6 text-cyan-900">
              New technicians receive step-by-step coaching and a job-specific
              knowledge check. QA approvals build their competency score;
              returned reports reset the pass streak. An administrator decides
              when the technician can work without coaching.
            </p>
          </div>
        </div>
      </section>
      <article className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold">
              Technician roster, training, and pay control
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Admins see the whole team; technicians only see their own
              confirmed records.
            </p>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus /> Add technician
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
              <SheetHeader className="border-b px-6 pb-5 pt-6">
                <SheetTitle>Create technician profile</SheetTitle>
                <SheetDescription>
                  This creates the employee record, technician role, coverage
                  rules, pay basis, and guided Training Mode.
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
                    Full name
                    <Input
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold">
                    Technician code
                    <Input
                      required
                      value={form.technicianCode}
                      onChange={(event) =>
                        setForm({ ...form, technicianCode: event.target.value })
                      }
                      placeholder="TECH-001"
                    />
                  </label>
                </div>
                <label className="space-y-1.5 text-sm font-semibold">
                  Work email
                  <Input
                    type="email"
                    required
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-semibold">
                    Phone
                    <Input
                      value={form.phone}
                      onChange={(event) =>
                        setForm({ ...form, phone: event.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold">
                    Home ZIP
                    <Input
                      value={form.homePostalCode}
                      onChange={(event) =>
                        setForm({ ...form, homePostalCode: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-sm font-bold text-blue-950">Dispatch origin</p><p className="mt-1 text-xs text-blue-800">This—not a universal hub—drives this technician&apos;s routing and bid mileage.</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, dispatchAddress1: "611 Park Meadow Road", dispatchAddress2: "Suite B", dispatchCity: "Westerville", dispatchState: "OH", dispatchPostalCode: "43081" })}>Use TechFlex hub</Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">Street address<Input value={form.dispatchAddress1} onChange={(event) => setForm({ ...form, dispatchAddress1: event.target.value })}/></label>
                    <label className="space-y-1.5 text-sm font-semibold">Suite / unit<Input value={form.dispatchAddress2} onChange={(event) => setForm({ ...form, dispatchAddress2: event.target.value })}/></label>
                    <label className="space-y-1.5 text-sm font-semibold">City<Input value={form.dispatchCity} onChange={(event) => setForm({ ...form, dispatchCity: event.target.value })}/></label>
                    <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5 text-sm font-semibold">State<Input value={form.dispatchState} onChange={(event) => setForm({ ...form, dispatchState: event.target.value })}/></label><label className="space-y-1.5 text-sm font-semibold">ZIP<Input value={form.dispatchPostalCode} onChange={(event) => setForm({ ...form, dispatchPostalCode: event.target.value })}/></label></div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-semibold">
                    Employment type
                    <Select
                      value={form.employmentType}
                      onValueChange={(value) =>
                        setForm({ ...form, employmentType: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold">
                    Coverage radius (miles)
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={form.maxRadiusMiles}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          maxRadiusMiles: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                {form.employmentType === "employee" ? (
                  <label className="space-y-1.5 text-sm font-semibold">
                    Starting hourly rate (maximum $40)
                    <Input
                      type="number"
                      min={7.25}
                      max={40}
                      step="0.25"
                      value={form.startingHourlyRate}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          startingHourlyRate: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ) : (
                  <label className="space-y-1.5 text-sm font-semibold">
                    Work-order payout percentage
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={form.payoutRate * 100}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          payoutRate: Number(event.target.value) / 100,
                        })
                      }
                    />
                  </label>
                )}
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-xs leading-5 text-cyan-900">
                  One compensation method is enforced: employees use the hourly
                  progression ladder; contractors use a work-order percentage.
                  Training Mode starts automatically. Creating a profile does
                  not send an invitation; Site access must also be authorized.
                </div>
                {create.error ? <p role="alert" className="text-sm text-red-700">{create.error.message}</p> : null}
                <Button
                  className="w-full"
                  type="submit"
                  disabled={create.isPending}
                >
                  {create.isPending ? "Creating…" : "Create technician"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        </div>
        {roster.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading technician records…
          </div>
        ) : null}
        {!roster.isLoading && !roster.data?.technicians.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No live technicians yet. Create the first profile, then import
            work-order pay.
          </div>
        ) : null}
        {roster.data?.technicians.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">TECHNICIAN</TableHead>
                <TableHead>CODE / TYPE</TableHead>
                <TableHead>TRAINING</TableHead>
                <TableHead>CREDENTIALS</TableHead>
                <TableHead>PENDING PAY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.data.technicians.map((tech) => {
                const summary = pay.data?.summary.find(
                  (item) => item.technicianId === tech.id,
                );
                return (
                  <TableRow key={tech.id}>
                    <TableCell className="pl-5">
                      <p className="font-bold">{tech.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tech.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tech.homePostalCode || "—"} · {tech.maxRadiusMiles} mi
                      </p>
                      <p className="mt-2 flex items-start gap-1 text-xs text-slate-600"><MapPin className="mt-0.5 size-3 shrink-0"/>{[tech.dispatchAddress1,tech.dispatchAddress2,tech.dispatchCity,tech.dispatchState,tech.dispatchPostalCode].filter(Boolean).join(", ") || "Dispatch origin required"}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="size-3"/>Google calendar: {tech.calendarStatus === "connected" ? "connected" : "connection pending"}</p>
                      <TechnicianFiles technicianId={tech.id} name={tech.name} role={identity.data?.identity.role || ""} />
                      <Button className="mt-2 h-7 px-2 text-xs" variant="outline" onClick={() => editDispatch(tech)}><Pencil className="size-3"/>Edit origin</Button>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs font-bold">
                        {tech.technicianCode}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {tech.employmentType}
                      </p>
                      {canEditEmployment ? <TechnicianDisciplines technician={tech} /> : null}
                      {canEditEmployment ? <Button className="mt-2" variant="outline" onClick={() => { updateEmployment.reset(); setEmploymentTech(tech); setEmploymentType(tech.employmentType); setPayRate(tech.employmentType === "contractor" ? tech.payoutRate * 100 : tech.currentHourlyRateCents / 100); }}><Pencil className="size-3" />Edit employment &amp; pay</Button> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(tech.trainingMode)}
                          disabled={updateTraining.isPending}
                          onCheckedChange={(checked) =>
                            updateTraining.mutate({
                              technicianId: tech.id,
                              trainingMode: checked,
                              proficiencyLevel: tech.proficiencyLevel,
                            })
                          }
                        />
                        <span className="text-xs font-bold">
                          {tech.trainingMode ? "Guided" : "Off"}
                        </span>
                      </div>
                      <Select
                        value={tech.proficiencyLevel}
                        onValueChange={(
                          value: TechnicianRecord["proficiencyLevel"],
                        ) =>
                          updateTraining.mutate({
                            technicianId: tech.id,
                            trainingMode: tech.trainingMode,
                            proficiencyLevel: value,
                          })
                        }
                      >
                        <SelectTrigger className="mt-2 h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trainee">Trainee</SelectItem>
                          <SelectItem value="guided">Guided</SelectItem>
                          <SelectItem value="independent">
                            Independent
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-slate-500">
                        Score {tech.competencyScore}% · streak{" "}
                        {tech.qaPassStreak}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">Not required for routine work</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tech.credentialCount} filed · career-ladder review only
                      </p>
                    </TableCell>
                    <TableCell className="font-bold text-amber-700">
                      {money(summary?.pendingCents || 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </article>
      <Sheet open={Boolean(dispatchTech)} onOpenChange={(next) => { if (!next) setDispatchTech(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b px-6 pb-5 pt-6">
            <SheetTitle>Dispatch origin</SheetTitle>
            <SheetDescription>Administrators control the starting point used for {dispatchTech?.name || "this technician"}&apos;s route and bid calculations.</SheetDescription>
          </SheetHeader>
          <form className="space-y-4 p-6" onSubmit={(event) => { event.preventDefault(); updateDispatch.mutate(); }}>
            <Button type="button" variant="outline" onClick={useMainHub}>Use 611 Park Meadow Road, Suite B</Button>
            <label className="block space-y-1.5 text-sm font-semibold">Street address<Input required value={dispatchForm.dispatchAddress1} onChange={(event) => setDispatchForm({ ...dispatchForm, dispatchAddress1: event.target.value })}/></label>
            <label className="block space-y-1.5 text-sm font-semibold">Suite / unit<Input value={dispatchForm.dispatchAddress2} onChange={(event) => setDispatchForm({ ...dispatchForm, dispatchAddress2: event.target.value })}/></label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm font-semibold sm:col-span-1">City<Input required value={dispatchForm.dispatchCity} onChange={(event) => setDispatchForm({ ...dispatchForm, dispatchCity: event.target.value })}/></label>
              <label className="space-y-1.5 text-sm font-semibold">State<Input required value={dispatchForm.dispatchState} onChange={(event) => setDispatchForm({ ...dispatchForm, dispatchState: event.target.value })}/></label>
              <label className="space-y-1.5 text-sm font-semibold">ZIP<Input required value={dispatchForm.dispatchPostalCode} onChange={(event) => setDispatchForm({ ...dispatchForm, dispatchPostalCode: event.target.value })}/></label>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-xs leading-5 text-cyan-900">The bid calculator will use this saved origin after the technician is selected. AI may recommend a different origin from source paperwork, but it cannot replace this profile silently.</div>
            <Button className="w-full" type="submit" disabled={updateDispatch.isPending}>{updateDispatch.isPending ? "Saving…" : "Save dispatch origin"}</Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
