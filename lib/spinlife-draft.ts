import { z } from "zod";
import { spinlifeDataSchema, spinlifeVisitSchema, type SpinLifeJob } from "./spinlife-simple";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const nullableText = (max = 512) => z.string().max(max).nullable();
const spinlifeJobSchema = z.object({
  id: z.string().min(1).max(512),
  version: z.number().int().nonnegative(),
  intakeVersion: z.number().int().positive().optional(),
  status: z.string().max(120),
  data: spinlifeDataSchema,
  visit: spinlifeVisitSchema,
  technicianId: nullableText(),
  technicianName: nullableText(),
  technicianPayCents: z.number().int().min(0).max(100_000_000).nullable(),
  scheduledStart: nullableText(120),
  startedAt: nullableText(120),
  documentedAt: nullableText(120),
  lastMutationId: nullableText(),
  packetAttachmentId: nullableText(),
  packetSourceVersion: z.number().int().nonnegative().nullable(),
}).strict();

const draftSchema = z.object({
  format: z.literal(1),
  ownerUserId: z.string().min(1).max(512),
  savedAt: z.number().int().nonnegative(),
  baseJob: spinlifeJobSchema,
  job: spinlifeJobSchema,
  pay: z.string().max(40),
}).strict();

export type SpinLifeDeviceDraft = z.infer<typeof draftSchema>;
export const SPINLIFE_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

function identity(userId: string) {
  return z.string().min(1).max(512).parse(userId.trim());
}

export function spinlifeDraftKey(userId: string, jobId?: string) {
  return `techcommand:spinlife-draft:v1:${encodeURIComponent(identity(userId))}${jobId ? `:order:${encodeURIComponent(jobId)}` : ""}`;
}

export function saveSpinLifeDraft(
  storage: DraftStorage,
  userId: string,
  input: { baseJob: SpinLifeJob; job: SpinLifeJob; pay: string },
  now = Date.now(),
) {
  const draft = draftSchema.parse({ format: 1, ownerUserId: identity(userId), savedAt: now, ...input });
  const encoded = JSON.stringify(draft);
  storage.setItem(spinlifeDraftKey(userId,draft.job.id), encoded);
  storage.setItem(spinlifeDraftKey(userId), encoded);
  return draft;
}

export function clearSpinLifeDraft(storage: DraftStorage, userId: string, jobId?: string) {
  const key=spinlifeDraftKey(userId);
  if(jobId) storage.removeItem(spinlifeDraftKey(userId,jobId));
  if(!jobId) {storage.removeItem(key);return;}
  try {if(JSON.parse(storage.getItem(key)||"null")?.job?.id===jobId)storage.removeItem(key);} catch { /* Preserve an unrelated unreadable draft for normal recovery. */ }
}

export function loadSpinLifeDraft(storage: DraftStorage, userId: string, now = Date.now(), jobId?: string):
  | { status: "none" | "expired" | "discarded" }
  | { status: "restored"; draft: SpinLifeDeviceDraft } {
  let key = spinlifeDraftKey(userId,jobId);
  let raw = storage.getItem(key);
  if(!raw && jobId) {key=spinlifeDraftKey(userId);raw=storage.getItem(key);}
  if (!raw) return { status: "none" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { storage.removeItem(key); return { status: "discarded" }; }
  const result = draftSchema.safeParse(parsed);
  if (!result.success || result.data.ownerUserId !== identity(userId)) {
    storage.removeItem(key);
    return { status: "discarded" };
  }
  if(jobId && result.data.job.id!==jobId) return {status:"none"};
  if (now - result.data.savedAt >= SPINLIFE_DRAFT_TTL_MS || result.data.savedAt > now + 60_000) {
    storage.removeItem(key);
    return { status: "expired" };
  }
  return { status: "restored", draft: result.data };
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeValue(base: unknown, local: unknown, server: unknown, path: string, conflicts: string[]): unknown {
  if (same(local, base)) return server;
  if (same(server, base) || same(local, server)) return local;
  const objects = [base, local, server].every(value => value !== null && typeof value === "object" && !Array.isArray(value));
  if (objects) {
    const output: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base as object), ...Object.keys(local as object), ...Object.keys(server as object)]);
    for (const key of keys) output[key] = mergeValue(
      (base as Record<string, unknown>)[key],
      (local as Record<string, unknown>)[key],
      (server as Record<string, unknown>)[key],
      `${path}.${key}`,
      conflicts,
    );
    return output;
  }
  conflicts.push(path);
  return local;
}

function payText(cents: number | null) {
  return cents === null ? "" : String(cents / 100);
}

/** Merge a recovered draft with a newer server copy without dropping unrelated changes. */
export function reconcileSpinLifeDraft(draft: SpinLifeDeviceDraft, server: SpinLifeJob | null):
  | { status: "unavailable" }
  | { status: "restored"; job: SpinLifeJob; pay: string; conflicts: string[] } {
  // A first save may have committed before the response was interrupted. When
  // its exact ID exists, reconcile it just like any later saved version.
  if (draft.job.version === 0 && !server) return { status: "restored", job: draft.job, pay: draft.pay, conflicts: [] };
  if (!server || server.id !== draft.job.id || server.version < draft.baseJob.version) return { status: "unavailable" };
  const conflicts: string[] = [];
  const data = mergeValue(draft.baseJob.data, draft.job.data, server.data, "details", conflicts);
  const visit = mergeValue(draft.baseJob.visit, draft.job.visit, server.visit, "field work", conflicts);
  const technicianId = mergeValue(draft.baseJob.technicianId, draft.job.technicianId, server.technicianId, "technician", conflicts);
  const scheduledStart = mergeValue(draft.baseJob.scheduledStart, draft.job.scheduledStart, server.scheduledStart, "planned date", conflicts);
  const localPayChanged = draft.pay !== payText(draft.baseJob.technicianPayCents);
  const serverPayChanged = server.technicianPayCents !== draft.baseJob.technicianPayCents;
  if (localPayChanged && serverPayChanged && draft.pay !== payText(server.technicianPayCents)) conflicts.push("technician payment");
  return {
    status: "restored",
    job: spinlifeJobSchema.parse({ ...server, data, visit, technicianId, scheduledStart }),
    pay: localPayChanged ? draft.pay : payText(server.technicianPayCents),
    conflicts,
  };
}
