import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  APPROVED_ADMINISTRATORS,
  TECHFLEX_ORG_ID,
  apiError,
  PortalHttpError,
  requirePortalRole,
  type PortalRole,
} from "@/lib/portal-auth";
import { administratorTemporaryPassword, assertSameOrigin, authBridge, passwordConfiguration, passwordResponse, sessionHeaders } from "@/lib/password-auth";
import { loginDirectory, loginUsernameSchema } from "@/lib/login-usernames";

type AdministratorRecord = {
  email: string;
  displayName: string;
  userStatus: string;
  lastSeenAt: string | null;
  role: PortalRole | null;
  membershipStatus: string | null;
};

const roleCapabilities: Record<
  "owner_administrator" | "operations_administrator",
  string[]
> = {
  owner_administrator: [
    "All operational and financial modules",
    "Pricing and margin policies",
    "User access and system settings",
    "Audit, export, and integration controls",
  ],
  operations_administrator: [
    "CRM, work orders, scheduling, and dispatch",
    "Technician onboarding and document workflows",
    "Completion review and customer follow-up",
    "Operational reporting without ownership transfer",
  ],
};

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const emails = APPROVED_ADMINISTRATORS.map(
      (administrator) => administrator.email,
    );
    const records = await env.DB.prepare(
      `SELECT lower(u.email) AS email,
              u.display_name AS displayName,
              u.status AS userStatus,
              u.last_seen_at AS lastSeenAt,
              r.name AS role,
              m.status AS membershipStatus
         FROM users u
         LEFT JOIN memberships m
           ON m.user_id = u.id AND m.organization_id = ?
         LEFT JOIN roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
        WHERE r.name IN ('owner_administrator', 'operations_administrator')
           OR lower(u.email) IN (${emails.map(() => "?").join(", ")})
        ORDER BY u.display_name, CASE r.name WHEN 'owner_administrator' THEN 1 ELSE 2 END`,
    )
      .bind(TECHFLEX_ORG_ID, ...emails)
      .all<AdministratorRecord>();

    const recordByEmailAndRole = new Map(
      records.results.map((record) => [
        `${record.email}:${record.role ?? "none"}`,
        record,
      ]),
    );
    const approvedAdministrators: { email: string; displayName: string; role: "owner_administrator" | "operations_administrator";
      approved: boolean; accountStatus: "active" | "first_sign_in_pending"; lastSeenAt: string | null }[] = APPROVED_ADMINISTRATORS.map(
      (administrator) => {
        const record = recordByEmailAndRole.get(
          `${administrator.email}:${administrator.role}`,
        );
        return {
          email: administrator.email,
          displayName: record?.displayName ?? administrator.displayName,
          role: administrator.role,
          approved: true,
          accountStatus:
            record?.userStatus === "active" &&
            record.membershipStatus === "active"
              ? "active"
              : "first_sign_in_pending",
          lastSeenAt: record?.lastSeenAt ?? null,
        };
      },
    );
    for (const record of records.results) {
      if (record.userStatus !== "active" || record.membershipStatus !== "active"
        || !["owner_administrator", "operations_administrator"].includes(record.role ?? "")
        || approvedAdministrators.some(administrator => administrator.email === record.email)) continue;
      approvedAdministrators.push({ email: record.email, displayName: record.displayName,
        role: record.role as "owner_administrator" | "operations_administrator", approved: true,
        accountStatus: "active", lastSeenAt: record.lastSeenAt });
    }

    return passwordResponse({
      viewerRole: identity.role,
      approvedAdministrators,
      roleCapabilities,
      authentication: {
        mode: "individual_email_password",
        sharedPasswordEnabled: false,
        passwordChangeOnFirstSignIn: true,
        sessionAttribution: true,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

const administratorSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  username: loginUsernameSchema,
  role: z.literal("operations_administrator"),
  temporaryPassword: z.string().min(8).max(256).optional(),
  testTechnicianUsername: loginUsernameSchema.optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await requirePortalRole(request, ["owner_administrator"]);
    assertSameOrigin(request);
    const parsed = administratorSchema.safeParse(await request.json());
    if (!parsed.success) throw new PortalHttpError(400, "Enter the administrator’s full name, business email and a First.Last username.");
    // Credentials never enter profile responses, audit records or saved user fields.
    const { temporaryPassword: requestedPassword, testTechnicianUsername, ...input } = parsed.data;
    const existing = await env.DB.prepare("SELECT id, status FROM users WHERE lower(email)=?")
      .bind(input.email).all<{ id: string; status: string }>();
    const directory = await loginDirectory();
    if (existing.results.length) {
      const profile = directory.find(row => row.userId === existing.results[0].id);
      if (existing.results.length === 1 && existing.results[0].status === "active"
        && profile?.roles.length === 1 && profile.roles[0] === input.role
        && profile.username === input.username && profile.displayName === input.displayName) {
        // A retry never resets an already-created login or replaces a personal password.
        return passwordResponse({ administrator: { ...input, userId: profile.userId }, duplicate: true,
          loginCreated: false, warning: "This administrator profile already exists. Check its login status below; no password or permission was changed." });
      }
      throw new PortalHttpError(409, "This email already belongs to a profile. No existing access or password was changed.");
    }
    if (directory.some(row => row.suggestedUsername?.toLowerCase() === input.username.toLowerCase()))
      throw new PortalHttpError(409, "That username is already assigned. Choose a different username.");
    const testProfile = testTechnicianUsername ? {
      userId: crypto.randomUUID(), technicianId: crypto.randomUUID(), username: testTechnicianUsername,
      email: `${testTechnicianUsername.toLowerCase()}@techcommand-test.invalid`,
      displayName: `${input.displayName} (TEST technician)`,
    } : null;
    if (testProfile) {
      if (testProfile.username.toLowerCase() === input.username.toLowerCase()
        || directory.some(row => row.suggestedUsername?.toLowerCase() === testProfile.username.toLowerCase()))
        throw new PortalHttpError(409, "The test technician needs a different, unused username.");
      const occupied = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=?")
        .bind(testProfile.email).first();
      if (occupied) throw new PortalHttpError(409, "That test account already exists. Check its login status instead of adding it again.");
    }
    const role = await env.DB.prepare("SELECT id FROM roles WHERE organization_id=? AND name=?")
      .bind(TECHFLEX_ORG_ID, input.role).first<{ id: string }>();
    if (!role) throw new PortalHttpError(503, "The administrator role needs setup. No account was created.");
    const technicianRole = testProfile ? await env.DB.prepare("SELECT id FROM roles WHERE organization_id=? AND name='technician'")
      .bind(TECHFLEX_ORG_ID).first<{ id: string }>() : null;
    if (testProfile && !technicianRole) throw new PortalHttpError(503, "The technician role needs setup. No accounts were created.");
    passwordConfiguration();
    const temporaryPassword = requestedPassword ?? administratorTemporaryPassword();
    const userId = crypto.randomUUID(), membershipId = crypto.randomUUID(), requestId = crypto.randomUUID();
    try {
      // D1 batch is atomic: a collision cannot leave a partial access grant.
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id,auth_subject,email,display_name,status) VALUES (?,?,?,?,'active')")
          .bind(userId, `email:${input.email}`, input.email, input.displayName),
        env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role_id,status) VALUES (?,?,?,?,'active')")
          .bind(membershipId, TECHFLEX_ORG_ID, userId, role.id),
        env.DB.prepare("INSERT INTO login_usernames (user_id,username,username_key) VALUES (?,?,?)")
          .bind(userId, input.username, input.username.toLowerCase()),
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.administrator_created','user',?,?)")
          .bind(requestId, TECHFLEX_ORG_ID, actor.userId, userId, JSON.stringify({ email: input.email, role: input.role, username: input.username, loginSetup: "requested", testTechnicianUserId: testProfile?.userId })),
        ...(testProfile && technicianRole ? [
          env.DB.prepare("INSERT INTO users (id,auth_subject,email,display_name,status) VALUES (?,?,?,?,'active')")
            .bind(testProfile.userId, `email:${testProfile.email}`, testProfile.email, testProfile.displayName),
          env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role_id,status) VALUES (?,?,?,?,'active')")
            .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, testProfile.userId, technicianRole.id),
          env.DB.prepare("INSERT INTO login_usernames (user_id,username,username_key) VALUES (?,?,?)")
            .bind(testProfile.userId, testProfile.username, testProfile.username.toLowerCase()),
          env.DB.prepare(`INSERT INTO technicians (id,organization_id,user_id,technician_code,employment_type,status,payout_type,payout_rate,
            current_hourly_rate_cents,protected_rate_cents,compensation_tier,service_disciplines_json)
            VALUES (?,?,?,?,'contractor','active','percentage',0,0,0,'test_account',?)`)
            .bind(testProfile.technicianId, TECHFLEX_ORG_ID, testProfile.userId, `TEST-${testProfile.technicianId.slice(0,8)}`, JSON.stringify(["biomedical", "dme_mobility"])),
          env.DB.prepare(`INSERT INTO calendar_profiles (id,organization_id,user_id,provider,display_name,connection_mode,status,self_manage,administrators_can_schedule)
            VALUES (?,?,?,'google',?,'user_oauth','not_connected',1,1)`)
            .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, testProfile.userId, testProfile.displayName),
          env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.test_technician_created','technician',?,?)")
            .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, actor.userId, testProfile.technicianId, JSON.stringify({ administratorUserId: userId, username: testProfile.username, role: "technician", testAccount: true })),
        ] : []),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw new PortalHttpError(409, "That email or username was just assigned. Refresh before trying again; no partial access was saved.");
      throw error;
    }
    const administrator = { ...input, userId };
    const targets = [administrator, ...(testProfile ? [testProfile] : [])];
    const logins: { userId: string; displayName: string; username: string; loginCreated: boolean; warning?: string }[] = [];
    for (const target of targets) {
      let changed;
      try {
        changed = await authBridge("create", { userId: target.userId, email: target.email, displayName: target.displayName,
          technicianId: "technicianId" in target ? target.technicianId : undefined,
          password: temporaryPassword, actorUserId: actor.userId });
      } catch {
        // Preserve both profiles and never replay an uncertain password write.
        logins.push({ userId: target.userId, displayName: target.displayName, username: target.username, loginCreated: false,
          warning: "Profile saved, but login creation could not be confirmed. Refresh TechCommand logins before using Create login. Do not add this person again." });
        continue;
      }
      let warning: string | undefined;
      try {
        await env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.password_create','user',?,?)")
          .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, actor.userId, target.userId, JSON.stringify({ requestId, providerId: changed.user.providerId, temporary: true })).run();
      } catch { warning = "Login is ready. Its completion audit needs review; do not repeat account creation."; }
      logins.push({ userId: target.userId, displayName: target.displayName, username: target.username, loginCreated: true, warning });
    }
    return Response.json({ administrator, loginCreated: logins[0].loginCreated, login: input.username, logins,
      ...(logins.some(row => row.loginCreated) ? { temporaryPassword } : {}),
      mustChangePassword: true, warning: logins.find(row => row.warning)?.warning }, { status: 201, headers: sessionHeaders() });
  } catch (error) { return apiError(error); }
}
