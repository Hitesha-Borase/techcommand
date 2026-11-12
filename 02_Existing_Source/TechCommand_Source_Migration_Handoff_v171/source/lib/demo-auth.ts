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
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS local_credentials (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, timezone, currency) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      TECHFLEX_ORG_ID,
      "Astute Restorations LLC",
      "TechFlex Mobility Solutions",
      "America/New_York",
      "USD",
    ).run();

    for (const demo of Object.values(DEMO_ACCOUNTS)) {
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

