import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { calculatePricing } from "@/lib/techflex-pricing";

const pricing = z.object({
  targetGrossMarginPercent: z.number().min(40).max(90),
  mileageRate: z.number().min(0).max(20),
  consumerMileageRate: z.number().min(0).max(20),
  consumerFreeMiles: z.number().int().min(0).max(500),
  fuelPerDriveHour: z.number().min(0).max(1000),
  technicianHourlyCost: z.number().min(0).max(1000),
  operatingAllowancePerHour: z.number().min(0).max(1000),
  additionalTechnicianFee: z.number().min(0).max(10000),
  stairsFee: z.number().min(0).max(10000),
  serviceRules: z.record(z.string(), z.record(z.string(), z.number())),
});

const configuration = z.object({
  dataClassification: z.literal("non_phi_work_order_only"),
  permittedServices: z.array(z.string().min(1)).min(1),
  territories: z.string().trim().min(2).max(500),
  sla: z.string().trim().min(2).max(1000),
  documentation: z.string().trim().min(2).max(2000),
  communications: z.string().trim().min(2).max(1000),
  integrationMethod: z.enum(["portal", "api", "manual_import"]),
  pricing,
});

const createSchema = z.object({
  accountId: z.string().min(1),
  contractAttachmentId: z.string().optional().nullable(),
  configuration,
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), id: z.string().min(1) }),
  z.object({ action: z.literal("activate"), id: z.string().min(1) }),
  z.object({
    action: z.literal("simulate"),
    id: z.string().min(1),
    scenario: z.object({
      serviceType: z.string().min(1),
      offeredAmount: z.number().min(0).max(1000000),
      roundTripMiles: z.number().min(0).max(3000),
      driveHours: z.number().min(0).max(100),
      onsiteHours: z.number().min(0.5).max(100),
      technicianCount: z.number().int().min(1).max(10),
      weightLb: z.number().min(0).max(10000),
      partsCount: z.number().int().min(0).max(100),
      stairsCount: z.number().int().min(0).max(100),
      hotelCost: z.number().min(0).max(10000),
      partsCost: z.number().min(0).max(100000),
      assetCount: z.number().int().min(0).max(10000),
    }),
  }),
]);

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const result = await env.DB.prepare(
      `SELECT pl.id,pl.account_id AS accountId,a.name AS accountName,pl.version,pl.status,
      pl.contract_attachment_id AS contractAttachmentId,pl.configuration_json AS configurationJson,
      pl.submitted_at AS submittedAt,pl.approved_at AS approvedAt,pl.activated_at AS activatedAt,pl.updated_at AS updatedAt
      FROM partner_launches pl JOIN accounts a ON a.id=pl.account_id
      WHERE pl.organization_id=? ORDER BY pl.updated_at DESC`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all<Record<string, unknown>>();
    return Response.json({
      launches: result.results.map((row) => ({
        ...row,
        configuration: JSON.parse(String(row.configurationJson)),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const input = createSchema.parse(await request.json());
    const account = await env.DB.prepare(
      "SELECT id FROM accounts WHERE id=? AND organization_id=? AND status='active'",
    )
      .bind(input.accountId, TECHFLEX_ORG_ID)
      .first();
    if (!account)
      return Response.json(
        { error: "Select an active partner account." },
        { status: 400 },
      );
    if (input.contractAttachmentId) {
      const attachment = await env.DB.prepare(
        "SELECT id FROM attachments WHERE id=? AND organization_id=? AND entity_type='account' AND entity_id=? AND category='partner_contract'",
      )
        .bind(input.contractAttachmentId, TECHFLEX_ORG_ID, input.accountId)
        .first();
      if (!attachment)
        return Response.json(
          { error: "The contract file is not attached to this account." },
          { status: 400 },
        );
    }
    const latest = await env.DB.prepare(
      "SELECT COALESCE(MAX(version),0) AS version FROM partner_launches WHERE account_id=?",
    )
      .bind(input.accountId)
      .first<{ version: number }>();
    const id = crypto.randomUUID();
    const version = Number(latest?.version || 0) + 1;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO partner_launches (id,organization_id,account_id,version,status,contract_attachment_id,configuration_json) VALUES (?,?,?,?,'draft',?,?)",
      ).bind(
        id,
        TECHFLEX_ORG_ID,
        input.accountId,
        version,
        input.contractAttachmentId || null,
        JSON.stringify(input.configuration),
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'partner_launch.draft_created','partner_launch',?,?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        id,
        JSON.stringify({
          accountId: input.accountId,
          version,
          contractAttachmentId: input.contractAttachmentId || null,
          configuration: input.configuration,
        }),
      ),
    ]);
    return Response.json(
      { launch: { id, accountId: input.accountId, version, status: "draft" } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error:
            "Complete every partner rule and keep the margin target at 40% or higher.",
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
    ]);
    const input = actionSchema.parse(await request.json());
    const row = await env.DB.prepare(
      "SELECT id,account_id AS accountId,status,configuration_json AS configurationJson FROM partner_launches WHERE id=? AND organization_id=?",
    )
      .bind(input.id, TECHFLEX_ORG_ID)
      .first<{
        id: string;
        accountId: string;
        status: string;
        configurationJson: string;
      }>();
    if (!row)
      return Response.json(
        { error: "Partner launch draft not found." },
        { status: 404 },
      );
    if (input.action === "simulate") {
      const config = configuration.parse(JSON.parse(row.configurationJson));
      const p = config.pricing;
      const isPermitted = config.permittedServices.includes(input.scenario.serviceType);
      const result = calculatePricing(
        { ...input.scenario, reimbursement: input.scenario.offeredAmount },
        {
          targetGrossMargin: p.targetGrossMarginPercent / 100,
          mileageRate: p.mileageRate,
          consumerMileageRate: p.consumerMileageRate,
          consumerFreeMiles: p.consumerFreeMiles,
          fuelPerDriveHour: p.fuelPerDriveHour,
          technicianHourlyCost: p.technicianHourlyCost,
          operatingAllowancePerHour: p.operatingAllowancePerHour,
          additionalTechnicianFee: p.additionalTechnicianFee,
          stairsFee: p.stairsFee,
          serviceRules: p.serviceRules,
        },
      );
      const simulatedMargin = input.scenario.offeredAmount > 0
        ? (input.scenario.offeredAmount - result.modeledDirectCosts) / input.scenario.offeredAmount
        : 0;
      return Response.json({
        simulation: {
          launchId: row.id,
          launchStatus: row.status,
          permitted: isPermitted,
          decision: !isPermitted
            ? "out_of_scope"
            : result.authorizedRevenue
              ? "authorized"
              : "hold_for_counteroffer",
          offeredAmount: input.scenario.offeredAmount,
          requiredBid: result.requiredBid,
          contractPrice: result.contractPrice,
          modeledDirectCosts: result.modeledDirectCosts,
          projectedMarginPercent: Math.round(simulatedMargin * 10000) / 100,
          targetMarginPercent: p.targetGrossMarginPercent,
          requiredTechnicianCount: result.requiredTechnicianCount,
          billableMiles: result.billableMiles,
          warnings: [
            ...(!isPermitted ? ["The selected service is not permitted by this contract version."] : []),
            ...(result.requiredTechnicianCount > input.scenario.technicianCount ? [`Safety rules increased the crew to ${result.requiredTechnicianCount}.`] : []),
            ...(input.scenario.offeredAmount < result.requiredBid ? [`The offer is $${(result.requiredBid - input.scenario.offeredAmount).toFixed(2)} below the protected minimum.`] : []),
          ],
        },
      });
    }
    if (input.action === "submit") {
      if (row.status !== "draft")
        return Response.json(
          { error: "Only a draft can be submitted." },
          { status: 409 },
        );
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE partner_launches SET status='review',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).bind(identity.userId, row.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id) VALUES (?,?,?,'partner_launch.submitted','partner_launch',?)",
        ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, row.id),
      ]);
      return Response.json({ status: "review" });
    }
    if (identity.role !== "owner_administrator")
      return Response.json(
        {
          error:
            "Only the Owner Administrator can activate partner contract rules.",
        },
        { status: 403 },
      );
    if (row.status !== "review")
      return Response.json(
        { error: "Submit the draft for review before activation." },
        { status: 409 },
      );
    const config = configuration.parse(JSON.parse(row.configurationJson));
    const p = config.pricing;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE partner_launches SET status='superseded',record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND status='active'",
      ).bind(row.accountId),
      env.DB.prepare(
        "UPDATE partner_launches SET status='active',approved_by=?,approved_at=CURRENT_TIMESTAMP,activated_at=CURRENT_TIMESTAMP,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).bind(identity.userId, row.id),
      env.DB.prepare(
        `INSERT INTO account_pricing_policies (id,account_id,name,target_gross_margin_bps,mileage_rate_cents,consumer_mileage_rate_cents,consumer_free_miles,fuel_per_drive_hour_cents,technician_hourly_cost_cents,operating_allowance_per_hour_cents,additional_technician_fee_cents,stairs_fee_cents,pricing_rules_json,status)
        VALUES (?,?,'Partner Launch contract rules',?,?,?,?,?,?,?,?,?,?,'active')
        ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,target_gross_margin_bps=excluded.target_gross_margin_bps,mileage_rate_cents=excluded.mileage_rate_cents,consumer_mileage_rate_cents=excluded.consumer_mileage_rate_cents,consumer_free_miles=excluded.consumer_free_miles,fuel_per_drive_hour_cents=excluded.fuel_per_drive_hour_cents,technician_hourly_cost_cents=excluded.technician_hourly_cost_cents,operating_allowance_per_hour_cents=excluded.operating_allowance_per_hour_cents,additional_technician_fee_cents=excluded.additional_technician_fee_cents,stairs_fee_cents=excluded.stairs_fee_cents,pricing_rules_json=excluded.pricing_rules_json,record_version=account_pricing_policies.record_version+1,updated_at=CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(),
        row.accountId,
        Math.round(p.targetGrossMarginPercent * 100),
        Math.round(p.mileageRate * 100),
        Math.round(p.consumerMileageRate * 100),
        p.consumerFreeMiles,
        Math.round(p.fuelPerDriveHour * 100),
        Math.round(p.technicianHourlyCost * 100),
        Math.round(p.operatingAllowancePerHour * 100),
        Math.round(p.additionalTechnicianFee * 100),
        Math.round(p.stairsFee * 100),
        JSON.stringify(p.serviceRules),
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'partner_launch.activated','partner_launch',?,?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        row.id,
        row.configurationJson,
      ),
    ]);
    return Response.json({ status: "active" });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "The saved configuration is invalid and cannot be activated.",
        },
        { status: 400 },
      );
    return apiError(error);
  }
}
