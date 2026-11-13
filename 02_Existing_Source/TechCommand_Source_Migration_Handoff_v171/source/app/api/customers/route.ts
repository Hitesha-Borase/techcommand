import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const schema = z.object({
  accountId: z.string().min(1),
  locationId: z.string().optional().nullable(),
  externalId: z.string().trim().max(120).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address1: z.string().trim().max(200).optional().nullable(),
  address2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});
const privateNoStore = { "Cache-Control": "private, no-store" } as const;
const customerHierarchySql = `SELECT a.id FROM accounts a
  WHERE a.id = ? AND a.organization_id = ? AND a.status = 'active'
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM locations l
       WHERE l.id = ? AND l.account_id = a.id AND l.status = 'active'
    ))`;

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    const technicianJoin =
      identity.role === "technician"
        ? "JOIN work_orders aw ON aw.customer_id=c.id AND aw.organization_id=c.organization_id JOIN work_order_assignments awa ON awa.work_order_id=aw.id AND awa.status='assigned' AND awa.technician_id=?"
        : "";
    const sql = `SELECT DISTINCT c.id, c.external_id AS externalId, c.name, c.email, c.phone, c.address_1 AS address1, c.address_2 AS address2, c.city, c.state, c.postal_code AS postalCode, c.notes, c.status,
      a.id AS accountId, a.name AS accountName, l.id AS locationId, l.name AS locationName,
      (SELECT count(*) FROM work_orders w WHERE w.customer_id = c.id AND w.organization_id=c.organization_id) AS workOrderCount,
      (SELECT count(*) FROM document_records d WHERE d.scope_type = 'customer' AND d.scope_id = c.id AND d.organization_id=c.organization_id AND d.status = 'current') AS documentCount
      FROM customers c JOIN accounts a ON a.id = c.account_id AND a.organization_id=c.organization_id LEFT JOIN locations l ON l.id = c.location_id AND l.account_id=a.id ${technicianJoin}
      WHERE c.organization_id = ? AND c.status != 'archived' ORDER BY c.updated_at DESC, c.name`;
    const rows =
      identity.role === "technician"
        ? await env.DB.prepare(sql)
            .bind(identity.technicianId, TECHFLEX_ORG_ID)
            .all()
        : await env.DB.prepare(sql).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ customers: rows.results }, { headers: privateNoStore });
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
    const input = schema.parse(await request.json());
    const locationId = input.locationId || null;
    const hierarchyValues = [input.accountId, TECHFLEX_ORG_ID, locationId, locationId];
    const hierarchy = await env.DB.prepare(customerHierarchySql).bind(...hierarchyValues).first();
    if (!hierarchy)
      return Response.json(
        { error: "Select an active TechFlex account. Any location must belong to that account." },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, organization_id, account_id, location_id, external_id, name, email, phone, address_1, address_2, city, state, postal_code, notes)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (${customerHierarchySql})`,
      ).bind(
        id,
        TECHFLEX_ORG_ID,
        input.accountId,
        locationId,
        input.externalId || null,
        input.name,
        input.email || null,
        input.phone || null,
        input.address1 || null,
        input.address2 || null,
        input.city || null,
        input.state || null,
        input.postalCode || null,
        input.notes || null,
        ...hierarchyValues,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         SELECT ?, ?, ?, 'customer.created', 'customer', ?, ?
          WHERE EXISTS (SELECT 1 FROM customers WHERE id=? AND organization_id=?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        id,
        JSON.stringify(input),
        id,
        TECHFLEX_ORG_ID,
      ),
    ]);
    if (results[0].meta.changes !== 1)
      return Response.json(
        { error: "The account or location changed before this customer was saved. Refresh the directory and try again." },
        { status: 409 },
      );
    return Response.json({ customer: { id, ...input } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the customer file fields.", details: error.flatten() },
        { status: 400 },
      );
    return apiError(error);
  }
}
