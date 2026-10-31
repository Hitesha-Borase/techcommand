import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  PortalHttpError,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { isAdministratorOnboardingAssigned } from "@/lib/onboarding-policy";

const administratorItems = [
  {
    key: "accounts",
    order: 1,
    title: "Load every active client account",
    detail:
      "Create SpinLife, Invacare, OnPoint, facility, manufacturer, retailer, and direct-pay accounts. Confirm billing email, terms, service level, and contract owner.",
    module: "accounts",
  },
  {
    key: "locations",
    order: 2,
    title: "Load every active service location",
    detail:
      "Add the full street address, department, access instructions, service window, and correct account relationship for every open assignment.",
    module: "locations",
  },
  {
    key: "customers",
    order: 3,
    title: "Create customer files",
    detail:
      "Enter each active recipient or facility contact, their account, service address, phone, email, external customer ID, and relevant notes.",
    module: "customers",
  },
  {
    key: "technicians",
    order: 4,
    title: "Complete technician and employee files",
    detail:
      "Add current technicians, regions, phone, employment type, availability, skills, and required employee documents. Credential evidence and CEUs are optional unless a career-ladder review is requested.",
    module: "technicians",
  },
  {
    key: "pricing",
    order: 5,
    title: "Confirm each account’s pricing rules",
    detail:
      "Review every job-type base rate, mileage rule, crew and stair fee, direct-cost assumptions, and gross-margin target. The floor cannot be below 40%.",
    module: "finance",
  },
  {
    key: "open_work_orders",
    order: 6,
    title: "Stage every open work order",
    detail:
      "Paste each assignment, reminder, or cancellation into the Manual Intake Inbox. Clear every prompt for the full WO suffix, linked customer file, location, equipment, complaint, authorization, deadline, schedule, and technician requirements before releasing it to pricing.",
    module: "work-orders",
  },
  {
    key: "documents",
    order: 7,
    title: "File required company and account documents",
    detail:
      "Upload contracts, rate sheets, policies, procedures, licenses, insurance, W-9s, accreditation records, and customer- or technician-specific documents.",
    module: "documents",
  },
  {
    key: "assets",
    order: 8,
    title: "Load biomedical equipment inventory",
    detail:
      "Enter each facility asset with tag, manufacturer, model, serial, department, risk class, PM interval, last PM, and next due date.",
    module: "assets",
  },
  {
    key: "validate",
    order: 9,
    title: "Reconcile and validate the live queue",
    detail:
      "Confirm no duplicate work orders, unresolved intake prompts, unreviewed cancellations, missing addresses, orphaned assets, underpriced assignments, or incomplete work-order document requirements remain. Credentials and CEUs are reviewed only for a requested career-ladder review.",
    module: "command",
  },
];

const technicianItems = [
  {
    key: "technician_profile",
    order: 1,
    title: "Confirm your profile and dispatch origin",
    detail:
      "Review your name, employment profile, service territory, and the address dispatch should use when calculating your routes. Credential evidence is needed only for a requested career-ladder review.",
    module: "profile",
  },
  {
    key: "technician_calendar",
    order: 2,
    title: "Confirm your calendar setup",
    detail:
      "Review your TechCommand schedule. Personal Google Calendar connection becomes available after the company calendar connector is activated; dispatch can still schedule work inside TechCommand now.",
    module: "route",
  },
  {
    key: "technician_route",
    order: 3,
    title: "Review today’s route",
    detail:
      "Open the Route tab, verify each stop and scheduled time, and use Navigate for live turn-by-turn directions.",
    module: "route",
  },
  {
    key: "technician_status",
    order: 4,
    title: "Learn the job status sequence",
    detail:
      "Use Start travel, Mark arrived, Begin service, and Complete job so dispatch sees current progress without calling you.",
    module: "today",
  },
  {
    key: "technician_evidence",
    order: 5,
    title: "Review evidence and completion requirements",
    detail:
      "Each job guides you through identification, multiple required photos, diagnostics, work performed, final testing, outcome, customer acknowledgment, and submission.",
    module: "today",
  },
  {
    key: "technician_pay",
    order: 6,
    title: "Review pay and acknowledgment",
    detail:
      "The Pay tab shows only your approved work, payment status, and weekly statements. Acknowledge each statement after reviewing it.",
    module: "pay",
  },
];

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    const scope = identity.role === "technician" ? "technician"
      : isAdministratorOnboardingAssigned(TECHFLEX_ORG_ID, identity) ? "administrator" : "none";
    const items = scope === "technician" ? technicianItems : scope === "administrator" ? administratorItems : [];
    if (scope === "none") {
      return Response.json({ items, role: identity.role, scope, userId: identity.userId }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const progress = await env.DB.prepare(
      "SELECT item_key AS itemKey, status, completed_at AS completedAt FROM onboarding_progress WHERE organization_id = ? AND user_id = ?",
    )
      .bind(TECHFLEX_ORG_ID, identity.userId)
      .all<{ itemKey: string; status: string; completedAt: string }>();
    const map = new Map<
      string,
      { itemKey: string; status: string; completedAt: string }
    >(
      progress.results.map(
        (row: { itemKey: string; status: string; completedAt: string }) => [
          String(row.itemKey),
          row,
        ],
      ),
    );
    return Response.json({
      items: items.map((item) => ({
        ...item,
        status: map.get(item.key)?.status || "open",
        completedAt: map.get(item.key)?.status === "complete" ? map.get(item.key)?.completedAt || null : null,
      })),
      role: identity.role,
      scope,
      userId: identity.userId,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    if (identity.role !== "technician" && !isAdministratorOnboardingAssigned(TECHFLEX_ORG_ID, identity)) {
      throw new PortalHttpError(403, "Administrative setup is assigned to another team member.");
    }
    const items = identity.role === "technician" ? technicianItems : administratorItems;
    const input = z
      .object({
        itemKey: z.enum(items.map((item) => item.key) as [string, ...string[]]),
        status: z.enum(["open", "complete"]),
      })
      .parse(await request.json());
    const result = await env.DB.prepare(
      `INSERT INTO onboarding_progress (id, organization_id, user_id, item_key, status, completed_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, item_key) DO UPDATE SET
         status=excluded.status,
         completed_at=CASE WHEN excluded.status = 'complete' AND onboarding_progress.status = 'complete'
           THEN onboarding_progress.completed_at
           ELSE excluded.completed_at END,
         updated_at=CURRENT_TIMESTAMP
       WHERE onboarding_progress.organization_id = excluded.organization_id`,
    )
      .bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.itemKey,
        input.status,
      )
      .run();
    if (!result.meta.changes) {
      throw new PortalHttpError(409, "Setup progress could not be saved. Ask your administrator to review the assignment.");
    }
    return Response.json({ progress: input }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Select a valid onboarding item." },
        { status: 400 },
      );
    return apiError(error);
  }
}
