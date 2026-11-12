"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  BrainCircuit,
  ChevronRight,
  CircleAlert,
  Cloud,
  Mail,
  Plus,
  RefreshCw,
  Sheet as SheetIcon,
  Sparkles,
  TimerReset,
  WalletCards,
  Wrench,
  Workflow,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { taskOrderTarget, orderHref } from "@/lib/order-navigation";

type BiomedicalFollowUp = {
  id: string;
  stage:
    | "needs_verification"
    | "ready_to_order"
    | "ordered"
    | "received"
    | "repair_scheduled"
    | "resolved"
    | "not_required";
  needsReverification: boolean;
  sourceProgressVersion: number;
  recordVersion: number;
  partDescription: string;
  partNumber: string;
  manufacturerReference: string;
  approvalReference: string;
  vendorName: string;
  orderReference: string;
  orderedOn: string | null;
  receivedOn: string | null;
  repairWorkOrderId: string | null;
  resolutionNote: string;
  notes: string;
};

type AdminTask = {
  id: string;
  title: string;
  instructions?: string | null;
  category: string;
  priority: string;
  status: string;
  assignedRole?: string | null;
  dueAt?: string | null;
  source: string;
  sourceRecordId?: string | null;
  workOrderId?: string | null;
  assignedTo?: string | null;
  followUp?: BiomedicalFollowUp | null;
  repairCandidates?: Array<{ id: string; externalId: string; status: string }>;
};

type Assignee = { id: string; name: string; email: string; role: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Unable to update the task list.");
  return data;
}

const integrationCards = [
  {
    name: "Gmail work-order intake",
    status: "Alerts + controlled entry",
    detail:
      "Email alerts are reviewed and saved manually into the intake inbox, where missing data generates persistent follow-up tasks",
    icon: Mail,
    tone: "blue",
  },
  {
    name: "Google Sheets / Drive",
    status: "Connection needed",
    detail:
      "Live sheet selection and scheduled imports become available after authorization",
    icon: SheetIcon,
    tone: "amber",
  },
  {
    name: "QuickBooks",
    status: "Upload ready",
    detail:
      "CSV/Excel imports now; direct customer, invoice, payment, and expense sync next",
    icon: WalletCards,
    tone: "violet",
  },
  {
    name: "SpinLife FaST",
    status: "Manual verification active",
    detail:
      "Administrators paste FaST details, verify the full work-order suffix, and clear the required customer, equipment, deadline, and authorization prompts",
    icon: Workflow,
    tone: "green",
  },
  {
    name: "OpenAI knowledge reasoning",
    status: "Governed base active",
    detail:
      "Portal memory and sourced answers are live; external model reasoning awaits the portal-specific API credential and data policy",
    icon: BrainCircuit,
    tone: "blue",
  },
];

const runbook = [
  {
    time: "Start of day",
    title: "Clear intake and exceptions",
    items: [
      "Enter new work orders, reminders, and cancellations",
      "Complete every blocking intake prompt",
      "Price anything awaiting review",
      "Check expiring acceptance deadlines",
    ],
  },
  {
    time: "Midday",
    title: "Keep the field moving",
    items: [
      "Review late arrivals and route exceptions",
      "Resolve parts or customer-access holds",
      "Verify technician evidence is uploading",
      "Update customers when timing changes",
    ],
  },
  {
    time: "End of day",
    title: "Close the money loop",
    items: [
      "Review technician submissions",
      "Return incomplete reports for correction",
      "Move approved work to invoicing",
      "Confirm pay entries and unresolved sync errors",
    ],
  },
];

const followUpStages = [
  ["needs_verification", "Needs verification"],
  ["ready_to_order", "Approved / ready to order"],
  ["ordered", "Ordered externally"],
  ["received", "Received"],
  ["repair_scheduled", "Repair work order linked"],
  ["resolved", "Operational follow-up resolved"],
  ["not_required", "No further follow-up required"],
] as const;

