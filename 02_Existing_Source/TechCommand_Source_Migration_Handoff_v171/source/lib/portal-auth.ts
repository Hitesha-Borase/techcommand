import { env } from "cloudflare:workers";
import { createErrorReference, safeServerLog } from "@/lib/server-observability";
import { PasswordAuthError, assertSameOrigin, usesPasswordLogin, verifyPasswordSession, type PasswordUser } from "@/lib/password-auth";
import { getDemoAccountFromCookie } from "@/lib/demo-auth";

export const TECHFLEX_ORG_ID = "techflex";

export function resolveOrganizationId(identity?: Partial<PortalIdentity> | null, request?: Request | null): string {
  if (identity?.organizationId) return identity.organizationId;
  if (request) {
    const tenantHeader = request.headers.get("x-organization-id") || request.headers.get("x-tenant-id");
    if (tenantHeader && tenantHeader.trim()) return tenantHeader.trim();
  }
  return (typeof process !== "undefined" && process.env?.TECHFLEX_ORG_ID) || TECHFLEX_ORG_ID;
}

export type PortalRole =
  | "owner_administrator"
  | "operations_administrator"
  | "dispatcher"
  | "biomedical_lead"
  | "finance"
  | "technician"
  | "client_administrator"
  | "client_location_user"
  | "auditor"
  | "school_coordinator";

export type PortalIdentity = {
  userId: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: PortalRole;
  technicianId: string | null;
  organizationId?: string;
};

export type ApprovedAdministrator = {
  email: string;
  displayName: string;
  userId: string;
  role: Extract<PortalRole, "owner_administrator" | "operations_administrator">;
  roleId: string;
  membershipId: string;
  roleDescription: string;
};

export const APPROVED_ADMINISTRATORS = [
  {
    email: "brandon@techflexmobility.com",
    displayName: "Brandon",
    userId: "user_brandon",
    role: "owner_administrator",
    roleId: "role_owner_administrator",
    membershipId: "membership_brandon_owner",
    roleDescription: "Full system, financial, policy, and access control",
  },
  {
    email: "james@techflexmobility.com",
    displayName: "James",
    userId: "user_james",
    role: "operations_administrator",
    roleId: "role_operations_administrator",
    membershipId: "membership_james_operations",
    roleDescription: "Operational administration without ownership transfer",
  },
  {
    email: "kristin.dunn@techflexmobility.com",
    displayName: "Kristin Dunn",
    userId: "user_kristin_dunn",
    role: "operations_administrator",
    roleId: "role_operations_administrator",
    membershipId: "membership_kristin_dunn_operations",
    roleDescription: "Operational administration without ownership transfer",
  },
  {
    email: "fboyer@ahcc.com",
    displayName: "Floyd Boyer",
    userId: "user_floyd_boyer",
    role: "owner_administrator",
    roleId: "role_owner_administrator",
    membershipId: "membership_floyd_compliance_administration",
    roleDescription: "Full portal administration for the compliance officer; does not transfer Site or company ownership",
  },
] as const satisfies readonly ApprovedAdministrator[];

const approvedAdministratorByEmail = new Map<string, ApprovedAdministrator>(
  APPROVED_ADMINISTRATORS.map((administrator) => [
    administrator.email,
    administrator,
  ]),
);

export class PortalHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headerName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encoded && encoding === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return null;
}

