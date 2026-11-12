import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";
import { rateTargets } from "@/lib/rate-sheet";
import { defaultServiceRules } from "@/lib/techflex-pricing";

const schema = z.object({
  expectedVersion: z.number().int().min(0),
  sourceDocumentId: z.string().min(1).optional(),
  accountId: z.string().min(1), targetGrossMarginPercent: z.number().min(40).max(90), mileageRate: z.number().min(0).max(20),
  consumerMileageRate: z.number().min(0).max(20), fuelPerDriveHour: z.number().min(0).max(1000), technicianHourlyCost: z.number().min(0).max(1000),
  consumerFreeMiles: z.number().int().min(0).max(500),
  operatingAllowancePerHour: z.number().min(0).max(1000), additionalTechnicianFee: z.number().min(0).max(10000), stairsFee: z.number().min(0).max(10000),
  serviceRules: z.record(z.string(), z.record(z.string(), z.number().finite().min(0).max(1000000))).refine(rules => Object.entries(rules).every(([service, fields]) => Object.keys(fields).every(field => rateTargets.includes(`${service}.${field}`)))),
});

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const rows = await env.DB.prepare(`SELECT a.id AS accountId, a.name AS accountName, a.account_type AS accountType, p.id,
      COALESCE(p.target_gross_margin_bps, 4000) AS targetGrossMarginBps, COALESCE(p.mileage_rate_cents, 77) AS mileageRateCents,
      COALESCE(p.consumer_mileage_rate_cents, 67) AS consumerMileageRateCents, COALESCE(p.consumer_free_miles, 10) AS consumerFreeMiles, COALESCE(p.fuel_per_drive_hour_cents, 1000) AS fuelPerDriveHourCents,
      COALESCE(p.technician_hourly_cost_cents, 2500) AS technicianHourlyCostCents, COALESCE(p.operating_allowance_per_hour_cents, 1000) AS operatingAllowancePerHourCents,
      COALESCE(p.additional_technician_fee_cents, 6500) AS additionalTechnicianFeeCents, COALESCE(p.stairs_fee_cents, 10000) AS stairsFeeCents,
      p.pricing_rules_json AS pricingRulesJson, p.updated_at AS updatedAt, COALESCE(p.record_version,0) AS recordVersion, p.status AS policyStatus
      FROM accounts a LEFT JOIN account_pricing_policies p ON p.account_id = a.id
      WHERE a.organization_id = ? AND a.status = 'active' ORDER BY a.name`).bind(TECHFLEX_ORG_ID).all<Record<string, unknown>>();
    return Response.json({ policies: rows.results.map((row: Record<string, unknown>) => ({ ...row, serviceRules: row.pricingRulesJson ? JSON.parse(String(row.pricingRulesJson)) : defaultServiceRules })) });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "finance"]);
    const input = schema.parse(await request.json());
    const account = await env.DB.prepare("SELECT id FROM accounts WHERE id = ? AND organization_id = ? AND status = 'active'").bind(input.accountId, TECHFLEX_ORG_ID).first();
    if (!account) return Response.json({ error: "Select an active account." }, { status: 400 });
    const current = await env.DB.prepare("SELECT record_version AS version FROM account_pricing_policies WHERE account_id=?").bind(input.accountId).first<{version:number}>();
    if (Number(current?.version || 0) !== input.expectedVersion) return Response.json({error:"These rates changed after you opened them. Reload the saved rates and compare before saving."},{status:409});
    if (input.sourceDocumentId) {
      const source = await env.DB.prepare("SELECT id FROM document_records WHERE id=? AND organization_id=? AND scope_type='account' AND scope_id=? AND category='rate_sheet' AND deleted_at IS NULL").bind(input.sourceDocumentId, TECHFLEX_ORG_ID, input.accountId).first();
      if (!source) return Response.json({error:"The reviewed rate sheet must be an available document for this account."},{status:400});
    }
    const id = crypto.randomUUID();
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
        SELECT ?, ?, ?, 'pricing_policy.updated', 'account', ?, ? WHERE
        EXISTS (SELECT 1 FROM account_pricing_policies WHERE account_id=? AND record_version=?)
        OR (?=0 AND NOT EXISTS (SELECT 1 FROM account_pricing_policies WHERE account_id=?))`)
        .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, input.accountId, JSON.stringify(input), input.accountId, input.expectedVersion, input.expectedVersion, input.accountId),
      env.DB.prepare(`INSERT INTO account_pricing_policies (id, account_id, name, target_gross_margin_bps, mileage_rate_cents, consumer_mileage_rate_cents, consumer_free_miles, fuel_per_drive_hour_cents, technician_hourly_cost_cents, operating_allowance_per_hour_cents, additional_technician_fee_cents, stairs_fee_cents, pricing_rules_json, status)
        VALUES (?, ?, 'Primary account rules', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(account_id) DO UPDATE SET target_gross_margin_bps=excluded.target_gross_margin_bps, mileage_rate_cents=excluded.mileage_rate_cents,
        consumer_mileage_rate_cents=excluded.consumer_mileage_rate_cents, consumer_free_miles=excluded.consumer_free_miles, fuel_per_drive_hour_cents=excluded.fuel_per_drive_hour_cents,
        technician_hourly_cost_cents=excluded.technician_hourly_cost_cents, operating_allowance_per_hour_cents=excluded.operating_allowance_per_hour_cents,
        additional_technician_fee_cents=excluded.additional_technician_fee_cents, stairs_fee_cents=excluded.stairs_fee_cents,
        pricing_rules_json=excluded.pricing_rules_json, status='active', record_version=account_pricing_policies.record_version+1, updated_at=CURRENT_TIMESTAMP WHERE account_pricing_policies.record_version=?`).bind(id, input.accountId, Math.round(input.targetGrossMarginPercent * 100), Math.round(input.mileageRate * 100), Math.round(input.consumerMileageRate * 100), input.consumerFreeMiles, Math.round(input.fuelPerDriveHour * 100), Math.round(input.technicianHourlyCost * 100), Math.round(input.operatingAllowancePerHour * 100), Math.round(input.additionalTechnicianFee * 100), Math.round(input.stairsFee * 100), JSON.stringify(input.serviceRules), input.expectedVersion),
    ]);
    if (!result[1]?.meta?.changes) return Response.json({error:"These rates changed while saving. Reload and compare; your draft has not been applied."},{status:409});
    return Response.json({ policy: input, recordVersion: input.expectedVersion + 1 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the rate values and reload an outdated form. The target gross margin must remain at least 40%.", details: error.flatten() }, { status: 400 });
    return apiError(error);
  }
}
