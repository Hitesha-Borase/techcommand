import { normalizeImportHeader, type ImportMapping } from "./import-mapping";
import type { StructuredImportType } from "./import-templates";

export const IMPORT_MAPPING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type ImportMappingDraft = {
  importType: StructuredImportType;
  sourceHeaders: string[];
  selectedId: string;
  profileName: string;
  mapping: ImportMapping;
  editingVersion?: number;
  savedAt: number;
};

function normalizedHeaders(sourceHeaders: string[]) {
  return sourceHeaders.map(normalizeImportHeader).sort();
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function importMappingDraftKey(userId: string, importType: StructuredImportType, sourceHeaders: string[]) {
  return `techcommand:import-mapping:${userId}:${importType}:${shortHash(normalizedHeaders(sourceHeaders).join("\u0001"))}`;
}

export function readImportMappingDraft(
  raw: string | null,
  expected: { importType: StructuredImportType; sourceHeaders: string[] },
  now = Date.now(),
): ImportMappingDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ImportMappingDraft>;
    if (value.importType !== expected.importType || !Array.isArray(value.sourceHeaders)) return null;
    if (normalizedHeaders(value.sourceHeaders).join("\u0001") !== normalizedHeaders(expected.sourceHeaders).join("\u0001")) return null;
    if (typeof value.savedAt !== "number" || now - value.savedAt >= IMPORT_MAPPING_DRAFT_TTL_MS || value.savedAt > now + 5 * 60 * 1000) return null;
    if (typeof value.selectedId !== "string" || value.selectedId.length > 100 || typeof value.profileName !== "string" || value.profileName.length > 80) return null;
    if (!value.mapping || typeof value.mapping !== "object" || Array.isArray(value.mapping)) return null;
    const entries = Object.entries(value.mapping);
    if (entries.length > 50 || entries.some(([target, source]) => !target || target.length > 120 || typeof source !== "string" || !source || source.length > 120)) return null;
    if (value.editingVersion !== undefined && (!Number.isInteger(value.editingVersion) || value.editingVersion < 1)) return null;
    return value as ImportMappingDraft;
  } catch {
    return null;
  }
}