function BiomedicalFollowUpPanel({ task }: { task: AdminTask }) {
  const queryClient = useQueryClient();
  const saved = task.followUp!;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    stage: saved.stage,
    partDescription: saved.partDescription,
    partNumber: saved.partNumber,
    manufacturerReference: saved.manufacturerReference,
    approvalReference: saved.approvalReference,
    vendorName: saved.vendorName,
    orderReference: saved.orderReference,
    orderedOn: saved.orderedOn ?? "",
    receivedOn: saved.receivedOn ?? "",
    repairWorkOrderId: saved.repairWorkOrderId ?? "none",
    resolutionNote: saved.resolutionNote,
    notes: saved.notes,
  });
  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/biomedical-follow-ups", {
        method: "PATCH",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          taskId: task.id,
          expectedRecordVersion: saved.recordVersion,
          sourceProgressVersion: saved.sourceProgressVersion,
          ...form,
          orderedOn: form.orderedOn || null,
          receivedOn: form.receivedOn || null,
          repairWorkOrderId:
            form.repairWorkOrderId === "none" ? null : form.repairWorkOrderId,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      setOpen(false);
      toast.success("Biomedical follow-up saved");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Wrench /> Manage follow-up
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b px-6 pb-5 pt-6">
          <SheetTitle>Parts and repair follow-up</SheetTitle>
          <SheetDescription>
            Record only verified operational events. This form does not place
            an order, spend money, create a work order, or declare equipment
            safe or returned to service.
          </SheetDescription>
        </SheetHeader>
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {saved.needsReverification ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              The technician evidence changed. Recheck the original task details
              before saving this operational status.
            </div>
          ) : null}
          <label className="block space-y-1.5 text-sm font-semibold">
            Verified stage
            <Select
              value={form.stage}
              onValueChange={(stage: BiomedicalFollowUp["stage"]) =>
                setForm({ ...form, stage })
              }
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {followUpStages.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-semibold">
              Part description
              <Input value={form.partDescription} onChange={(event) => setForm({ ...form, partDescription: event.target.value })} placeholder="Leave blank until known" />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Verified part number
              <Input value={form.partNumber} onChange={(event) => setForm({ ...form, partNumber: event.target.value })} placeholder="Do not infer" />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-semibold">
            Manufacturer / compatibility reference
            <Input value={form.manufacturerReference} onChange={(event) => setForm({ ...form, manufacturerReference: event.target.value })} placeholder="Actual source or reference" />
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Actual approval reference
            <Input value={form.approvalReference} onChange={(event) => setForm({ ...form, approvalReference: event.target.value })} placeholder="Required before ready to order" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-semibold">
              Vendor
              <Input value={form.vendorName} onChange={(event) => setForm({ ...form, vendorName: event.target.value })} />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Actual order reference
              <Input value={form.orderReference} onChange={(event) => setForm({ ...form, orderReference: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-semibold">
              Ordered date
              <Input type="date" value={form.orderedOn} onChange={(event) => setForm({ ...form, orderedOn: event.target.value })} />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              Received date
              <Input type="date" value={form.receivedOn} onChange={(event) => setForm({ ...form, receivedOn: event.target.value })} />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-semibold">
            Existing repair work order
            <Select value={form.repairWorkOrderId} onValueChange={(repairWorkOrderId) => setForm({ ...form, repairWorkOrderId })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {(task.repairCandidates ?? []).map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.externalId} · {candidate.status.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-xs font-normal text-slate-500">
              Only existing open work orders for this exact facility and asset appear.
            </span>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Resolution / no-follow-up explanation
            <Textarea value={form.resolutionNote} onChange={(event) => setForm({ ...form, resolutionNote: event.target.value })} placeholder="Required only to close the operational follow-up" />
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Operations notes
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-24" />
          </label>
          <Button className="w-full" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save verified follow-up"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function OperationsCenter() {
  const queryClient = useQueryClient();
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [task, setTask] = useState({
    title: "",
    instructions: "",
    category: "Operations",
    priority: "normal",
    assignedUserId: "unassigned",
    dueAt: "",
  });
  const tasksQuery = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: () =>
      fetchJson<{
        tasks: AdminTask[];
        assignees: Assignee[];
        canManageBiomedicalFollowUps: boolean;
      }>("/api/tasks"),
  });
  const mutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "complete" }),
      }),
    onSuccess: async (_data, id) => {
      setCompletedIds((current) => [...current, id]);
      await queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast.success("Task completed");
    },
    onError: (error) => toast.error(error.message),
  });
  const createTask = useMutation({
    mutationFn: () =>
      fetchJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...task,
          assignedUserId:
            task.assignedUserId === "unassigned" ? null : task.assignedUserId,
          dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      setTaskOpen(false);
      setTask({
        title: "",
        instructions: "",
        category: "Operations",
        priority: "normal",
        assignedUserId: "unassigned",
        dueAt: "",
      });
      toast.success("Task assigned");
    },
    onError: (error) => toast.error(error.message),
  });
  const tasks = (tasksQuery.data?.tasks ?? []).filter(
    (task) => !completedIds.includes(task.id),
  );
  const priorityStyle: Record<string, string> = {
    urgent: "border-red-200 bg-red-50 text-red-700",
    high: "border-amber-200 bg-amber-50 text-amber-800",
    normal: "border-blue-200 bg-blue-50 text-blue-700",
    low: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {integrationCards.map((item) => {
          const Icon = item.icon;
          const iconColors: Record<string, string> = {
            blue: "bg-blue-50 text-blue-700",
            amber: "bg-amber-50 text-amber-700",
            violet: "bg-violet-50 text-violet-700",
            green: "bg-emerald-50 text-emerald-700",
          };
          return (
            <article key={item.name} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid size-10 place-items-center rounded-xl ${iconColors[item.tone]}`}
                >
                  <Icon className="size-5" />
                </span>
                <span className="rounded-full border px-2 py-1 text-[11px] font-bold text-slate-600">
                  {item.status}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-900">
                {item.name}
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {item.detail}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <article className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-bold text-slate-900">
                Needs addressed
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Generated from missing data, deadlines, exceptions, and
                financial status
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => tasksQuery.refetch()}
                aria-label="Refresh task list"
              >
                <RefreshCw />
              </Button>
              <Sheet open={taskOpen} onOpenChange={setTaskOpen}>
                <SheetTrigger asChild>
                  <Button>
                    <Plus /> Assign task
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                  <SheetHeader className="border-b px-6 pb-5 pt-6">
                    <SheetTitle>Create and assign a task</SheetTitle>
                    <SheetDescription>
                      Give any active TechFlex user a trackable responsibility
                      with a clear deadline.
                    </SheetDescription>
                  </SheetHeader>
                  <form
                    className="space-y-4 p-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createTask.mutate();
                    }}
                  >
                    <label className="block space-y-1.5 text-sm font-semibold">
                      Task
                      <Input
                        required
                        value={task.title}
                        onChange={(event) =>
                          setTask({ ...task, title: event.target.value })
                        }
                        placeholder="Follow up with SpinLife on WO…"
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm font-semibold">
                      Instructions
                      <Textarea
                        value={task.instructions}
                        onChange={(event) =>
                          setTask({ ...task, instructions: event.target.value })
                        }
                        className="min-h-32"
                        placeholder="State exactly what done looks like."
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5 text-sm font-semibold">
                        Category
                        <Select
                          value={task.category}
                          onValueChange={(value) =>
                            setTask({ ...task, category: value })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "Operations",
                              "Work orders",
                              "Dispatch",
                              "Pricing",
                              "Finance",
                              "HTM",
                              "Compliance",
                              "Customer follow-up",
                            ].map((item) => (
                              <SelectItem key={item} value={item}>
                                {item}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block space-y-1.5 text-sm font-semibold">
                        Priority
                        <Select
                          value={task.priority}
                          onValueChange={(value) =>
                            setTask({ ...task, priority: value })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                    <label className="block space-y-1.5 text-sm font-semibold">
                      Assign to
                      <Select
                        value={task.assignedUserId}
                        onValueChange={(value) =>
                          setTask({ ...task, assignedUserId: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">
                            Unassigned queue
                          </SelectItem>
                          {tasksQuery.data?.assignees.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.name} · {person.role.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="block space-y-1.5 text-sm font-semibold">
                      Due date and time
                      <Input
                        type="datetime-local"
                        value={task.dueAt}
                        onChange={(event) =>
                          setTask({ ...task, dueAt: event.target.value })
                        }
                      />
                    </label>
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={createTask.isPending}
                    >
                      {createTask.isPending ? "Assigning…" : "Create task"}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </div>
          </div>
          {tasksQuery.error ? (
            <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <CircleAlert className="size-4 shrink-0" />
              {tasksQuery.error.message}
            </div>
          ) : null}
          {tasksQuery.isLoading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Building today’s task order…
            </div>
          ) : null}
          {!tasksQuery.isLoading && tasks.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <Check className="size-5" />
              </span>
              <p className="mt-3 font-bold text-slate-900">Queue clear</p>
              <p className="mt-1 text-sm text-slate-500">
                No current administrative exceptions.
              </p>
            </div>
          ) : null}
          <div className="divide-y">
            {tasks.map((task, index) => (
              <div key={task.id} className="flex gap-3 p-4 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{task.title}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityStyle[task.priority] ?? priorityStyle.normal}`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  {task.instructions ? (
                    <p className="mt-1.5 text-sm leading-5 text-slate-500">
                      {task.instructions}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {task.category} ·{" "}
                    {task.assignedTo ||
                      task.assignedRole?.replaceAll("_", " ") ||
                      "Unassigned queue"}
                  </p>
                  {taskOrderTarget(task.source,task.sourceRecordId,task.workOrderId)?<a className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-3 font-semibold text-blue-700" href={orderHref(taskOrderTarget(task.source,task.sourceRecordId,task.workOrderId)!)}>Open saved record</a>:null}
                </div>
                {task.followUp && tasksQuery.data?.canManageBiomedicalFollowUps ? (
                  <BiomedicalFollowUpPanel key={`${task.id}:${task.followUp.recordVersion}`} task={task} />
                ) : task.followUp ? (
                  <span className="text-xs font-semibold text-slate-500">
                    Operations administrator review required
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mutation.mutate(task.id)}
                    disabled={mutation.isPending}
                  >
                    <Check /> Done
                  </Button>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border bg-[#102748] p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">
                Weekday admin runbook
              </p>
              <h2 className="mt-2 text-xl font-bold">
                Keep the system current
              </h2>
            </div>
            <Sparkles className="size-5 text-blue-200" />
          </div>
          <div className="mt-5 space-y-5">
            {runbook.map((block) => (
              <div
                key={block.time}
                className="border-l border-blue-300/30 pl-4"
              >
                <div className="flex items-center gap-2">
                  <TimerReset className="size-4 text-blue-300" />
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">
                    {block.time}
                  </p>
                </div>
                <p className="mt-1.5 font-bold">{block.title}</p>
                <ul className="mt-2 space-y-1.5">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-xs leading-5 text-blue-100/75"
                    >
                      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-blue-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-blue-100/75">
            <Cloud className="size-4 text-emerald-300" /> Tasks will become
            automatic as each data source connects.
          </div>
        </article>
      </section>
    </div>
  );
}
