export const defaultServiceRules: Record<string, Record<string, number>> = {
  evaluation: { base: 100 }, repair_single: { base: 120 }, repair_multi: { base: 135, extraPart: 12.5 }, frame_repair: { base: 175 },
  hourly_service: { hourly: 125 }, biomed_service_call: { hourly: 115 }, consumer_install: { base: 175 },
  wgd_basic: { perLbAtOrBelow225: 1, perLbAbove225: 1.25 },
  wgd_complex: { perLbAtOrBelow225: 1.25, perLbAbove225: 1.5 },
  bed_delivery: { minimum: 180, perLbAtOrBelow225: 1.25, perLbAbove225: 1.5 },
  biomed_pm_a: { perAsset: 18, facilityMinimum: 295 }, biomed_pm_b: { perAsset: 45, facilityMinimum: 295 },
  biomed_pm_c: { perAsset: 65, facilityMinimum: 295 }, biomed_pm_d: { perAsset: 95, facilityMinimum: 295 },
};

export type PricingPolicy = {
  targetGrossMargin: number; mileageRate: number; consumerMileageRate: number; consumerFreeMiles: number; fuelPerDriveHour: number;
  technicianHourlyCost: number; operatingAllowancePerHour: number; additionalTechnicianFee: number; stairsFee: number;
  serviceRules: Record<string, Record<string, number>>;
};

export const defaultPricingPolicy: PricingPolicy = { targetGrossMargin: 0.4, mileageRate: 0.77, consumerMileageRate: 0.67, consumerFreeMiles: 10, fuelPerDriveHour: 10, technicianHourlyCost: 25, operatingAllowancePerHour: 10, additionalTechnicianFee: 65, stairsFee: 100, serviceRules: defaultServiceRules };

export type PricingInput = { serviceType: string; reimbursement: number; roundTripMiles: number; driveHours: number; onsiteHours: number; technicianCount: number; weightLb: number; partsCount: number; stairsCount: number; hotelCost: number; partsCost: number; assetCount: number; consumerPricing?: boolean };

export function calculatePricing(input: PricingInput, policy: PricingPolicy = defaultPricingPolicy) {
  const upToCent = (value: number) => Math.ceil((value - Number.EPSILON) * 100) / 100;
  const downToCent = (value: number) => Math.floor((value + Number.EPSILON) * 100) / 100;
  const marginFloor = Math.max(0.4, policy.targetGrossMargin);
  const consumerLane = input.consumerPricing || input.serviceType === "consumer_install";
  const billableMiles = consumerLane ? Math.max(0, input.roundTripMiles - policy.consumerFreeMiles) : input.roundTripMiles;
  const mileage = billableMiles * (consumerLane ? policy.consumerMileageRate : policy.mileageRate);
  const requiredTechnicianCount = input.weightLb > 500 && ["wgd_basic", "wgd_complex", "bed_delivery"].includes(input.serviceType) ? Math.max(3, input.technicianCount) : input.serviceType === "bed_delivery" ? Math.max(2, input.technicianCount) : input.technicianCount;
  const extraCrew = Math.max(requiredTechnicianCount - 1, 0) * policy.additionalTechnicianFee;
  const stairs = input.stairsCount > 0 ? policy.stairsFee : 0;
  const rule = policy.serviceRules[input.serviceType] ?? defaultServiceRules[input.serviceType] ?? { base: 120 };
  let serviceBase = rule.base ?? 120;
  if (input.serviceType === "repair_multi") serviceBase = (rule.base ?? 135) + Math.max(input.partsCount - 1, 0) * (rule.extraPart ?? 12.5);
  if (["hourly_service", "biomed_service_call"].includes(input.serviceType)) serviceBase = (rule.hourly ?? (input.serviceType === "biomed_service_call" ? 115 : 125)) * input.onsiteHours;
  if (["wgd_basic", "wgd_complex", "bed_delivery"].includes(input.serviceType)) {
    serviceBase = input.weightLb * (input.weightLb <= 225 ? (rule.perLbAtOrBelow225 ?? 1) : (rule.perLbAbove225 ?? 1.25));
    if (rule.minimum) serviceBase = Math.max(rule.minimum, serviceBase);
  }
  if (input.serviceType.startsWith("biomed_pm")) serviceBase = Math.max(rule.facilityMinimum ?? 295, input.assetCount * (rule.perAsset ?? 65));
  const contractPrice = upToCent(serviceBase + mileage + extraCrew + stairs);
  const onsiteLaborHours = input.onsiteHours * requiredTechnicianCount;
  const driveLaborHours = input.driveHours * requiredTechnicianCount;
  const laborHours = onsiteLaborHours + driveLaborHours;
  const technicianLabor = onsiteLaborHours * policy.technicianHourlyCost;
  const driveTimeLabor = driveLaborHours * policy.technicianHourlyCost;
  const internalLabor = technicianLabor + driveTimeLabor;
  const operatingAllowance = laborHours * policy.operatingAllowancePerHour;
  const travelOperatingCost = input.driveHours * policy.fuelPerDriveHour;
  const roundTripMileage = mileage;
  const fixedDirectCosts = roundTripMileage + operatingAllowance + travelOperatingCost + input.hotelCost + input.partsCost;
  const otherExpenses = operatingAllowance + travelOperatingCost + input.hotelCost + input.partsCost;
  const modeledDirectCosts = technicianLabor + driveTimeLabor + fixedDirectCosts;
  const offeredRevenue = input.reimbursement;
  const projectedMargin = upToCent(offeredRevenue - modeledDirectCosts);
  const requiredRevenueForCosts = upToCent(modeledDirectCosts / (1 - marginFloor));
  const requiredBid = upToCent(Math.max(contractPrice, requiredRevenueForCosts));
  const authorizedRevenue = offeredRevenue + 0.005 >= requiredBid ? offeredRevenue : 0;
  const counteroffer = authorizedRevenue ? 0 : requiredBid;
  const technicianPay = authorizedRevenue ? downToCent(Math.max(0, authorizedRevenue * (1 - marginFloor) - fixedDirectCosts)) : 0;
  const estimatedCost = authorizedRevenue ? technicianPay + fixedDirectCosts : modeledDirectCosts;
  const grossMargin = authorizedRevenue > 0 ? (authorizedRevenue - estimatedCost) / authorizedRevenue : 0;
  return { marginFloor, billableMiles, requiredTechnicianCount, mileage, roundTripMileage, extraCrew, stairs, serviceBase, contractPrice, onsiteLaborHours, driveLaborHours, technicianLabor, driveTimeLabor, internalLabor, operatingAllowance, travelOperatingCost, otherExpenses, fixedDirectCosts, modeledDirectCosts, projectedMargin, requiredRevenueForCosts, requiredBid, offeredRevenue, authorizedRevenue, technicianPay, estimatedCost, grossMargin, counteroffer, decision: counteroffer ? "counteroffer_required" as const : "authorized" as const };
}
