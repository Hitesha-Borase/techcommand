import { z } from "zod";

export const googleEstimateRequestSchema = z.object({
  routeId: z.string().min(1).max(200),
  version: z.number().int().positive(),
  startAddress: z.string().trim().min(1).max(500),
  includeReturn: z.boolean(),
  returnAddress: z.string().trim().max(500),
  stops: z.array(z.object({ stopId: z.string().min(1).max(200), address: z.string().trim().min(1).max(500) }).strict()).min(1).max(75),
}).strict().refine(input => !input.includeReturn || Boolean(input.returnAddress), "Enter the return destination.")
  .refine(input => new Set(input.stops.map(stop => stop.stopId)).size === input.stops.length, "Each stop must appear once.");

export type GoogleEstimateRequest = z.infer<typeof googleEstimateRequestSchema>;
const legSchema = z.object({ driveMinutes: z.number().int().min(0).max(1440) });
export const googleEstimateResultSchema = z.object({
  provider: z.literal("google_maps"), mode: z.literal("standard_no_traffic"),
  estimatedAt: z.string().datetime(), version: z.number().int().positive(),
  stops: z.array(legSchema.extend({ stopId: z.string().min(1) })).min(1).max(75),
  returnMinutes: z.number().int().min(0).max(1440).nullable(),
  warnings: z.array(z.string().max(2000)).max(210),
});
export type GoogleEstimateResult = z.infer<typeof googleEstimateResultSchema>;

// Request at most ten intermediates per call: ordinary Compute Routes features.
export const GOOGLE_ROUTE_LEGS_PER_REQUEST = 11;
export function googleRouteChunks(addresses: string[]) {
  const chunks: string[][] = [];
  for (let start = 0; start < addresses.length - 1; start += GOOGLE_ROUTE_LEGS_PER_REQUEST)
    chunks.push(addresses.slice(start, start + GOOGLE_ROUTE_LEGS_PER_REQUEST + 1));
  return chunks;
}

export function estimateMatchesPlan(result: GoogleEstimateResult, plan: GoogleEstimateRequest) {
  return result.version === plan.version && result.stops.length === plan.stops.length &&
    result.stops.every((stop, index) => stop.stopId === plan.stops[index].stopId) &&
    (plan.includeReturn ? result.returnMinutes !== null : result.returnMinutes === null);
}
