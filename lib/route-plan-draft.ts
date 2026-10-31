import { z } from "zod";

const plannedStopSchema = z.object({
  stopId: z.string().min(1),
  serviceMinutes: z.number().int().min(1).max(720),
  driveMinutes: z.number().int().min(0).max(1440).nullable(),
});

const routePlanDraftSchema = z.object({
  ownerUserId: z.string().min(1).max(512),
  routeId: z.string().min(1),
  version: z.number().int().positive(),
  stops: z.array(plannedStopSchema).min(1).max(75),
  startAddress: z.string().max(500),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  includeReturn: z.boolean(),
  returnAddress: z.string().max(500),
  returnMinutes: z.number().int().min(0).max(1440).nullable(),
  savedAt: z.number().int().nonnegative(),
});

export type RoutePlanDeviceDraft = z.infer<typeof routePlanDraftSchema>;
export type RoutePlanDraftInput = Omit<RoutePlanDeviceDraft, "ownerUserId" | "savedAt">;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const ROUTE_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
const identity = (ownerUserId: string) => z.string().min(1).max(512).parse(ownerUserId.trim());
const key = (ownerUserId: string, routeId: string) => `techcommand.route-plan-draft.v2.${encodeURIComponent(identity(ownerUserId))}.${encodeURIComponent(routeId)}`;

function validUniqueStops(stops: RoutePlanDeviceDraft["stops"]) {
  return new Set(stops.map(stop => stop.stopId)).size === stops.length;
}

export function saveRoutePlanDraft(storage: DraftStorage, ownerUserId: string, input: RoutePlanDraftInput, now = Date.now()) {
  const result = routePlanDraftSchema.safeParse({ ...input, ownerUserId: identity(ownerUserId), savedAt: now });
  if (!result.success || !validUniqueStops(result.data.stops)) throw new Error("Invalid route plan draft.");
  storage.setItem(key(ownerUserId, input.routeId), JSON.stringify(result.data));
}

export function clearRoutePlanDraft(storage: DraftStorage, ownerUserId: string, routeId: string) {
  storage.removeItem(key(ownerUserId, routeId));
}

export function loadRoutePlanDraft(storage: DraftStorage, ownerUserId: string, routeId: string, currentStopIds: string[], now = Date.now()):
  | { status: "none" | "expired" | "discarded" }
  | { status: "restored"; draft: RoutePlanDeviceDraft } {
  const storageKey = key(ownerUserId, routeId);
  const stored = storage.getItem(storageKey);
  if (!stored) return { status: "none" };
  let parsed: unknown;
  try { parsed = JSON.parse(stored); }
  catch { storage.removeItem(storageKey); return { status: "discarded" }; }
  const result = routePlanDraftSchema.safeParse(parsed);
  if (!result.success || result.data.ownerUserId !== identity(ownerUserId) || result.data.routeId !== routeId || !validUniqueStops(result.data.stops)) {
    storage.removeItem(storageKey);
    return { status: "discarded" };
  }
  if (now - result.data.savedAt > ROUTE_DRAFT_TTL_MS || result.data.savedAt > now + 60_000) {
    storage.removeItem(storageKey);
    return { status: "expired" };
  }
  const savedStops = new Set(result.data.stops.map(stop => stop.stopId));
  if (savedStops.size !== currentStopIds.length || currentStopIds.some(id => !savedStops.has(id))) {
    storage.removeItem(storageKey);
    return { status: "discarded" };
  }
  return { status: "restored", draft: result.data };
}
