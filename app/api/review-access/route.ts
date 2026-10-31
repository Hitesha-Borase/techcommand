import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  APPROVED_ADMINISTRATORS,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { assertSameOrigin } from "@/lib/password-auth";

const createSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(120),
});

const updateSchema = z.object({
  membershipId: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

const adminRoles = ["owner_administrator", "operations_administrator"] as const;

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...adminRoles]);
    const reviewers = await env.DB.prepare(
      `SELECT m.id AS membershipId, u.email, u.display_name AS displayName,
              m.status, u.last_seen_at AS lastSeenAt, m.created_at AS createdAt
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         JOIN roles r ON r.id = m.role_id
        WHERE m.organization_id = ? AND r.name = 'auditor'
        ORDER BY u.display_name`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all();
    return Response.json({ reviewers: reviewers.results });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...adminRoles]);
    assertSameOrigin(request);
    const input = createSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    if (APPROVED_ADMINISTRATORS.some(administrator => administrator.email === email))
      return Response.json({ error: "This email belongs to an administrator. Use a separate consultant identity." }, { status: 409 });
    const existing = await env.DB.prepare("SELECT id,display_name AS displayName,status FROM users WHERE lower(email)=?")
      .bind(email).all<{ id: string; displayName: string; status: string }>();
    if (existing.results.length) {
      const user = existing.results[0];
      const memberships = await env.DB.prepare(`SELECT m.organization_id AS organizationId,m.status,r.name AS role
        FROM memberships m LEFT JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
        WHERE m.user_id=?`).bind(user.id).all<{ organizationId: string; status: string; role: string | null }>();
      if (existing.results.length !== 1 || user.status !== "active" || memberships.results.length !== 1
        || memberships.results[0].organizationId !== TECHFLEX_ORG_ID || memberships.results[0].role !== "auditor")
        return Response.json({ error: "This email already belongs to another profile. No access or profile was changed." }, { status: 409 });
      if (memberships.results[0].status !== "active")
        return Response.json({ error: "This reviewer is suspended. Use Restore after reviewing the existing access." }, { status: 409 });
      return Response.json({ reviewer: { email, displayName: user.displayName, status: "active" }, duplicate: true });
    }
    const userId = crypto.randomUUID();
    const membershipId = `reviewer_${crypto.randomUUID()}`;

    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO roles (id, organization_id, name, description, is_system) VALUES ('role_auditor', ?, 'auditor', 'Read-only product and controls review', 1)",
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
            "INSERT INTO users (id, auth_subject, email, display_name, status) VALUES (?, ?, ?, ?, 'active')",
          ).bind(userId, `email:${email}`, email, input.displayName),
      env.DB.prepare(
        `INSERT INTO memberships (id, organization_id, user_id, role_id, status)
         VALUES (?, ?, ?, 'role_auditor', 'active')
         ON CONFLICT(organization_id, user_id, role_id) DO UPDATE SET
           status = 'active', updated_at = CURRENT_TIMESTAMP`,
      ).bind(membershipId, TECHFLEX_ORG_ID, userId),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'review_access.prepared', 'user', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        userId,
        JSON.stringify({ email, role: "auditor" }),
      ),
    ]);

    return Response.json(
      {
        reviewer: { email, displayName: input.displayName, status: "active" },
        nextStep:
          "Create this person's individual login in TechCommand logins, then share the temporary password privately.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Enter the consultant's name and a valid business email." },
        { status: 400 },
      );
    }
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...adminRoles]);
    assertSameOrigin(request);
    const input = updateSchema.parse(await request.json());
    const membership = await env.DB.prepare(
      `SELECT m.id, m.user_id AS userId
         FROM memberships m
         JOIN roles r ON r.id = m.role_id
        WHERE m.id = ? AND m.organization_id = ? AND r.name = 'auditor'`,
    )
      .bind(input.membershipId, TECHFLEX_ORG_ID)
      .first<{ id: string; userId: string }>();
    if (!membership) {
      return Response.json({ error: "Reviewer access was not found." }, { status: 404 });
    }
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE memberships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(input.status, input.membershipId),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'review_access.status_changed', 'membership', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.membershipId,
        JSON.stringify({ status: input.status }),
      ),
    ]);
    return Response.json({ membershipId: input.membershipId, status: input.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Choose a valid reviewer status." }, { status: 400 });
    }
    return apiError(error);
  }
}
