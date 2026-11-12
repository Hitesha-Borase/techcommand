/** Record IDs are opaque: an intake ID may itself contain the `intake:` prefix. */
export type OrderTarget = { kind: "intake" | "work_order"; id: string };

export function orderTargetFromValue(value: unknown): OrderTarget | null {
  if(!value || typeof value!=="object")return null;
  const target=value as Record<string,unknown>;
  return (target.kind==="intake"||target.kind==="work_order") && typeof target.id==="string" && target.id.length>0 && target.id.length<=512
    ? {kind:target.kind,id:target.id}:null;
}

export function taskOrderTarget(source: unknown, sourceRecordId: unknown, workOrderId?: unknown): OrderTarget | undefined {
  if (source === "work_order_intake" && typeof sourceRecordId === "string" && sourceRecordId.startsWith("intake:") && sourceRecordId.length > 7)
    return { kind: "intake", id: sourceRecordId.slice(7) };
  if (typeof workOrderId === "string" && workOrderId) return { kind: "work_order", id: workOrderId };
}

export function orderHref(target: OrderTarget) {
  return `/#${target.kind}=${encodeURIComponent(target.id)}`;
}

export function orderTargetFromHash(hash: string): OrderTarget | null {
  const match = /^#(intake|work_order)=(.+)$/.exec(hash);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2]);
    return id && id.length <= 512 ? { kind: match[1] as OrderTarget["kind"], id } : null;
  } catch { return null; }
}
