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
    await ensureAccountsSchema();

    const db = getDatabase();
    const store = getAccountsStore();
    const accountsMap = new Map<string, any>();

    // 1. Fetch from D1 database
    if (db) {
      try {
        const result = await db.prepare(
          `SELECT * FROM accounts WHERE COALESCE(status, 'active') != 'archived' ORDER BY name`
        ).all();

        for (const a of (result.results || []) as any[]) {
          const accountId = String(a.id);
          const accObj = {
            id: accountId,
            externalId: a.external_id || a.externalId || null,
            name: String(a.name || ""),
            accountType: String(a.account_type || a.accountType || "facility"),
            status: String(a.status || "active"),
            billingEmail: a.billing_email || a.billingEmail || null,
            paymentTermsDays: Number(a.payment_terms_days || a.paymentTermsDays || 30),
            serviceLevel: a.service_level || a.serviceLevel || null,
            serviceDiscipline: a.service_discipline || a.serviceDiscipline || null,
            updatedAt: a.updated_at || a.updatedAt || new Date().toISOString(),
            locationCount: 0,
            assetCount: 0,
          };
          accountsMap.set(accountId, accObj);
          store.set(accountId, accObj);
        }
      } catch (dbErr) {
        console.warn("[API ACCOUNTS GET] D1 query warning:", dbErr);
      }
    }

    // 2. Merge accounts from in-memory store
    for (const [id, acc] of store.entries()) {
      if (!accountsMap.has(id)) {
        accountsMap.set(id, {
          id: String(acc.id),
          externalId: acc.externalId || acc.external_id || null,
          name: String(acc.name || ""),
          accountType: String(acc.accountType || acc.account_type || "facility"),
          status: String(acc.status || "active"),
          billingEmail: acc.billingEmail || acc.billing_email || null,
          paymentTermsDays: Number(acc.paymentTermsDays || acc.payment_terms_days || 30),
          serviceLevel: acc.serviceLevel || acc.service_level || null,
          serviceDiscipline: acc.serviceDiscipline || acc.service_discipline || null,
          updatedAt: acc.updatedAt || acc.updated_at || new Date().toISOString(),
          locationCount: 0,
          assetCount: 0,
        });

        // Sync to D1
        if (db) {
          try {
            await db.prepare(
              `INSERT OR REPLACE INTO accounts
                (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level, service_discipline, record_version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            ).bind(
              acc.id,
              acc.organizationId || TECHFLEX_ORG_ID,
              acc.externalId || null,
              acc.name,
              acc.accountType || "facility",
              acc.billingEmail || null,
              acc.paymentTermsDays || 30,
              acc.serviceLevel || null,
              acc.serviceDiscipline || null,
            ).run();
          } catch {}
        }
      }
    }

    const accountsList = Array.from(accountsMap.values());
    accountsList.sort((a, b) => a.name.localeCompare(b.name));

    // 3. Attach dynamic locationCount and assetCount from D1
    if (accountsList.length > 0 && db) {
      try {
        const locRes = await db.prepare(
          "SELECT account_id, COUNT(*) as count FROM locations WHERE COALESCE(status, 'active') = 'active' GROUP BY account_id"
        ).all();
        const locMap = new Map((locRes.results || []).map((l: any) => [l.account_id, Number(l.count)]));
        for (const acc of accountsList) {
          if (locMap.has(acc.id)) acc.locationCount = locMap.get(acc.id)!;
        }
      } catch {}

      try {
        const assetRes = await db.prepare(
          "SELECT account_id, COUNT(*) as count FROM assets WHERE COALESCE(status, 'in_service') != 'retired' GROUP BY account_id"
        ).all();
        const assetMap = new Map((assetRes.results || []).map((s: any) => [s.account_id, Number(s.count)]));
        for (const acc of accountsList) {
          if (assetMap.has(acc.id)) acc.assetCount = assetMap.get(acc.id)!;
        }
      } catch {}
    }

    return Response.json({ accounts: accountsList }, { headers: privateNoStore });
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
      "biomedical_lead",
      "dispatcher",
    ]);
    await ensureAccountsSchema();
    const orgId = resolveOrganizationId(identity, request) || TECHFLEX_ORG_ID;
    const body = await request.json();
    const input = accountSchema.parse(body);
    const id = crypto.randomUUID();

    const accountRecord = {
      id,
      organizationId: orgId,
      externalId: input.externalId || null,
      name: input.name,
      accountType: input.accountType,
      status: "active",
      billingEmail: input.billingEmail || null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      serviceLevel: input.serviceLevel || null,
      serviceDiscipline: input.serviceDiscipline || null,
      locationCount: 0,
      assetCount: 0,
      updatedAt: new Date().toISOString(),
    };

    // 1. Save to in-memory store
    const store = getAccountsStore();
    store.set(id, accountRecord);

    // 2. Save to D1 database
    const db = getDatabase();
    if (db) {
      try {
        await db.exec("PRAGMA foreign_keys = OFF;");
        await db.prepare(
          `INSERT OR REPLACE INTO accounts
            (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level, service_discipline, record_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ).bind(
          id,
          orgId,
          input.externalId || null,
          input.name,
          input.accountType,
          input.billingEmail || null,
          input.paymentTermsDays ?? 30,
          input.serviceLevel || null,
          input.serviceDiscipline || null,
        ).run();
      } catch (dbErr) {
        console.error("[API ACCOUNTS POST] D1 insert failed, trying baseline insert:", dbErr);
        try {
          await db.prepare(
            `INSERT OR REPLACE INTO accounts
              (id, organization_id, external_id, name, account_type, status, billing_email, payment_terms_days, service_level, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          ).bind(
            id,
            orgId,
            input.externalId || null,
            input.name,
            input.accountType,
            input.billingEmail || null,
            input.paymentTermsDays ?? 30,
            input.serviceLevel || null,
          ).run();
        } catch (baselineErr) {
          console.error("[API ACCOUNTS POST] Baseline D1 insert failed:", baselineErr);
        }
      }

      // Safe audit log insert
      try {
        await db.prepare(
          `INSERT INTO audit_logs
            (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'account.created', 'account', ?, ?)`,
        ).bind(crypto.randomUUID(), orgId, identity.userId || null, id, JSON.stringify(input)).run();
      } catch (auditErr) {
        console.warn("[API ACCOUNTS POST] Audit log insert warning:", auditErr);
      }
    }

    return Response.json({ account: { id, ...input, status: "active" } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Review the highlighted account fields.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}
