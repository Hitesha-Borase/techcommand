import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const locationSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  locationType: z.string().trim().max(80).optional().nullable(),
  address1: z.string().trim().min(3).max(200),
  address2: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().min(5).max(10),
  timezone: z.string().trim().default("America/New_York"),
  accessInstructions: z.string().trim().max(2000).optional().nullable(),
  departmentName: z.string().trim().max(120).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    const accountId = new URL(request.url).searchParams.get("accountId");
    const statement = env.DB.prepare(
      `SELECT l.id, l.external_id AS externalId, l.account_id AS accountId, a.name AS accountName, l.name,
              l.location_type AS locationType, l.address_1 AS address1, l.address_2 AS address2,
              l.city, l.state, l.postal_code AS postalCode, l.timezone,
              l.access_instructions AS accessInstructions, l.updated_at AS updatedAt,
              COUNT(DISTINCT d.id) AS departmentCount,
              COUNT(DISTINCT s.id) AS assetCount
         FROM locations l
         JOIN accounts a ON a.id = l.account_id AND a.organization_id = ?
         LEFT JOIN departments d ON d.location_id = l.id AND d.status = 'active'
         LEFT JOIN assets s ON s.location_id = l.id AND s.account_id = a.id
           AND s.organization_id = a.organization_id AND s.status != 'retired'
        WHERE l.status = 'active' AND (? IS NULL OR l.account_id = ?)
        GROUP BY l.id
        ORDER BY a.name, l.name`,
    ).bind(TECHFLEX_ORG_ID, accountId, accountId);
    const result = await statement.all();
    return Response.json({ locations: result.results }, { headers: privateNoStore });
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
    const input = locationSchema.parse(await request.json());
    const account = await env.DB.prepare(
      "SELECT id FROM accounts WHERE id = ? AND organization_id = ? AND status = 'active' LIMIT 1",
    ).bind(input.accountId, TECHFLEX_ORG_ID).first();
    if (!account) {
      return Response.json({ error: "Select an active account." }, { status: 400 });
    }
    const locationId = crypto.randomUUID();
    const statements = [
      env.DB.prepare(
        `INSERT INTO locations
          (id, account_id, name, location_type, status, address_1, address_2, city, state, postal_code, timezone, access_instructions)
         SELECT ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?
           FROM accounts WHERE id = ? AND organization_id = ? AND status = 'active'`,
      ).bind(
        locationId,
        input.accountId,
        input.name,
        input.locationType || null,
        input.address1,
        input.address2 || null,
        input.city,
        input.state,
        input.postalCode,
        input.timezone,
        input.accessInstructions || null,
        input.accountId,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         SELECT ?, ?, ?, 'location.created', 'location', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM locations l JOIN accounts a ON a.id = l.account_id
             WHERE l.id = ? AND a.organization_id = ?
          )`,
      ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, locationId, JSON.stringify(input), locationId, TECHFLEX_ORG_ID),
    ];
    if (input.departmentName) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO departments (id, location_id, name, status)
           SELECT ?, ?, ?, 'active' WHERE EXISTS (
             SELECT 1 FROM locations l JOIN accounts a ON a.id = l.account_id
              WHERE l.id = ? AND a.organization_id = ?
           )`,
        ).bind(crypto.randomUUID(), locationId, input.departmentName, locationId, TECHFLEX_ORG_ID),
      );
    }
    const results = await env.DB.batch(statements);
    if (results[0].meta.changes !== 1)
      return Response.json(
        { error: "The selected account changed before this facility was saved. Refresh the account list and try again." },
        { status: 409 },
      );
    return Response.json({ location: { id: locationId, ...input, status: "active" } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Review the highlighted location fields.", details: error.flatten() }, { status: 400 });
    }
    return apiError(error);
  }
}
