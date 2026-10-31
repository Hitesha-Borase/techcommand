"use client";

import { portalFetch, portalJson } from "./portal-fetch";

const DB_NAME = "techcommand-offline-v1";
const DB_VERSION = 1;
const DRAFT_STORE = "completion-drafts";
const QUEUE_STORE = "request-queue";

export type OfflineQueueItem = {
  id: string;
  ownerUserId: string;
  kind: "json" | "upload";
  url: string;
  method: string;
  createdAt: string;
  attempts: number;
  body?: string;
  headers?: Record<string, string>;
  file?: Blob;
  fileName?: string;
  fields?: Record<string, string>;
  status?: "queued" | "attention";
  lastError?: string;
  multipart?: {
    uploadId: string;
    attachmentId: string;
    storageKey: string;
    safeName: string;
    partSize: number;
    parts: Array<{ partNumber: number; etag: string }>;
  };
};

function notifyQueueChange() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("techcommand:queue-change"));
}

async function scheduleBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
    await sync?.register("techcommand-offline-sync");
  } catch {
    // The foreground retry loop remains the supported fallback.
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE))
        database.createObjectStore(DRAFT_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(QUEUE_STORE))
        database.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    try {
      const transaction = database.transaction(storeName, mode);
      const result = operation(transaction.objectStore(storeName));
      const fail = () => {
        database.close();
        reject(transaction.error || result.error || new Error("Device storage could not save your work. Keep this form open and try again after freeing storage."));
      };
      // An individual request can succeed before the transaction aborts. Only
      // the transaction's completion confirms that the draft/queue is saved.
      transaction.oncomplete = () => {
        database.close();
        resolve(result.result);
      };
      transaction.onabort = fail;
      transaction.onerror = fail;
    } catch (error) {
      database.close();
      reject(error);
    }
  });
}

export function completionDraftKey(workOrderId: string, technicianId: string) {
  return `${workOrderId}:${technicianId}`;
}

function requireOwnerUserId(value: string) {
  const ownerUserId = value.trim();
  if (!ownerUserId)
    throw new Error("Your signed-in identity could not be verified. Keep this work open, restore access, and try again.");
  return ownerUserId;
}

function ownerKey(ownerUserId: string, key: string) {
  return `v2:${ownerUserId.length}:${ownerUserId}:${key}`;
}

export async function saveCompletionDraft(owner: string, key: string, report: unknown) {
  const ownerUserId = requireOwnerUserId(owner);
  await request(DRAFT_STORE, "readwrite", (store) =>
    store.put({ key: ownerKey(ownerUserId, key), ownerUserId, report, savedAt: new Date().toISOString() }),
  );
}

export async function loadCompletionDraft<T>(owner: string, key: string) {
  const ownerUserId = requireOwnerUserId(owner);
  const draft = await request<{ key: string; ownerUserId?: string; report: T; savedAt: string } | undefined>(
    DRAFT_STORE,
    "readonly",
    (store) => store.get(ownerKey(ownerUserId, key)),
  );
  return draft?.ownerUserId === ownerUserId ? draft : undefined;
}

export async function removeCompletionDraft(owner: string, key: string) {
  const ownerUserId = requireOwnerUserId(owner);
  await request(DRAFT_STORE, "readwrite", (store) => store.delete(ownerKey(ownerUserId, key)));
}

export type PendingCompletionSubmission<T = unknown> = {
  requestId: string;
  body: T;
  savedAt: string;
};

function pendingSubmissionKey(key: string) {
  return `pending-submit:${key}`;
}

export async function savePendingCompletionSubmission<T>(owner: string, key: string, requestId: string, body: T) {
  const ownerUserId = requireOwnerUserId(owner);
  const value: PendingCompletionSubmission<T> & { key: string; ownerUserId: string } = {
    key: ownerKey(ownerUserId, pendingSubmissionKey(key)),
    ownerUserId,
    requestId,
    body,
    savedAt: new Date().toISOString(),
  };
  await request(DRAFT_STORE, "readwrite", (store) => store.put(value));
  return value;
}

export async function loadPendingCompletionSubmission<T>(owner: string, key: string) {
  const ownerUserId = requireOwnerUserId(owner);
  const pending = await request<(PendingCompletionSubmission<T> & { key: string; ownerUserId?: string }) | undefined>(
    DRAFT_STORE,
    "readonly",
    (store) => store.get(ownerKey(ownerUserId, pendingSubmissionKey(key))),
  );
  return pending?.ownerUserId === ownerUserId ? pending : undefined;
}

export async function removePendingCompletionSubmission(owner: string, key: string) {
  const ownerUserId = requireOwnerUserId(owner);
  await request(DRAFT_STORE, "readwrite", (store) => store.delete(ownerKey(ownerUserId, pendingSubmissionKey(key))));
}

export async function queueJsonRequest(owner: string, url: string, body: unknown) {
  const ownerUserId = requireOwnerUserId(owner);
  const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const item: OfflineQueueItem = {
    id: values.workOrderId
      ? ownerKey(ownerUserId, `json:${url}:${String(values.action || "save")}:${String(values.workOrderId)}:${String(values.technicianId || "")}`)
      : crypto.randomUUID(),
    ownerUserId,
    kind: "json",
    url,
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: "queued",
  };
  await request(QUEUE_STORE, "readwrite", (store) => store.put(item));
  notifyQueueChange();
  void scheduleBackgroundSync();
  return item.id;
}

