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
  name: z.string().trim().min(2).max(160),
  title: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  contactType: z.enum([
    "operations",
    "dispatch",
    "billing",
    "service",
    "technical",
    "warranty",
    "facility",
    "executive",
    "general",
  ]),
  isPrimary: z.boolean().default(false),
});
const privateNoStore = { "Cache-Control": "private, no-store" } as const;
const contactHierarchySql = `SELECT a.id FROM accounts a
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
    const technicianFilter =
      identity.role === "technician"
        ? "AND EXISTS (SELECT 1 FROM work_orders w JOIN work_order_assignments wa ON wa.work_order_id=w.id AND wa.status='assigned' WHERE w.account_id=a.id AND w.organization_id=a.organization_id AND wa.technician_id=?)"
        : "";
    const sql = `SELECT c.id,c.name,c.title,c.email,c.phone,c.contact_type AS contactType,c.is_primary AS isPrimary,a.id AS accountId,a.name AS accountName,l.id AS locationId,l.name AS locationName FROM contacts c JOIN accounts a ON a.id=c.account_id LEFT JOIN locations l ON l.id=c.location_id AND l.account_id=a.id WHERE a.organization_id=? ${technicianFilter} ORDER BY c.is_primary DESC,a.name,c.name`;
    const rows =
      identity.role === "technician"
        ? await env.DB.prepare(sql)
            .bind(TECHFLEX_ORG_ID, identity.technicianId)
            .all()
        : await env.DB.prepare(sql).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ contacts: rows.results }, { headers: privateNoStore });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
    ]);
    const input = schema.parse(await request.json());
    const locationId = input.locationId || null;
    const hierarchyValues = [input.accountId, TECHFLEX_ORG_ID, locationId, locationId];
    const hierarchy = await env.DB.prepare(contactHierarchySql).bind(...hierarchyValues).first();
    if (!hierarchy)
      return Response.json(
        { error: "Select an active TechFlex account. Any location must belong to that account." },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO contacts (id,account_id,location_id,name,title,email,phone,contact_type,is_primary)
         SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (${contactHierarchySql})`,
      ).bind(
        id,
        input.accountId,
        locationId,
        input.name,
        input.title || null,
        input.email || null,
        input.phone || null,
        input.contactType,
        input.isPrimary ? 1 : 0,
        ...hierarchyValues,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
         SELECT ?,?,?,'contact.created','contact',?,?
          WHERE EXISTS (SELECT 1 FROM contacts c JOIN accounts a ON a.id=c.account_id WHERE c.id=? AND a.organization_id=?)`,
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
        { error: "The account or location changed before this contact was saved. Refresh the directory and try again." },
        { status: 409 },
      );
    return Response.json({ contact: { id, ...input } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the contact fields." },
        { status: 400 },
      );
    return apiError(error);
  }
}
