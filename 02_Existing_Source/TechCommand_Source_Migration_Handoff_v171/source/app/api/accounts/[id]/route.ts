import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  resolveOrganizationId,
} from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  accountType: z.enum(["manufacturer", "retailer", "facility", "direct_customer", "partner"]).optional(),
  externalId: z.string().trim().max(100).optional().nullable(),
  billingEmail: z.string().email().optional().or(z.literal("")).nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  serviceDiscipline: z.enum(["biomedical", "dme_mobility"]).optional().nullable(),
  serviceLevel: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["active", "inactive", "archived", "suspended"]).optional(),
});

function getDatabase(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const { id } = await params;
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available" }, { status: 500 });

    const account = await db.prepare(
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
        WHERE a.id = ? AND (a.organization_id = ? OR a.organization_id = 'techflex' OR a.organization_id IS NULL OR a.organization_id = '')
        GROUP BY a.id`
    ).bind(id, TECHFLEX_ORG_ID).first();

    if (!account) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const locations = await db.prepare(
      `SELECT l.id, l.name, l.location_type AS locationType, l.city, l.state, l.postal_code AS postalCode
         FROM locations l
        WHERE l.account_id = ? AND COALESCE(l.status, 'active') = 'active'
        ORDER BY l.name`
    ).bind(id).all();

    return Response.json({
      account,
      locations: locations?.results || [],
    }, { headers: privateNoStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const { id } = await params;
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available" }, { status: 500 });

    const body = await request.json();
    const input = updateAccountSchema.parse(body);

    const existing = await db.prepare(
      `SELECT * FROM accounts WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex' OR organization_id IS NULL OR organization_id = '')`
    ).bind(id, TECHFLEX_ORG_ID).first();

    if (!existing) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }

    const updatedAccount = {
      ...existing,
      name: input.name ?? existing.name,
      account_type: input.accountType ?? existing.account_type,
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
        id,
      ),
      db.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json, after_json)
         VALUES (?, ?, ?, 'account.updated', 'account', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        id,
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
    ).bind(id).first()) as { locationCount: number; assetCount: number } | null;

    return Response.json({
      account: {
        id,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const { id } = await params;
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available" }, { status: 500 });

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
