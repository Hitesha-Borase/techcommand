import { trainingAssignmentError } from "@/lib/training-dispatch";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;
import {
  calculatePricing,
  defaultPricingPolicy,
  type PricingPolicy,
} from "@/lib/techflex-pricing";

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS link.");

const inputSchema = z.object({
  intakeId: z.string().trim().optional().nullable(),
  accountId: z.string().min(1),
  locationId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  technicianId: z.string().optional().nullable(),
  externalSource: z.string().trim().max(80).default("manual"),
  externalId: z.string().trim().min(2).max(120),
  serviceType: z.enum([
    "evaluation",
    "repair_single",
    "repair_multi",
    "frame_repair",
    "hourly_service",
    "biomed_service_call",
    "consumer_install",
    "wgd_basic",
    "wgd_complex",
    "bed_delivery",
    "biomed_pm_a",
    "biomed_pm_b",
    "biomed_pm_c",
    "biomed_pm_d",
  ]),
  summary: z.string().trim().min(2).max(240),
  rawText: z.string().trim().max(30000).optional().nullable(),
  noticeType: z.string().trim().max(80).optional().nullable(),
  sourceDetailUrl: httpUrl.optional().nullable(),
  responseRequirement: z.string().trim().max(1000).optional().nullable(),
  responseDueAt: z.string().datetime().optional().nullable(),
  customerName: z.string().trim().max(240).optional().nullable(),
  customerPhone: z.string().trim().max(80).optional().nullable(),
  customerEmail: z.string().trim().max(320).optional().nullable(),
  serviceAddress: z.string().trim().max(1000).optional().nullable(),
  customerComplaint: z.string().trim().max(5000).optional().nullable(),
  equipmentType: z.string().trim().max(240).optional().nullable(),
  manufacturer: z.string().trim().max(120).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  serialNumber: z.string().trim().max(120).optional().nullable(),
  reimbursement: z.number().min(0).max(1000000),
  roundTripMiles: z.number().min(0).max(10000).default(0),
  driveHours: z.number().min(0).max(200).default(0),
  onsiteHours: z.number().min(0).max(200).default(1),
  technicianCount: z.number().int().min(1).max(10).default(1),
  weightLb: z.number().min(0).max(10000).default(0),
  partsCount: z.number().int().min(0).max(100).default(0),
  stairsCount: z.number().int().min(0).max(20).default(0),
  hotelCost: z.number().min(0).max(10000).default(0),
  partsCost: z.number().min(0).max(100000).default(0),
  assetCount: z.number().int().min(1).max(10000).default(1),
  scheduledStart: z.string().optional().nullable(),
  shipmentStatus: z.string().trim().max(120).optional().nullable(),
  accessInstructions: z.string().trim().max(5000).optional().nullable(),
});

function instructionSet(serviceType: string) {
  const common = [
    "Confirm customer, service address, manufacturer, model, and serial number",
    "Photograph the equipment and surrounding area before work",
    "Document the customer complaint in the customer’s words",
    "Perform and document a safety inspection",
    "Record findings, work performed, test results, and final operating condition",
    "Capture required after photos and obtain customer acknowledgement",
  ];
  if (serviceType.startsWith("wgd") || serviceType === "bed_delivery")
    return [
      ...common,
      "Photograph packaging and freight condition before opening",
      "Verify every carton, accessory, and serial-number label",
      "Complete assembly and full functional test",
      "Demonstrate operation, charging, controls, and safety features to the customer",
    ];
  if (
    serviceType.startsWith("repair") ||
    serviceType === "evaluation" ||
    serviceType === "hourly_service"
  )
    return [
      ...common,
      "Reproduce the reported symptom before replacing parts",
      "Follow the manufacturer’s model-specific diagnostic sequence",
      "Record fault codes, voltage readings, adjustments, and parts used",
      "Complete a loaded functional test after the repair",
    ];
  if (serviceType.startsWith("biomed_pm"))
    return [
      ...common,
      "Confirm facility, department, asset tag, risk class, and PM interval",
      "Inspect structural, mechanical, electrical, alarm, battery, and safety functions applicable to the device",
      "Record measured values, calibration or performance results, and pass/fail disposition",
      "Apply the PM label and record the next due date",
      "Quarantine and escalate any device that fails a safety-critical test",
    ];
  return common;
}

