"use client";

import { clearOfflineOwnerData } from "./offline-client";

type DeviceStorage = Pick<Storage, "key" | "length" | "removeItem">;

function requireIdentity(value: string) {
  const ownerUserId = value.trim();
  if (!ownerUserId) throw new Error("The departing identity could not be verified for device cleanup.");
  return ownerUserId;
}

function isIdentityBoundKey(key: string, ownerUserId: string) {
  const encoded = encodeURIComponent(ownerUserId);
  const spinLife = `techcommand:spinlife-draft:v1:${encoded}`;
  if (key === spinLife || key.startsWith(`${spinLife}:order:`)) return true;
  if (key === `techcommand:bid-workspace:v2:${encoded}`) return true;
  if (key === `techcommand:problem-report:${ownerUserId}`) return true;
  if (key.startsWith(`techcommand.route-plan-draft.v2.${encoded}.`)) return true;
  if (key.startsWith(`techcommand.route-navigation.v2.${encoded}.`)) return true;
  return ["accounts", "locations", "assets", "work_orders", "technician_pay"]
    .some((type) => key.startsWith(`techcommand:import-mapping:${ownerUserId}:${type}:`));
}

export function clearIdentityBoundWebStorage(owner: string, storage: DeviceStorage) {
  const ownerUserId = requireIdentity(owner);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isIdentityBoundKey(key, ownerUserId)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/** Clear the exact departing user's drafts without touching another account. */
export async function clearIdentityBoundDeviceState(
  owner: string,
  stores: { local?: DeviceStorage; session?: DeviceStorage } = {},
) {
  const ownerUserId = requireIdentity(owner);
  const local = stores.local || window.localStorage;
  const session = stores.session || window.sessionStorage;
  const localRecords = clearIdentityBoundWebStorage(ownerUserId, local);
  const sessionRecords = clearIdentityBoundWebStorage(ownerUserId, session);
  const offline = await clearOfflineOwnerData(ownerUserId);
  return { localRecords, sessionRecords, ...offline };
}
