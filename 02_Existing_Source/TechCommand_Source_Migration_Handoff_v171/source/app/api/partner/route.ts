import { env } from "cloudflare:workers";
import { z } from "zod";
import { calculatePricing, defaultPricingPolicy, type PricingInput, type PricingPolicy } from "@/lib/techflex-pricing";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole, type PortalIdentity } from "@/lib/portal-auth";

const pricingFields = z.object({
  locationId: z.string().min(1),
  serviceType: z.string().min(1),
  summary: z.string().trim().min(5).max(180),
  description: z.string().trim().max(4000).optional().default(""),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  desiredDate: z.string().optional().default(""),
  roundTripMiles: z.number().min(0).max(3000).default(0),
  driveHours: z.number().min(0).max(100).default(0),
  onsiteHours: z.number().min(0.5).max(100).default(1),
  technicianCount: z.number().int().min(1).max(10).default(1),
  weightLb: z.number().min(0).max(10000).default(0),
  partsCount: z.number().int().min(0).max(100).default(0),
  stairsCount: z.number().int().min(0).max(100).default(0),
  assetCount: z.number().int().min(0).max(10000).default(0),
});

const actionSchema = z.discriminatedUnion("action", [
  pricingFields.extend({ action: z.literal("preview_quote") }),
  pricingFields.extend({ action: z.literal("submit_request") }),
  z.object({ action: z.literal("quote_decision"), estimateId: z.string().min(1), decision: z.enum(["accepted", "declined"]) }),
  z.object({ action: z.literal("send_message"), subject: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), workOrderId: z.string().optional().nullable() }),
]);

type Scope = { accountId: string; accountName: string; locationId: string | null; accessRole: string };

async function scopeFor(identity: PortalIdentity) {
  const scope = await env.DB.prepare(
    `SELECT aa.account_id AS accountId,a.name AS accountName,aa.location_id AS locationId,aa.access_role AS accessRole
       FROM account_access aa JOIN accounts a ON a.id=aa.account_id
      WHERE aa.user_id=? AND aa.status='active' AND a.organization_id=? AND a.status='active' LIMIT 1`,
  ).bind(identity.userId, TECHFLEX_ORG_ID).first<Scope>();
  if (!scope) throw new Error("This client login is not linked to an active account.");
  return scope;
}

async function policyFor(accountId: string): Promise<PricingPolicy> {
  const row = await env.DB.prepare(
    `SELECT target_gross_margin_bps AS targetGrossMarginBps,mileage_rate_cents AS mileageRateCents,
            consumer_mileage_rate_cents AS consumerMileageRateCents,consumer_free_miles AS consumerFreeMiles,
            fuel_per_drive_hour_cents AS fuelPerDriveHourCents,technician_hourly_cost_cents AS technicianHourlyCostCents,
            operating_allowance_per_hour_cents AS operatingAllowancePerHourCents,
            additional_technician_fee_cents AS additionalTechnicianFeeCents,stairs_fee_cents AS stairsFeeCents,
            pricing_rules_json AS pricingRulesJson
       FROM account_pricing_policies WHERE account_id=? AND status='active' LIMIT 1`,
  ).bind(accountId).first<Record<string, number | string>>();
  if (!row) return defaultPricingPolicy;
  return {
    targetGrossMargin: Math.max(0.4, Number(row.targetGrossMarginBps) / 10000),
    mileageRate: Number(row.mileageRateCents) / 100,
    consumerMileageRate: Number(row.consumerMileageRateCents) / 100,
    consumerFreeMiles: Number(row.consumerFreeMiles),
    fuelPerDriveHour: Number(row.fuelPerDriveHourCents) / 100,
    technicianHourlyCost: Number(row.technicianHourlyCostCents) / 100,
    operatingAllowancePerHour: Number(row.operatingAllowancePerHourCents) / 100,
    additionalTechnicianFee: Number(row.additionalTechnicianFeeCents) / 100,
    stairsFee: Number(row.stairsFeeCents) / 100,
    serviceRules: JSON.parse(String(row.pricingRulesJson)),
  };
}

function publicQuote(input: z.infer<typeof pricingFields>, policy: PricingPolicy) {
  const pricingInput: PricingInput = {
    serviceType: input.serviceType, reimbursement: 0, roundTripMiles: input.roundTripMiles,
    driveHours: input.driveHours, onsiteHours: input.onsiteHours, technicianCount: input.technicianCount,
    weightLb: input.weightLb, partsCount: input.partsCount, stairsCount: input.stairsCount,
    hotelCost: 0, partsCost: 0, assetCount: input.assetCount,
  };
  const result = calculatePricing(pricingInput, policy);
  const visibleSubtotal = result.serviceBase + result.mileage + result.extraCrew + result.stairs;
  const assurance = Math.max(0, result.requiredBid - visibleSubtotal);
  return {
    totalCents: Math.round(result.requiredBid * 100),
    requiredTechnicianCount: result.requiredTechnicianCount,
    expiresInDays: 14,
    lineItems: [
      { description: "Service", amountCents: Math.round(result.serviceBase * 100) },
      ...(result.mileage ? [{ description: "Travel", amountCents: Math.round(result.mileage * 100) }] : []),
      ...(result.extraCrew ? [{ description: "Required crew", amountCents: Math.round(result.extraCrew * 100) }] : []),
      ...(result.stairs ? [{ description: "Site access", amountCents: Math.round(result.stairs * 100) }] : []),
      ...(assurance > 0.005 ? [{ description: "Service assurance", amountCents: Math.round(assurance * 100) }] : []),
    ],
    internal: result,
  };
}

