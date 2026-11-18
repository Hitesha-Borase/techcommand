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
    const check = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").first();
    if (check) return;
  } catch {}

  try {
    await db.exec("PRAGMA foreign_keys = OFF;");
  } catch {}

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      timezone TEXT DEFAULT 'America/New_York' NOT NULL,
      currency TEXT DEFAULT 'USD' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `INSERT OR IGNORE INTO organizations (id, legal_name, display_name)
    VALUES ('techflex', 'Astute Restorations LLC', 'TechFlex Mobility Solutions')`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      auth_subject TEXT,
      email TEXT,
      display_name TEXT,
      status TEXT DEFAULT 'active' NOT NULL,
      last_seen_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
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
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      occurred_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS locations (
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
    )`,
    `CREATE TABLE IF NOT EXISTS assets (
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
    )`
  ];

  for (const stmt of ddlStatements) {
    try {
      await db.prepare(stmt).run();
    } catch {}
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
    const db = getDatabase();
    if (!db) return Response.json({ accounts: [] }, { headers: privateNoStore });

    const result = await db.prepare(
      `SELECT a.id, a.external_id AS externalId, a.name, a.account_type AS accountType,
              COALESCE(a.status, 'active') AS status,
              a.billing_email AS billingEmail,
              COALESCE(a.payment_terms_days, 30) AS paymentTermsDays,
              a.service_discipline AS serviceDiscipline,
              a.service_level AS serviceLevel,
              COALESCE(a.updated_at, a.created_at, CURRENT_TIMESTAMP) AS updatedAt,
              COUNT(DISTINCT l.id) AS locationCount,
              COUNT(DISTINCT s.id) AS assetCount
         FROM accounts a
         LEFT JOIN locations l ON l.account_id = a.id AND COALESCE(l.status, 'active') = 'active'
         LEFT JOIN assets s ON s.account_id = a.id AND COALESCE(s.status, 'in_service') != 'retired'
        WHERE (a.organization_id = ? OR a.organization_id = 'techflex' OR a.organization_id IS NULL OR a.organization_id = '')
          AND COALESCE(a.status, 'active') != 'archived'
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
    const db = getDatabase();
    const orgId = resolveOrganizationId(identity, request) || TECHFLEX_ORG_ID;
    const body = await request.json();
    const input = accountSchema.parse(body);
    const id = crypto.randomUUID();

    // Ensure parent organization and actor user records exist so foreign keys never fail
    try {
      await db.prepare(
        "INSERT OR IGNORE INTO organizations (id, legal_name, display_name) VALUES (?, 'Astute Restorations LLC', 'TechFlex Mobility Solutions')",
      ).bind(TECHFLEX_ORG_ID).run();
      await db.prepare(
        "INSERT OR IGNORE INTO users (id, auth_subject, email, display_name, status) VALUES (?, ?, ?, ?, 'active')",
      ).bind(identity.userId, identity.authSubject, identity.email, identity.displayName).run();
    } catch {}

    await db.batch([
      db.prepare(
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
      db.prepare(
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

const updateAccountSchema = accountSchema.partial().extend({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  accountType: z.enum(["manufacturer", "retailer", "facility", "direct_customer", "partner"]),
  status: z.enum(["active", "inactive", "archived", "suspended"]).optional(),
});

export async function PUT(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    await ensureAccountsSchema();
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available" }, { status: 500 });

    const body = await request.json();
    const input = updateAccountSchema.parse(body);

    const existing = await db.prepare(
      `SELECT * FROM accounts WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex' OR organization_id IS NULL OR organization_id = '')`
    ).bind(input.id, TECHFLEX_ORG_ID).first();

    if (!existing) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }

    const updatedAccount = {
      ...existing,
      name: input.name,
      account_type: input.accountType,
      billing_email: input.billingEmail !== undefined ? (input.billingEmail || null) : existing.billing_email,
      payment_terms_days: input.paymentTermsDays !== undefined ? input.paymentTermsDays : (existing.payment_terms_days ?? 30),
      service_level: input.serviceLevel !== undefined ? (input.serviceLevel || null) : existing.service_level,
      service_discipline: input.serviceDiscipline !== undefined ? (input.serviceDiscipline || null) : existing.service_discipline,
      external_id: input.externalId !== undefined ? (input.externalId || null) : existing.external_id,
      status: input.status || existing.status || "active",
    };

    await db.batch([
      db.prepare(
        `UPDATE accounts
            SET name = ?,
                account_type = ?,
                billing_email = ?,
                payment_terms_days = ?,
                service_level = ?,
                service_discipline = ?,
                external_id = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).bind(
        updatedAccount.name,
        updatedAccount.account_type,
        updatedAccount.billing_email,
        updatedAccount.payment_terms_days,
        updatedAccount.service_level,
        updatedAccount.service_discipline,
        updatedAccount.external_id,
        updatedAccount.status,
        input.id,
      ),
      db.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json, after_json)
         VALUES (?, ?, ?, 'account.updated', 'account', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.id,
        JSON.stringify(existing),
        JSON.stringify(updatedAccount),
      ),
    ]);

    const counts = (await db.prepare(
      `SELECT COUNT(DISTINCT l.id) AS locationCount, COUNT(DISTINCT s.id) AS assetCount
         FROM accounts a
         LEFT JOIN locations l ON l.account_id = a.id AND COALESCE(l.status, 'active') = 'active'
         LEFT JOIN assets s ON s.account_id = a.id AND COALESCE(s.status, 'in_service') != 'retired'
        WHERE a.id = ?`
    ).bind(input.id).first()) as { locationCount: number; assetCount: number } | null;

    return Response.json({
      account: {
        id: input.id,
        name: updatedAccount.name,
        accountType: updatedAccount.account_type,
        externalId: updatedAccount.external_id,
        billingEmail: updatedAccount.billing_email,
        paymentTermsDays: updatedAccount.payment_terms_days,
        serviceLevel: updatedAccount.service_level,
        serviceDiscipline: updatedAccount.service_discipline,
        status: updatedAccount.status,
        locationCount: counts?.locationCount || 0,
        assetCount: counts?.assetCount || 0,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Review the highlighted account fields.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    await ensureAccountsSchema();
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available" }, { status: 500 });

    const url = new URL(request.url);
    let id = url.searchParams.get("id");
    if (!id) {
      try {
        const body = (await request.json()) as Record<string, any>;
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return Response.json({ error: "Account ID is required." }, { status: 400 });
    }

    const existing = await db.prepare(
      `SELECT * FROM accounts WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex' OR organization_id IS NULL OR organization_id = '')`
    ).bind(id, TECHFLEX_ORG_ID).first();

    if (!existing) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }

    let deleted = false;
    try {
      await db.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
      deleted = true;
    } catch {
      await db.prepare(
        "UPDATE accounts SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(id).run();
    }

    try {
      await db.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json)
         VALUES (?, ?, ?, 'account.deleted', 'account', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        id,
        JSON.stringify(existing),
      ).run();
    } catch {}

    return Response.json({ ok: true, id, archived: !deleted });
  } catch (error) {
    return apiError(error);
  }
}
