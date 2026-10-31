import { importTemplateColumns, type StructuredImportType } from "./import-templates";

export type ImportMapping = Record<string, string>;

const aliases: Record<StructuredImportType, Partial<Record<string, string[]>>> = {
  accounts: {
    account_id: ["account id", "external id", "customer id", "partner account id"],
    account_name: ["account name", "customer", "customer name", "company", "name"],
  },
  locations: {
    account_id: ["account id", "account external id", "account reference", "customer id"],
    account_name: ["account name", "account", "customer", "customer name", "company"],
    location_id: ["location id", "location external id", "location reference", "site id"],
    location_name: ["location name", "location", "facility", "site name", "name"],
    address_1: ["address 1", "address", "street", "service address"],
    postal_code: ["postal code", "zip", "zipcode", "zip code"],
  },
  assets: {
    account_id: ["account id", "account external id", "account reference", "customer id"],
    account_name: ["account name", "account", "customer", "customer name", "company"],
    location_id: ["location id", "location external id", "location reference", "site id"],
    location_name: ["location name", "location", "facility", "site name"],
    asset_tag: ["asset tag", "asset id", "tag", "equipment id"],
    manufacturer: ["manufacturer", "make"],
    serial_number: ["serial number", "serial", "serial no"],
  },
  work_orders: {
    account_id: ["account id", "account external id", "account reference", "customer id"],
    account_name: ["account name", "account", "customer", "customer name", "company"],
    location_id: ["location id", "location external id", "location reference", "site id"],
    location_name: ["location name", "location", "facility", "site name"],
    work_order_id: ["work order id", "work order", "work order number", "wo number", "wo #", "wo", "partner work order", "partner wo"],
    service_type: ["service type", "job type", "service"],
    summary: ["summary", "job notes", "description", "complaint"],
    accepted_price: ["accepted price", "price", "total", "job pays", "authorization"],
  },
  technician_pay: {
    technician_code: ["technician code", "tech code", "employee code"],
    work_order_id: ["work order id", "work order", "work order number", "wo number", "wo #", "wo", "partner work order", "partner wo"],
    gross_revenue: ["gross revenue", "revenue"],
    payout_rate: ["payout rate", "rate"],
    payout: ["payout", "technician pay", "tech pay"],
  },
};

const requiredGroups: Record<StructuredImportType, string[][]> = {
  accounts: [["account_name"]],
  locations: [["account_id", "account_name"], ["location_name"], ["address_1"], ["city"], ["state"], ["postal_code"]],
  assets: [["account_id", "account_name"], ["location_id", "location_name"], ["asset_tag"], ["manufacturer"], ["model"]],
  work_orders: [["account_id", "account_name"], ["location_id", "location_name"], ["work_order_id"]],
  technician_pay: [["technician_code"], ["work_order_id"]],
};

export function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function suggestImportMapping(sourceHeaders: string[], type: StructuredImportType): ImportMapping {
  const available = new Set(sourceHeaders.map(normalizeImportHeader));
  const mapping: ImportMapping = {};
  for (const target of importTemplateColumns[type]) {
    const candidates = [target, ...(aliases[type][target] || [])].map(normalizeImportHeader);
    const match = candidates.find((candidate) => available.has(candidate));
    if (match) mapping[target] = match;
  }
  return mapping;
}

export function validateImportMapping(sourceHeaders: string[], type: StructuredImportType, mapping: ImportMapping) {
  const available = new Set(sourceHeaders.map(normalizeImportHeader));
  const allowedTargets = new Set(importTemplateColumns[type]);
  const errors: string[] = [];
  const usedSources = new Map<string, string>();
  for (const [target, source] of Object.entries(mapping)) {
    const normalizedSource = normalizeImportHeader(source);
    if (!allowedTargets.has(target)) errors.push(`Unknown TechCommand field: ${target}.`);
    if (!available.has(normalizedSource)) errors.push(`Source column is missing: ${source}.`);
    const previous = usedSources.get(normalizedSource);
    if (previous && previous !== target) errors.push(`Source column ${source} is mapped more than once.`);
    usedSources.set(normalizedSource, target);
  }
  for (const group of requiredGroups[type]) {
    if (!group.some((target) => mapping[target] && available.has(normalizeImportHeader(mapping[target]))))
      errors.push(`Map ${group.join(" or ").replaceAll("_", " ")}.`);
  }
  return { ready: errors.length === 0, errors };
}

export function applyImportMapping<T extends string | number | boolean | null>(rows: Record<string, T>[], mapping: ImportMapping) {
  return rows.map((row) => {
    const sourceValues = Object.fromEntries(Object.entries(row).map(([header, value]) => [normalizeImportHeader(header), value]));
    const normalized = { ...sourceValues };
    for (const [target, source] of Object.entries(mapping)) {
      const normalizedSource = normalizeImportHeader(source);
      // Read only the original cells: another target may share this source's name.
      if (Object.prototype.hasOwnProperty.call(sourceValues, normalizedSource)) normalized[target] = sourceValues[normalizedSource];
    }
    return normalized;
  });
}

export function adaptImportMapping(sourceHeaders: string[], type: StructuredImportType, mapping: ImportMapping) {
  const available = new Set(sourceHeaders.map(normalizeImportHeader));
  const allowedTargets = new Set(importTemplateColumns[type]);
  const adapted: ImportMapping = {};
  const usedSources = new Set<string>();
  for (const [target, source] of Object.entries(mapping)) {
    const normalizedSource = normalizeImportHeader(source);
    if (allowedTargets.has(target) && available.has(normalizedSource) && !usedSources.has(normalizedSource)) {
      adapted[target] = normalizedSource;
      usedSources.add(normalizedSource);
    }
  }
  for (const [target, source] of Object.entries(suggestImportMapping(sourceHeaders, type))) {
    if (!adapted[target] && !usedSources.has(source)) {
      adapted[target] = source;
      usedSources.add(source);
    }
  }
  return adapted;
}

export function importMappingFields(type: StructuredImportType) {
  return importTemplateColumns[type].map((key) => ({
    key,
    label: key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    required: requiredGroups[type].some((group) => group.includes(key)),
  }));
}
