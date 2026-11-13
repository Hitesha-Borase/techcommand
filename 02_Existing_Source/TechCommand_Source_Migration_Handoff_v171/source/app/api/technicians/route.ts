import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { administratorTemporaryPassword, assertSameOrigin, authBridge, passwordAuthConfigured } from "@/lib/password-auth";
import { availableTechnicianUsername, loginDirectory, loginUsernameSchema } from "@/lib/login-usernames";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  username: loginUsernameSchema.optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  technicianCode: z.string().trim().min(2).max(30),
  employmentType: z.enum(["employee", "contractor"]),
  homePostalCode: z.string().trim().max(12).optional().nullable(),
  dispatchAddress1: z.string().trim().max(240).optional().nullable(),
  dispatchAddress2: z.string().trim().max(120).optional().nullable(),
  dispatchCity: z.string().trim().max(120).optional().nullable(),
  dispatchState: z.string().trim().max(40).optional().nullable(),
  dispatchPostalCode: z.string().trim().max(20).optional().nullable(),
  maxRadiusMiles: z.number().int().min(1).max(1000).default(200),
  payoutRate: z.number().min(0).max(1).default(0.55),
  startingHourlyRate: z.number().min(7.25).max(40).default(22),
});

const employmentSchema = z.discriminatedUnion("employmentType", [
  z.object({ action: z.literal("employment"), technicianId: z.string().min(1), recordVersion: z.number().int().min(1), employmentType: z.literal("contractor"), payoutRate: z.number().min(0).max(1) }),
  z.object({ action: z.literal("employment"), technicianId: z.string().min(1), recordVersion: z.number().int().min(1), employmentType: z.literal("employee"), hourlyRate: z.number().min(7.25).max(40) }),
]);

const trainingSchema = z.object({
  action: z.literal("training").optional(),
  technicianId: z.string().min(1),
  trainingMode: z.boolean(),
  proficiencyLevel: z.enum(["trainee", "guided", "independent"]),
});

