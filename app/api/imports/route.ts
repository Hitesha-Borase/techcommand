import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  PortalHttpError,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { applyImportMapping, validateImportMapping, type ImportMapping } from "@/lib/import-mapping";

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const assetUpdateField = z.enum([
  "customer_asset_id", "manufacturer", "model", "serial_number", "description",
  "department", "risk_class", "next_pm_due_on", "pm_interval_months",
]);
const assetDecision = z.object({
  row: z.number().int().min(2),
  action: z.enum(["create", "update", "skip"]),
  assetId: z.string().min(1).nullable(),
  expectedRecordVersion: z.number().int().positive().nullable(),
  fields: z.array(assetUpdateField).max(9),
});
const importSchema = z.object({
  importId: z.string().uuid().optional(),
  mode: z.enum(["preview", "apply"]).default("apply"),
  importType: z.enum(["accounts", "locations", "assets", "work_orders", "technician_pay"]),
  source: z.enum(["excel", "csv", "google_sheets", "quickbooks"]),
  fileName: z.string().max(255).optional().nullable(),
  mappingProfileId: z.string().uuid().optional(),
  mappingProfileVersion: z.number().int().min(1).optional(),
  rows: z.array(z.record(z.string(), cell)).min(1).max(1000),
  assetDecisions: z.array(assetDecision).max(1000).optional(),
});

type AssetUpdateField = z.infer<typeof assetUpdateField>;
type AssetDecision = z.infer<typeof assetDecision>;

type ImportError = { row: number; message: string };
type ImportProgress = {
  id: string;
  importType: string;
  source: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  mappingJson: string | null;
  errorJson: string | null;
};

type ImportCheckpoint = {
  requestFingerprint?: string;
  sourceFingerprint?: string;
  mappingProfileId?: string | null;
  mappingProfileVersion?: number | null;
  mappingSnapshot?: ImportMapping | null;
};

const importConflictMessage = "This import is already continuing in another request. Keep the file selected, refresh import history, then retry if it is still processing.";

async function requestFingerprint(input: z.infer<typeof importSchema>) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({
      importType: input.importType,
      source: input.source,
      fileName: input.fileName || null,
      mappingProfileId: input.mappingProfileId || null,
      mappingProfileVersion: input.mappingProfileVersion || null,
      rows: input.rows,
      assetDecisions: input.assetDecisions || null,
    })),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sourceFingerprint(input: z.infer<typeof importSchema>) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({
      importType: input.importType,
      source: input.source,
      fileName: input.fileName || null,
      mappingProfileId: input.mappingProfileId || null,
      rows: input.rows,
    })),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function savedCheckpoint(value: string | null): ImportCheckpoint {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ImportCheckpoint : {};
  } catch {
    return {};
  }
}

function savedMappingSnapshot(value: unknown): ImportMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([target, source]) => Boolean(target) && typeof source === "string")
    ? Object.fromEntries(entries) as ImportMapping
    : null;
}

function savedErrors(value: string | null): ImportError[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ImportError => Boolean(
        item && typeof item === "object" &&
        Number.isInteger((item as ImportError).row) &&
        typeof (item as ImportError).message === "string",
      ))
      : [];
  } catch {
    return [];
  }
}

function importResponse(progress: Pick<ImportProgress, "id" | "status" | "rowCount" | "successCount" | "errorCount" | "createdCount" | "updatedCount" | "skippedCount" | "errorJson">) {
  return Response.json({ import: {
    id: progress.id,
    status: progress.status,
    rowCount: progress.rowCount,
    successCount: progress.successCount,
    errorCount: progress.errorCount,
    createdCount: progress.createdCount,
    updatedCount: progress.updatedCount,
    skippedCount: progress.skippedCount,
    errors: savedErrors(progress.errorJson),
  } });
}

