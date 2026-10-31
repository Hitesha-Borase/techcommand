import { z } from "zod";
import { defaultServiceRules } from "@/lib/techflex-pricing";

export const rateTargets = ["mileageRate", "additionalTechnicianFee", "stairsFee", ...Object.entries(defaultServiceRules).flatMap(([service, rule]) => Object.keys(rule).map(key => `${service}.${key}`))];
export const rateProposalSchema = z.object({ target: z.string().refine(value => rateTargets.includes(value)), value: z.number().finite().min(0).max(1000000), evidence: z.string().min(1).max(1000), conditions: z.string().max(1000) });
export type RateProposal = z.infer<typeof rateProposalSchema>;
export const rateSheetSchema = z.object({ partnerName: z.string().max(240).nullable(), currency: z.string().max(20).nullable(), effectiveDate: z.string().max(80).nullable(), rates: z.array(rateProposalSchema).max(100), warnings: z.array(z.string().max(1000)).max(30) });
export type RateSheet = z.infer<typeof rateSheetSchema>;

export function applyRateProposals<T extends { serviceRules: Record<string, Record<string, number>> }>(form: T, proposals: RateProposal[]): T {
  const next = { ...form, serviceRules: Object.fromEntries(Object.entries(form.serviceRules).map(([key, value]) => [key, { ...value }])) };
  const seen = new Set<string>();
  for (const proposed of proposals) {
    const item = rateProposalSchema.parse(proposed);
    if (seen.has(item.target)) throw new Error("This sheet has more than one rate for the same rule. Select the applicable row and review its conditions.");
    seen.add(item.target);
    if (item.target === "mileageRate" && item.value > 20) throw new Error("Mileage must be a rate per mile, no greater than $20.");
    if (["stairsFee", "additionalTechnicianFee"].includes(item.target) && item.value > 10000) throw new Error("Confirm the fee units and amount before applying.");
    const [service, field] = item.target.split(".");
    if (field) next.serviceRules[service] = { ...(next.serviceRules[service] || {}), [field]: item.value };
    else (next as Record<string, unknown>)[service] = item.value;
  }
  return next;
}

export function rateLabel(target: string) {
  return target.replaceAll("_", " ").replaceAll(".", " · ").replace(/([a-z])([A-Z])/g, "$1 $2");
}
