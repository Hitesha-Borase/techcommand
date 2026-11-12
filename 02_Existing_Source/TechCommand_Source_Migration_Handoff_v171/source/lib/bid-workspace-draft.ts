import { z } from "zod";

const text = z.string().max(10_000);
const amount = z.number().finite().min(0).max(100_000_000);

const bidFieldsSchema = z.object({
  externalSource: text,
  clientAccountName: text,
  externalId: text,
  customerName: text,
  customerPhone: text,
  customerEmail: text,
  serviceAddress: text,
  serviceType: text,
  summary: text,
  customerComplaint: text,
  equipmentType: text,
  manufacturer: text,
  model: text,
  serialNumber: text,
  sourceAssignedTechnician: text,
  sourceDispatchAddress: text,
  authorization: amount,
  onsiteHours: z.number().finite().min(0).max(720),
  technicianCount: z.number().int().min(1).max(25),
  weightLb: z.number().finite().min(0).max(1_000_000),
  partsCount: z.number().int().min(0).max(10_000),
  stairsCount: z.number().int().min(0).max(10_000),
  confidence: z.number().finite().min(0).max(1).optional(),
  warnings: z.array(z.string().max(500)).max(50).optional(),
}).strict();

const bidDraftSchema = z.object({
  ownerUserId: z.string().min(1).max(512),
  accountId: z.string().max(512),
  technicianId: z.string().max(512),
  fields: bidFieldsSchema,
  routeOrigin: z.string().max(2_000),
  roundTripMiles: z.number().finite().min(0).max(100_000),
  driveHours: z.number().finite().min(0).max(10_000),
  finalBidAmount: amount.nullable(),
  pricingNote: z.string().max(5_000),
  savedAt: z.number().int().nonnegative(),
}).strict();

export type BidWorkspaceFields = z.infer<typeof bidFieldsSchema>;
export type BidWorkspaceDraft = z.infer<typeof bidDraftSchema>;
export type BidWorkspaceDraftInput = Omit<BidWorkspaceDraft, "ownerUserId" | "savedAt">;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const BID_WORKSPACE_DRAFT_TTL_MS = 12 * 60 * 60 * 1_000;

function identity(ownerUserId: string) {
  return z.string().min(1).max(512).parse(ownerUserId.trim());
}

export function bidWorkspaceDraftKey(ownerUserId: string) {
  return `techcommand:bid-workspace:v2:${encodeURIComponent(identity(ownerUserId))}`;
}

export function saveBidWorkspaceDraft(storage: DraftStorage, ownerUserId: string, input: BidWorkspaceDraftInput, now = Date.now()) {
  const draft = bidDraftSchema.parse({ ...input, ownerUserId: identity(ownerUserId), savedAt: now });
  storage.setItem(bidWorkspaceDraftKey(ownerUserId), JSON.stringify(draft));
}

export function clearBidWorkspaceDraft(storage: DraftStorage, ownerUserId: string) {
  storage.removeItem(bidWorkspaceDraftKey(ownerUserId));
}

export function loadBidWorkspaceDraft(storage: DraftStorage, ownerUserId: string, now = Date.now()):
  | { status: "none" | "expired" | "discarded" }
  | { status: "restored"; draft: BidWorkspaceDraft } {
  const key = bidWorkspaceDraftKey(ownerUserId);
  const raw = storage.getItem(key);
  if (!raw) return { status: "none" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { storage.removeItem(key); return { status: "discarded" }; }
  const result = bidDraftSchema.safeParse(parsed);
  if (!result.success || result.data.ownerUserId !== identity(ownerUserId)) {
    storage.removeItem(key);
    return { status: "discarded" };
  }
  if (now - result.data.savedAt > BID_WORKSPACE_DRAFT_TTL_MS || result.data.savedAt > now + 60_000) {
    storage.removeItem(key);
    return { status: "expired" };
  }
  return { status: "restored", draft: result.data };
}