async function provisionApprovedAdministrator(
  administrator: ApprovedAdministrator,
  authSubject: string,
  displayName: string,
): Promise<PortalIdentity> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, timezone, currency) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      TECHFLEX_ORG_ID,
      "Astute Restorations LLC",
      "TechFlex Mobility Solutions",
      "America/New_York",
      "USD",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO roles (id, organization_id, name, description, is_system) VALUES (?, ?, ?, ?, 1)",
    ).bind(
      administrator.roleId,
      TECHFLEX_ORG_ID,
      administrator.role,
      administrator.roleDescription,
    ),
  ]);

  await env.DB.prepare(
    `INSERT INTO users
      (id, auth_subject, email, display_name, status, last_seen_at)
     VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO UPDATE SET
       auth_subject = CASE
         WHEN users.auth_subject LIKE 'email:%' THEN excluded.auth_subject
         ELSE users.auth_subject
       END,
       display_name = excluded.display_name,
       status = 'active',
       last_seen_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      administrator.userId,
      authSubject,
      administrator.email,
      displayName,
    )
    .run();

  const user = await env.DB.prepare(
    "SELECT id, auth_subject AS authSubject, display_name AS displayName FROM users WHERE lower(email) = ? LIMIT 1",
  )
    .bind(administrator.email)
    .first<{
      id: string;
      authSubject: string;
      displayName: string;
    }>();
  if (!user) {
    throw new PortalHttpError(500, "The approved administrator account could not be prepared.");
  }

  const previousMembership = await env.DB.prepare(
    "SELECT id FROM memberships WHERE organization_id = ? AND user_id = ? AND role_id = ? AND status = 'active'",
  ).bind(TECHFLEX_ORG_ID, user.id, administrator.roleId).first();

  await env.DB.prepare(
    `INSERT INTO memberships
      (id, organization_id, user_id, role_id, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(organization_id, user_id, role_id) DO UPDATE SET
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      administrator.membershipId,
      TECHFLEX_ORG_ID,
      user.id,
      administrator.roleId,
    )
    .run();

  if (!previousMembership) {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES (?, ?, ?, 'access.approved_administrator_activated', 'membership', ?, ?)`,
    ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, user.id, administrator.membershipId,
      JSON.stringify({ role: administrator.role, email: administrator.email, authorization: 'owner-approved administrator configuration' })).run();
  }
  await env.DB.prepare(
    "UPDATE memberships SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND user_id = ? AND role_id = 'role_auditor' AND status = 'active'",
  ).bind(TECHFLEX_ORG_ID, user.id).run();

  return {
    userId: user.id,
    authSubject: user.authSubject,
    email: administrator.email,
    displayName: user.displayName,
    role: administrator.role,
    technicianId: null,
  };
}

async function resolvePortalIdentity(request: Request): Promise<PortalIdentity> {
  const demo = getDemoAccountFromCookie(request.headers.get("cookie"));
  if (demo) {
    return {
      userId: demo.userId,
      authSubject: `demo:${demo.email}`,
      email: demo.email,
      displayName: demo.displayName,
      role: demo.role,
      technicianId: demo.technicianId,
    };
  }
  if (usesPasswordLogin(request)) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
    const { user } = await verifyPasswordSession(request);
    return getPasswordPortalIdentity(user);
  }
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const authSubject =
    request.headers.get("oai-authenticated-user-id")?.trim() ||
    (email ? `email:${email}` : null);
  if (!email || !authSubject) {
    throw new PortalHttpError(401, "Sign in is required.");
  }

  const administrator = approvedAdministratorByEmail.get(email);
  if (administrator) {
    return provisionApprovedAdministrator(
      administrator,
      authSubject,
      headerName(request) ?? administrator.displayName,
    );
  }

  const row = await env.DB.prepare(
    `SELECT u.id AS userId, u.auth_subject AS authSubject, u.email, u.display_name AS displayName,
            r.name AS role, t.id AS technicianId
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       JOIN roles r ON r.id = m.role_id
       LEFT JOIN technicians t ON t.user_id = u.id AND t.status = 'active'
      WHERE (u.auth_subject = ? OR lower(u.email) = ?) AND u.status = 'active'
        AND m.organization_id = ? AND r.organization_id = m.organization_id
      ORDER BY CASE r.name
        WHEN 'owner_administrator' THEN 1
        WHEN 'operations_administrator' THEN 2
        WHEN 'biomedical_lead' THEN 3
        WHEN 'dispatcher' THEN 4
        WHEN 'finance' THEN 5
        WHEN 'technician' THEN 6
        ELSE 9 END
      LIMIT 1`,
  ).bind(authSubject, email, TECHFLEX_ORG_ID).first<{
    userId: string;
    authSubject: string;
    email: string;
    displayName: string;
    role: PortalRole;
    technicianId: string | null;
  }>();

  if (!row) {
    throw new PortalHttpError(403, "Your portal account has not been assigned a role.");
  }
  await env.DB.prepare(
    `UPDATE users
        SET auth_subject = CASE WHEN auth_subject LIKE 'email:%' THEN ? ELSE auth_subject END,
            last_seen_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).bind(authSubject, row.userId).run();
  return { ...row, authSubject };
}