function assertLocation(scope: Scope, locationId: string) {
  if (scope.locationId && scope.locationId !== locationId) {
    return Response.json({ error: "This login is limited to a different location." }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["client_administrator", "client_location_user"]);
    const scope = await scopeFor(identity);
    const locationFilter = scope.locationId ? " AND l.id=?" : "";
    const bindings = scope.locationId ? [scope.accountId, scope.locationId] : [scope.accountId];
    const [locations, jobs, messages] = await Promise.all([
      env.DB.prepare(
        `SELECT l.id,l.name,l.address_1 AS address1,l.city,l.state,l.postal_code AS postalCode
           FROM locations l WHERE l.account_id=? AND l.status='active'${locationFilter} ORDER BY l.name`,
      ).bind(...bindings).all(),
      env.DB.prepare(
        `SELECT w.id,w.external_id AS requestNumber,w.location_id AS locationId,l.name AS locationName,
                w.service_type AS serviceType,w.summary,w.description,w.priority,w.status,w.scheduled_start AS scheduledStart,
                e.id AS estimateId,e.estimate_number AS estimateNumber,e.status AS quoteStatus,e.total_cents AS quoteTotalCents,
                e.expires_at AS quoteExpiresAt,w.created_at AS createdAt
           FROM work_orders w JOIN locations l ON l.id=w.location_id
           LEFT JOIN estimates e ON e.id=(SELECT e2.id FROM estimates e2 WHERE e2.work_order_id=w.id ORDER BY e2.created_at DESC LIMIT 1)
          WHERE w.account_id=? AND w.external_source='client_portal'${scope.locationId ? " AND w.location_id=?" : ""}
          ORDER BY w.created_at DESC LIMIT 100`,
      ).bind(...bindings).all(),
      env.DB.prepare(
        `SELECT cm.id,cm.work_order_id AS workOrderId,cm.subject,cm.body,cm.created_at AS createdAt,
                u.display_name AS senderName,
                COALESCE((SELECT r.name FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.user_id=u.id AND m.organization_id=? AND m.status='active' ORDER BY CASE r.name WHEN 'owner_administrator' THEN 1 WHEN 'operations_administrator' THEN 2 ELSE 9 END LIMIT 1),'user') AS senderRole
           FROM client_messages cm JOIN users u ON u.id=cm.sender_user_id
          WHERE cm.account_id=? AND cm.visibility='shared'
            ${scope.locationId ? "AND cm.work_order_id IN (SELECT id FROM work_orders WHERE account_id=? AND location_id=?)" : ""}
          ORDER BY cm.created_at DESC LIMIT 100`,
      ).bind(...(scope.locationId ? [TECHFLEX_ORG_ID, scope.accountId, scope.accountId, scope.locationId] : [TECHFLEX_ORG_ID, scope.accountId])).all(),
    ]);
    return Response.json({
      identity: { displayName: identity.displayName, email: identity.email, role: identity.role },
      account: { id: scope.accountId, name: scope.accountName },
      locations: locations.results, jobs: jobs.results, messages: messages.results,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["client_administrator", "client_location_user"]);
    const scope = await scopeFor(identity);
    const input = actionSchema.parse(await request.json());

    if (input.action === "send_message") {
      if (scope.locationId && !input.workOrderId) {
        return Response.json({ error: "Select a job when sending from a location-limited login." }, { status: 400 });
      }
      if (input.workOrderId) {
        const workOrder = await env.DB.prepare("SELECT id FROM work_orders WHERE id=? AND account_id=? AND (? IS NULL OR location_id=?)").bind(input.workOrderId, scope.accountId, scope.locationId, scope.locationId).first();
        if (!workOrder) return Response.json({ error: "That job is outside your account." }, { status: 403 });
      }
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO client_messages (id,organization_id,account_id,work_order_id,sender_user_id,subject,body) VALUES (?,?,?,?,?,?,?)").bind(id, TECHFLEX_ORG_ID, scope.accountId, input.workOrderId || null, identity.userId, input.subject, input.body),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'client_message.sent','client_message',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify({ accountId: scope.accountId, workOrderId: input.workOrderId || null })),
      ]);
      return Response.json({ message: { id, ...input, senderName: identity.displayName, createdAt: new Date().toISOString() } }, { status: 201 });
    }

    if (input.action === "quote_decision") {
      const estimate = await env.DB.prepare(
        `SELECT e.id,e.work_order_id AS workOrderId,e.total_cents AS totalCents,e.estimated_cost_cents AS estimatedCostCents
           FROM estimates e WHERE e.id=? AND e.account_id=? AND e.status IN ('presented','draft')`,
      ).bind(input.estimateId, scope.accountId).first<{ id: string; workOrderId: string; totalCents: number; estimatedCostCents: number }>();
      if (!estimate) return Response.json({ error: "That quote is no longer awaiting a decision." }, { status: 409 });
      const marginBps = estimate.totalCents > 0 ? Math.floor(((estimate.totalCents - estimate.estimatedCostCents) * 10000) / estimate.totalCents) : 0;
      if (input.decision === "accepted" && marginBps < 4000) return Response.json({ error: "This quote requires TechFlex pricing review before acceptance." }, { status: 409 });
      await env.DB.batch([
        env.DB.prepare("UPDATE estimates SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(input.decision, identity.userId, estimate.id),
        env.DB.prepare("UPDATE work_orders SET status=?,accepted_price_cents=?,gross_margin_basis_points=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND account_id=?").bind(input.decision === "accepted" ? "ready_to_assign" : "quote_declined", input.decision === "accepted" ? estimate.totalCents : null, input.decision === "accepted" ? marginBps : null, estimate.workOrderId, scope.accountId),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'client_quote.decision','estimate',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, estimate.id, JSON.stringify({ decision: input.decision })),
      ]);
      return Response.json({ estimate: { id: estimate.id, status: input.decision } });
    }

    const invalidScope = assertLocation(scope, input.locationId);
    if (invalidScope) return invalidScope;
    const location = await env.DB.prepare("SELECT id FROM locations WHERE id=? AND account_id=? AND status='active'").bind(input.locationId, scope.accountId).first();
    if (!location) return Response.json({ error: "Select an active location for your account." }, { status: 400 });
    const policy = await policyFor(scope.accountId);
    const quote = publicQuote(input, policy);
    if (input.action === "preview_quote") {
      return Response.json({ quote: { totalCents: quote.totalCents, requiredTechnicianCount: quote.requiredTechnicianCount, expiresInDays: quote.expiresInDays, lineItems: quote.lineItems } });
    }

    const workOrderId = crypto.randomUUID();
    const estimateId = crypto.randomUUID();
    const token = workOrderId.split("-")[0].toUpperCase();
    const requestNumber = `TC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${token}`;
    const estimateNumber = `Q-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${token}`;
    const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
    const internal = quote.internal;
    const statements = [
      env.DB.prepare(
        `INSERT INTO work_orders (id,organization_id,account_id,location_id,external_source,external_id,service_type,priority,status,summary,description,required_technician_count,product_weight_lb,stairs_count,service_window_json,estimated_cost_cents,gross_margin_basis_points)
         VALUES (?,?,?,?,'client_portal',?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(workOrderId, TECHFLEX_ORG_ID, scope.accountId, input.locationId, requestNumber, input.serviceType, input.priority, "quote_presented", input.summary, input.description || null, quote.requiredTechnicianCount, input.weightLb || null, input.stairsCount, JSON.stringify({ desiredDate: input.desiredDate || null }), Math.round(internal.modeledDirectCosts * 100), Math.floor((1 - internal.modeledDirectCosts / internal.requiredBid) * 10000)),
      env.DB.prepare(
        `INSERT INTO estimates (id,work_order_id,account_id,estimate_number,status,subtotal_cents,total_cents,estimated_cost_cents,gross_margin_basis_points,pricing_snapshot_json,expires_at)
         VALUES (?,?,?,?, 'presented',?,?,?,?,?,?)`,
      ).bind(estimateId, workOrderId, scope.accountId, estimateNumber, quote.totalCents, quote.totalCents, Math.round(internal.modeledDirectCosts * 100), Math.floor((1 - internal.modeledDirectCosts / internal.requiredBid) * 10000), JSON.stringify({ input, calculation: internal, publicLineItems: quote.lineItems, generatedBy: "client_portal" }), expiresAt),
      ...quote.lineItems.map((item, index) => env.DB.prepare("INSERT INTO estimate_items (id,estimate_id,sort_order,description,quantity,unit_price_cents,total_cents) VALUES (?,?,?, ?,1,?,?)").bind(crypto.randomUUID(), estimateId, index, item.description, item.amountCents, item.amountCents)),
      env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'client_request.submitted','work_order',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, workOrderId, JSON.stringify({ requestNumber, estimateNumber, accountId: scope.accountId })),
    ];
    await env.DB.batch(statements);
    return Response.json({ request: { id: workOrderId, requestNumber, status: "quote_presented" }, quote: { id: estimateId, estimateNumber, totalCents: quote.totalCents, expiresAt, requiredTechnicianCount: quote.requiredTechnicianCount, lineItems: quote.lineItems } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the service request fields.", details: error.flatten() }, { status: 400 });
    return apiError(error);
  }
}
