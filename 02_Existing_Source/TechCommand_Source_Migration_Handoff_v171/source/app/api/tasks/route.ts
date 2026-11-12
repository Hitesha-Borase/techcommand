import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const taskSchema = z.object({
  title: z.string().trim().min(2).max(240),
  instructions: z.string().trim().max(3000).optional().nullable(),
  category: z.string().trim().min(2).max(80),
  priority: z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  dueAt: z.string().datetime().optional().nullable(),
  assignedRole: z.string().trim().max(80).optional().nullable(),
  assignedUserId: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const [stored, workOrderCounts, pmCounts, assignees] =
      await env.DB.batch([
        env.DB.prepare(
          `SELECT admin_tasks.id, admin_tasks.title, admin_tasks.instructions, admin_tasks.category, admin_tasks.priority, admin_tasks.status,
                admin_tasks.assigned_role AS assignedRole, admin_tasks.assigned_user_id AS assignedUserId,
                u.display_name AS assignedTo, admin_tasks.due_at AS dueAt, admin_tasks.source, admin_tasks.source_record_id AS sourceRecordId, admin_tasks.work_order_id AS workOrderId, admin_tasks.created_at AS createdAt,
                CASE WHEN f.id IS NULL THEN NULL ELSE json_object(
                  'id',f.id,'stage',f.stage,'needsReverification',json(CASE WHEN f.needs_reverification=1 THEN 'true' ELSE 'false' END),
                  'sourceProgressVersion',f.source_progress_version,'recordVersion',f.record_version,
                  'partDescription',f.part_description,'partNumber',f.part_number,'manufacturerReference',f.manufacturer_reference,
                  'approvalReference',f.approval_reference,'vendorName',f.vendor_name,'orderReference',f.order_reference,
                  'orderedOn',f.ordered_on,'receivedOn',f.received_on,'repairWorkOrderId',f.repair_work_order_id,
                  'resolutionNote',f.resolution_note,'notes',f.notes
                ) END AS followUpJson,
                CASE WHEN f.id IS NULL THEN NULL ELSE (
                  SELECT json_group_array(json_object('id',rw.id,'externalId',rw.external_id,'status',rw.status))
                    FROM work_order_assets rwa JOIN work_orders rw ON rw.id=rwa.work_order_id AND rw.organization_id=rwa.organization_id
                   WHERE rwa.organization_id=admin_tasks.organization_id AND rwa.asset_id=source_wa.asset_id
                     AND rw.account_id=source_w.account_id AND rw.location_id=source_w.location_id
                     AND rw.id<>source_w.id AND rw.status NOT IN ('cancelled','closed')
                ) END AS repairCandidatesJson
           FROM admin_tasks LEFT JOIN users u ON u.id = admin_tasks.assigned_user_id
           LEFT JOIN biomedical_follow_ups f ON f.task_id=admin_tasks.id AND f.organization_id=admin_tasks.organization_id
           LEFT JOIN work_order_assets source_wa ON source_wa.id=f.work_order_asset_id AND source_wa.organization_id=f.organization_id
           LEFT JOIN work_orders source_w ON source_w.id=source_wa.work_order_id AND source_w.organization_id=source_wa.organization_id
          WHERE admin_tasks.organization_id = ? AND admin_tasks.source NOT IN ('compliance','problem_report') AND admin_tasks.status IN ('open', 'in_progress')
          ORDER BY CASE admin_tasks.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                   CASE WHEN admin_tasks.due_at IS NULL THEN 1 ELSE 0 END, admin_tasks.due_at, admin_tasks.created_at
          LIMIT 100`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT
            SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
            SUM(CASE WHEN status = 'ready_to_assign' THEN 1 ELSE 0 END) AS unassignedCount,
            SUM(CASE WHEN status = 'technician_submitted' THEN 1 ELSE 0 END) AS qaCount,
            SUM(CASE WHEN status = 'ready_to_invoice' THEN 1 ELSE 0 END) AS invoiceCount
           FROM work_orders w
          WHERE w.organization_id = ? AND EXISTS (
            SELECT 1 FROM accounts a JOIN locations l ON l.id=w.location_id AND l.account_id=a.id
             WHERE a.id=w.account_id AND a.organization_id=w.organization_id
          )`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT COUNT(*) AS overdueCount FROM pm_plans p
           JOIN assets a ON a.id=p.asset_id AND a.organization_id=?
           WHERE p.status = 'active' AND p.next_due_on < date('now')`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT DISTINCT u.id, u.display_name AS name, u.email, r.name AS role
           FROM users u JOIN memberships m ON m.user_id = u.id AND m.organization_id = ? AND m.status = 'active'
           JOIN roles r ON r.id = m.role_id WHERE u.status = 'active'
          ORDER BY CASE r.name WHEN 'owner_administrator' THEN 1 WHEN 'operations_administrator' THEN 2 WHEN 'technician' THEN 3 ELSE 4 END, u.display_name`,
        ).bind(TECHFLEX_ORG_ID),
      ]);
    const counts = (workOrderCounts.results[0] ?? {}) as Record<
      string,
      number | null
    >;
    const onboarding = [
      {
        id: "system-email-intake",
        title: "Enter new external work-order notices",
        instructions:
          "Copy the email or portal details into the Manual Intake Inbox. Save incomplete records so the exact missing-data prompts and deadlines remain visible until resolved.",
        category: "Inbox",
        priority: "urgent",
        status: "open",
        assignedRole: "operations_administrator",
        dueAt: null,
        source: "system",
      },
      {
        id: "system-import-master-data",
        title: "Import the current account and technician workbook",
        instructions:
          "Upload Excel or CSV data, map the columns, review errors, then commit the valid rows.",
        category: "Data",
        priority: "high",
        status: "open",
        assignedRole: "operations_administrator",
        dueAt: null,
        source: "system",
      },
      {
        id: "system-qb-connect",
        title: "Connect or upload QuickBooks data",
        instructions:
          "Connect QuickBooks when credentials are available, or upload the customer, invoice, payment, and expense exports.",
        category: "Finance",
        priority: "normal",
        status: "open",
        assignedRole: "finance",
        dueAt: null,
        source: "system",
      },
    ];
    const generated = [
      Number(counts.newCount) > 0
        ? {
            id: "generated-new-work",
            title: `Price ${counts.newCount} new work orders`,
            category: "Work orders",
            priority: "urgent",
            status: "open",
            source: "generated",
          }
        : null,
      Number(counts.unassignedCount) > 0
        ? {
            id: "generated-unassigned",
            title: `Assign ${counts.unassignedCount} ready work orders`,
            category: "Dispatch",
            priority: "urgent",
            status: "open",
            source: "generated",
          }
        : null,
      Number(counts.qaCount) > 0
        ? {
            id: "generated-qa",
            title: `Review ${counts.qaCount} technician submissions`,
            category: "Quality",
            priority: "high",
            status: "open",
            source: "generated",
          }
        : null,
      Number(counts.invoiceCount) > 0
        ? {
            id: "generated-invoice",
            title: `Invoice ${counts.invoiceCount} completed work orders`,
            category: "Finance",
            priority: "high",
            status: "open",
            source: "generated",
          }
        : null,
      Number(
        (pmCounts.results[0] as { overdueCount?: number } | undefined)
          ?.overdueCount,
      ) > 0
        ? {
            id: "generated-pm",
            title: "Schedule overdue preventive maintenance",
            category: "HTM",
            priority: "urgent",
            status: "open",
            source: "generated",
          }
        : null,
      // No automatic credential tasks: evidence is reviewed only on request
      // within the career ladder. Manually requested tasks remain visible.
    ].filter(Boolean);
    return Response.json({
      tasks: [
        ...generated,
        ...stored.results.map((row) => {
          const task = row as Record<string, unknown> & {
            followUpJson?: string | null;
            repairCandidatesJson?: string | null;
          };
          const { followUpJson, repairCandidatesJson, ...plain } = task;
          return {
            ...plain,
            followUp: followUpJson ? JSON.parse(followUpJson) : null,
            repairCandidates: repairCandidatesJson
              ? JSON.parse(repairCandidatesJson)
              : [],
          };
        }),
        ...onboarding,
      ],
      assignees: assignees.results,
      canManageBiomedicalFollowUps: [
        "owner_administrator",
        "operations_administrator",
      ].includes(identity.role),
    }, { headers: privateNoStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const input = taskSchema.parse(await request.json());
    if (input.assignedUserId) {
      const assignee = await env.DB.prepare(
        `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.id = ? AND m.organization_id = ? AND m.status = 'active' AND u.status = 'active' LIMIT 1`,
      )
        .bind(input.assignedUserId, TECHFLEX_ORG_ID)
        .first();
      if (!assignee)
        return Response.json(
          { error: "Select an active TechFlex user." },
          { status: 400 },
        );
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO admin_tasks
        (id, organization_id, assigned_user_id, assigned_role, category, title, instructions, priority, status, source, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'manual', ?)`,
    )
      .bind(
        id,
        TECHFLEX_ORG_ID,
        input.assignedUserId || null,
        input.assignedRole || null,
        input.category,
        input.title,
        input.instructions || null,
        input.priority,
        input.dueAt || null,
      )
      .run();
    return Response.json(
      { task: { id, ...input, status: "open", source: "manual" } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Review the task details.", details: error.flatten() },
        { status: 400 },
      );
    }
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const input = z
      .object({
        id: z.string().min(1),
        status: z.enum(["open", "in_progress", "complete"]),
      })
      .parse(await request.json());
    if (input.id.startsWith("system-") || input.id.startsWith("generated-")) {
      return Response.json({
        task: { id: input.id, status: input.status, transient: true },
      });
    }
    const protectedTask = await env.DB.prepare("SELECT source FROM admin_tasks WHERE id=? AND organization_id=? AND source IN ('compliance','problem_report','biomedical_asset_progress')").bind(input.id, TECHFLEX_ORG_ID).first<{source:string}>();
    if (protectedTask?.source === "compliance") return Response.json({error:'Update compliance records from Compliance & Audits.'}, {status:403});
    if (protectedTask?.source === "problem_report") return Response.json({error:'Review problem reports from the Command Center.'}, {status:403});
    if (protectedTask?.source === "biomedical_asset_progress") return Response.json({error:'Record the verified parts and repair status before closing this follow-up.'}, {status:403});
    await env.DB.prepare(
      `UPDATE admin_tasks SET status = ?, completed_at = CASE WHEN ? = 'complete' THEN CURRENT_TIMESTAMP ELSE NULL END,
             completed_by = CASE WHEN ? = 'complete' THEN ? ELSE NULL END,
             record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
    )
      .bind(
        input.status,
        input.status,
        input.status,
        identity.userId,
        input.id,
        TECHFLEX_ORG_ID,
      )
      .run();
    return Response.json({ task: { id: input.id, status: input.status } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid task update." }, { status: 400 });
    }
    return apiError(error);
  }
}
