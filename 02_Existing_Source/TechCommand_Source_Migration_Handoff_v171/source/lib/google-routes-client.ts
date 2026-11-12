import { z } from "zod";
import { googleRouteChunks } from "@/lib/google-route-estimate";

export class RouteEstimateError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const providerSchema = z.object({ routes: z.array(z.object({
  legs: z.array(z.object({ duration: z.string().regex(/^\d+(?:\.\d{1,9})?s$/) })),
  warnings: z.array(z.string().max(2000)).max(30).optional(),
})).length(1) });

/** No provider response is cached, logged, put in an audit, or persisted in a plan. */
export async function computeGoogleDriveTimes(addresses: string[], key: string) {
  const minutes: number[] = [];
  const warnings: string[] = [];
  const signal = AbortSignal.timeout(25_000);
  for (const points of googleRouteChunks(addresses)) {
    let response: Response;
    try {
      response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.legs.duration,routes.warnings" },
        body: JSON.stringify({ origin: { address: points[0] }, destination: { address: points.at(-1) },
          intermediates: points.slice(1, -1).map(address => ({ address })),
          travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", computeAlternativeRoutes: false,
          optimizeWaypointOrder: false }),
      });
    } catch {
      throw new RouteEstimateError(503, "provider_unavailable", "Google driving estimates are unavailable or timed out. Your manual plan is unchanged; try again later.");
    }
    // Never echo the provider error body: it may contain addresses or credentials.
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new RouteEstimateError(503, "provider_configuration", "Google Routes needs an administrator to check its API key, billing and API restrictions. Manual planning remains available.");
      if (response.status === 429)
        throw new RouteEstimateError(429, "provider_quota", "Google's request limit has been reached. Use manual estimates or try again later.");
      throw new RouteEstimateError(502, "provider_rejected", "Google could not calculate every leg. Check the addresses or continue with manual estimates.");
    }
    let data: z.infer<typeof providerSchema>;
    try { data = providerSchema.parse(await response.json()); }
    catch { throw new RouteEstimateError(502, "invalid_result", "Google returned an incomplete route. No partial estimates were applied."); }
    const route = data.routes[0];
    if (route.legs.length !== points.length - 1)
      throw new RouteEstimateError(502, "invalid_result", "Google did not return every requested leg. No partial estimates were applied.");
    for (const leg of route.legs) {
      const seconds = Number(leg.duration.slice(0, -1));
      const value = Math.ceil(seconds / 60);
      if (!Number.isFinite(value) || value < 0 || value > 1440)
        throw new RouteEstimateError(502, "invalid_result", "A driving estimate is outside the supported range. Review the route with dispatch.");
      minutes.push(value);
    }
    warnings.push(...(route.warnings || []));
  }
  return { minutes, warnings: [...new Set(warnings)] };
}