function counterofferDraft(source: string, externalId: string, amount: number) {
  const formatted = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  if (source === "spinlife")
    return `Thank you for sending work order ${externalId}. Based on the required service scope, round-trip travel, technician coverage, and the applicable TechFlex rate structure, our authorized total for this assignment is ${formatted}. Please update the FaST authorization and confirm so we can accept and schedule the work.`;
  if (source === "invacare")
    return `Thank you for the service request for ${externalId}. Using TechFlex’s long-distance quote method and the required field-service scope, our authorized total is ${formatted}. Please confirm the revised purchase-order or service authorization so we can schedule coverage.`;
  if (source === "onpoint")
    return `We reviewed service request ${externalId}. The approved not-to-exceed amount required for travel, diagnostics, field labor, and completion documentation is ${formatted}. Please confirm the revised NTE authorization before dispatch.`;
  if (source === "direct")
    return `We completed the service-cost review for ${externalId}. The TechFlex authorized estimate is ${formatted}, including the applicable service scope and travel. Please approve the estimate so we can schedule the work.`;
  return `Thank you for sending work order ${externalId}. Based on the required service scope, travel, technician coverage, and TechFlex’s pricing structure, our authorized total for this assignment is ${formatted}. Please confirm the revised authorization so we can schedule the work.`;
}

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
    const technicianWhere =
      identity.role === "technician" ? "AND t.id = ?" : "";
    const requestedId = new URL(request.url).searchParams.get("id");
    const query = `SELECT w.id, w.external_id AS externalId, w.external_source AS externalSource,
              w.service_type AS serviceType, w.priority, w.status, w.summary, w.description,
              w.required_technician_count AS technicianCount, w.product_weight_lb AS weightLb,
              w.stairs_count AS stairsCount, w.scheduled_start AS scheduledStart,
              w.offered_payment_cents AS offeredPaymentCents,
              w.accepted_price_cents AS acceptedPriceCents, w.estimated_cost_cents AS estimatedCostCents,
              w.gross_margin_basis_points AS grossMarginBasisPoints, a.name AS accountName,
              l.name AS locationName, l.city, l.state, t.id AS technicianId,
              COALESCE(u.display_name, t.technician_code) AS technicianName, p.payout_cents AS technicianPayCents
         FROM work_orders w
         JOIN accounts a ON a.id = w.account_id AND a.organization_id = w.organization_id
         JOIN locations l ON l.id = w.location_id AND l.account_id = w.account_id
         LEFT JOIN work_order_assignments wa ON wa.work_order_id = w.id AND wa.status != 'declined'
         LEFT JOIN technicians t ON t.id = wa.technician_id AND t.organization_id = w.organization_id
         LEFT JOIN users u ON u.id = t.user_id AND EXISTS (
           SELECT 1 FROM memberships tm WHERE tm.user_id = t.user_id AND tm.organization_id = w.organization_id AND tm.status = 'active'
         )
         LEFT JOIN technician_payouts p ON p.work_order_id = w.id AND p.technician_id = t.id
        WHERE w.organization_id = ? ${technicianWhere} ${requestedId ? "AND w.id = ?" : ""}
        ORDER BY CASE w.status WHEN 'new' THEN 1 WHEN 'pricing_review' THEN 2 WHEN 'ready_to_assign' THEN 3 WHEN 'assigned' THEN 4 ELSE 8 END, w.created_at DESC LIMIT 200`;
    const statement = env.DB.prepare(query).bind(TECHFLEX_ORG_ID, ...(identity.role === "technician" ? [identity.technicianId] : []), ...(requestedId ? [requestedId] : []));
    const result = await statement.all();
    return Response.json({ workOrders: result.results }, { headers: privateNoStore });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const input = inputSchema.parse(await request.json());
    if (input.externalSource.replace(/\s/g, "").toLowerCase() === "spinlife") {
      const existingSimple = await env.DB.prepare(`SELECT i.id FROM work_order_intakes i JOIN spinlife_visits v ON v.intake_id=i.id
        WHERE i.organization_id=? AND lower(replace(i.source,' ',''))='spinlife' AND i.external_id=? LIMIT 1`)
        .bind(TECHFLEX_ORG_ID,input.externalId).first();
      if(existingSimple) return Response.json({error:"This order is already in the SpinLife portal. Open its existing record to avoid duplicate service or billing."},{status:409});
    }
    if (input.intakeId) {
      const intake = await env.DB.prepare(
        "SELECT status, source, external_id AS externalId FROM work_order_intakes WHERE id = ? AND organization_id = ?",
      )
        .bind(input.intakeId, TECHFLEX_ORG_ID)
        .first<{ status: string; source: string; externalId: string | null }>();
      if (!intake)
        return Response.json(
          { error: "The manual intake record was not found." },
          { status: 404 },
        );
      if (intake.status !== "ready_for_pricing")
        return Response.json(
          {
            error:
              "Complete every critical intake prompt before creating the work order.",
          },
          { status: 409 },
        );
      if (
        (intake.externalId && intake.externalId !== input.externalId) ||
        intake.source !== input.externalSource
      )
        return Response.json(
          {
            error:
              "The work-order number or source no longer matches the intake record.",
          },
          { status: 409 },
        );
    }
    const hierarchy = await env.DB.prepare(
      "SELECT l.id, a.account_type AS accountType FROM locations l JOIN accounts a ON a.id = l.account_id WHERE l.id = ? AND a.id = ? AND a.organization_id = ? AND l.status = 'active' AND a.status = 'active'",
    )
      .bind(input.locationId, input.accountId, TECHFLEX_ORG_ID)
      .first<{ id: string; accountType: string }>();
    if (!hierarchy)
      return Response.json(
        { error: "The selected location does not belong to that account." },
        { status: 400 },
      );
    if (input.customerId) {
      const customer = await env.DB.prepare(
        "SELECT id FROM customers WHERE id = ? AND account_id = ? AND organization_id = ? AND status = 'active'",
      )
        .bind(input.customerId, input.accountId, TECHFLEX_ORG_ID)
        .first();
      if (!customer)
        return Response.json(
          { error: "The selected customer does not belong to that account." },
          { status: 400 },
        );
    }
    if (input.assetId) {
      const asset = await env.DB.prepare(
        "SELECT id FROM assets WHERE id = ? AND account_id = ? AND location_id = ? AND organization_id = ? AND status != 'retired'",
      )
        .bind(input.assetId, input.accountId, input.locationId, TECHFLEX_ORG_ID)
        .first();
      if (!asset)
        return Response.json(
          {
            error:
              "The selected asset must belong to this account and location.",
          },
          { status: 400 },
        );
    }
    if (input.technicianId) {
      const trainingError = await trainingAssignmentError(input.technicianId, "", "primary");
      if (trainingError) return Response.json({error:trainingError},{status:409});
      const technician = await env.DB.prepare(
        "SELECT id FROM technicians WHERE id = ? AND organization_id = ? AND status = 'active'",
      )
        .bind(input.technicianId, TECHFLEX_ORG_ID)
        .first();
      if (!technician)
        return Response.json(
          { error: "Select an active technician." },
          { status: 400 },
        );
    }
    const policyRow = await env.DB.prepare(
      `SELECT target_gross_margin_bps AS targetGrossMarginBps, mileage_rate_cents AS mileageRateCents,
      consumer_mileage_rate_cents AS consumerMileageRateCents, consumer_free_miles AS consumerFreeMiles, fuel_per_drive_hour_cents AS fuelPerDriveHourCents,
      technician_hourly_cost_cents AS technicianHourlyCostCents, operating_allowance_per_hour_cents AS operatingAllowancePerHourCents,
      additional_technician_fee_cents AS additionalTechnicianFeeCents, stairs_fee_cents AS stairsFeeCents, pricing_rules_json AS pricingRulesJson
      FROM account_pricing_policies WHERE account_id = ? AND status = 'active' LIMIT 1`,
    )
      .bind(input.accountId)
      .first<Record<string, number | string>>();
    const policy: PricingPolicy = policyRow
      ? {
          targetGrossMargin: Math.max(
            0.4,
            Number(policyRow.targetGrossMarginBps) / 10000,
          ),
          mileageRate: Number(policyRow.mileageRateCents) / 100,
          consumerMileageRate: Number(policyRow.consumerMileageRateCents) / 100,
          consumerFreeMiles: Number(policyRow.consumerFreeMiles ?? 10),
          fuelPerDriveHour: Number(policyRow.fuelPerDriveHourCents) / 100,
          technicianHourlyCost:
            Number(policyRow.technicianHourlyCostCents) / 100,
          operatingAllowancePerHour:
            Number(policyRow.operatingAllowancePerHourCents) / 100,
          additionalTechnicianFee:
            Number(policyRow.additionalTechnicianFeeCents) / 100,
          stairsFee: Number(policyRow.stairsFeeCents) / 100,
          serviceRules: policyRow.pricingRulesJson ? JSON.parse(String(policyRow.pricingRulesJson)) : defaultPricingPolicy.serviceRules,
        }
      : defaultPricingPolicy;
    const calculation = calculatePricing(
      {
        ...input,
        consumerPricing: hierarchy.accountType === "direct_customer",
      },
      policy,
    );
    const workOrderId = crypto.randomUUID();
    const estimateId = crypto.randomUUID();
    const estimateNumber = `EST-${input.externalId}`;
    const instructions = instructionSet(input.serviceType);
    const status =
      calculation.decision === "counteroffer_required"
        ? "pricing_review"
        : input.technicianId && calculation.requiredTechnicianCount === 1
          ? "assigned"
          : "ready_to_assign";
    const description = [
      input.customerName || input.customerPhone || input.customerEmail
        ? `Customer: ${[
            input.customerName,
            input.customerPhone,
            input.customerEmail,
          ]
            .filter(Boolean)
            .join(" · ")}`
        : "",
      input.serviceAddress ? `Service address: ${input.serviceAddress}` : "",
      input.customerComplaint
        ? `Customer complaint: ${input.customerComplaint}`
        : "",
      input.equipmentType ||
      input.manufacturer ||
      input.model ||
      input.serialNumber
        ? `Equipment: ${[
            input.equipmentType,
            input.manufacturer,
            input.model,
            input.serialNumber ? `S/N ${input.serialNumber}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}`
        : "",
      input.shipmentStatus ? `Shipment status: ${input.shipmentStatus}` : "",
      input.accessInstructions
        ? `Access instructions: ${input.accessInstructions}`
        : "",
      input.responseRequirement
        ? `Response requirement: ${input.responseRequirement}`
        : "",
      input.sourceDetailUrl ? `Source detail: ${input.sourceDetailUrl}` : "",
      input.rawText ? `Original intake:\n${input.rawText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const marginBps = Math.round(calculation.grossMargin * 10000);
    const pricingSnapshot = {
      version: "techflex-2026.09-account-policy",
      marginFloor: calculation.marginFloor,
      policy,
      input,
      calculation,
      instructions,
    };

    const statements = [
      env.DB.prepare(`SELECT CASE WHEN ?!= 'spinlife' OR NOT EXISTS (
        SELECT 1 FROM work_order_intakes i JOIN spinlife_visits v ON v.intake_id=i.id
        WHERE i.organization_id=? AND lower(replace(i.source,' ',''))='spinlife' AND i.external_id=?
      ) THEN 1 ELSE json('spinlife_duplicate_conflict') END`).bind(input.externalSource.replace(/\s/g, "").toLowerCase(),TECHFLEX_ORG_ID,input.externalId),
      env.DB.prepare(
        `INSERT INTO work_orders (id, organization_id, account_id, location_id, customer_id, asset_id, external_source, external_id, service_type, priority, status, summary, description, required_skills_json, required_technician_count, product_weight_lb, stairs_count, scheduled_start, offered_payment_cents, accepted_price_cents, estimated_cost_cents, gross_margin_basis_points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        workOrderId,
        TECHFLEX_ORG_ID,
        input.accountId,
        input.locationId,
        input.customerId || null,
        input.assetId || null,
        input.externalSource,
        input.externalId,
        input.serviceType,
        status,
        input.summary,
        description || null,
        JSON.stringify({
          instructions,
          equipmentType: input.equipmentType,
          manufacturer: input.manufacturer,
          model: input.model,
          serialNumber: input.serialNumber,
        }),
        calculation.requiredTechnicianCount,
        input.weightLb || null,
        input.stairsCount,
        input.scheduledStart || null,
        Math.round(input.reimbursement * 100),
        calculation.decision === "authorized"
          ? Math.round(input.reimbursement * 100)
          : null,
        Math.round(calculation.estimatedCost * 100),
        marginBps,
      ),
      env.DB.prepare(
        `INSERT INTO estimates (id, work_order_id, account_id, estimate_number, status, subtotal_cents, total_cents, estimated_cost_cents, gross_margin_basis_points, pricing_snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        estimateId,
        workOrderId,
        input.accountId,
        estimateNumber,
        calculation.decision,
        Math.round(calculation.requiredBid * 100),
        Math.round(calculation.requiredBid * 100),
        Math.round(calculation.estimatedCost * 100),
        marginBps,
        JSON.stringify(pricingSnapshot),
      ),
      env.DB.prepare(
        `INSERT INTO work_order_events (id, work_order_id, event_type, actor_user_id, source, payload_json) VALUES (?, ?, 'intake.created', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        workOrderId,
        identity.userId,
        input.externalSource,
        JSON.stringify({ pricing: calculation, instructions }),
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'work_order.created', 'work_order', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        workOrderId,
        JSON.stringify({ input, calculation, status }),
      ),
    ];
    if (input.technicianId) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO work_order_assignments (id, work_order_id, technician_id, role, status, responded_at) VALUES (?, ?, ?, 'primary', ?, CASE WHEN ? = 'assigned' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
        ).bind(
          crypto.randomUUID(),
          workOrderId,
          input.technicianId,
          status === "assigned" ? "assigned" : "proposed",
          status,
        ),
      );
      if (status === "assigned")
        statements.push(
          env.DB.prepare(
            `INSERT INTO technician_payouts (id, technician_id, work_order_id, status, basis_type, basis_rate, gross_revenue_cents, payout_cents) VALUES (?, ?, ?, 'pending', 'margin_remainder', ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            input.technicianId,
            workOrderId,
            1 - calculation.marginFloor,
            Math.round(input.reimbursement * 100),
            Math.round(calculation.technicianPay * 100),
          ),
        );
    }
    if (calculation.counteroffer) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO admin_tasks (id, organization_id, account_id, work_order_id, assigned_user_id, assigned_role, category, title, instructions, priority, status, source, source_record_id) VALUES (?, ?, ?, ?, ?, 'operations_administrator', 'Pricing', ?, ?, 'urgent', 'open', 'pricing_engine', ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          input.accountId,
          workOrderId,
          identity.userId,
          `Send counteroffer for ${input.externalId}`,
          `Offered payment is $${input.reimbursement.toFixed(2)} and is not approved TechFlex revenue. Projected margin is $${calculation.projectedMargin.toFixed(2)} after $${calculation.technicianLabor.toFixed(2)} onsite labor, $${calculation.driveTimeLabor.toFixed(2)} drive-time labor, $${calculation.roundTripMileage.toFixed(2)} round-trip mileage, and $${calculation.otherExpenses.toFixed(2)} other expenses. Counter at $${calculation.counteroffer.toFixed(2)} to meet contract rules and the ${(calculation.marginFloor * 100).toFixed(0)}% margin floor. Dispatch remains blocked until revised authorization is confirmed.`,
          `counteroffer:${workOrderId}`,
        ),
      );
    }
    if (input.intakeId) {
      statements.push(
        env.DB.prepare(
          `UPDATE work_order_intakes
              SET status = 'converted', converted_work_order_id = ?, reviewed_at = CURRENT_TIMESTAMP,
                  reviewed_by = ?, updated_by = ?, record_version = record_version + 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND organization_id = ? AND status = 'ready_for_pricing'`,
        ).bind(
          workOrderId,
          identity.userId,
          identity.userId,
          input.intakeId,
          TECHFLEX_ORG_ID,
        ),
        env.DB.prepare(
          `UPDATE admin_tasks
              SET status = 'complete', completed_at = CURRENT_TIMESTAMP, completed_by = ?,
                  record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE source = 'work_order_intake' AND source_record_id = ?`,
        ).bind(identity.userId, `intake:${input.intakeId}`),
        env.DB.prepare(
          `UPDATE attachments SET entity_type = 'work_order', entity_id = ?
            WHERE organization_id = ? AND entity_type = 'work_order_intake' AND entity_id = ?`,
        ).bind(workOrderId, TECHFLEX_ORG_ID, input.intakeId),
        env.DB.prepare(
          `UPDATE document_records SET scope_type = 'work_order', scope_id = ?
            WHERE organization_id = ? AND scope_type = 'work_order_intake' AND scope_id = ?`,
        ).bind(workOrderId, TECHFLEX_ORG_ID, input.intakeId),
      );
    }
    await env.DB.batch(statements);
    const account = await env.DB.prepare(
      "SELECT name FROM accounts WHERE id = ?",
    )
      .bind(input.accountId)
      .first<{ name: string }>();
    const counterofferMessage = calculation.counteroffer
      ? counterofferDraft(
          input.externalSource,
          input.externalId,
          calculation.counteroffer,
        )
      : null;
    return Response.json(
      {
        workOrder: {
          id: workOrderId,
          externalId: input.externalId,
          status,
          instructions,
        },
        pricing: calculation,
        counterofferMessage,
        accountName: account?.name,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Review the work-order intake fields.",
          details: error.flatten(),
        },
        { status: 400 },
      );
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
      "technician",
    ]);

    const body = await request.json();

    const input = z
      .object({
        id: z.string().min(1),
        reimbursement: z.number().min(0).max(1000000),
        technicianId: z.string().optional().nullable(),
        scheduledStart: z.string().optional().nullable(),
      })
      .parse(body);

    const workOrder = await env.DB.prepare(
      `SELECT w.id, w.account_id AS accountId, w.location_id AS locationId, w.service_type AS serviceType,
              w.product_weight_lb AS weightLb, w.stairs_count AS stairsCount,
              w.required_technician_count AS technicianCount,
              a.account_type AS accountType,
              (SELECT wa.id FROM work_order_assignments wa WHERE wa.work_order_id = w.id LIMIT 1) AS assignmentId,
              (SELECT wa.technician_id FROM work_order_assignments wa WHERE wa.work_order_id = w.id LIMIT 1) AS assignedTechnicianId
         FROM work_orders w
         JOIN accounts a ON a.id = w.account_id
        WHERE (w.id = ? OR w.external_id = ?) AND w.organization_id = ?`,
    )
      .bind(input.id, input.id, TECHFLEX_ORG_ID)
      .first<{
        id: string;
        accountId: string;
        locationId: string;
        serviceType: string;
        weightLb: number | null;
        stairsCount: number | null;
        technicianCount: number | null;
        accountType: string;
        assignmentId: string | null;
        assignedTechnicianId: string | null;
      }>();

    if (!workOrder) {
      return Response.json(
        { error: "Work order not found." },
        { status: 404 },
      );
    }

    const policyRow = await env.DB.prepare(
      `SELECT target_gross_margin_bps AS targetGrossMarginBps, mileage_rate_cents AS mileageRateCents,
       consumer_mileage_rate_cents AS consumerMileageRateCents, consumer_free_miles AS consumerFreeMiles, fuel_per_drive_hour_cents AS fuelPerDriveHourCents,
       technician_hourly_cost_cents AS technicianHourlyCostCents, operating_allowance_per_hour_cents AS operatingAllowancePerHourCents,
       additional_technician_fee_cents AS additionalTechnicianFeeCents, stairs_fee_cents AS stairsFeeCents, pricing_rules_json AS pricingRulesJson
       FROM account_pricing_policies WHERE account_id = ? AND status = 'active' LIMIT 1`,
    )
      .bind(workOrder.accountId)
      .first<Record<string, number | string>>();

    const policy: PricingPolicy = policyRow
      ? {
          targetGrossMargin: Math.max(
            0.4,
            Number(policyRow.targetGrossMarginBps) / 10000,
          ),
          mileageRate: Number(policyRow.mileageRateCents) / 100,
          consumerMileageRate: Number(policyRow.consumerMileageRateCents) / 100,
          consumerFreeMiles: Number(policyRow.consumerFreeMiles ?? 10),
          fuelPerDriveHour: Number(policyRow.fuelPerDriveHourCents) / 100,
          technicianHourlyCost:
            Number(policyRow.technicianHourlyCostCents) / 100,
          operatingAllowancePerHour:
            Number(policyRow.operatingAllowancePerHourCents) / 100,
          additionalTechnicianFee:
            Number(policyRow.additionalTechnicianFeeCents) / 100,
          stairsFee: Number(policyRow.stairsFeeCents) / 100,
          serviceRules: policyRow.pricingRulesJson ? JSON.parse(String(policyRow.pricingRulesJson)) : defaultPricingPolicy.serviceRules,
        }
      : defaultPricingPolicy;

    const calculation = calculatePricing(
      {
        serviceType: workOrder.serviceType,
        reimbursement: input.reimbursement,
        roundTripMiles: 0,
        driveHours: 0,
        onsiteHours: 1,
        technicianCount: workOrder.technicianCount || 1,
        weightLb: workOrder.weightLb || 0,
        partsCount: 0,
        stairsCount: workOrder.stairsCount || 0,
        hotelCost: 0,
        partsCost: 0,
        assetCount: 1,
        consumerPricing: workOrder.accountType === "direct_customer",
      },
      policy,
    );

    const targetTechId = input.technicianId !== undefined ? (input.technicianId || null) : workOrder.assignedTechnicianId;
    const finalTechId = targetTechId === "unassigned" ? null : targetTechId;
    const isAuthorized = input.reimbursement > 0;
    (calculation as { decision: string }).decision = isAuthorized ? "authorized" : calculation.decision;
    const marginBps = isAuthorized ? Math.max(4000, Math.round((calculation.grossMargin || 0.4) * 10000)) : 0;
    const patchStatus = !isAuthorized
      ? "pricing_review"
      : finalTechId && calculation.requiredTechnicianCount === 1
        ? "assigned"
        : "ready_to_assign";

    const status =
      calculation.decision === "counteroffer_required"
        ? "pricing_review"
        : finalTechId && calculation.requiredTechnicianCount === 1
          ? "assigned"
          : "ready_to_assign";


    const statements = [
      env.DB.prepare(
        `UPDATE work_orders SET
           offered_payment_cents = ?,
           accepted_price_cents = ?,
           estimated_cost_cents = ?,
           gross_margin_basis_points = ?,
           status = ?,
           scheduled_start = COALESCE(?, scheduled_start),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      ).bind(
        Math.round(input.reimbursement * 100),
        calculation.decision === "authorized"
          ? Math.round(input.reimbursement * 100)
          : null,
        Math.round(calculation.estimatedCost * 100),
        marginBps,
        status,
        input.scheduledStart || null,
        workOrder.id,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `UPDATE estimates SET
           status = ?,
           subtotal_cents = ?,
           total_cents = ?,
           estimated_cost_cents = ?,
           gross_margin_basis_points = ?
         WHERE work_order_id = ?`,
      ).bind(
        calculation.decision,
        Math.round(calculation.requiredBid * 100),
        Math.round(calculation.requiredBid * 100),
        Math.round(calculation.estimatedCost * 100),
        marginBps,
        workOrder.id,
      ),
      env.DB.prepare(
        `INSERT INTO work_order_events (id, work_order_id, event_type, actor_user_id, source, payload_json)
         VALUES (?, ?, 'pricing.updated', ?, 'portal', ?)`,
      ).bind(
        crypto.randomUUID(),
        workOrder.id,
        identity.userId,
        JSON.stringify({ reimbursement: input.reimbursement, status, calculation }),
      ),
    ];

    if (finalTechId) {
      if (workOrder.assignmentId) {
        statements.push(
          env.DB.prepare(
            `UPDATE work_order_assignments SET
               technician_id = ?,
               status = CASE WHEN ? = 'assigned' THEN 'assigned' ELSE 'proposed' END,
               responded_at = CASE WHEN ? = 'assigned' THEN CURRENT_TIMESTAMP ELSE responded_at END
             WHERE id = ?`,
          ).bind(finalTechId, status, status, workOrder.assignmentId),
        );
      } else {
        statements.push(
          env.DB.prepare(
            `INSERT INTO work_order_assignments (id, work_order_id, technician_id, role, status, responded_at)
             VALUES (?, ?, ?, 'primary', CASE WHEN ? = 'assigned' THEN 'assigned' ELSE 'proposed' END, CASE WHEN ? = 'assigned' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          ).bind(crypto.randomUUID(), workOrder.id, finalTechId, status, status),
        );
      }
    } else if (input.technicianId === "unassigned" && workOrder.assignmentId) {
      statements.push(
        env.DB.prepare(`DELETE FROM work_order_assignments WHERE id = ?`).bind(workOrder.assignmentId),
      );
    }

    await env.DB.batch(statements);

    return Response.json({
      ok: true,
      status,
      pricing: calculation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Review the update fields.", details: error.flatten() },
        { status: 400 },
      );
    }
    return apiError(error);
  }
}


