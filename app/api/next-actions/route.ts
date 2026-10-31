import { env } from "cloudflare:workers";
import { taskOrderTarget, type OrderTarget } from "@/lib/order-navigation";
import {
  TECHFLEX_ORG_ID,
  apiError,
  getPortalIdentity,
  type PortalIdentity,
} from "@/lib/portal-auth";

type Priority = "urgent" | "high" | "normal";

type NextAction = {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  module: string;
  actionLabel: string;
  dueAt: string | null;
  workOrderId?: string;
  target?: OrderTarget;
};

const priorityRank: Record<Priority, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
};

function normalizePriority(value: unknown): Priority {
  return value === "urgent" ? "urgent" : value === "high" ? "high" : "normal";
}

function sortActions(actions: NextAction[]) {
  return actions.sort((a, b) => {
    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority) return priority;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.title.localeCompare(b.title);
  });
}

function moduleForTask(category: string, source: string) {
  const value = `${category} ${source}`.toLowerCase();
  if (value.includes("dispatch") || value.includes("route")) return "dispatch";
  if (value.includes("finance") || value.includes("invoice") || value.includes("pay")) return "finance";
  if (value.includes("credential") || value.includes("ceu") || value.includes("technician")) return "technicians";
  if (value.includes("partner") || value.includes("client")) return "partners";
  if (value.includes("integration") || value.includes("sync")) return "automations";
  if (value.includes("document")) return "documents";
  return "work-orders";
}

async function administratorActions(identity: PortalIdentity) {
  const role = identity.role;
  const [tasks, workOrders] = await Promise.all([
    env.DB.prepare(
      `SELECT id,title,instructions,category,priority,source,source_record_id AS sourceRecordId,due_at AS dueAt,work_order_id AS workOrderId
         FROM admin_tasks
        WHERE organization_id=? AND status IN ('open','in_progress')
          AND (assigned_user_id=? OR assigned_role=? OR (assigned_user_id IS NULL AND assigned_role IS NULL))
        ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                 CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at,created_at
        LIMIT 12`,
    ).bind(TECHFLEX_ORG_ID, identity.userId, role).all(),
    env.DB.prepare(
      `SELECT id,COALESCE(external_id,id) AS workOrderNumber,summary,status,priority,scheduled_start AS scheduledStart
         FROM work_orders
        WHERE organization_id=? AND status IN ('pricing_review','ready_to_assign','technician_submitted','ready_to_invoice')
        ORDER BY CASE status WHEN 'pricing_review' THEN 1 WHEN 'technician_submitted' THEN 2
          WHEN 'ready_to_assign' THEN 3 ELSE 4 END,opened_at LIMIT 12`,
    ).bind(TECHFLEX_ORG_ID).all(),
  ]);

  const actions: NextAction[] = tasks.results.map((row) => ({
    id: `task-${row.id}`,
    title: String(row.title),
    detail: String(row.instructions || `${row.category} task requires review.`),
    priority: normalizePriority(row.priority),
    module: moduleForTask(String(row.category), String(row.source)),
    actionLabel: "Open task",
    dueAt: row.dueAt ? String(row.dueAt) : null,
    workOrderId: row.workOrderId ? String(row.workOrderId) : undefined,
    target: taskOrderTarget(row.source, row.sourceRecordId, row.workOrderId),
  }));

  const taskWorkOrders = new Set(actions.map((action) => action.workOrderId).filter(Boolean));
  for (const row of workOrders.results) {
    if (taskWorkOrders.has(String(row.id))) continue;
    const state = String(row.status);
    const copy: Record<string, { title: string; detail: string; module: string; label: string; priority: Priority }> = {
      pricing_review: { title: `Resolve pricing · ${row.workOrderNumber}`, detail: "The work order cannot advance until its pricing and direct costs support the required margin.", module: "work-orders", label: "Review pricing", priority: "urgent" },
      ready_to_assign: { title: `Assign crew · ${row.workOrderNumber}`, detail: "Pricing is cleared and the work order is waiting for technician coverage.", module: "dispatch", label: "Open dispatch", priority: "high" },
      technician_submitted: { title: `Review submission · ${row.workOrderNumber}`, detail: "Technician evidence and the service report are waiting for administrative QA.", module: "work-orders", label: "Review QA", priority: "high" },
      ready_to_invoice: { title: `Complete billing · ${row.workOrderNumber}`, detail: "The approved work order is ready for invoice and collection handling.", module: "finance", label: "Open finance", priority: "high" },
    };
    const item = copy[state];
    if (!item) continue;
    actions.push({
      id: `work-order-${row.id}`,
      title: item.title,
      detail: item.detail,
      priority: row.priority === "urgent" ? "urgent" : item.priority,
      module: item.module,
      actionLabel: item.label,
      dueAt: row.scheduledStart ? String(row.scheduledStart) : null,
      workOrderId: String(row.id),
    });
  }
  return sortActions(actions).slice(0, 12);
}

