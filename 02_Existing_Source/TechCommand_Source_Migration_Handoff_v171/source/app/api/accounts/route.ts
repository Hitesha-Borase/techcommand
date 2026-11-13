import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  resolveOrganizationId,
} from "@/lib/portal-auth";

const accountSchema = z.object({
  name: z.string().trim().min(2).max(160),
  accountType: z.enum(["manufacturer", "retailer", "facility", "direct_customer", "partner"]),
  externalId: z.string().trim().max(100).optional().nullable(),
  billingEmail: z.string().email().optional().or(z.literal("")).nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  serviceDiscipline: z.enum(["biomedical", "dme_mobility"]).optional().nullable(),
  serviceLevel: z.string().trim().max(120).optional().nullable(),
});

const readRoles = [
  "owner_administrator",
  "operations_administrator",
  "dispatcher",
  "biomedical_lead",
  "finance",
] as const;

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

declare global {
  // eslint-disable-next-line no-var
  var __TECHCOMMAND_ACCOUNTS_MAP__: Map<string, any> | undefined;
}

function getDatabase(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB;
}

function getAccountsStore(): Map<string, any> {
  if (!globalThis.__TECHCOMMAND_ACCOUNTS_MAP__) {
    globalThis.__TECHCOMMAND_ACCOUNTS_MAP__ = new Map();
    (globalThis as any).__TECHCOMMAND_ACCOUNTS__ = globalThis.__TECHCOMMAND_ACCOUNTS_MAP__;
  }
  return globalThis.__TECHCOMMAND_ACCOUNTS_MAP__;
}

async function ensureAccountsSchema() {
  const db = getDatabase();
  if (!db) return;

  try {
    await db.exec("PRAGMA foreign_keys = OFF;");
  } catch {}

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        currency TEXT DEFAULT 'USD' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      INSERT OR IGNORE INTO organizations (id, legal_name, display_name)
      VALUES ('techflex', 'Astute Restorations LLC', 'TechFlex Mobility Solutions');

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        auth_subject TEXT,
        email TEXT,
        display_name TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        last_seen_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        external_id TEXT,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        billing_email TEXT,
        payment_terms_days INTEGER DEFAULT 30 NOT NULL,
        service_level TEXT,
        service_discipline TEXT,
        notes TEXT,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        occurred_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

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
    console.warn("[ensureAccountsSchema] create tables warning:", err);
  }

  // Ensure individual columns exist if accounts table existed previously from Drizzle migrations
  const alterColumns = [
    "ALTER TABLE accounts ADD COLUMN service_discipline TEXT",
    "ALTER TABLE accounts ADD COLUMN service_level TEXT",
    "ALTER TABLE accounts ADD COLUMN billing_email TEXT",
    "ALTER TABLE accounts ADD COLUMN payment_terms_days INTEGER DEFAULT 30",
    "ALTER TABLE accounts ADD COLUMN status TEXT DEFAULT 'active'",
    "ALTER TABLE accounts ADD COLUMN record_version INTEGER DEFAULT 1",
    "ALTER TABLE accounts ADD COLUMN notes TEXT",
  ];
  for (const alterSql of alterColumns) {
    try {
      await db.prepare(alterSql).run();
    } catch {}
  }
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...readRoles]);
    const result = await env.DB.prepare(
      `SELECT a.id, a.external_id AS externalId, a.name, a.account_type AS accountType,
              a.status, a.billing_email AS billingEmail, a.payment_terms_days AS paymentTermsDays,
              a.service_discipline AS serviceDiscipline, a.service_level AS serviceLevel, a.updated_at AS updatedAt,
              COUNT(DISTINCT l.id) AS locationCount,
              COUNT(DISTINCT s.id) AS assetCount
         FROM accounts a
         LEFT JOIN locations l ON l.account_id = a.id AND l.status = 'active'
         LEFT JOIN assets s ON s.account_id = a.id AND s.organization_id = a.organization_id AND s.status != 'retired'
        WHERE a.organization_id = ? AND a.status != 'archived'
        GROUP BY a.id
        ORDER BY a.name`,
    ).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ accounts: result?.results || [] }, { headers: privateNoStore });
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
    await ensureAccountsSchema();
    const orgId = resolveOrganizationId(identity, request) || TECHFLEX_ORG_ID;
    const body = await request.json();
    const input = accountSchema.parse(body);
    const id = crypto.randomUUID();

    // Ensure parent organization and actor user records exist so foreign keys never fail
    await env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name) VALUES (?, 'Astute Restorations LLC', 'TechFlex Mobility Solutions')",
    ).bind(TECHFLEX_ORG_ID).run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, auth_subject, email, display_name, status) VALUES (?, ?, ?, ?, 'active')",
    ).bind(identity.userId, identity.authSubject, identity.email, identity.displayName).run();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO accounts
          (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level, service_discipline)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      ).bind(
        id,
        TECHFLEX_ORG_ID,
        input.externalId || null,
        input.name,
        input.accountType,
        input.billingEmail || null,
        input.paymentTermsDays,
        input.serviceLevel || null,
        input.serviceDiscipline || null,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'account.created', 'account', ?, ?)`,
      ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify(input)),
    ]);
    return Response.json({ account: { id, ...input, status: "active" } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Review the highlighted account fields.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}
