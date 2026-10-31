"use client";

import { useState } from "react";
import {
  ArrowRight,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  ImageIcon,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const demoJobs = [
  {
    id: "diagnostic",
    label: "Diagnostic",
    workOrder: "DEMO-SL-24091-1",
    equipment: "Apex Mobility AX-500 power chair (fictional)",
    model: "AX-500",
    city: "Columbus, Ohio",
    complaint: "Intermittent power loss after approximately ten minutes of use.",
    authorization: 300,
    technicianPay: 180,
    companyAllocation: 120,
    technician: "Jordan Lee · Diagnostic & mobility qualified",
    distance: "18 miles from assigned dispatch origin",
    checklist: [
      "Verify model, serial number, charger, controller, and battery configuration",
      "Photograph identification label and as-found condition",
      "Complete approved power and connection checks",
      "Record readings, symptoms reproduced, and next recommended action",
      "Perform final safety/function check and capture customer signature",
    ],
  },
  {
    id: "repair",
    label: "Repair",
    workOrder: "DEMO-SL-24107-2",
    equipment: "Apex Mobility LX-3 lift chair (fictional)",
    model: "LX-3",
    city: "Westerville, Ohio",
    complaint: "Chair raises but will not return fully to the seated position.",
    authorization: 420,
    technicianPay: 252,
    companyAllocation: 168,
    technician: "Taylor Morgan · Lift-chair repair qualified",
    distance: "11 miles from assigned dispatch origin",
    checklist: [
      "Confirm replacement-part authorization and exact unit identification",
      "Photograph the serial label, as-found condition, and replacement part",
      "Inspect power, hand control, wiring, mounting points, and mechanism",
      "Install only the authorized part and document the work performed",
      "Cycle the chair unloaded and loaded, then capture signature and final photos",
    ],
  },
  {
    id: "delivery",
    label: "White-glove delivery",
    workOrder: "DEMO-SL-24122-1",
    equipment: "Apex Mobility P7 complex power chair (fictional)",
    model: "P7",
    city: "Newark, Ohio",
    complaint: "Deliver, assemble, configure, function-test, and demonstrate the unit.",
    authorization: 650,
    technicianPay: 390,
    companyAllocation: 260,
    technician: "Casey Reed · Delivery/setup qualified",
    distance: "27 miles from assigned dispatch origin",
    checklist: [
      "Verify carton count, condition, unit identity, and delivery-path requirements",
      "Photograph cartons before opening and record freight damage if present",
      "Assemble and configure only within approved manufacturer instructions",
      "Complete unloaded and loaded operational and safety checks",
      "Demonstrate controls, capture delivery acceptance, signature, and final photos",
    ],
  },
] as const;

const steps = [
  ["Intake", "Save, upload, paste, or receive an approved exchange"],
  ["Extract", "Read the work-order fields and preserve the source"],
  ["Review", "Resolve anything missing or uncertain before release"],
  ["Price", "Apply the account rule and show the 60% demonstration allocation"],
  ["Assign", "Suggest the nearest qualified technician and allow reassignment"],
  ["Contact", "Create the customer-contact task and scheduling follow-up"],
  ["AI brief", "Prepare job-specific guidance from approved information"],
  ["Field work", "Guide the technician from arrival through signature"],
  ["QA & packet", "Verify evidence and assemble the completion package"],
  ["Return", "Download manually or simulate an approved FaST exchange"],
] as const;

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function Status({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" }) {
  const colors = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return <Badge variant="outline" className={colors[tone]}>{children}</Badge>;
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <Icon className="size-4 text-cyan-700" />
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

export function SpinLifeDemoStepContent({ step, job }: { step: number; job: (typeof demoJobs)[number] }) {
  if (step === 0)
    return (
      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-2xl border bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[.15em] text-cyan-700">Saved SpinLife work order</p>
          <div className="mt-4 rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-200">
            <p>WORK ORDER: {job.workOrder}</p>
            <p>TYPE: {job.label}</p>
            <p>EQUIPMENT: {job.equipment}</p>
            <p>SERVICE AREA: {job.city}</p>
            <p>AUTHORIZED SERVICE: {money(job.authorization)}</p>
            <p>NOTES: {job.complaint}</p>
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">Three controlled ways in</h4>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p><b className="text-slate-900">1. Upload:</b> Save the work order, then drag in the PDF or screenshot.</p>
            <p><b className="text-slate-900">2. Paste:</b> Copy the work-order text into TechCommand.</p>
            <p><b className="text-slate-900">3. Approved connection:</b> Receive it through an API, export, or other method SpinLife authorizes.</p>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            This demonstration does not log into FaST or transmit a real work order.
          </div>
        </section>
      </div>
    );

  if (step === 1)
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={FileText} label="Work order" value={job.workOrder} />
          <SummaryCard icon={Wrench} label="Service type" value={job.label} />
          <SummaryCard icon={PackageCheck} label="Equipment/model" value={job.model} />
          <SummaryCard icon={MapPin} label="Service area" value={job.city} />
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <b>Source preserved.</b> The original upload remains linked to the draft. Extracted values are proposals until an administrator reviews them; uncertain fields are never silently guessed.
        </div>
      </div>
    );

  if (step === 2)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">Ready to release</h4>
          <div className="mt-4 space-y-3">
            {["Work-order number and service type", "Equipment model and complaint", "Authorized amount", "Service city and account"].map((item) => (
              <p key={item} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="size-4 text-emerald-600" />{item}</p>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="font-extrabold text-amber-950">Administrator confirmation</h4>
          <p className="mt-3 text-sm leading-6 text-amber-950">Exact customer contact details, access notes, parts shipment status, appointment window, mileage, stairs, weight, and crew needs must be confirmed before they affect dispatch or pricing.</p>
          <p className="mt-3 text-xs font-bold text-amber-800">Missing information holds the record; it does not disappear or advance under a green success message.</p>
        </section>
      </div>
    );

  if (step === 3)
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
        <section className="rounded-2xl border bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[.15em] text-blue-700">Fictional SpinLife demonstration rule</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={FileCheck2} label="Authorized service" value={money(job.authorization)} />
            <SummaryCard icon={UserRoundCheck} label="Technician · 60%" value={money(job.technicianPay)} />
            <SummaryCard icon={ShieldCheck} label="TechFlex · 40%" value={money(job.companyAllocation)} />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Illustrative basis: 60% of authorized service reimbursement. Pass-through expenses are excluded unless the signed account rule says otherwise.</p>
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <b>Important:</b> this is a presentation calculation, not a change to live TechFlex compensation. A real SpinLife-specific 60% rule must be approved and configured in the executed agreement before automation uses it.
        </section>
      </div>
    );

  if (step === 4)
    return (
      <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
          <MapPin className="size-6 text-cyan-700" />
          <p className="mt-3 text-xs font-black uppercase tracking-wider text-cyan-700">Suggested assignment</p>
          <h4 className="mt-1 text-lg font-black text-slate-950">{job.technician}</h4>
          <p className="mt-2 text-sm text-slate-600">{job.distance}</p>
          <Status tone="green">Qualified and available · demo</Status>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">Administrator stays in control</h4>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>TechCommand compares service qualifications, coverage, dispatch origin, availability, crew requirements, and current workload.</p>
            <p>The dispatcher can choose another qualified technician before release. The change is attributed and the old route is cleaned up.</p>
            <p>The technician sees the assignment and the configured pay basis, without seeing internal company financial details.</p>
          </div>
        </section>
      </div>
    );

  if (step === 5)
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [BellRing, "Assignment alert", `New ${job.label.toLowerCase()} assignment ${job.workOrder}`],
          [UserRoundCheck, "Required next action", "Contact the customer and record the outcome"],
          [ClipboardCheck, "Escalation", "Remind and flag until contact or an administrator resolves it"],
        ].map(([Icon, title, copy]) => {
          const CardIcon = Icon as typeof BellRing;
          return <section key={String(title)} className="rounded-2xl border bg-white p-5"><CardIcon className="size-5 text-blue-700" /><h4 className="mt-3 font-extrabold text-slate-900">{String(title)}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{String(copy)}</p><div className="mt-3"><Status tone="amber">Simulated · nothing sent</Status></div></section>;
        })}
      </div>
    );

  if (step === 6)
    return (
      <div className="grid gap-4 lg:grid-cols-[.7fr_1.3fr]">
        <section className="rounded-2xl bg-[#071d31] p-5 text-white">
          <Bot className="size-7 text-cyan-300" />
          <p className="mt-4 text-xs font-black uppercase tracking-[.15em] text-cyan-300">TechCommand Copilot</p>
          <h4 className="mt-2 text-xl font-black">Prepare this {job.label.toLowerCase()} visit</h4>
          <p className="mt-3 text-sm leading-6 text-slate-300">Uses the work order, exact model, assigned role, approved knowledge, and required evidence. It recommends; it cannot silently change the job.</p>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">Generated job brief · demonstration</h4>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p><b className="text-slate-900">Known complaint:</b> {job.complaint}</p>
            <p><b className="text-slate-900">First verification:</b> confirm the exact model and serial before using model-specific guidance.</p>
            <p><b className="text-slate-900">Evidence plan:</b> source label, as-found condition, work performed, function testing, final condition, and signature.</p>
            <p><b className="text-slate-900">Safety boundary:</b> if an approved manufacturer procedure is unavailable, the technician is told to stop and obtain it rather than accept invented instructions.</p>
          </div>
        </section>
      </div>
    );

  if (step === 7)
    return (
      <div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
        <section className="rounded-2xl border bg-white p-5">
          <p className="text-xs font-black uppercase tracking-wider text-blue-700">Technician view</p>
          <h4 className="mt-2 text-xl font-black text-slate-950">{job.workOrder}</h4>
          <p className="mt-2 text-sm text-slate-600">{job.equipment}</p>
          <div className="mt-4"><Status tone="blue">Device autosave + offline queue</Status></div>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">A-to-Z {job.label.toLowerCase()} checklist</h4>
          <div className="mt-4 space-y-3">
            {job.checklist.map((item, index) => <p key={item} className="flex gap-3 text-sm leading-6 text-slate-700"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-cyan-50 text-xs font-black text-cyan-800">{index + 1}</span>{item}</p>)}
          </div>
        </section>
      </div>
    );

  if (step === 8)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h4 className="font-extrabold text-slate-900">QA completion gate</h4>
          <div className="mt-4 space-y-3">
            {["Required photos present", "Technician notes and testing complete", "Customer signature present", "Crew, time, price, and pay basis unchanged"].map((item) => <p key={item} className="flex items-center justify-between gap-3 text-sm text-slate-700"><span>{item}</span><Status tone="green">Complete · demo</Status></p>)}
          </div>
        </section>
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="font-extrabold text-emerald-950">Generated completion package</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [FileCheck2, "SpinLife completion worksheet", "Demonstration layout"],
              [ClipboardCheck, "TechFlex Service Report", "Branded and signed"],
              [ImageIcon, "Photo evidence", "Before, serial, work, after"],
              [FileText, `Invoice ${job.workOrder}`, money(job.authorization)],
            ].map(([Icon, title, copy]) => {
              const CardIcon = Icon as typeof FileText;
              return <div key={String(title)} className="rounded-xl border border-emerald-200 bg-white p-4"><CardIcon className="size-5 text-emerald-700" /><p className="mt-2 text-sm font-extrabold text-slate-900">{String(title)}</p><p className="mt-1 text-xs text-slate-500">{String(copy)}</p></div>;
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-emerald-900">An actual SpinLife form cannot be represented as exact until its blank template is supplied and mapped.</p>
        </section>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[.15em] text-emerald-700">Available operating path</p>
        <h4 className="mt-2 text-lg font-black text-slate-950">Download and submit the verified package manually</h4>
        <p className="mt-3 text-sm leading-6 text-slate-600">After real QA approval, TechCommand can provide the TechFlex Service Report, photo evidence, and invoice—and, once SpinLife’s blank template is supplied and mapped, its completed partner document—as one controlled package for portal upload.</p>
        <div className="mt-4"><Status tone="green">Workflow demonstrated · no file transmitted</Status></div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-black uppercase tracking-[.15em] text-amber-800">Future approved exchange</p>
        <h4 className="mt-2 text-lg font-black text-amber-950">Return the package and status automatically</h4>
        <p className="mt-3 text-sm leading-6 text-amber-950">With a provider-approved API, export, EDI, or documented portal method, the same verified package can enter a visible delivery queue with confirmation and recoverable failures.</p>
        <div className="mt-4 flex items-center gap-2"><Status tone="amber">Simulation only</Status><ArrowRight className="size-4 text-amber-700" /><Status tone="amber">No verified FaST exchange</Status></div>
      </section>
    </div>
  );
}

export function SpinLifeWorkflowDemo({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [jobId, setJobId] = useState<(typeof demoJobs)[number]["id"]>("repair");
  const job = demoJobs.find((item) => item.id === jobId) || demoJobs[1];

  function close() {
    onOpenChange(false);
    setStep(0);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="border-b bg-[#071d31] px-5 py-5 text-left text-white sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <div className="flex flex-wrap gap-2"><Status tone="amber">DEMONSTRATION ONLY</Status><Status tone="blue">Fictional work orders</Status></div>
              <DialogTitle className="mt-3 text-2xl text-white">TechFlex + SpinLife workflow</DialogTitle>
              <DialogDescription className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Follow one job from saved work order through extraction, assignment, technician execution, QA, documents, and the clearly labeled return options.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-4 sm:p-7">
          <section className="rounded-2xl border bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Choose a fictional SpinLife job</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {demoJobs.map((item) => (
                <button key={item.id} type="button" onClick={() => { setJobId(item.id); setStep(0); }} className={`min-h-20 rounded-xl border p-3 text-left transition ${job.id === item.id ? "border-cyan-500 bg-white shadow-sm ring-2 ring-cyan-100" : "bg-white/60 hover:border-cyan-300"}`} aria-pressed={job.id === item.id}>
                  <span className="text-sm font-extrabold text-slate-900">{item.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{item.workOrder}</span>
                  <span className="mt-1 block text-xs font-semibold text-blue-700">{item.model} · {money(item.authorization)}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <aside className="rounded-2xl border bg-white p-3">
              <p className="px-2 py-2 text-xs font-black uppercase tracking-[.14em] text-slate-400">Workflow</p>
              <ol className="space-y-1">
                {steps.map(([title, detail], index) => (
                  <li key={title}>
                    <button type="button" onClick={() => setStep(index)} className={`flex w-full gap-3 rounded-xl p-2.5 text-left ${index === step ? "bg-cyan-50 text-cyan-950" : "text-slate-600 hover:bg-slate-50"}`} aria-current={index === step ? "step" : undefined}>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-black ${index <= step ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
                      <span><span className="block text-sm font-extrabold">{title}</span><span className="mt-0.5 hidden text-[11px] leading-4 text-slate-500 lg:block">{detail}</span></span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            <main className="min-w-0">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Step {step + 1} of {steps.length}</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">{steps[step][0]}</h3>
                  <p className="mt-1 text-sm text-slate-600">{steps[step][1]}</p>
                </div>
                <Status tone="blue">{job.workOrder}</Status>
              </div>
              <Progress value={((step + 1) / steps.length) * 100} />
              <div className="mt-5"><SpinLifeDemoStepContent step={step} job={job} /></div>

              <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ChevronLeft /> Back</Button>
                {step < steps.length - 1 ? (
                  <Button className="flex-1 sm:flex-none" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Next step <ChevronRight /></Button>
                ) : (
                  <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setStep(0)}><RotateCcw /> Run another job</Button>
                )}
                <Button variant="ghost" className="sm:ml-auto" onClick={close}>Exit demonstration</Button>
              </div>
            </main>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
            <b>What this proves:</b> the workflow, decision points, role handoffs, document set, and recoverable delivery design. It does not prove a live FaST connection, exact SpinLife form mapping, notification delivery, or provider approval.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { demoJobs as SPINLIFE_DEMO_JOBS, steps as SPINLIFE_DEMO_STEPS };