function progressGuard(importId: string, successCount: number, errorCount: number) {
  return env.DB.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM data_imports
     WHERE id=? AND organization_id=? AND status='processing'
       AND success_count=? AND error_count=?
  ) THEN 1 ELSE json('import_progress_conflict') END`).bind(
    importId, TECHFLEX_ORG_ID, successCount, errorCount,
  );
}

function isProgressConflict(error: unknown) {
  return String(error).includes("malformed JSON");
}

function rowError(row: number, error: unknown): ImportError {
  const message = error instanceof Error
    ? (/UNIQUE constraint/i.test(error.message)
      ? "This record already exists. Review it before importing again."
      : /(?:D1_ERROR|SQLITE|constraint)/i.test(error.message)
        ? "The row could not be saved. Check its record references and required values."
        : error.message)
    : "The row could not be saved.";
  return { row, message };
}

function key(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizedRow(row: Record<string, string | number | boolean | null>) {
  const headers=Object.keys(row).map(key);
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error("Column headers must be nonempty and distinct after normalization.");
  return Object.fromEntries(Object.entries(row).map(([header, value]) => [key(header), value]));
}

function textValue(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function numberValue(row: Record<string, unknown>, ...names: string[]) {
  const raw = textValue(row, ...names).replace(/[$,%]/g, "").replace(/,/g, "");
  const value = Number(raw);
  if (raw && (!Number.isFinite(value) || value < 0)) throw new Error(`${names[0]} must be a non-negative number.`);
  return value;
}


async function uniqueMatch<T>(statement: D1PreparedStatement, label: string): Promise<T | null> {
  const result = await statement.all<T>();
  if (result.results.length > 1) throw new Error(`${label} matches more than one record. Use a unique reference or correct duplicate records before importing.`);
  return result.results[0] || null;
}

async function resolveAccount(row: Record<string, unknown>) {
  const reference = textValue(row, "account_id", "account_external_id", "account_reference");
  if (reference) {
    const account = await uniqueMatch<{ id: string }>(env.DB.prepare(
      `SELECT id FROM accounts WHERE organization_id=? AND status='active'
        AND (id=? OR external_id=?) LIMIT 2`,
    ).bind(TECHFLEX_ORG_ID, reference, reference), `Account ID ${reference}`);
    if (!account) throw new Error(`Account ID not found: ${reference}. Download a fresh account/location reference file and use its account_id value.`);
    return account;
  }
  const name = textValue(row, "account_name", "account", "customer");
  const account = await uniqueMatch<{ id: string }>(env.DB.prepare(
    "SELECT id FROM accounts WHERE organization_id=? AND lower(name)=lower(?) AND status='active' LIMIT 2",
  ).bind(TECHFLEX_ORG_ID, name), `Account ${name || "(blank)"}`);
  if (!account) throw new Error(`Account not found: ${name || "(blank)"}. Add account_id to select the exact company.`);
  return account;
}

async function resolveHierarchy(row: Record<string, unknown>) {
  const account = await resolveAccount(row);
  const reference = textValue(row, "location_id", "location_external_id", "location_reference");
  if (reference) {
    const location = await uniqueMatch<{ id: string }>(env.DB.prepare(
      `SELECT id FROM locations WHERE account_id=? AND status='active'
        AND (id=? OR external_id=?) LIMIT 2`,
    ).bind(account.id, reference, reference), `Location ID ${reference}`);
    if (!location) throw new Error(`Location ID not found for the selected account: ${reference}. Download a fresh account/location reference file and use its location_id value.`);
    return { accountId: account.id, locationId: location.id };
  }
  const name = textValue(row, "location_name", "location", "facility");
  const location = await uniqueMatch<{ id: string }>(env.DB.prepare(
    "SELECT id FROM locations WHERE account_id=? AND lower(name)=lower(?) AND status='active' LIMIT 2",
  ).bind(account.id, name), `Location ${name || "(blank)"}`);
  if (!location) throw new Error(`Location not found for the selected account: ${name || "(blank)"}. Add location_id to select the exact service location.`);
  return { accountId: account.id, locationId: location.id };
}

type ExistingAsset = {
  id: string; accountId: string; locationId: string; assetTag: string;
  customerAssetId: string | null; manufacturer: string; model: string; serialNumber: string | null;
  description: string | null; department: string | null; riskClass: string;
  nextPmDueOn: string | null; pmIntervalMonths: number | null; categoryRevisionId: string | null;
  recordVersion: number;
};

const assetFieldColumns: Record<AssetUpdateField, { column: string; label: string; current: keyof ExistingAsset }> = {
  customer_asset_id: { column: "customer_asset_id", label: "Customer asset ID", current: "customerAssetId" },
  manufacturer: { column: "manufacturer", label: "Manufacturer", current: "manufacturer" },
  model: { column: "model", label: "Model", current: "model" },
  serial_number: { column: "serial_number", label: "Serial number", current: "serialNumber" },
  description: { column: "description", label: "Description", current: "description" },
  department: { column: "department", label: "Department note", current: "department" },
  risk_class: { column: "risk_class", label: "Asset risk class", current: "riskClass" },
  next_pm_due_on: { column: "next_pm_due_on", label: "Next PM due date", current: "nextPmDueOn" },
  pm_interval_months: { column: "pm_interval_months", label: "PM interval months", current: "pmIntervalMonths" },
};

function importedAssetValues(row: Record<string, unknown>, creating = false) {
  const text = (field: string, ...aliases: string[]) => {
    const value = textValue(row, field, ...aliases);
    return value || (creating ? null : undefined);
  };
  const riskRaw = textValue(row, "risk_class", "risk").toLowerCase();
  if (riskRaw && !["unassessed", "low", "medium", "high", "critical"].includes(riskRaw))
    throw new Error("Risk class must be unassessed, low, medium, high, or critical.");
  const dueRaw = textValue(row, "next_pm_due", "next_pm_due_on");
  if (dueRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueRaw))
    throw new Error("Next PM due date must use YYYY-MM-DD.");
  const intervalRaw = textValue(row, "pm_interval_months", "pm_interval");
  const interval = intervalRaw ? numberValue(row, "pm_interval_months", "pm_interval") : (creating ? null : undefined);
  if (typeof interval === "number" && (!Number.isInteger(interval) || interval < 1 || interval > 60))
    throw new Error("PM interval months must be a whole number from 1 through 60.");
  return {
    customer_asset_id: text("customer_asset_id"),
    manufacturer: text("manufacturer", "make"),
    model: text("model"),
    serial_number: text("serial_number", "serial"),
    description: text("description", "equipment"),
    department: text("department"),
    risk_class: riskRaw || (creating ? "unassessed" : undefined),
    next_pm_due_on: dueRaw || (creating ? null : undefined),
    pm_interval_months: interval,
  } satisfies Record<AssetUpdateField, string | number | null | undefined>;
}

async function existingAssetByTag(assetTag: string) {
  return env.DB.prepare(`SELECT id,account_id AS accountId,location_id AS locationId,asset_tag AS assetTag,
    customer_asset_id AS customerAssetId,manufacturer,model,serial_number AS serialNumber,description,department,
    risk_class AS riskClass,next_pm_due_on AS nextPmDueOn,pm_interval_months AS pmIntervalMonths,
    category_revision_id AS categoryRevisionId,record_version AS recordVersion
    FROM assets WHERE organization_id=? AND asset_tag=? LIMIT 1`).bind(TECHFLEX_ORG_ID, assetTag).first<ExistingAsset>();
}

async function existingAssetById(assetId: string) {
  return env.DB.prepare(`SELECT id,account_id AS accountId,location_id AS locationId,asset_tag AS assetTag,
    customer_asset_id AS customerAssetId,manufacturer,model,serial_number AS serialNumber,description,department,
    risk_class AS riskClass,next_pm_due_on AS nextPmDueOn,pm_interval_months AS pmIntervalMonths,
    category_revision_id AS categoryRevisionId,record_version AS recordVersion
    FROM assets WHERE organization_id=? AND id=? LIMIT 1`).bind(TECHFLEX_ORG_ID, assetId).first<ExistingAsset>();
}

async function scopedIdentityCollision(locationId: string, assetTag: string, manufacturer: string, serialNumber: string, customerAssetId: string) {
  if (!serialNumber && !customerAssetId) return null;
  return env.DB.prepare(`SELECT id,asset_tag AS assetTag,record_version AS recordVersion FROM assets WHERE organization_id=? AND location_id=? AND asset_tag<>?
    AND ((?<>'' AND lower(manufacturer)=lower(?) AND lower(COALESCE(serial_number,''))=lower(?))
      OR (?<>'' AND lower(COALESCE(customer_asset_id,''))=lower(?))) LIMIT 1`).bind(
    TECHFLEX_ORG_ID, locationId, assetTag,
    serialNumber, manufacturer, serialNumber, customerAssetId, customerAssetId,
  ).first<{ id: string; assetTag: string; recordVersion: number }>();
}

const openAssetWorkSql = `EXISTS(SELECT 1 FROM work_orders w WHERE w.organization_id=?
  AND w.status NOT IN ('ready_to_invoice','completed','approved','invoiced','paid','cancelled','closed')
  AND (w.asset_id=? OR EXISTS(SELECT 1 FROM work_order_assets wa WHERE wa.work_order_id=w.id AND wa.asset_id=?)))`;

async function assetHasOpenWork(assetId: string) {
  const row = await env.DB.prepare(`SELECT CASE WHEN ${openAssetWorkSql} THEN 1 ELSE 0 END AS active`).bind(
    TECHFLEX_ORG_ID, assetId, assetId,
  ).first<{ active: number }>();
  return Boolean(row?.active);
}

function assetReviewSnapshot(asset: ExistingAsset) {
  return Object.fromEntries((Object.keys(assetFieldColumns) as AssetUpdateField[]).map((field) => [field, asset[assetFieldColumns[field].current]]));
}

async function previewAssetRows(rows: Record<string, string | number | boolean | null>[]) {
  const preview = [] as Record<string, unknown>[];
  for (let index = 0; index < rows.length; index += 1) {
    const sourceRow = index + 2;
    try {
      const row = normalizedRow(rows[index]);
      const hierarchy = await resolveHierarchy(row);
      const assetTag = textValue(row, "asset_tag", "asset_id", "tag");
      const manufacturer = textValue(row, "manufacturer", "make");
      const model = textValue(row, "model");
      if (!assetTag || !manufacturer || !model) throw new Error("Asset tag, manufacturer, and model are required.");
      const existing = await existingAssetByTag(assetTag);
      if (!existing) {
        const incoming = importedAssetValues(row, true);
        const collision = await scopedIdentityCollision(
          hierarchy.locationId, assetTag, manufacturer,
          String(incoming.serial_number || ""), String(incoming.customer_asset_id || ""),
        );
        if (collision) {
          preview.push({ row: sourceRow, status: "conflict", defaultAction: "skip", assetTag, assetId: collision.id, expectedRecordVersion: collision.recordVersion, fields: [], issue: `Serial or customer asset identity already belongs to ${collision.assetTag} at this facility. Review that asset instead of creating another record.` });
          continue;
        }
        preview.push({ row: sourceRow, status: "new", defaultAction: "create", assetTag, assetId: null, expectedRecordVersion: null, fields: Object.entries(incoming).filter(([, value]) => value !== undefined).map(([field, value]) => ({ field, label: assetFieldColumns[field as AssetUpdateField].label, current: null, incoming: value, blockedReason: null })) });
        continue;
      }
      if (existing.accountId !== hierarchy.accountId || existing.locationId !== hierarchy.locationId) {
        preview.push({ row: sourceRow, status: "conflict", defaultAction: "skip", assetTag, assetId: existing.id, expectedRecordVersion: existing.recordVersion, fields: [], issue: "This asset tag belongs to a different saved account or facility. Use Placement and configuration history for an actual move." });
        continue;
      }
      const incoming = importedAssetValues(row, false);
      const openWork = await assetHasOpenWork(existing.id);
      const fields = (Object.keys(assetFieldColumns) as AssetUpdateField[]).flatMap((field) => {
        const value = incoming[field];
        if (value === undefined) return [];
        const current = existing[assetFieldColumns[field].current] as string | number | null;
        if (String(current ?? "") === String(value ?? "")) return [];
        let blockedReason: string | null = null;
        if (openWork) blockedReason = "Open work must be finished or cancelled before this asset can be updated.";
        else if (existing.categoryRevisionId && ["risk_class", "pm_interval_months"].includes(field)) blockedReason = "Use the governed category-policy workflow for this pinned risk or interval value.";
        return [{ field, label: assetFieldColumns[field].label, current, incoming: value, blockedReason }];
      });
      preview.push({ row: sourceRow, status: fields.length ? "changed" : "unchanged", defaultAction: "skip", assetTag, assetId: existing.id, expectedRecordVersion: existing.recordVersion, fields, issue: fields.length ? null : "No nonblank imported value differs from the saved asset." });
    } catch (error) {
      preview.push({ row: sourceRow, status: "error", defaultAction: "skip", assetTag: "", assetId: null, expectedRecordVersion: null, fields: [], issue: rowError(sourceRow, error).message });
    }
  }
  return preview;
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const result = await env.DB.prepare(
      `SELECT id, import_type AS importType, source, file_name AS fileName, status,
              row_count AS rowCount, success_count AS successCount, error_count AS errorCount,
              created_count AS createdCount, updated_count AS updatedCount, skipped_count AS skippedCount,
              started_at AS startedAt, completed_at AS completedAt, error_json AS errorJson
         FROM data_imports
        WHERE organization_id = ?
        ORDER BY started_at DESC LIMIT 25`,
    ).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ imports: result.results.map((row: Record<string, unknown>) => ({ ...row, errors: savedErrors(row.errorJson ? String(row.errorJson) : null) })) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const submitted = importSchema.parse(await request.json());
    if (submitted.mappingProfileId && !submitted.mappingProfileVersion)
      throw new PortalHttpError(400, "Reload the saved column plan before importing this spreadsheet.");
    if (!submitted.mappingProfileId && submitted.mappingProfileVersion)
      throw new PortalHttpError(400, "Choose the saved column plan again before importing.");

    const submittedSourceFingerprint = await sourceFingerprint(submitted);
    let importId = submitted.importId || crypto.randomUUID();
    let progress = await env.DB.prepare(
      `SELECT id, import_type AS importType, source, file_name AS fileName, status,
              row_count AS rowCount, success_count AS successCount, error_count AS errorCount,
              created_count AS createdCount, updated_count AS updatedCount, skipped_count AS skippedCount,
              mapping_json AS mappingJson, error_json AS errorJson
         FROM data_imports WHERE id=? AND organization_id=? LIMIT 1`,
    ).bind(importId, TECHFLEX_ORG_ID).first<ImportProgress>();
    if (!progress) {
      progress = await env.DB.prepare(
        `SELECT id, import_type AS importType, source, file_name AS fileName, status,
                row_count AS rowCount, success_count AS successCount, error_count AS errorCount,
                created_count AS createdCount, updated_count AS updatedCount, skipped_count AS skippedCount,
                mapping_json AS mappingJson, error_json AS errorJson
           FROM data_imports
          WHERE organization_id=? AND status='processing'
            AND CASE WHEN json_valid(mapping_json)
                     THEN json_extract(mapping_json, '$.sourceFingerprint')
                     ELSE NULL END=?
          ORDER BY started_at DESC LIMIT 1`,
      ).bind(TECHFLEX_ORG_ID, submittedSourceFingerprint).first<ImportProgress>();
      if (progress) importId = progress.id;
    }

    let input = submitted;
    let mappingSnapshot: ImportMapping | null = null;
    const checkpoint = savedCheckpoint(progress?.mappingJson || null);
    if (progress && checkpoint.sourceFingerprint) {
      if (checkpoint.sourceFingerprint !== submittedSourceFingerprint)
        throw new PortalHttpError(409, "This recovery ID belongs to a different spreadsheet. Choose the original file again or start a new import.");
      if ((checkpoint.mappingProfileId || null) !== (submitted.mappingProfileId || null))
        throw new PortalHttpError(409, "This recovery ID belongs to a different column plan. Choose the original spreadsheet and plan again.");
      if (submitted.mappingProfileId) {
        mappingSnapshot = savedMappingSnapshot(checkpoint.mappingSnapshot);
        if (!mappingSnapshot || !checkpoint.mappingProfileVersion)
          throw new PortalHttpError(409, "This older import does not contain a recoverable column snapshot. Keep the source file and ask an administrator to review its saved rows before starting a corrected-row import.");
        const currentHeaders = Object.keys(submitted.rows[0] || {});
        const validation = validateImportMapping(currentHeaders, submitted.importType, mappingSnapshot);
        if (!validation.ready)
          throw new PortalHttpError(409, `This spreadsheet no longer matches the mapping reviewed when the import began. ${validation.errors.join(" ")}`);
        input = {
          ...submitted,
          mappingProfileVersion: checkpoint.mappingProfileVersion,
          rows: applyImportMapping(submitted.rows, mappingSnapshot),
        };
      }
    } else if (submitted.mappingProfileId) {
      const saved = await env.DB.prepare(`SELECT import_type AS importType,source_headers_json AS sourceHeadersJson,
        mapping_json AS mappingJson,record_version AS recordVersion,status
        FROM import_mapping_profiles WHERE id=? AND organization_id=? LIMIT 1`).bind(
        submitted.mappingProfileId, TECHFLEX_ORG_ID,
      ).first<{ importType: string; sourceHeadersJson: string; mappingJson: string; recordVersion: number; status: string }>();
      if (!saved) throw new PortalHttpError(404, "This saved column plan no longer exists. Reload the plan list.");
      if (saved.importType !== submitted.importType)
        throw new PortalHttpError(400, "This column plan belongs to a different import type.");
      if (saved.recordVersion !== submitted.mappingProfileVersion)
        throw new PortalHttpError(409, "This column plan changed after the preview opened. Reload it and compare the mapped columns before importing.");
      let mapping: ImportMapping;
      try { mapping = JSON.parse(saved.mappingJson) as ImportMapping; }
      catch { throw new PortalHttpError(409, "This saved column plan cannot be read. Rebuild it before importing."); }
      const currentHeaders = Object.keys(submitted.rows[0] || {});
      const validation = validateImportMapping(currentHeaders, submitted.importType, mapping);
      if (!validation.ready)
        throw new PortalHttpError(409, `This spreadsheet no longer matches the saved column plan. ${validation.errors.join(" ")}`);
      mappingSnapshot = mapping;
      input = { ...submitted, rows: applyImportMapping(submitted.rows, mapping) };
    }
    if (input.mode === "preview") {
      if (input.importType !== "assets") throw new PortalHttpError(400, "Controlled update preview is available only for biomedical asset imports.");
      return Response.json({ preview: await previewAssetRows(input.rows) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    let assetDecisions = new Map<number, AssetDecision>();
    if (input.importType === "assets") {
      if (!input.assetDecisions || input.assetDecisions.length !== input.rows.length)
        throw new PortalHttpError(400, "Review every asset row as Create, Update selected fields, or Skip before importing.");
      assetDecisions = new Map(input.assetDecisions.map((decision) => [decision.row, decision]));
      if (assetDecisions.size !== input.rows.length || input.rows.some((_, index) => !assetDecisions.has(index + 2)))
        throw new PortalHttpError(400, "Each asset row must have one controlled import decision.");
      for (const decision of input.assetDecisions) {
        if (decision.action === "update" && (!decision.assetId || !decision.expectedRecordVersion || !decision.fields.length))
          throw new PortalHttpError(400, `Row ${decision.row} needs an exact asset version and at least one selected field before update.`);
        if (decision.action === "create" && (decision.assetId || decision.expectedRecordVersion || decision.fields.length))
          throw new PortalHttpError(400, `Row ${decision.row} cannot combine Create with an existing asset or update fields.`);
        if (decision.action === "skip" && decision.fields.length)
          throw new PortalHttpError(400, `Row ${decision.row} cannot combine Skip with update fields.`);
      }
    } else if (input.assetDecisions?.length) {
      throw new PortalHttpError(400, "Asset decisions cannot be applied to another import type.");
    }
    const fingerprint = await requestFingerprint(input);
    if (!progress) {
      const interrupted = await env.DB.prepare(
        `SELECT id FROM data_imports
          WHERE organization_id=? AND status='processing'
            AND CASE WHEN json_valid(mapping_json)
                     THEN json_extract(mapping_json, '$.requestFingerprint')
                     ELSE NULL END=?
          ORDER BY started_at DESC LIMIT 1`,
      ).bind(TECHFLEX_ORG_ID, fingerprint).first<{ id: string }>();
      if (interrupted) importId = interrupted.id;
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO data_imports
        (id, organization_id, import_type, source, file_name, status, row_count, mapping_json, imported_by)
       VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?)`,
    ).bind(
      importId, TECHFLEX_ORG_ID, input.importType, input.source,
      input.fileName || null, input.rows.length, JSON.stringify({
        requestFingerprint: fingerprint,
        sourceFingerprint: submittedSourceFingerprint,
        mappingProfileId: input.mappingProfileId || null,
        mappingProfileVersion: input.mappingProfileVersion || null,
        mappingSnapshot,
      }), identity.userId,
    ).run();
    progress = await env.DB.prepare(
      `SELECT id, import_type AS importType, source, file_name AS fileName, status,
              row_count AS rowCount, success_count AS successCount, error_count AS errorCount,
              created_count AS createdCount, updated_count AS updatedCount, skipped_count AS skippedCount,
              mapping_json AS mappingJson, error_json AS errorJson
         FROM data_imports WHERE id=? AND organization_id=? LIMIT 1`,
    ).bind(importId, TECHFLEX_ORG_ID).first<ImportProgress>();
    if (!progress) throw new Error("The import checkpoint could not be prepared.");
    const storedFingerprint = savedCheckpoint(progress.mappingJson).requestFingerprint || "";
    if (
      progress.importType !== input.importType || progress.source !== input.source ||
      progress.fileName !== (input.fileName || null) || progress.rowCount !== input.rows.length ||
      storedFingerprint !== fingerprint
    ) throw new PortalHttpError(409, "This recovery ID belongs to a different spreadsheet. Choose the original file again or start a new import.");
    if (["complete", "completed_with_errors"].includes(progress.status)) return importResponse(progress);
    if (progress.status !== "processing") throw new PortalHttpError(409, "This import cannot be resumed from its current status. Start a new import with the source spreadsheet.");

    let errors = savedErrors(progress.errorJson);
    let successCount = progress.successCount;
    let errorCount = progress.errorCount;
    let createdCount = progress.createdCount;
    let updatedCount = progress.updatedCount;
    let skippedCount = progress.skippedCount;
    const startIndex = successCount + errorCount;
    if (startIndex > input.rows.length || errors.length !== errorCount)
      throw new PortalHttpError(409, "This import checkpoint is inconsistent. Keep the source file and ask an administrator to review the import history before retrying.");

    for (let index = startIndex; index < input.rows.length; index += 1) {
      const statements: D1PreparedStatement[] = [];
      let outcome: "created" | "updated" | "skipped" = "created";
      try {
        const row = normalizedRow(input.rows[index]);
        if (input.importType === "accounts") {
          const name = textValue(row, "account_name", "name", "customer");
          if (!name) throw new Error("Account name is required.");
          const externalId = textValue(row, "external_id", "account_id");
          if (await env.DB.prepare("SELECT id FROM accounts WHERE organization_id=? AND (lower(name)=lower(?) OR (?!='' AND external_id=?)) LIMIT 1").bind(TECHFLEX_ORG_ID,name,externalId,externalId).first()) throw new Error("Account already exists. Review the existing account instead of importing a duplicate.");
          statements.push(
            env.DB.prepare(
              `INSERT INTO accounts
                (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level)
               VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              TECHFLEX_ORG_ID,
              textValue(row, "external_id", "account_id") || null,
              name,
              textValue(row, "account_type", "type") || "facility",
              textValue(row, "billing_email", "email") || null,
              textValue(row,"payment_terms_days","terms_days") ? numberValue(row,"payment_terms_days","terms_days") : 30,
              textValue(row, "service_level", "sla") || null,
            ),
          );
        }

        if (input.importType === "locations") {
          const name = textValue(row, "location_name", "name", "facility");
          const account = await resolveAccount(row);
          if (!name) throw new Error("Location name is required.");
          if (!textValue(row,"address_1","address","street") || !textValue(row,"city") || !textValue(row,"state") || !textValue(row,"postal_code","zip","zipcode")) throw new Error("Address, city, state, and ZIP are required for a location.");
          if (await env.DB.prepare("SELECT id FROM locations WHERE account_id=? AND lower(name)=lower(?) LIMIT 1").bind(account.id,name).first()) throw new Error("Location already exists for this account. Review its existing record.");
          const locationId = crypto.randomUUID();
          statements.push(
            env.DB.prepare(
              `INSERT INTO locations
                (id, account_id, external_id, name, location_type, status, address_1, address_2, city, state, postal_code, timezone)
               VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
            ).bind(
              locationId,
              account.id,
              textValue(row, "external_id", "location_id") || null,
              name,
              textValue(row, "location_type", "type") || null,
              textValue(row, "address_1", "address", "street"),
              textValue(row, "address_2", "suite") || null,
              textValue(row, "city"),
              textValue(row, "state").toUpperCase(),
              textValue(row, "postal_code", "zip", "zipcode"),
              textValue(row, "timezone") || "America/New_York",
            ),
          );
          const department = textValue(row, "department", "department_name");
          if (department) {
            statements.push(
              env.DB.prepare(
                "INSERT INTO departments (id, location_id, name, status) VALUES (?, ?, ?, 'active')",
              ).bind(crypto.randomUUID(), locationId, department),
            );
          }
        }

        if (input.importType === "assets") {
          const decision = assetDecisions.get(index + 2)!;
          const assetTag = textValue(row, "asset_tag", "asset_id", "tag");
          const existing = assetTag ? await existingAssetByTag(assetTag) : null;
          if (decision.action === "skip") {
            const reviewed = decision.assetId && existing?.id !== decision.assetId
              ? await existingAssetById(decision.assetId)
              : existing;
            if (decision.assetId) {
              if (!reviewed || reviewed.id !== decision.assetId || reviewed.recordVersion !== decision.expectedRecordVersion)
                throw new Error("The matched asset changed after preview. Review this spreadsheet again before recording the skip.");
            } else if (existing) {
              throw new Error("This row now matches an existing asset. Review it again before recording the skip.");
            }
            outcome = "skipped";
            const before = reviewed ? assetReviewSnapshot(reviewed) : null;
            statements.push(env.DB.prepare(`INSERT INTO asset_import_rows
              (id,organization_id,import_id,source_row,action,asset_id,expected_asset_version,selected_fields_json,source_json,before_json,after_json,decided_by)
              VALUES(?,?,?,?, 'skip', ?, ?, '[]', ?, ?, ?, ?)`).bind(
              crypto.randomUUID(), TECHFLEX_ORG_ID, importId, index + 2,
              reviewed?.id || null, reviewed?.recordVersion || null, JSON.stringify(row),
              before ? JSON.stringify(before) : null, before ? JSON.stringify(before) : null, identity.userId,
            ));
          } else {
            const hierarchy = await resolveHierarchy(row);
            const manufacturer = textValue(row, "manufacturer", "make");
            const model = textValue(row, "model");
            if (!assetTag || !manufacturer || !model) throw new Error("Asset tag, manufacturer, and model are required.");
            if (decision.action === "create") {
              if (existing) throw new Error("This asset tag now exists. Review the spreadsheet again and choose an explicit update or skip.");
              const incoming = importedAssetValues(row, true);
              const collision = await scopedIdentityCollision(
                hierarchy.locationId, assetTag, manufacturer,
                String(incoming.serial_number || ""), String(incoming.customer_asset_id || ""),
              );
              if (collision) throw new Error(`Serial or customer asset identity already belongs to ${collision.assetTag} at this facility.`);
              const assetId = crypto.randomUUID();
              statements.push(
                env.DB.prepare(`INSERT INTO assets
                  (id,organization_id,account_id,location_id,asset_tag,customer_asset_id,manufacturer,model,serial_number,description,department,risk_class,status,next_pm_due_on,pm_interval_months)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'pending_verification', ?,?)`).bind(
                  assetId, TECHFLEX_ORG_ID, hierarchy.accountId, hierarchy.locationId, assetTag,
                  incoming.customer_asset_id, incoming.manufacturer, incoming.model, incoming.serial_number,
                  incoming.description, incoming.department, incoming.risk_class,
                  incoming.next_pm_due_on, incoming.pm_interval_months,
                ),
                env.DB.prepare(`INSERT INTO asset_import_rows
                  (id,organization_id,import_id,source_row,action,asset_id,expected_asset_version,selected_fields_json,source_json,before_json,after_json,decided_by)
                  VALUES(?,?,?,?, 'create', ?,NULL,'[]',?,NULL,?,?)`).bind(
                  crypto.randomUUID(), TECHFLEX_ORG_ID, importId, index + 2, assetId,
                  JSON.stringify(row), JSON.stringify(incoming), identity.userId,
                ),
                env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,'asset.import_created','asset',?,?)").bind(
                  crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, assetId,
                  JSON.stringify({ importId, sourceRow: index + 2, values: incoming }),
                ),
              );
            } else {
              if (!existing || existing.id !== decision.assetId)
                throw new Error("The matched asset changed after preview. Review the spreadsheet again before updating.");
              if (existing.accountId !== hierarchy.accountId || existing.locationId !== hierarchy.locationId)
                throw new Error("The asset belongs to a different saved account or facility. Use Placement and configuration history for an actual move.");
              if (existing.recordVersion !== decision.expectedRecordVersion)
                throw new Error("The asset changed after preview. Refresh and compare the spreadsheet again.");
              if (await assetHasOpenWork(existing.id))
                throw new Error("Finish or cancel the asset's open work before applying imported changes.");
              const incoming = importedAssetValues(row, false);
              const selected = [...new Set(decision.fields)];
              if (existing.categoryRevisionId && selected.some((field) => ["risk_class", "pm_interval_months"].includes(field)))
                throw new Error("Use the governed category-policy workflow for a pinned asset's risk or PM interval.");
              const assignments: string[] = [];
              const values: unknown[] = [];
              const before: Partial<Record<AssetUpdateField, unknown>> = {};
              const after: Partial<Record<AssetUpdateField, unknown>> = {};
              for (const field of selected) {
                const value = incoming[field];
                if (value === undefined) throw new Error(`${assetFieldColumns[field].label} is blank. Blank cells never erase saved asset data.`);
                const current = existing[assetFieldColumns[field].current] as string | number | null;
                if (String(current ?? "") === String(value ?? "")) throw new Error(`${assetFieldColumns[field].label} no longer differs from the saved asset.`);
                assignments.push(`${assetFieldColumns[field].column}=?`);
                values.push(value);
                before[field] = current;
                after[field] = value;
              }
              if (!assignments.length) throw new Error("Select at least one changed, nonblank field to update.");
              outcome = "updated";
              statements.push(
                env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM assets WHERE id=? AND organization_id=? AND account_id=? AND location_id=? AND record_version=?) THEN 1 ELSE json('asset_import_stale') END").bind(
                  existing.id, TECHFLEX_ORG_ID, hierarchy.accountId, hierarchy.locationId, existing.recordVersion,
                ),
                env.DB.prepare(`SELECT CASE WHEN NOT ${openAssetWorkSql} THEN 1 ELSE json('asset_import_open_work') END`).bind(TECHFLEX_ORG_ID, existing.id, existing.id),
                env.DB.prepare(`UPDATE assets SET ${assignments.join(",")},record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?`).bind(
                  ...values, existing.id, TECHFLEX_ORG_ID, existing.recordVersion,
                ),
                env.DB.prepare(`INSERT INTO asset_import_rows
                  (id,organization_id,import_id,source_row,action,asset_id,expected_asset_version,selected_fields_json,source_json,before_json,after_json,decided_by)
                  VALUES(?,?,?,?, 'update', ?,?,?,?,?,?,?)`).bind(
                  crypto.randomUUID(), TECHFLEX_ORG_ID, importId, index + 2, existing.id, existing.recordVersion,
                  JSON.stringify(selected), JSON.stringify(row), JSON.stringify(before), JSON.stringify(after), identity.userId,
                ),
                env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,'asset.import_updated','asset',?,?,?)").bind(
                  crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, existing.id,
                  JSON.stringify({ importId, sourceRow: index + 2, values: before }),
                  JSON.stringify({ importId, sourceRow: index + 2, values: after, resultingRecordVersion: existing.recordVersion + 1 }),
                ),
              );
            }
          }
        }

        if (input.importType === "work_orders") {
          const externalId = textValue(row, "work_order_id", "work_order", "wo_number", "wo");
          const hierarchy = await resolveHierarchy(row);
          if (!externalId) throw new Error("Work-order ID is required.");
          if (await env.DB.prepare("SELECT id FROM work_orders WHERE organization_id=? AND external_id=? LIMIT 1").bind(TECHFLEX_ORG_ID,externalId).first()) throw new Error("Work order already exists. Review it before importing again.");
          const acceptedPrice = numberValue(row, "accepted_price", "price", "total");
          statements.push(
            env.DB.prepare(
              `INSERT INTO work_orders
                (id, organization_id, account_id, location_id, external_source, external_id, service_type, priority, status, summary, required_technician_count, scheduled_start, accepted_price_cents)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              TECHFLEX_ORG_ID,
              hierarchy.accountId,
              hierarchy.locationId,
              input.source,
              externalId,
              textValue(row, "service_type", "job_type", "service") || "field_service",
              textValue(row, "priority") || "normal",
              textValue(row, "status") || "new",
              textValue(row, "summary", "description") || externalId,
              numberValue(row, "technician_count", "required_technician_count") || 1,
              textValue(row, "scheduled_start", "scheduled_date") || null,
              acceptedPrice ? Math.round(acceptedPrice * 100) : null,
            ),
          );
        }

        if (input.importType === "technician_pay") {
          const technicianCode = textValue(row, "technician_code", "tech_code", "technician");
          const workOrderNumber = textValue(row, "work_order_id", "work_order", "wo_number", "wo");
          const [technician, workOrder] = await Promise.all([
            uniqueMatch<{ id: string }>(env.DB.prepare(
              `SELECT t.id FROM technicians t LEFT JOIN users u ON u.id = t.user_id
                WHERE t.organization_id = ? AND (lower(t.technician_code) = lower(?) OR lower(u.email) = lower(?)) LIMIT 2`,
            ).bind(TECHFLEX_ORG_ID, technicianCode, technicianCode), `Technician ${technicianCode || "(blank)"}`),
            uniqueMatch<{ id: string; acceptedPriceCents: number | null }>(env.DB.prepare(
              "SELECT id, accepted_price_cents AS acceptedPriceCents FROM work_orders WHERE organization_id = ? AND (id = ? OR external_id = ?) LIMIT 2",
            ).bind(TECHFLEX_ORG_ID, workOrderNumber, workOrderNumber), `Work order ${workOrderNumber || "(blank)"}`),
          ]);
          if (!technician) throw new Error(`Technician not found: ${technicianCode || "(blank)"}.`);
          if (!workOrder) throw new Error(`Work order not found: ${workOrderNumber || "(blank)"}.`);
          if (await env.DB.prepare("SELECT id FROM technician_payouts WHERE technician_id=? AND work_order_id=? LIMIT 1").bind(technician.id,workOrder.id).first()) throw new Error("A payout already exists for this technician and work order. Review it in Finance; imports cannot overwrite an existing payout.");
          const grossRevenue = textValue(row,"gross_revenue","revenue","job_total") ? numberValue(row,"gross_revenue","revenue","job_total") : (workOrder.acceptedPriceCents ?? 0) / 100;
          const payoutRateRaw = textValue(row,"payout_rate","pay_rate","percentage") ? numberValue(row,"payout_rate","pay_rate","percentage") : 55;
          const payoutRate = payoutRateRaw > 1 ? payoutRateRaw / 100 : payoutRateRaw;
          if (payoutRate > 1) throw new Error("Payout rate cannot exceed 100%.");
          const payout = textValue(row,"payout","technician_pay") ? numberValue(row,"payout","technician_pay") : grossRevenue * payoutRate;
          statements.push(
            env.DB.prepare(
              `INSERT INTO technician_payouts
                (id, technician_id, work_order_id, status, basis_type, basis_rate, gross_revenue_cents, payout_cents)
               VALUES (?, ?, ?, ?, 'percentage', ?, ?, ?)
`,
            ).bind(
              crypto.randomUUID(),
              technician.id,
              workOrder.id,
              textValue(row, "status") || "pending",
              payoutRate,
              Math.round(grossRevenue * 100),
              Math.round(payout * 100),
            ),
          );
        }
        const outcomeColumn = {
          created: "created_count",
          updated: "updated_count",
          skipped: "skipped_count",
        }[outcome];
        await env.DB.batch([
          progressGuard(importId, successCount, errorCount),
          ...statements,
          env.DB.prepare(
            `UPDATE data_imports SET success_count=success_count+1,${outcomeColumn}=${outcomeColumn}+1
              WHERE id=? AND organization_id=? AND status='processing'
                AND success_count=? AND error_count=?`,
          ).bind(importId, TECHFLEX_ORG_ID, successCount, errorCount),
          env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS (
            SELECT 1 FROM data_imports WHERE id=? AND success_count=? AND error_count=?
          ) THEN 1 ELSE json('import_progress_conflict') END`).bind(
            importId, successCount + 1, errorCount,
          ),
        ]);
        successCount += 1;
        if (outcome === "created") createdCount += 1;
        if (outcome === "updated") updatedCount += 1;
        if (outcome === "skipped") skippedCount += 1;
      } catch (error) {
        let rowFailure = error;
        if (isProgressConflict(error)) {
          const current = await env.DB.prepare(
            "SELECT status,success_count AS successCount,error_count AS errorCount FROM data_imports WHERE id=? AND organization_id=?",
          ).bind(importId, TECHFLEX_ORG_ID).first<{status:string;successCount:number;errorCount:number}>();
          if (!current || current.status !== "processing" || current.successCount !== successCount || current.errorCount !== errorCount)
            throw new PortalHttpError(409, importConflictMessage);
          if (input.importType === "assets" && outcome === "updated")
            rowFailure = new Error("The asset changed or open work began while this update was being saved. Review the spreadsheet against the current asset before retrying.");
          else
            throw new PortalHttpError(409, importConflictMessage);
        }
        const nextErrors = [...errors, rowError(index + 2, rowFailure)];
        try {
          await env.DB.batch([
            progressGuard(importId, successCount, errorCount),
            env.DB.prepare(
              `UPDATE data_imports SET error_count=error_count+1, error_json=?
                WHERE id=? AND organization_id=? AND status='processing'
                  AND success_count=? AND error_count=?`,
            ).bind(JSON.stringify(nextErrors), importId, TECHFLEX_ORG_ID, successCount, errorCount),
            env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS (
              SELECT 1 FROM data_imports WHERE id=? AND success_count=? AND error_count=?
            ) THEN 1 ELSE json('import_progress_conflict') END`).bind(
              importId, successCount, errorCount + 1,
            ),
          ]);
        } catch (checkpointError) {
          if (isProgressConflict(checkpointError)) throw new PortalHttpError(409, importConflictMessage);
          throw checkpointError;
        }
        errors = nextErrors;
        errorCount += 1;
      }
    }

    const status = errorCount ? "completed_with_errors" : "complete";
    try {
      await env.DB.batch([
        progressGuard(importId, successCount, errorCount),
        env.DB.prepare(
          `UPDATE data_imports SET status=?, error_json=?, completed_at=CURRENT_TIMESTAMP
            WHERE id=? AND organization_id=? AND status='processing'
              AND success_count=? AND error_count=?`,
        ).bind(status, errors.length ? JSON.stringify(errors) : null, importId, TECHFLEX_ORG_ID, successCount, errorCount),
        env.DB.prepare(
          `INSERT INTO audit_logs
            (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'data.imported', 'data_import', ?, ?)`,
        ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, importId, JSON.stringify({
          importType: input.importType,
          source: input.source,
          rowCount: input.rows.length,
          successCount,
          errorCount,
          createdCount,
          updatedCount,
          skippedCount,
        })),
        env.DB.prepare(`SELECT CASE WHEN EXISTS (
          SELECT 1 FROM data_imports WHERE id=? AND organization_id=? AND status=?
            AND success_count=? AND error_count=?
        ) THEN 1 ELSE json('import_progress_conflict') END`).bind(
          importId, TECHFLEX_ORG_ID, status, successCount, errorCount,
        ),
      ]);
    } catch (error) {
      if (!isProgressConflict(error)) throw error;
      const completed = await env.DB.prepare(
        `SELECT id, status, row_count AS rowCount, success_count AS successCount,
                error_count AS errorCount, created_count AS createdCount, updated_count AS updatedCount,
                skipped_count AS skippedCount, error_json AS errorJson
           FROM data_imports WHERE id=? AND organization_id=?`,
      ).bind(importId, TECHFLEX_ORG_ID).first<Pick<ImportProgress, "id" | "status" | "rowCount" | "successCount" | "errorCount" | "createdCount" | "updatedCount" | "skippedCount" | "errorJson">>();
      if (completed && ["complete", "completed_with_errors"].includes(completed.status))
        return importResponse(completed);
      throw new PortalHttpError(409, importConflictMessage);
    }
    return importResponse({
      id: importId,
      status,
      rowCount: input.rows.length,
      successCount,
      errorCount,
      createdCount,
      updatedCount,
      skippedCount,
      errorJson: errors.length ? JSON.stringify(errors) : null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({error:"The import request contains invalid JSON."},{status:400});
    if (error instanceof z.ZodError) {
      return Response.json({ error: "The imported data is not in a supported format.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}
