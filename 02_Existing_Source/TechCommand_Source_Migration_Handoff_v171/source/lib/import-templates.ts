export type StructuredImportType =
  | "accounts"
  | "locations"
  | "assets"
  | "work_orders"
  | "technician_pay";

export const importTemplateColumns: Record<StructuredImportType, string[]> = {
  accounts: ["account_id", "account_name", "account_type", "billing_email", "payment_terms_days", "service_level"],
  locations: ["account_id", "account_name", "location_id", "location_name", "address_1", "address_2", "city", "state", "postal_code", "timezone", "department"],
  assets: ["account_id", "account_name", "location_id", "location_name", "asset_tag", "manufacturer", "model", "serial_number", "description", "department", "risk_class", "next_pm_due_on", "pm_interval_months"],
  work_orders: ["account_id", "account_name", "location_id", "location_name", "work_order_id", "service_type", "priority", "status", "summary", "required_technician_count", "scheduled_start", "accepted_price"],
  technician_pay: ["technician_code", "work_order_id", "gross_revenue", "payout_rate", "payout", "status"],
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function untrustedCsvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = typeof value === "string" && /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return csvCell(safe);
}

export function blankImportTemplate(type: StructuredImportType) {
  return `${importTemplateColumns[type].map(csvCell).join(",")}\r\n`;
}

type AccountReference = { id: string; externalId?: string | null; name?: string };
type LocationReference = { id: string; externalId?: string | null; accountId?: string; accountName?: string; name?: string };

export function companyReferenceCsv(accounts: AccountReference[], locations: LocationReference[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const rows = [["account_id", "account_name", "location_id", "location_name"]];
  for (const account of accounts) {
    const matches = locations.filter((location) => location.accountId === account.id);
    if (!matches.length) rows.push([account.externalId || account.id, account.name || "", "", ""]);
    for (const location of matches)
      rows.push([
        account.externalId || account.id,
        account.name || location.accountName || "",
        location.externalId || location.id,
        location.name || "",
      ]);
  }
  for (const location of locations) {
    if (location.accountId && byId.has(location.accountId)) continue;
    rows.push([location.accountId || "", location.accountName || "", location.externalId || location.id, location.name || ""]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function correctionOnlyCsv(
  rows: Record<string, unknown>[],
  errors: { row: number }[],
) {
  if (!rows.length) return { contents: "", rowCount: 0, protectedCellCount: 0 };
  const headers = Object.keys(rows[0]);
  const indexes = [...new Set(errors.map((error) => error.row - 2))]
    .filter((index) => index >= 0 && index < rows.length)
    .sort((left, right) => left - right);
  let protectedCellCount = headers.filter((header) => /^\s*[=+\-@]/.test(header)).length;
  const lines = [headers.map(untrustedCsvCell).join(",")];
  for (const index of indexes) {
    lines.push(headers.map((header) => {
      const value = rows[index][header];
      if (typeof value === "string" && /^\s*[=+\-@]/.test(value)) protectedCellCount += 1;
      return untrustedCsvCell(value);
    }).join(","));
  }
  return { contents: `${lines.join("\r\n")}\r\n`, rowCount: indexes.length, protectedCellCount };
}
