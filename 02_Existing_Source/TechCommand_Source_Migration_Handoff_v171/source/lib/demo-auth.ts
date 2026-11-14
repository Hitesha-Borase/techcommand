import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID, type PortalRole } from "@/lib/portal-auth";

export type DemoAccount = {
  email: string;
  password: string;
  displayName: string;
  userId: string;
  role: PortalRole;
  roleId: string;
  technicianId: string | null;
  technicianCode?: string;
  description: string;
};

export const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  "admin@demo.com": {
    email: "admin@demo.com",
    password: "admin1234",
    displayName: "Demo Administrator",
    userId: "user_demo_admin",
    role: "owner_administrator",
    roleId: "role_owner_administrator",
    technicianId: null,
    description: "Full Super Admin & Control Tower Dashboard",
  },
  "tech@demo.com": {
    email: "tech@demo.com",
    password: "tech1234",
    displayName: "Demo Technician",
    userId: "user_demo_tech",
    role: "technician",
    roleId: "role_technician",
    technicianId: "tech_demo_1",
    technicianCode: "TECH-DEMO",
    description: "Mobile Field App & Assigned Jobs Dashboard",
  },
  "biomed@demo.com": {
    email: "biomed@demo.com",
    password: "biomed1234",
    displayName: "Demo Biomedical Lead",
    userId: "user_demo_biomed",
    role: "biomedical_lead",
    roleId: "role_biomedical_lead",
    technicianId: null,
    description: "Hospital Equipment & PM Rounds Dashboard",
  },
  "finance@demo.com": {
    email: "finance@demo.com",
    password: "finance1234",
    displayName: "Demo Finance Officer",
    userId: "user_demo_finance",
    role: "finance",
    roleId: "role_finance",
    technicianId: null,
    description: "Invoicing, Margins & Payouts Dashboard",
  },
  "client@demo.com": {
    email: "client@demo.com",
    password: "client1234",
    displayName: "Demo Client Partner",
    userId: "user_demo_client",
    role: "client_administrator",
    roleId: "role_client_administrator",
    technicianId: null,
    description: "Client & Facility Management Dashboard",
  },
};

export function getDemoAccountFromCookie(cookieHeader: string | null): DemoAccount | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map(s => s.trim()).find(s => s.startsWith("tc_demo_user="));
  if (!match) return null;
  const email = decodeURIComponent(match.split("=")[1] || "").trim().toLowerCase();
  return DEMO_ACCOUNTS[email] || null;
}

export async function seedAllDemoUsers() {
  try {
    if (!env?.DB) {
      console.warn("seedAllDemoUsers: env.DB is not configured yet.");
      return;
    }

    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS local_credentials (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        currency TEXT DEFAULT 'USD' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_system INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        auth_subject TEXT,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        last_seen_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(organization_id, user_id, role_id)
      );
      CREATE TABLE IF NOT EXISTS technicians (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        technician_code TEXT,
        employment_type TEXT DEFAULT 'contractor' NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        service_disciplines_json TEXT,
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

    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN service_discipline TEXT;"); } catch {}
    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN service_level TEXT;"); } catch {}
    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN billing_email TEXT;"); } catch {}
    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN payment_terms_days INTEGER DEFAULT 30;"); } catch {}
    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN status TEXT DEFAULT 'active';"); } catch {}
    try { await env.DB.exec("ALTER TABLE accounts ADD COLUMN record_version INTEGER DEFAULT 1;"); } catch {}

    await env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, timezone, currency) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      TECHFLEX_ORG_ID,
      "Astute Restorations LLC",
      "TechFlex Mobility Solutions",
      "America/New_York",
      "USD",
    ).run();

    try {
      await env.DB.exec("DELETE FROM users WHERE lower(email) LIKE '%@demo.com'; DELETE FROM memberships WHERE user_id LIKE 'user_demo_%'; DELETE FROM login_usernames WHERE user_id LIKE 'user_demo_%';");
    } catch {}

    for (const demo of [] as DemoAccount[]) {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO local_credentials (id, email, password, role, display_name, description)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             password = excluded.password,
             role = excluded.role,
             display_name = excluded.display_name,
             description = excluded.description`,
        ).bind(
          demo.userId,
          demo.email,
          demo.password,
          demo.role,
          demo.displayName,
          demo.description,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO roles (id, organization_id, name, description, is_system) VALUES (?, ?, ?, ?, 1)",
        ).bind(
          demo.roleId,
          TECHFLEX_ORG_ID,
          demo.role,
          demo.displayName,
        ),
        env.DB.prepare(
          `INSERT INTO users (id, auth_subject, email, display_name, status, last_seen_at)
           VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
           ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, status = 'active'`,
        ).bind(
          demo.userId,
          `demo:${demo.email}`,
          demo.email,
          demo.displayName,
        ),
        env.DB.prepare(
          `INSERT INTO memberships (id, organization_id, user_id, role_id, status)
           VALUES (?, ?, ?, ?, 'active')
           ON CONFLICT(organization_id, user_id, role_id) DO UPDATE SET status = 'active'`,
        ).bind(
          `membership_${demo.userId}`,
          TECHFLEX_ORG_ID,
          demo.userId,
          demo.roleId,
        ),
      ]);

      if (demo.role === "technician" && demo.technicianId) {
        await env.DB.prepare(
          `INSERT INTO technicians (id, organization_id, user_id, technician_code, employment_type, status, service_disciplines_json)
           VALUES (?, ?, ?, ?, 'contractor', 'active', '["dme_mobility","biomedical"]')
           ON CONFLICT(id) DO UPDATE SET status = 'active'`,
        ).bind(
          demo.technicianId,
          TECHFLEX_ORG_ID,
          demo.userId,
          demo.technicianCode || "TECH-DEMO",
        ).run();
      }
    }

    try {
      const dbUsers = await env.DB.prepare(`
        SELECT u.id AS userId, u.email, u.display_name AS displayName, r.name AS role, r.id AS roleId,
               t.id AS technicianId, t.technician_code AS technicianCode,
               (SELECT password FROM local_credentials lc WHERE lower(lc.email) = lower(u.email) LIMIT 1) AS password
          FROM users u
          JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
          JOIN roles r ON r.id = m.role_id
          LEFT JOIN technicians t ON t.user_id = u.id
         WHERE u.status = 'active'
      `).all<{
        userId: string; email: string; displayName: string; role: string; roleId: string;
        technicianId: string | null; technicianCode: string | null; password: string | null;
      }>();
      if (dbUsers?.results) {
        for (const row of dbUsers.results) {
          const acc: DemoAccount = {
            email: row.email,
            password: row.password || "TechCommand2026!",
            displayName: row.displayName,
            userId: row.userId,
            role: row.role as PortalRole,
            roleId: row.roleId,
            technicianId: row.technicianId,
            technicianCode: row.technicianCode || undefined,
            description: `${row.displayName} (${row.role})`,
          };
          DEMO_ACCOUNTS[row.email.toLowerCase()] = acc;
        }
      }
    } catch {}
  } catch (error) {
    console.error("seedAllDemoUsers error:", error);
  }
}

export async function ensureDemoUserInDb(demo: DemoAccount) {
  try {
    await seedAllDemoUsers();
  } catch (error) {
    console.error("ensureDemoUserInDb error:", error);
  }
}
