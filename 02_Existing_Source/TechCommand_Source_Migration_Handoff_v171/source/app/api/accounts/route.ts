import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
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
    return Response.json({ accounts: result.results }, { headers: privateNoStore });
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
    const input = accountSchema.parse(await request.json());
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
