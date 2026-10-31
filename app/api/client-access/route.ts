import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";
import { assertSameOrigin } from "@/lib/password-auth";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(120),
  accountId: z.string().min(1),
  role: z.enum(["client_administrator", "client_location_user"]),
  locationId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  accessId: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

const messageSchema = z.object({
  action: z.literal("send_message"),
  accountId: z.string().min(1),
  workOrderId: z.string().optional().nullable(),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(5000),
});

const adminRoles = ["owner_administrator", "operations_administrator"] as const;

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...adminRoles]);
    const [accounts, locations, access, messages] = await Promise.all([
      env.DB.prepare(
        "SELECT id, name FROM accounts WHERE organization_id=? AND status='active' ORDER BY name",
      ).bind(TECHFLEX_ORG_ID).all(),
      env.DB.prepare(
        `SELECT l.id, l.account_id AS accountId, l.name
           FROM locations l JOIN accounts a ON a.id=l.account_id
          WHERE a.organization_id=? AND l.status='active' ORDER BY a.name,l.name`,
      ).bind(TECHFLEX_ORG_ID).all(),
      env.DB.prepare(
        `SELECT aa.id, aa.user_id AS userId, aa.account_id AS accountId, aa.location_id AS locationId,
                aa.access_role AS role, aa.status, aa.created_at AS createdAt,
                u.email, u.display_name AS displayName, u.last_seen_at AS lastSeenAt,
                a.name AS accountName, l.name AS locationName
           FROM account_access aa
           JOIN users u ON u.id=aa.user_id
           JOIN accounts a ON a.id=aa.account_id
           LEFT JOIN locations l ON l.id=aa.location_id
          WHERE a.organization_id=?
          ORDER BY a.name,u.display_name`,
      ).bind(TECHFLEX_ORG_ID).all(),
      env.DB.prepare(
        `SELECT cm.id,cm.account_id AS accountId,a.name AS accountName,cm.work_order_id AS workOrderId,
                cm.subject,cm.body,cm.created_at AS createdAt,u.display_name AS senderName,
                COALESCE((SELECT r.name FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.user_id=u.id AND m.organization_id=? AND m.status='active' ORDER BY CASE r.name WHEN 'owner_administrator' THEN 1 WHEN 'operations_administrator' THEN 2 ELSE 9 END LIMIT 1),'user') AS senderRole
           FROM client_messages cm JOIN accounts a ON a.id=cm.account_id JOIN users u ON u.id=cm.sender_user_id
          WHERE cm.organization_id=? AND cm.visibility='shared' ORDER BY cm.created_at DESC LIMIT 100`,
      ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID).all(),
    ]);
    return Response.json({
      accounts: accounts.results,
      locations: locations.results,
      access: access.results,
      messages: messages.results,
      authentication: {
        mode: "individual_email_identity",
        sharedPasswordsEnabled: false,
        siteAuthorizationRequired: false,
        passwordChangeOnFirstSignIn: true,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...adminRoles]);
    assertSameOrigin(request);
    const body: unknown = await request.json();
    if (
      body !== null &&
      typeof body === "object" &&
      "action" in body &&
      body.action === "send_message"
    ) {
      const message = messageSchema.parse(body);
      const account = await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND organization_id=? AND status='active'").bind(message.accountId, TECHFLEX_ORG_ID).first();
      if (!account) return Response.json({ error: "Select an active client account." }, { status: 400 });
      if (message.workOrderId) {
        const workOrder = await env.DB.prepare("SELECT id FROM work_orders WHERE id=? AND account_id=?").bind(message.workOrderId, message.accountId).first();
        if (!workOrder) return Response.json({ error: "That job does not belong to the selected account." }, { status: 403 });
      }
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO client_messages (id,organization_id,account_id,work_order_id,sender_user_id,subject,body) VALUES (?,?,?,?,?,?,?)").bind(id, TECHFLEX_ORG_ID, message.accountId, message.workOrderId || null, identity.userId, message.subject, message.body),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'client_message.sent','client_message',?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify({ accountId: message.accountId, workOrderId: message.workOrderId || null })),
      ]);
      return Response.json({ message: { id, ...message, senderName: identity.displayName } }, { status: 201 });
    }
    const input = inviteSchema.parse(body);
    const email = input.email.toLowerCase();
    if (input.role === "client_location_user" && !input.locationId) {
      return Response.json({ error: "Select the location this user may access." }, { status: 400 });
    }
    const account = await env.DB.prepare(
      "SELECT id,name FROM accounts WHERE id=? AND organization_id=? AND status='active'",
    ).bind(input.accountId, TECHFLEX_ORG_ID).first<{ id: string; name: string }>();
    if (!account) return Response.json({ error: "Select an active client account." }, { status: 400 });
    if (input.locationId) {
      const location = await env.DB.prepare(
        "SELECT id FROM locations WHERE id=? AND account_id=? AND status='active'",
      ).bind(input.locationId, input.accountId).first();
      if (!location) return Response.json({ error: "That location does not belong to the selected account." }, { status: 400 });
    }

    const matches = await env.DB.prepare(
      "SELECT id,auth_subject AS authSubject,status FROM users WHERE lower(email)=?",
    ).bind(email).all<{ id: string; authSubject: string; status: string }>();
    if (matches.results.length > 1) return Response.json({ error: "More than one profile uses this email. Resolve the duplicate before granting facility access." }, { status: 409 });
    const existing = matches.results[0];
    if (existing) {
      const memberships = await env.DB.prepare(`SELECT m.organization_id AS organizationId,r.name AS role FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.user_id=?`).bind(existing.id).all<{ organizationId: string; role: string }>();
      if (existing.status !== "active" || memberships.results.some(m => m.organizationId !== TECHFLEX_ORG_ID || !["client_administrator", "client_location_user"].includes(m.role))) {
        return Response.json({ error: "This email already has another company or team profile. Choose the facility contact's own email; their existing access was not changed." }, { status: 409 });
      }
    }
    const userId = existing?.id ?? crypto.randomUUID();
    const roleId = `role_${input.role}`;
    const accessId = crypto.randomUUID();
    const statements = [
      env.DB.prepare(
        "INSERT OR IGNORE INTO roles (id,organization_id,name,description,is_system) VALUES (?,?,?,?,1)",
      ).bind(roleId, TECHFLEX_ORG_ID, input.role, input.role === "client_administrator" ? "Client account portal administration" : "Client location portal access"),
      existing
        ? env.DB.prepare(
            "UPDATE users SET display_name=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          ).bind(input.displayName, userId)
        : env.DB.prepare(
            "INSERT INTO users (id,auth_subject,email,display_name,status) VALUES (?,?,?,?, 'active')",
          ).bind(userId, `email:${email}`, email, input.displayName),
      env.DB.prepare(
        "UPDATE memberships SET status='inactive',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=? AND role_id IN ('role_client_administrator','role_client_location_user')",
      ).bind(TECHFLEX_ORG_ID, userId),
      env.DB.prepare(
        `INSERT INTO memberships (id,organization_id,user_id,role_id,status)
         VALUES (?,?,?,?, 'active')
         ON CONFLICT(organization_id,user_id,role_id) DO UPDATE SET status='active',updated_at=CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, userId, roleId),
      env.DB.prepare("DELETE FROM account_access WHERE user_id=? AND account_id IN (SELECT id FROM accounts WHERE organization_id=?)").bind(userId, TECHFLEX_ORG_ID),
      env.DB.prepare(
        "INSERT INTO account_access (id,user_id,account_id,location_id,access_role,status) VALUES (?,?,?,?,?,'active')",
      ).bind(accessId, userId, input.accountId, input.locationId || null, input.role),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
         VALUES (?, ?, ?, 'client_access.prepared', 'account_access', ?, ?)`,
      ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, accessId, JSON.stringify({ ...input, email })),
    ];
    await env.DB.batch(statements);
    return Response.json({
      access: { id: accessId, userId, ...input, email, accountName: account.name, status: "active" },
      nextStep: `Facility permissions saved. Create the email/password login for ${email}; no ChatGPT account or Site viewer invitation is required.`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Review the partner access fields.", details: error.flatten() }, { status: 400 });
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...adminRoles]);
    assertSameOrigin(request);
    const input = updateSchema.parse(await request.json());
    const row = await env.DB.prepare(
      `SELECT aa.id,aa.user_id AS userId,aa.access_role AS accessRole FROM account_access aa JOIN accounts a ON a.id=aa.account_id
        WHERE aa.id=? AND a.organization_id=?`,
    ).bind(input.accessId, TECHFLEX_ORG_ID).first<{ id: string; userId: string; accessRole: string }>();
    if (!row) return Response.json({ error: "Partner access record not found." }, { status: 404 });
    await env.DB.batch([
      env.DB.prepare("UPDATE account_access SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(input.status, input.accessId),
      env.DB.prepare(
        `UPDATE memberships SET status=?,updated_at=CURRENT_TIMESTAMP
          WHERE organization_id=? AND user_id=? AND role_id=?`,
      ).bind(input.status, TECHFLEX_ORG_ID, row.userId, `role_${row.accessRole}`),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
         VALUES (?, ?, ?, 'client_access.status_changed', 'account_access', ?, ?)`,
      ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, input.accessId, JSON.stringify({ status: input.status })),
    ]);
    return Response.json({ access: { id: input.accessId, status: input.status } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Choose a valid access status." }, { status: 400 });
    return apiError(error);
  }
}
