import { env } from "cloudflare:workers";
import { z } from "zod";
import { normalizeImportHeader, validateImportMapping } from "@/lib/import-mapping";
import { TECHFLEX_ORG_ID, PortalHttpError, apiError, requirePortalRole } from "@/lib/portal-auth";

const importType = z.enum(["accounts", "locations", "assets", "work_orders", "technician_pay"]);
const saveSchema = z.object({
  id: z.string().uuid().optional(),
  profileName: z.string().trim().min(2).max(80),
  importType,
  sourceHeaders: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  mapping: z.record(z.string(), z.string().trim().min(1).max(120)).refine((value) => Object.keys(value).length <= 50),
  recordVersion: z.number().int().min(1).optional(),
});

type MappingRow = {
  id: string;
  profileName: string;
  importType: string;
  sourceHeadersJson: string;
  mappingJson: string;
  status: string;
  exchangeVerified: number;
  recordVersion: number;
  updatedAt: string;
};

function profile(row: MappingRow) {
  return {
    id: row.id,
    profileName: row.profileName,
    importType: row.importType,
    sourceHeaders: JSON.parse(row.sourceHeadersJson),
    mapping: JSON.parse(row.mappingJson),
    status: row.status,
    exchangeVerified: Boolean(row.exchangeVerified),
    recordVersion: row.recordVersion,
    updatedAt: row.updatedAt,
  };
}

const selectProfile = `SELECT id,profile_name AS profileName,import_type AS importType,
  source_headers_json AS sourceHeadersJson,mapping_json AS mappingJson,status,
  exchange_verified AS exchangeVerified,record_version AS recordVersion,updated_at AS updatedAt
  FROM import_mapping_profiles WHERE organization_id=?`;

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const rows = await env.DB.prepare(`${selectProfile} ORDER BY updated_at DESC,profile_name`).bind(TECHFLEX_ORG_ID).all<MappingRow>();
    return Response.json({ profiles: rows.results.map(profile) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const input = saveSchema.parse(await request.json());
    const sourceHeaders = [...new Set(input.sourceHeaders.map(normalizeImportHeader))];
    if (sourceHeaders.length !== input.sourceHeaders.length)
      throw new PortalHttpError(400, "Source columns must be distinct after punctuation and spacing are normalized.");
    const mapping = Object.fromEntries(Object.entries(input.mapping).map(([target, source]) => [target, normalizeImportHeader(source)]));
    const validation = validateImportMapping(sourceHeaders, input.importType, mapping);
    if (!validation.ready) throw new PortalHttpError(400, `Finish the column plan before saving. ${validation.errors.join(" ")}`);

    const id = input.id || crypto.randomUUID();
    const before = input.id
      ? await env.DB.prepare(`${selectProfile} AND id=? LIMIT 1`).bind(TECHFLEX_ORG_ID, input.id).first<MappingRow>()
      : null;
    if (input.id && !before) throw new PortalHttpError(404, "This saved column plan no longer exists. Refresh the plan list.");
    if (before && input.recordVersion !== before.recordVersion)
      throw new PortalHttpError(409, "This column plan changed in another tab. Reload it before saving your changes.");

    const savedPlan = JSON.stringify({ profileName: input.profileName, importType: input.importType, sourceHeaders, mapping, status: "saved_plan", exchangeVerified: false });
    if (before) {
      await env.DB.batch([
        env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM import_mapping_profiles
          WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('mapping_profile_conflict') END`).bind(id, TECHFLEX_ORG_ID, before.recordVersion),
        env.DB.prepare(`UPDATE import_mapping_profiles SET profile_name=?,import_type=?,source_headers_json=?,mapping_json=?,
          status='saved_plan',exchange_verified=0,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND organization_id=? AND record_version=?`).bind(input.profileName, input.importType, JSON.stringify(sourceHeaders), JSON.stringify(mapping), id, TECHFLEX_ORG_ID, before.recordVersion),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) VALUES (?,?,?,'import_mapping.updated','import_mapping_profile',?,?,?)")
          .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify(profile(before)), savedPlan),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO import_mapping_profiles
          (id,organization_id,profile_name,import_type,source_headers_json,mapping_json,status,exchange_verified,created_by)
          VALUES (?,?,?,?,?,?,'saved_plan',0,?)`).bind(id, TECHFLEX_ORG_ID, input.profileName, input.importType, JSON.stringify(sourceHeaders), JSON.stringify(mapping), identity.userId),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'import_mapping.created','import_mapping_profile',?,?)")
          .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, savedPlan),
      ]);
    }
    const saved = await env.DB.prepare(`${selectProfile} AND id=? LIMIT 1`).bind(TECHFLEX_ORG_ID, id).first<MappingRow>();
    if (!saved) throw new Error("The saved column plan could not be confirmed.");
    return Response.json({ profile: profile(saved), message: "Column plan saved. No partner exchange has been tested." }, { status: before ? 200 : 201 });
  } catch (error) {
    if (String(error).includes("mapping_profile_conflict"))
      return Response.json({ error: "This column plan changed in another tab. Reload it before saving your changes." }, { status: 409 });
    if (/UNIQUE constraint/i.test(String(error)))
      return Response.json({ error: "A column plan with this name already exists for this import type. Select it to update the existing plan." }, { status: 409 });
    if (error instanceof z.ZodError) return Response.json({ error: "Review the plan name, file headings, and mapped columns." }, { status: 400 });
    return apiError(error);
  }
}