async function technicianActions(identity: PortalIdentity) {
  if (!identity.technicianId) return [];
  const [assignments, payStubs] = await Promise.all([
    env.DB.prepare(
      `SELECT w.id,COALESCE(w.external_id,w.id) AS workOrderNumber,w.summary,w.status,
              w.priority,w.scheduled_start AS scheduledStart,wa.status AS assignmentStatus
         FROM work_order_assignments wa JOIN work_orders w ON w.id=wa.work_order_id
        WHERE wa.technician_id=? AND wa.status NOT IN ('declined','cancelled','completed')
          AND w.status NOT IN ('paid','cancelled','closed')
        ORDER BY CASE w.priority WHEN 'urgent' THEN 1 ELSE 2 END,
                 CASE WHEN w.scheduled_start IS NULL THEN 1 ELSE 0 END,w.scheduled_start LIMIT 12`,
    ).bind(identity.technicianId).all(),
    env.DB.prepare(
      `SELECT id,period_start AS periodStart,period_end AS periodEnd,gross_pay_cents AS grossPayCents
         FROM pay_stubs WHERE technician_id=? AND confirmed_at IS NULL
        ORDER BY period_end DESC LIMIT 3`,
    ).bind(identity.technicianId).all(),
  ]);

  const actions: NextAction[] = [];
  for (const row of assignments.results) {
    const assignment = String(row.assignmentStatus);
    const status = String(row.status);
    let title = "Open assignment";
    let detail = String(row.summary);
    let label = "View job";
    if (["offered", "assigned", "accepted"].includes(assignment)) {
      title = `Start travel · ${row.workOrderNumber}`;
      detail = `${row.summary} is assigned and ready for travel status.`;
      label = "Open today";
    } else if (assignment === "dispatched") {
      title = `Record arrival · ${row.workOrderNumber}`;
      detail = `${row.summary} is currently marked in transit.`;
      label = "Open today";
    } else if (assignment === "arrived" && status !== "in_progress") {
      title = `Begin service · ${row.workOrderNumber}`;
      detail = `${row.summary} is waiting for the service-start timestamp.`;
      label = "Open today";
    } else if (status === "in_progress") {
      title = `Complete documentation · ${row.workOrderNumber}`;
      detail = "Finish the guided workflow, required evidence, testing, and signature before submission.";
      label = "Complete job";
    } else if (status === "technician_submitted" || assignment === "submitted") {
      continue;
    }
    actions.push({ id: `assignment-${row.id}`, title, detail, priority: normalizePriority(row.priority), module: "today", actionLabel: label, dueAt: row.scheduledStart ? String(row.scheduledStart) : null, workOrderId: String(row.id) });
  }
  for (const row of payStubs.results) {
    actions.push({ id: `pay-stub-${row.id}`, title: "Acknowledge weekly pay statement", detail: `${row.periodStart} through ${row.periodEnd} is ready for review and acknowledgment.`, priority: "high", module: "pay", actionLabel: "Review statement", dueAt: null });
  }
  // Optional career-ladder checks never interrupt routine field work or pay.
  return sortActions(actions).slice(0, 12);
}

async function clientActions(identity: PortalIdentity) {
  const scope = await env.DB.prepare(
    `SELECT account_id AS accountId,location_id AS locationId FROM account_access
      WHERE user_id=? AND status='active' LIMIT 1`,
  ).bind(identity.userId).first<{ accountId: string; locationId: string | null }>();
  if (!scope) return [];
  const bindings = scope.locationId ? [scope.accountId, scope.locationId] : [scope.accountId];
  const [quotes, messages] = await Promise.all([
    env.DB.prepare(
      `SELECT w.id,COALESCE(w.external_id,w.id) AS workOrderNumber,w.summary,e.expires_at AS expiresAt
         FROM work_orders w JOIN estimates e ON e.work_order_id=w.id AND e.status='presented'
        WHERE w.account_id=?${scope.locationId ? " AND w.location_id=?" : ""}
        ORDER BY e.expires_at LIMIT 12`,
    ).bind(...bindings).all(),
    env.DB.prepare(
      `SELECT cm.id,cm.subject,cm.created_at AS createdAt
         FROM client_messages cm
        WHERE cm.account_id=? AND cm.visibility='shared' AND cm.sender_user_id<>? AND cm.read_at IS NULL
          ${scope.locationId ? "AND cm.work_order_id IN (SELECT id FROM work_orders WHERE account_id=? AND location_id=?)" : ""}
        ORDER BY cm.created_at DESC LIMIT 5`,
    ).bind(...(scope.locationId ? [scope.accountId, identity.userId, scope.accountId, scope.locationId] : [scope.accountId, identity.userId])).all(),
  ]);
  const actions: NextAction[] = quotes.results.map((row) => ({ id: `quote-${row.id}`, title: `Review quote · ${row.workOrderNumber}`, detail: `${row.summary} is waiting for your acceptance or decline decision.`, priority: "high", module: "jobs", actionLabel: "Review quote", dueAt: row.expiresAt ? String(row.expiresAt) : null, workOrderId: String(row.id) }));
  for (const row of messages.results) actions.push({ id: `message-${row.id}`, title: `Read message · ${row.subject}`, detail: "TechFlex sent an account-scoped message requiring your review.", priority: "normal", module: "messages", actionLabel: "Open messages", dueAt: String(row.createdAt) });
  return sortActions(actions).slice(0, 12);
}

export async function GET(request: Request) {
  try {
    const identity = await getPortalIdentity(request);
    if (identity.role === "school_coordinator") return Response.json({error:"School access is limited to training records."},{status:403});
    let actions: NextAction[] = [];
    if (identity.role === "technician") actions = await technicianActions(identity);
    else if (["client_administrator", "client_location_user"].includes(identity.role)) actions = await clientActions(identity);
    else actions = await administratorActions(identity);
    return Response.json({
      generatedAt: new Date().toISOString(),
      identity: { displayName: identity.displayName, role: identity.role },
      primary: actions[0] || null,
      actions,
      summary: { total: actions.length, urgent: actions.filter((item) => item.priority === "urgent").length, high: actions.filter((item) => item.priority === "high").length },
    });
  } catch (error) {
    return apiError(error);
  }
}