export async function getPasswordPortalIdentity(user: PasswordUser, allowTemporary = false): Promise<PortalIdentity> {
  if (user.app_metadata.tc_temporary && !allowTemporary) throw new PasswordAuthError(428, "Choose your own password before opening your assignments.");
  const users = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=? AND status='active'")
    .bind(user.email.trim().toLowerCase()).all<{ id: string }>();
  if (users.results.length !== 1) throw new PasswordAuthError(403, "Your profile needs administrator attention. No records were changed.");
  const localId = users.results[0].id;
  if (user.app_metadata.tc_user && user.app_metadata.tc_user !== localId) throw new PasswordAuthError(403, "This login is not linked to this TechCommand profile.");
  const row = await env.DB.prepare(`SELECT u.id AS userId, u.email, u.display_name AS displayName, r.name AS role, t.id AS technicianId
    FROM users u JOIN memberships m ON m.user_id=u.id AND m.status='active'
    JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
    LEFT JOIN technicians t ON t.user_id=u.id AND t.organization_id=m.organization_id AND t.status='active'
    WHERE u.id=? AND u.status='active' AND m.organization_id=?
    ORDER BY CASE r.name WHEN 'owner_administrator' THEN 1 WHEN 'operations_administrator' THEN 2 WHEN 'biomedical_lead' THEN 3 WHEN 'dispatcher' THEN 4 WHEN 'finance' THEN 5 WHEN 'technician' THEN 6 ELSE 9 END LIMIT 1`)
    .bind(localId, TECHFLEX_ORG_ID).first<Omit<PortalIdentity, "authSubject">>();
  if (!row || (!user.app_metadata.tc_user && (row.role !== "technician" || !user.app_metadata.tc_email_enrollment || row.technicianId !== user.app_metadata.tc_technician)))
    throw new PasswordAuthError(403, "Your TechCommand account has not been assigned active access.");
  return { ...row, authSubject: `supabase:${user.id}` };
}

export async function getPortalIdentity(request: Request): Promise<PortalIdentity> {
  const identity = await resolvePortalIdentity(request);
  // Consultant review is a product walkthrough, not an audit of customer data.
  // Default-deny centrally: a historical or future route allowlist must not
  // accidentally turn this role into read access to operational records.
  if (identity.role === "auditor") {
    const path = new URL(request.url).pathname;
    const allowed = (request.method === "GET" && ["/api/me", "/api/analytics/config"].includes(path))
      || (request.method === "POST" && path === "/api/problem-reports");
    if (!allowed) throw new PortalHttpError(403, "Consultant review does not include production records or administrative actions.");
  }
  return identity;
}

export async function requirePortalRole(
  request: Request,
  roles: PortalRole[],
): Promise<PortalIdentity> {
  const identity = await getPortalIdentity(request);
  if (!roles.includes(identity.role)) {
    throw new PortalHttpError(403, "You do not have permission to perform this action.");
  }
  return identity;
}

export function apiError(error: unknown) {
  if (error instanceof PasswordAuthError) return Response.json({ error: error.message }, {
    status: error.status,
    headers: { "Cache-Control": "private, no-store", ...(error.refreshable ? { "X-TechCommand-Refresh": "password" } : {}) },
  });
  if (error instanceof PortalHttpError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  }
  const reference = createErrorReference();
  safeServerLog("api_request", error, reference);
  console.error(">>> [API ERROR DETAILED]:", error);
  return Response.json(
    { error: "The portal could not complete that request.", reference, debug: (error as any)?.message || String(error) },
    { status: 500, headers: { "X-TechCommand-Error-Reference": reference } },
  );
}
