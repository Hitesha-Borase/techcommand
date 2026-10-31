import { defaultPricingPolicy, type PricingPolicy } from "@/lib/techflex-pricing";

/** The same account values used by work-order creation, in calculator units. */
export function accountPricing(row: Record<string, unknown> | null): PricingPolicy {
  if (!row) return defaultPricingPolicy;
  return {
    targetGrossMargin: Math.max(0.4, Number(row.targetGrossMarginBps) / 10000),
    mileageRate: Number(row.mileageRateCents) / 100,
    consumerMileageRate: Number(row.consumerMileageRateCents) / 100,
    consumerFreeMiles: Number(row.consumerFreeMiles ?? 10),
    fuelPerDriveHour: Number(row.fuelPerDriveHourCents) / 100,
    technicianHourlyCost: Number(row.technicianHourlyCostCents) / 100,
    operatingAllowancePerHour: Number(row.operatingAllowancePerHourCents) / 100,
    additionalTechnicianFee: Number(row.additionalTechnicianFeeCents) / 100,
    stairsFee: Number(row.stairsFeeCents) / 100,
    serviceRules: row.pricingRulesJson ? JSON.parse(String(row.pricingRulesJson)) : defaultPricingPolicy.serviceRules,
  };
}

export function intakePricingAmounts(authorization: number, recommendedBid: number, proposedBid: number | null) {
  return { authorization, recommendedBid, proposedBid: proposedBid ?? recommendedBid };
}