const dispatchProfileSchema = z.object({
  action: z.literal("dispatch_profile"),
  technicianId: z.string().min(1),
  dispatchAddress1: z.string().trim().min(2).max(240),
  dispatchAddress2: z.string().trim().max(120).optional().nullable(),
  dispatchCity: z.string().trim().min(2).max(120),
  dispatchState: z.string().trim().min(2).max(40),
  dispatchPostalCode: z.string().trim().min(5).max(20),
});

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const result = await env.DB.prepare(
      `SELECT t.id, t.technician_code AS technicianCode, t.employment_type AS employmentType,
              t.service_disciplines_json AS serviceDisciplinesJson, t.record_version AS recordVersion, t.status, t.phone, t.home_postal_code AS homePostalCode,
              t.dispatch_address_1 AS dispatchAddress1,t.dispatch_address_2 AS dispatchAddress2,
              t.dispatch_city AS dispatchCity,t.dispatch_state AS dispatchState,
              t.dispatch_postal_code AS dispatchPostalCode,
              t.max_radius_miles AS maxRadiusMiles, t.payout_type AS payoutType,
              t.payout_rate AS payoutRate, u.display_name AS name, u.email,
              t.training_mode AS trainingMode, t.proficiency_level AS proficiencyLevel,
              t.guided_jobs_completed AS guidedJobsCompleted, t.qa_pass_streak AS qaPassStreak,
              t.competency_score AS competencyScore,
              t.hire_date AS hireDate,t.current_hourly_rate_cents AS currentHourlyRateCents,
              t.compensation_tier AS compensationTier,t.protected_rate_cents AS protectedRateCents,
              t.rate_status AS rateStatus,t.ceu_due_on AS ceuDueOn,
              t.ceu_hours_required AS ceuHoursRequired,t.ceu_hours_completed AS ceuHoursCompleted,
              cp.status AS calendarStatus,cp.external_calendar_id AS calendarId,
              COUNT(DISTINCT c.id) AS credentialCount
         FROM technicians t
         LEFT JOIN users u ON u.id = t.user_id AND EXISTS (
           SELECT 1 FROM memberships m WHERE m.user_id = t.user_id AND m.organization_id = t.organization_id AND m.status = 'active'
         )
         LEFT JOIN technician_credentials c ON c.technician_id = t.id AND c.status = 'current'
         LEFT JOIN calendar_profiles cp ON cp.user_id=t.user_id AND cp.organization_id=t.organization_id AND cp.provider='google'
        WHERE t.organization_id = ? AND t.status != 'inactive'
          AND (t.user_id IS NULL OR u.id IS NOT NULL)
        GROUP BY t.id ORDER BY u.display_name`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all();
    return Response.json({ technicians: result.results }, { headers: privateNoStore });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const payload = await request.json();
    if ((payload as { action?: string }).action === "disciplines") {
      const input = z.object({ technicianId: z.string().min(1), recordVersion: z.number().int().positive(), disciplines: z.array(z.enum(["biomedical", "dme_mobility"])).max(2) }).parse(payload);
      const value = JSON.stringify([...new Set(input.disciplines)]);
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) SELECT ?,?,?,'technician.disciplines_updated','technician',id,service_disciplines_json,? FROM technicians WHERE id=? AND organization_id=? AND record_version=?").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,value,input.technicianId,TECHFLEX_ORG_ID,input.recordVersion),
        env.DB.prepare("UPDATE technicians SET service_disciplines_json=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=?").bind(value,input.technicianId,TECHFLEX_ORG_ID,input.recordVersion),
      ]);
      if (!results[1].meta.changes) return Response.json({error:"The technician profile changed. Reload before saving capabilities."},{status:409});
      return Response.json({updated:true});
    }
    if ((payload as { action?: string }).action === "employment") {
      const input = employmentSchema.parse(payload);
      const before = await env.DB.prepare("SELECT employment_type,payout_type,payout_rate,current_hourly_rate_cents,protected_rate_cents,compensation_tier,record_version FROM technicians WHERE id=? AND organization_id=? AND status!='inactive'").bind(input.technicianId, TECHFLEX_ORG_ID).first();
      if (!before) return Response.json({ error: "Technician not found." }, { status: 404 });
      const hourly = input.employmentType === "employee" ? Math.round(input.hourlyRate * 100) : 0;
      const rate = input.employmentType === "contractor" ? input.payoutRate : 0;
      const tier = input.employmentType === "contractor" ? "contractor" : before.employment_type === "employee" ? before.compensation_tier : "apprentice";
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) SELECT ?,?,?,'technician.employment_updated','technician',?,?,? FROM technicians WHERE id=? AND organization_id=? AND record_version=? AND status!='inactive'").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.technicianId,JSON.stringify(before),JSON.stringify(input),input.technicianId,TECHFLEX_ORG_ID,input.recordVersion),
        env.DB.prepare("UPDATE technicians SET employment_type=?,payout_type=?,payout_rate=?,current_hourly_rate_cents=?,protected_rate_cents=?,compensation_tier=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND record_version=? AND status!='inactive'").bind(input.employmentType,input.employmentType === "contractor" ? "percentage" : "hourly",rate,hourly,hourly,tier,input.technicianId,TECHFLEX_ORG_ID,input.recordVersion),
      ]);
      if (!results[1].meta.changes) return Response.json({ error: "This profile changed while you were editing. Refresh the roster and reopen employment settings." }, { status: 409 });
      return Response.json({ updated: true });
    }
    if ((payload as { action?: string }).action === "dispatch_profile") {
      const input = dispatchProfileSchema.parse(payload);
      const technician = await env.DB.prepare(
        "SELECT id FROM technicians WHERE id=? AND organization_id=? AND status!='inactive'",
      ).bind(input.technicianId, TECHFLEX_ORG_ID).first();
      if (!technician)
        return Response.json({ error: "Technician not found." }, { status: 404 });
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE technicians SET dispatch_address_1=?,dispatch_address_2=?,dispatch_city=?,dispatch_state=?,dispatch_postal_code=?,
             dispatch_latitude=NULL,dispatch_longitude=NULL,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND organization_id=?`,
        ).bind(input.dispatchAddress1,input.dispatchAddress2 || null,input.dispatchCity,input.dispatchState,input.dispatchPostalCode,input.technicianId,TECHFLEX_ORG_ID),
        env.DB.prepare(
          "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'technician.dispatch_origin_updated','technician',?,?)",
        ).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,input.technicianId,JSON.stringify(input)),
      ]);
      return Response.json({ technician: input });
    }
    const input = trainingSchema.parse(payload);
    const technician = await env.DB.prepare(
      "SELECT id FROM technicians WHERE id=? AND organization_id=? AND status!='inactive'",
    )
      .bind(input.technicianId, TECHFLEX_ORG_ID)
      .first();
    if (!technician)
      return Response.json({ error: "Technician not found." }, { status: 404 });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE technicians SET training_mode=?,proficiency_level=?,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?",
      ).bind(
        input.trainingMode ? 1 : 0,
        input.proficiencyLevel,
        input.technicianId,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'technician.training_updated','technician',?,?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.technicianId,
        JSON.stringify(input),
      ),
    ]);
    return Response.json({ technician: input });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Review the technician settings and pay rate.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const input = schema.parse(await request.json());
    assertSameOrigin(request);
    const userId = crypto.randomUUID();
    const technicianId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const normalizedEmail = input.email.toLowerCase();
    const existingUser = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=?").bind(normalizedEmail).first<{ id: string }>();
    const existingTechnician = await env.DB.prepare(
      "SELECT id FROM technicians WHERE organization_id=? AND (lower(technician_code)=lower(?) OR user_id=?)",
    ).bind(TECHFLEX_ORG_ID, input.technicianCode, existingUser?.id || "").first();
    if (existingTechnician) return Response.json({ error: "A technician already uses this email or technician code. Open the existing roster record, or use a different email and code." }, { status: 409 });
    if (existingUser) return Response.json({ error: "This email already has a portal user account. Use Users & Access to review its existing role before adding a technician; no existing permissions were changed." }, { status: 409 });
    const directory = await loginDirectory();
    const reserved = directory.map(row => row.username || row.suggestedUsername).filter((value): value is string => !!value);
    const username = input.username || availableTechnicianUsername(input.name, reserved);
    if (reserved.some(value => value.toLowerCase() === username.toLowerCase())) return Response.json({ error: "That username is already assigned. Add a number, such as First.Last.2." }, { status: 409, headers: privateNoStore });
    const storedUsername = await env.DB.prepare("SELECT user_id FROM login_usernames WHERE username_key=?").bind(username.toLowerCase()).first();
    if (storedUsername) return Response.json({ error: "That username is reserved for another profile. Choose another username." }, { status: 409, headers: privateNoStore });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO roles (id, organization_id, name, description, is_system) VALUES ('role_technician', ?, 'technician', 'Assigned field work and personal records only', 1)",
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        "INSERT INTO users (id, auth_subject, email, display_name, phone, status) VALUES (?, ?, ?, ?, ?, 'active')",
      ).bind(
        userId,
        `email:${normalizedEmail}`,
        normalizedEmail,
        input.name,
        input.phone || null,
      ),
      env.DB.prepare("INSERT INTO login_usernames(user_id,username,username_key) VALUES (?,?,?)").bind(userId,username,username.toLowerCase()),
      env.DB.prepare(
        "INSERT INTO memberships (id, organization_id, user_id, role_id, status) VALUES (?, ?, ?, 'role_technician', 'active')",
      ).bind(membershipId, TECHFLEX_ORG_ID, userId),
      env.DB.prepare(
        `INSERT INTO technicians (id, organization_id, user_id, technician_code, employment_type, status, phone, home_postal_code,dispatch_address_1,dispatch_address_2,dispatch_city,dispatch_state,dispatch_postal_code,max_radius_miles, payout_type, payout_rate,hire_date,current_hourly_rate_cents,compensation_tier,protected_rate_cents,ceu_due_on,ceu_hours_required,ceu_hours_completed) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,date('now'),?,?,?,date('now','+1 year'),8,0)`,
      ).bind(
        technicianId,
        TECHFLEX_ORG_ID,
        userId,
        input.technicianCode,
        input.employmentType,
        input.phone || null,
        input.homePostalCode || null,
        input.dispatchAddress1 || null,
        input.dispatchAddress2 || null,
        input.dispatchCity || null,
        input.dispatchState || null,
        input.dispatchPostalCode || null,
        input.maxRadiusMiles,
        input.employmentType === "employee" ? "hourly" : "percentage",
        input.employmentType === "employee" ? 0 : input.payoutRate,
        input.employmentType === "employee"
          ? Math.round(input.startingHourlyRate * 100)
          : 0,
        input.employmentType === "employee" ? "apprentice" : "contractor",
        input.employmentType === "employee"
          ? Math.round(input.startingHourlyRate * 100)
          : 0,
      ),
      env.DB.prepare(
        `INSERT INTO calendar_profiles (id,organization_id,user_id,provider,display_name,connection_mode,status,self_manage,administrators_can_schedule)
         VALUES (?,?,?,'google',?,'user_oauth','not_connected',1,1)`,
      ).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,userId,`${input.name} — TechCommand`),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'technician.created', 'technician', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        technicianId,
        JSON.stringify({ ...input, email: normalizedEmail }),
      ),
    ]);
    let temporaryPassword: string | undefined;
    let loginReady = false;
    let warning: string | undefined;
    try {
      if (!passwordAuthConfigured()) throw new Error("Direct sign-in is not configured.");
      const password = administratorTemporaryPassword();
      await env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.password_create_requested','user',?,?)")
        .bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,userId,JSON.stringify({ technicianId, username })).run();
      const result = await authBridge("create", { userId, technicianId, email: normalizedEmail, displayName: input.name, password, actorUserId: identity.userId });
      loginReady = true;
      temporaryPassword = password;
      try {
        await env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'access.password_create','user',?,?)")
          .bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,userId,JSON.stringify({ providerId: result.user.providerId, temporary: true })).run();
      } catch { warning = "Profile and login are ready. The completion audit needs review; do not create the technician again."; }
    } catch {
      warning = "The technician profile was saved, but login creation could not be confirmed. Do not add the technician again. Open Users & access → TechCommand logins, check this person’s status, and use Create login or Reset password there.";
    }
    return Response.json(
      {
        technician: {
          id: technicianId,
          ...input,
          email: normalizedEmail,
          status: "active",
        },
        accessSetup: {
          email: normalizedEmail,
          userId,
          username,
          loginReady,
          temporaryPassword,
          mustChangePassword: true,
          warning,
          databaseProfileReady: true,
          siteViewerAuthorizationRequired: false,
          calendarStatus: "not_connected",
        },
      },
      { status: 201, headers: privateNoStore },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Review the technician profile fields.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    if (String(error).includes("login_usernames.username_key"))
      return Response.json({ error: "That username was just assigned. Refresh the roster and use another username." }, { status: 409, headers: privateNoStore });
    if (String(error).includes("UNIQUE constraint failed"))
      return Response.json({ error: "This email or technician code was just added. Refresh the roster and open the existing record." }, { status: 409 });
    return apiError(error);
  }
}
