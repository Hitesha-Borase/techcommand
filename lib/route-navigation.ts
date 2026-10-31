import { z } from "zod";

// Device-local selection only. No addresses, job details, or completion state.
const selectionSchema = z.object({
  ownerUserId: z.string().min(1).max(512),
  routeId: z.string().min(1),
  version: z.number().int().positive(),
  stopId: z.string().min(1),
  savedAt: z.number().int().nonnegative(),
});
type NavigationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const ROUTE_NAVIGATION_TTL_MS = 12 * 60 * 60 * 1000;
const identity = (ownerUserId: string) => z.string().min(1).max(512).parse(ownerUserId.trim());
const key = (ownerUserId: string, routeId: string) => `techcommand.route-navigation.v2.${encodeURIComponent(identity(ownerUserId))}.${encodeURIComponent(routeId)}`;

export function saveRouteNavigation(storage: NavigationStorage, ownerUserId: string, routeId: string, version: number, stopId: string, now = Date.now()) {
  const selection = selectionSchema.parse({ ownerUserId: identity(ownerUserId), routeId, version, stopId, savedAt: now });
  storage.setItem(key(ownerUserId, routeId), JSON.stringify(selection));
}

export function clearRouteNavigation(storage: NavigationStorage, ownerUserId: string, routeId: string) {
  storage.removeItem(key(ownerUserId, routeId));
}

export function loadRouteNavigation(storage: NavigationStorage, ownerUserId: string, routeId: string, version: number, stopIds: string[], now = Date.now()) {
  const stored = storage.getItem(key(ownerUserId, routeId));
  if (!stored) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(stored); }
  catch { clearRouteNavigation(storage, ownerUserId, routeId); return null; }
  const result = selectionSchema.safeParse(parsed);
  if (!result.success || result.data.ownerUserId !== identity(ownerUserId) || result.data.routeId !== routeId || result.data.version !== version ||
      !stopIds.includes(result.data.stopId) || now - result.data.savedAt > ROUTE_NAVIGATION_TTL_MS ||
      result.data.savedAt > now + 60_000) {
    clearRouteNavigation(storage, ownerUserId, routeId);
    return null;
  }
  return result.data.stopId;
}
