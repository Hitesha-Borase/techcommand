import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole, resolveOrganizationId } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

function getDatabase(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB;
}

const locationSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  locationType: z.string().trim().max(80).optional().nullable(),
  address1: z.string().trim().min(3).max(200),
  address2: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().min(5).max(10),
  timezone: z.string().trim().default("America/New_York"),
  accessInstructions: z.string().trim().max(2000).optional().nullable(),
  departmentName: z.string().trim().max(120).optional().nullable(),
});

async function ensureLocationsSchema() {
  const db = getDatabase();
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        external_id TEXT,
        name TEXT NOT NULL,
        location_type TEXT,
        department TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        address_1 TEXT NOT NULL,
        address_2 TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        country TEXT DEFAULT 'US' NOT NULL,
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY NOT NULL,
        location_id TEXT NOT NULL,
        name TEXT NOT NULL,
        floor TEXT,
        room TEXT,
        cost_center TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        category_id TEXT,
        asset_tag TEXT NOT NULL,
        customer_asset_id TEXT,
        manufacturer TEXT NOT NULL,
        model TEXT NOT NULL,
        serial_number TEXT,
        description TEXT,
        department TEXT,
        risk_class TEXT NOT NULL,
        status TEXT DEFAULT 'in_service' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
  } catch (err) {
    console.warn("ensureLocationsSchema warning:", err);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    await ensureLocationsSchema();
    const db = getDatabase();
    if (!db) return Response.json({ locations: [] }, { headers: privateNoStore });

    const orgId = resolveOrganizationId(identity, request) || TECHFLEX_ORG_ID;
    const accountId = new URL(request.url).searchParams.get("accountId");
    const statement = db.prepare(
      `SELECT l.id, l.external_id AS externalId, l.account_id AS accountId, a.name AS accountName, l.name,
              l.location_type AS locationType, l.address_1 AS address1, l.address_2 AS address2,
              l.city, l.state, l.postal_code AS postalCode, l.timezone,
              l.access_instructions AS accessInstructions, l.updated_at AS updatedAt,
              COUNT(DISTINCT d.id) AS departmentCount,
              COUNT(DISTINCT s.id) AS assetCount
         FROM locations l
         JOIN accounts a ON a.id = l.account_id AND (a.organization_id = ? OR a.organization_id = 'techflex' OR a.organization_id IS NULL OR a.organization_id = '')
         LEFT JOIN departments d ON d.location_id = l.id AND COALESCE(d.status, 'active') = 'active'
         LEFT JOIN assets s ON s.location_id = l.id AND s.account_id = a.id
           AND COALESCE(s.status, 'in_service') != 'retired'
        WHERE COALESCE(l.status, 'active') = 'active' AND (? IS NULL OR l.account_id = ?)
        GROUP BY l.id
        ORDER BY a.name, l.name`,
    ).bind(orgId, accountId, accountId);
    const result = await statement.all();
    return Response.json({ locations: result.results || [] }, { headers: privateNoStore });
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
<<<<<<< HEAD
      "biomedical_lead",
      "dispatcher",
=======
>>>>>>> 17ebf6d9fa9a65562b293d1018c04545a1e0ef9a
    ]);
    await ensureLocationsSchema();
    const db = getDatabase();
    const orgId = resolveOrganizationId(identity, request) || TECHFLEX_ORG_ID;
    const input = locationSchema.parse(await request.json());

    let account: any = null;
    if (db) {
      try {
        account = await db.prepare(
          "SELECT id FROM accounts WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex' OR organization_id IS NULL OR organization_id = '') AND COALESCE(status, 'active') != 'archived' LIMIT 1",
        ).bind(input.accountId, orgId).first();
      } catch {}
    }

    if (!account) {
      const candidate = (globalThis as any).__TECHCOMMAND_ACCOUNTS_MAP__?.get(input.accountId) ||
                        (globalThis as any).__TECHCOMMAND_ACCOUNTS__?.get(input.accountId);
      if (candidate && db) {
        try {
          await db.prepare(
            `INSERT OR REPLACE INTO accounts (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level, service_discipline, record_version)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1)`
          ).bind(
            candidate.id,
            orgId || "techflex",
            candidate.external_id || candidate.externalId || null,
            candidate.name,
            candidate.account_type || candidate.accountType || "facility",
            candidate.billing_email || candidate.billingEmail || null,
            candidate.payment_terms_days || candidate.paymentTermsDays || 30,
            candidate.service_level || candidate.serviceLevel || null,
            candidate.service_discipline || candidate.serviceDiscipline || null,
          ).run();
          account = { id: candidate.id };
        } catch {}
      }
    }

    if (!account && !((globalThis as any).__TECHCOMMAND_ACCOUNTS_MAP__?.has(input.accountId))) {
      return Response.json({ error: "Select an active account." }, { status: 400 });
    }

    const locationId = crypto.randomUUID();
    if (db) {
      await db.prepare(
        `INSERT INTO locations
          (id, account_id, name, location_type, status, address_1, address_2, city, state, postal_code, timezone, access_instructions)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        locationId,
        input.accountId,
        input.name,
        input.locationType || null,
        input.address1,
        input.address2 || null,
        input.city,
        input.state,
        input.postalCode,
        input.timezone,
        input.accessInstructions || null,
      ).run();

      try {
        await db.prepare(
          `INSERT INTO audit_logs
            (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'location.created', 'location', ?, ?)`,
        ).bind(crypto.randomUUID(), orgId, identity.userId || null, locationId, JSON.stringify(input)).run();
      } catch {}

      if (input.departmentName) {
        try {
          await db.prepare(
            "INSERT INTO departments (id, location_id, name, status) VALUES (?, ?, ?, 'active')",
          ).bind(crypto.randomUUID(), locationId, input.departmentName).run();
        } catch {}
      }
    }

    return Response.json({ location: { id: locationId, ...input, status: "active" } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Review the highlighted location fields.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}