function _unusedOld() { return null; }
/*
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "technician",
    ]);
    return Response.json(
      {
        error:

      },

    );
  } catch (error) {
    return apiError(error);
  }
}

*/
export async function legacyWorkOrderCompletion(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "technician",
    ]);
    const input = z
      .object({
        id: z.string().min(1),
        findings: z.string().trim().min(10).max(10000),
        workPerformed: z.string().trim().min(10).max(10000),
        recommendation: z.string().trim().max(10000).optional().nullable(),
        customerSignatureName: z.string().trim().min(2).max(160),
        assetDisposition: z
          .enum([
            "passed",
            "returned_to_service",
            "parts_required",
            "follow_up_required",
            "quarantined",
            "retired",
          ])
          .default("returned_to_service"),
        checklist: z
          .array(
            z.object({ label: z.string().max(500), complete: z.boolean() }),
          )
          .min(1)
          .max(50),
      })
      .parse(await request.json());
    if (input.checklist.some((item) => !item.complete))
      return Response.json(
        {
          error:
            "Complete every required field-service checkpoint before submission.",
        },
        { status: 400 },
      );
    const workOrder = await env.DB.prepare(
      `SELECT w.id, w.external_id AS externalId, w.account_id AS accountId, w.asset_id AS assetId, w.service_type AS serviceType, w.accepted_price_cents AS acceptedPriceCents, w.summary, w.status,
      wa.technician_id AS technicianId, a.name AS accountName, l.name AS locationName, l.city, l.state,
      COALESCE(u.display_name, t.technician_code) AS technicianName
      FROM work_orders w JOIN accounts a ON a.id = w.account_id JOIN locations l ON l.id = w.location_id
      LEFT JOIN work_order_assignments wa ON wa.work_order_id = w.id AND wa.status = 'assigned'
      LEFT JOIN technicians t ON t.id = wa.technician_id LEFT JOIN users u ON u.id = t.user_id
      WHERE w.id = ? AND w.organization_id = ? LIMIT 1`,
    )
      .bind(input.id, input.id, TECHFLEX_ORG_ID)
      .first<{
        id: string;
        externalId: string;
        accountId: string;
        assetId: string | null;
        serviceType: string;
        acceptedPriceCents: number;
        summary: string;
        status: string;
        technicianId: string | null;
        accountName: string;
        locationName: string;
        city: string;
        state: string;
        technicianName: string | null;
      }>();
    if (!workOrder)
      return Response.json({ error: "Work order not found." }, { status: 404 });
    if (workOrder.status === "pricing_review")
      return Response.json(
        {
          error:
            "This work order cannot be completed until the counteroffer is authorized at the required margin.",
        },
        { status: 409 },
      );
    if (!workOrder.technicianId)
      return Response.json(
        { error: "Assign a technician before completing the work order." },
        { status: 400 },
      );
    if (
      identity.role === "technician" &&
      identity.technicianId !== workOrder.technicianId
    )
      return Response.json(
        { error: "This work order is not assigned to you." },
        { status: 403 },
      );
    const reportId = crypto.randomUUID();
    const invoiceId = crypto.randomUUID();
    const invoiceNumber = `INV-${workOrder.externalId}`;
    const total = workOrder.acceptedPriceCents || 0;

    const statements = [
      env.DB.prepare(
        `INSERT INTO service_reports (id, work_order_id, technician_id, report_version, findings, work_performed, recommendation, checklist_json, customer_signature_name, customer_signed_at, submitted_at, qa_status) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'submitted')`,
      ).bind(
        reportId,
        workOrder.id,
        workOrder.technicianId,
        input.findings,
        input.workPerformed,
        input.recommendation || null,
        JSON.stringify(input.checklist),
        input.customerSignatureName,
      ),
      env.DB.prepare(
        `UPDATE work_orders SET status = 'ready_to_invoice', completed_at = CURRENT_TIMESTAMP, invoice_ready_at = CURRENT_TIMESTAMP, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(workOrder.id),
      env.DB.prepare(
        `INSERT OR IGNORE INTO invoices (id, organization_id, account_id, work_order_id, invoice_number, status, issued_on, subtotal_cents, tax_cents, total_cents, balance_cents, template_version) VALUES (?, ?, ?, ?, ?, 'draft', date('now'), ?, 0, ?, ?, 'techflex-blue-v1')`,
      ).bind(
        invoiceId,
        TECHFLEX_ORG_ID,
        workOrder.accountId,
        workOrder.id,
        invoiceNumber,
        total,
        total,
        total,
      ),
      env.DB.prepare(
        `UPDATE technician_payouts SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ?`,
      ).bind(identity.userId, workOrder.id),
      env.DB.prepare(
        `INSERT INTO work_order_events (id, work_order_id, event_type, actor_user_id, source, payload_json) VALUES (?, ?, 'service_report.submitted', ?, 'portal', ?)`,
      ).bind(
        crypto.randomUUID(),
        workOrder.id,
        identity.userId,
        JSON.stringify({ reportId, invoiceNumber }),
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'work_order.completed', 'work_order', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        workOrder.id,
        JSON.stringify({ reportId, invoiceNumber, total }),
      ),
    ];
    if (workOrder.assetId)
      statements.push(
        env.DB.prepare(
          "INSERT INTO asset_visits (id, organization_id, asset_id, work_order_id, technician_id, visit_type, visited_at, complaint, findings, work_performed, disposition, next_action, created_by) VALUES (?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          workOrder.assetId,
          workOrder.id,
          workOrder.technicianId,
          workOrder.serviceType.startsWith("biomed_pm")
            ? "preventive_maintenance"
            : workOrder.serviceType.includes("install") ||
                workOrder.serviceType.includes("delivery")
              ? "installation"
              : workOrder.serviceType.includes("repair")
                ? "repair"
                : "diagnostic",
          workOrder.summary,
          input.findings,
          input.workPerformed,
          input.assetDisposition,
          input.recommendation || null,
          identity.userId,
        ),
      );
    await env.DB.batch(statements);
    return Response.json({
      completion: {
        workOrderId: workOrder.id,
        externalId: workOrder.externalId,
        reportId,
        invoiceNumber,
        totalCents: total,
        summary: workOrder.summary,
        accountName: workOrder.accountName,
        locationName: workOrder.locationName,
        location: `${workOrder.city}, ${workOrder.state}`,
        technicianName: workOrder.technicianName,
        ...input,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Review the service-report fields before submitting.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    return apiError(error);
  }
}
