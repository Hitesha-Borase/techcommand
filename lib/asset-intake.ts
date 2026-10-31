import { normalizeImportHeader } from "@/lib/import-mapping";
import type { ImportCell } from "@/lib/import-parsing";

/** A file-level facility choice fills absent reference columns; supplied references stay authoritative. */
export function scopedAssetRows(rows: Record<string, ImportCell>[], accountId: string, locationId: string): Record<string, ImportCell>[] {
  if (!rows.length || !accountId || !locationId) return rows;
  const headers = new Set(Object.keys(rows[0]).map(normalizeImportHeader));
  const hasAccount = ["account_id", "account_external_id", "account_reference", "customer_id", "account_name", "account", "customer", "customer_name", "company"].some(key => headers.has(key));
  const hasLocation = ["location_id", "location_external_id", "location_reference", "site_id", "location_name", "location", "facility", "site_name"].some(key => headers.has(key));
  if (hasAccount || hasLocation) return rows;
  return rows.map(row => ({ ...row, account_id: accountId, location_id: locationId }));
}