export async function queueFileUpload(
  owner: string,
  url: string,
  file: File | Blob,
  fields: Record<string, string>,
  fileName?: string,
) {
  const ownerUserId = requireOwnerUserId(owner);
  const estimate = await navigator.storage?.estimate?.();
  const freeBytes = estimate?.quota && estimate.usage !== undefined
    ? estimate.quota - estimate.usage
    : null;
  if (freeBytes !== null && freeBytes < file.size + 25 * 1024 * 1024)
    throw new Error("This device does not have enough browser storage to secure that file offline. Reconnect and upload it directly, or free device storage first.");
  const id = crypto.randomUUID();
  const item: OfflineQueueItem = {
    id,
    ownerUserId,
    kind: "upload",
    url,
    method: "POST",
    file,
    fileName: file instanceof File ? file.name : fileName || "upload.bin",
    fields: { ...fields, attachmentId: fields.attachmentId || id },
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: "queued",
  };
  await request(QUEUE_STORE, "readwrite", (store) => store.put(item));
  notifyQueueChange();
  void scheduleBackgroundSync();
  return item.id;
}

async function allQueued() {
  return request<OfflineQueueItem[]>(QUEUE_STORE, "readonly", (store) => store.getAll());
}

async function ownedQueued(owner: string) {
  const ownerUserId = requireOwnerUserId(owner);
  return (await allQueued()).filter((item) => item.ownerUserId === ownerUserId);
}

async function removeQueued(id: string) {
  await request(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  notifyQueueChange();
}

async function updateQueued(item: OfflineQueueItem) {
  await request(QUEUE_STORE, "readwrite", (store) => store.put(item));
  notifyQueueChange();
}

export async function getOfflineQueueStatus(owner: string) {
  const items = await ownedQueued(owner);
  return {
    queued: items.filter((item) => item.status !== "attention").length,
    attention: items.filter((item) => item.status === "attention").length,
    totalBytes: items.reduce((total, item) => total + Number(item.file?.size || 0), 0),
  };
}

async function responseError(response: Response) {
  try {
    const body = await response.clone().json() as { error?: string };
    return body.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

async function uploadQueuedFile(item: OfflineQueueItem, expectedOwnerEpoch: number) {
  const stillOwned = () => ownerEpoch(item.ownerUserId) === expectedOwnerEpoch;
  if (!stillOwned()) throw new Error("This identity signed out before the upload could continue.");
  const file = item.file;
  if (!file) throw new Error("The queued file is no longer available on this device. Keep this item for reference and select the original file to upload again.");
  if (file.size <= 20 * 1024 * 1024) {
    const body = new FormData();
    Object.entries(item.fields || {}).forEach(([key, value]) => body.set(key, value));
    body.set("file", new File([file], item.fileName || "upload.bin", { type: file.type }));
    return portalFetch(item.url, { method: item.method, body });
  }
  const fields = item.fields || {};
  let multipart = item.multipart;
  if (!multipart) {
    const initialized = await portalFetch(item.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "multipart_init", ...fields, fileName: item.fileName || "upload.bin", contentType: file.type, sizeBytes: file.size }),
    });
    if (!initialized.ok) return initialized;
    const data = await portalJson<Omit<NonNullable<OfflineQueueItem["multipart"]>, "parts"> & { attachment?: { id: string } }>(initialized, "The resumable upload could not be initialized.");
    if (data.attachment) return initialized;
    multipart = { ...data, parts: [] };
    item = { ...item, multipart };
    if (!stillOwned()) throw new Error("This identity signed out before the upload could continue.");
    await updateQueued(item);
  }
  const completedParts = new Map(multipart.parts.map((part) => [part.partNumber, part]));
  for (let offset = 0, partNumber = 1; offset < file.size; offset += multipart.partSize, partNumber += 1) {
    if (completedParts.has(partNumber)) continue;
    const params = new URLSearchParams({ uploadId: multipart.uploadId, storageKey: multipart.storageKey, entityType: fields.entityType || "", entityId: fields.entityId || "", partNumber: String(partNumber) });
    const response = await portalFetch(`${item.url}?${params}`, { method: "PUT", body: file.slice(offset, offset + multipart.partSize) });
    if (!response.ok) return response;
    const part = await portalJson<{ partNumber: number; etag: string }>(response, `Upload part ${partNumber} could not be confirmed.`);
    multipart.parts.push(part);
    if (!stillOwned()) throw new Error("This identity signed out before the upload could continue.");
    await updateQueued({ ...item, multipart });
  }
  const completed = await portalFetch(item.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "multipart_complete", ...fields, ...multipart, fileName: item.fileName || "upload.bin", contentType: file.type, sizeBytes: file.size }),
  });
  if (!completed.ok) {
    try {
      const result = await completed.clone().json() as { retryMode?: string };
      if (result.retryMode === "restart_upload" && stillOwned())
        await updateQueued({ ...item, multipart: undefined });
    } catch {
      // Keep the completed-part checkpoint when the response cannot be read.
    }
  }
  return completed;
}

let activeFlush: { ownerUserId: string; promise: Promise<{ processed: number; remaining: number }> } | null = null;
const ownerEpochs = new Map<string, number>();

function ownerEpoch(ownerUserId: string) {
  return ownerEpochs.get(ownerUserId) || 0;
}

/**
 * Remove only one confirmed identity's recoverable device records. The epoch
 * prevents an already-running retry from recreating a queue item after logout.
 */
export async function clearOfflineOwnerData(owner: string) {
  const ownerUserId = requireOwnerUserId(owner);
  ownerEpochs.set(ownerUserId, ownerEpoch(ownerUserId) + 1);
  const drafts = await request<Array<{ key: string; ownerUserId?: string }>>(DRAFT_STORE, "readonly", (store) => store.getAll());
  const queued = await allQueued();
  const ownedDrafts = drafts.filter((item) => item.ownerUserId === ownerUserId);
  const ownedQueue = queued.filter((item) => item.ownerUserId === ownerUserId);
  for (const item of ownedDrafts)
    await request(DRAFT_STORE, "readwrite", (store) => store.delete(item.key));
  for (const item of ownedQueue)
    await request(QUEUE_STORE, "readwrite", (store) => store.delete(item.id));
  notifyQueueChange();
  return { drafts: ownedDrafts.length, queued: ownedQueue.length };
}

export function flushOfflineQueue(owner: string): Promise<{ processed: number; remaining: number }> {
  const ownerUserId = requireOwnerUserId(owner);
  if (activeFlush?.ownerUserId === ownerUserId) return activeFlush.promise;
  if (activeFlush) return activeFlush.promise.then(() => flushOfflineQueue(ownerUserId));
  const promise = flushQueue(ownerUserId).finally(() => {
    if (activeFlush?.promise === promise) activeFlush = null;
  });
  activeFlush = { ownerUserId, promise };
  return promise;
}

async function currentIdentityMatches(ownerUserId: string) {
  try {
    const response = await portalFetch("/api/me");
    const data = await portalJson<{ identity?: { userId?: string } }>(response, "Your signed-in identity could not be verified.");
    if (data.identity?.userId === ownerUserId) return true;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("techcommand:session-required"));
  } catch {
    // Network failures keep the item queued. portalFetch separately raises
    // session recovery when the response proves authentication was lost.
  }
  return false;
}

async function flushQueue(ownerUserId: string) {
  const epoch = ownerEpoch(ownerUserId);
  if (!navigator.onLine) return { processed: 0, remaining: (await ownedQueued(ownerUserId)).length };
  const queued = (await ownedQueued(ownerUserId)).filter((item) => item.status !== "attention").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let processed = 0;
  for (const item of queued) {
    if (ownerEpoch(ownerUserId) !== epoch) break;
    if (!await currentIdentityMatches(ownerUserId)) break;
    try {
      let response: Response;
      if (item.kind === "upload") {
        response = await uploadQueuedFile(item, epoch);
      } else {
        response = await portalFetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
      }
      const latest = (await ownedQueued(ownerUserId)).find((queuedItem) => queuedItem.id === item.id) || item;
      if (ownerEpoch(ownerUserId) !== epoch) break;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429)
          await updateQueued({ ...latest, status: "attention", attempts: item.attempts + 1, lastError: await responseError(response) });
        else await updateQueued({ ...latest, status: "queued", attempts: item.attempts + 1, lastError: await responseError(response) });
        continue;
      }
      await removeQueued(item.id);
      processed += 1;
    } catch (error) {
      if (ownerEpoch(ownerUserId) !== epoch) break;
      const latest = (await ownedQueued(ownerUserId)).find((queuedItem) => queuedItem.id === item.id) || item;
      await updateQueued({ ...latest, status: "attention", attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : "Save could not be confirmed. Check the record before retrying." });
      break;
    }
  }
  const remaining = (await ownedQueued(ownerUserId)).length;
  if (processed > 0)
    window.dispatchEvent(new CustomEvent("techcommand:sync-complete", { detail: { processed, remaining } }));
  return { processed, remaining };
}

export async function getOfflineAttentionItems(owner: string) {
  return (await ownedQueued(owner)).filter(item => item.status === "attention").map(item => ({
    id: item.id, label: item.fileName || "Saved work order update", createdAt: item.createdAt,
    lastError: item.lastError || "Check the record before retrying.",
  }));
}

export async function resolveOfflineItem(owner: string, id: string, action: "retry" | "confirmed_saved") {
  const ownerUserId = requireOwnerUserId(owner);
  if (activeFlush) await activeFlush.promise;
  const item = (await ownedQueued(ownerUserId)).find(item => item.id === id);
  if (!item || item.status !== "attention") return;
  if (action === "confirmed_saved") await removeQueued(id);
  else await updateQueued({ ...item, status: "queued", lastError: undefined });
  notifyQueueChange();
  if (action === "retry") await flushOfflineQueue(ownerUserId);
}
