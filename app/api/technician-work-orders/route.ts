import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";


const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const createSchema = z
  .object({
    requestId: z.string().uuid(),
    locationId: z.string().trim().min(1).max(160),
    assetId: z.string().trim().min(1).max(160).optional().nullable(),
    assetIds: z
      .array(z.string().trim().min(1).max(160))
      .max(200)
      .optional()
      .default([]),
    serviceType: z
      .enum(["biomed_service_call", "biomed_pm_a", "biomed_cataloging", "biomed_repair"])
      .default("biomed_service_call"),
    workNeeded: z.string().trim().max(5000).default(""),
    scheduledStart: z.string().datetime().optional().nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.assetId && input.assetIds.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose equipment once.",
        path: ["assetIds"],
      });
    if (new Set(input.assetIds).size !== input.assetIds.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each equipment item can be selected only once.",
        path: ["assetIds"],
      });
    if (!["biomed_pm_a", "biomed_cataloging"].includes(input.serviceType) && input.assetIds.length > 1)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A service or repair work order can include one equipment item.",
        path: ["assetIds"],
      });
  });

type CreateInput = z.infer<typeof createSchema>;

type ReplayRow = {
  id: string;
  externalId: string;
  scheduledStart: string | null;
  selectedAssetCount: number;
  payloadJson: string | null;
  actorUserId: string | null;
};

function selectedAssetIds(input: CreateInput) {
  return [...(input.assetIds.length ? input.assetIds : input.assetId ? [input.assetId] : [])].sort();
}

function payload(input: CreateInput) {
  return JSON.stringify({
    locationId: input.locationId,
    assetIds: selectedAssetIds(input),
    serviceType: input.serviceType,
    workNeeded: input.workNeeded,
    scheduledStart: input.scheduledStart || null,
  });
}

function workOrderNumber(requestId: string) {
  return `TF-BIO-${requestId.toUpperCase()}`;
}

async function findReplay(requestId: string) {
  return env.DB.prepare(
    `SELECT w.id, w.external_id AS externalId,
            w.scheduled_start AS scheduledStart, e.payload_json AS payloadJson,
            e.actor_user_id AS actorUserId,
            (SELECT COUNT(*) FROM work_order_assets wa
              WHERE wa.work_order_id = w.id) AS selectedAssetCount
       FROM work_orders w
       JOIN work_order_events e ON e.work_order_id = w.id
        AND e.event_type = 'technician.work_order_created'
      WHERE w.organization_id = ? AND w.external_source = 'technician_self_service'
        AND w.external_id = ? LIMIT 1`,
  )
    .bind(TECHFLEX_ORG_ID, workOrderNumber(requestId))
    .first<ReplayRow>();
}

function replayResponse(
  existing: ReplayRow,
  identity: PortalIdentity,
  expectedPayload: string,
) {
  if (
    existing.actorUserId !== identity.userId ||
    existing.payloadJson !== expectedPayload
  )
    return Response.json(
      {
        error:
          "This save reference was already used. Refresh the form before creating another work order.",
      },
      { status: 409, headers: privateNoStore },
    );
  return Response.json(
    {
      workOrder: {
        id: existing.id,
        externalId: existing.externalId,
        scheduledStart: existing.scheduledStart,
        selectedAssetCount: existing.selectedAssetCount,
      },
      alreadySaved: true,
    },
    { headers: privateNoStore },
  );
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["technician"]);
    const result = await env.DB.prepare(
      `SELECT a.id AS accountId, a.name AS accountName,
              l.id AS locationId, l.name AS locationName,
              l.address_1 AS address1, l.address_2 AS address2,
              l.city, l.state, l.postal_code AS postalCode,
              x.id AS assetId, x.asset_tag AS assetTag,
              x.manufacturer, x.model, x.serial_number AS serialNumber,
              x.description AS assetDescription, x.status AS assetStatus
         FROM accounts a
         JOIN locations l ON l.account_id = a.id AND l.status = 'active'
         LEFT JOIN assets x ON x.account_id = a.id AND x.location_id = l.id
          AND x.organization_id = a.organization_id
          AND x.status NOT IN ('retired', 'inventory_reference')
        WHERE a.organization_id = ? AND a.status = 'active'
          AND (a.service_discipline = 'biomedical' OR (a.service_discipline IS NULL AND a.service_level = 'Biomedical/PM'))
        ORDER BY a.name, l.name, x.asset_tag`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all<Record<string, unknown>>();
    const facilities = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        locationId: string;
        locationName: string;
        address: string;
        assets: Array<{
          id: string;
          assetTag: string;
          equipment: string;
          serialNumber: string | null;
          status: string;
        }>;
      }
    >();
    for (const row of result.results) {
      const locationId = String(row.locationId);
      if (!facilities.has(locationId))
        facilities.set(locationId, {
          accountId: String(row.accountId),
          accountName: String(row.accountName),
          locationId,
          locationName: String(row.locationName),
          address: [
            row.address1,
            row.address2,
            row.city,
            row.state,
            row.postalCode,
          ]
            .filter(Boolean)
            .join(", "),
          assets: [],
        });
      if (row.assetId)
        facilities.get(locationId)?.assets.push({
          id: String(row.assetId),
          assetTag: String(row.assetTag),
          equipment:
            [row.manufacturer, row.model, row.assetDescription]
              .filter(Boolean)
              .join(" · ") || "Equipment details pending",
          serialNumber: row.serialNumber ? String(row.serialNumber) : null,
          status: String(row.assetStatus),
        });
    }
    return Response.json(
      { facilities: [...facilities.values()] },
      { headers: privateNoStore },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["technician"]);
    if (!identity.technicianId)
      return Response.json(
        { error: "This login is not linked to an active technician profile." },
        { status: 403, headers: privateNoStore },
      );
    const input = createSchema.parse(await request.json());
    const assetIds = selectedAssetIds(input);
    const expectedPayload = payload(input);
    const existing = await findReplay(input.requestId);
    if (existing) return replayResponse(existing, identity, expectedPayload);

    const facility = await env.DB.prepare(
      `SELECT l.id AS locationId, l.account_id AS accountId
         FROM locations l JOIN accounts a ON a.id = l.account_id
        WHERE l.id = ? AND l.status = 'active' AND a.status = 'active'
          AND a.organization_id = ? AND (a.service_discipline = 'biomedical' OR (a.service_discipline IS NULL AND a.service_level = 'Biomedical/PM'))`,
    )
      .bind(input.locationId, TECHFLEX_ORG_ID)
      .first<{ locationId: string; accountId: string }>();
    if (!facility)
      return Response.json(
        { error: "Select a saved Biomedical/PM facility." },
        { status: 400, headers: privateNoStore },
      );
    if (assetIds.length) {
      const placeholders = assetIds.map(() => "?").join(",");
      const available = await env.DB.prepare(
        `SELECT id FROM assets WHERE id IN (${placeholders})
          AND organization_id = ? AND account_id = ? AND location_id = ?
          AND status NOT IN ('retired', 'inventory_reference')`,
      )
        .bind(
          ...assetIds,
          TECHFLEX_ORG_ID,
          facility.accountId,
          facility.locationId,
        )
        .all<{ id: string }>();
      if (available.results.length !== assetIds.length)
        return Response.json(
          {
            error:
              "That equipment is not available at the selected facility. Refresh and choose again.",
          },
          { status: 400, headers: privateNoStore },
        );
    }

    const workOrderId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    const externalId = workOrderNumber(input.requestId);
    const eventId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const summary = input.workNeeded.split(/\r?\n/, 1)[0].slice(0, 240);
    // A multi-asset PM round has no single primary asset. This deliberately
    // prevents legacy single-asset coverage logic from treating the whole
    // round as covered based on one selected device.
    const primaryAssetId = assetIds.length === 1 ? assetIds[0] : null;
    const statements = [
      env.DB.prepare(
        `INSERT INTO work_orders
          (id, organization_id, account_id, location_id, asset_id,
           external_source, external_id, service_type, priority, status,
           summary, description, required_technician_count, scheduled_start)
         VALUES (?, ?, ?, ?, ?, 'technician_self_service', ?, ?, 'normal',
                 'assigned', ?, ?, 1, ?)`,
      ).bind(
        workOrderId,
        TECHFLEX_ORG_ID,
        facility.accountId,
        facility.locationId,
        primaryAssetId,
        externalId,
        input.serviceType,
        summary,
        input.workNeeded,
        input.scheduledStart || null,
      ),
      env.DB.prepare(
        `INSERT INTO work_order_assignments
          (id, work_order_id, technician_id, role, status, responded_at)
         VALUES (?, ?, ?, 'primary', 'assigned', CURRENT_TIMESTAMP)`,
      ).bind(assignmentId, workOrderId, identity.technicianId),
      ...assetIds.map((assetId) =>
        env.DB.prepare(
          `INSERT INTO work_order_assets
            (id, organization_id, work_order_id, asset_id, status, updated_by)
           VALUES (?, ?, ?, ?, 'not_started', ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          workOrderId,
          assetId,
          identity.userId,
        ),
      ),
      env.DB.prepare(
        `INSERT INTO work_order_events
          (id, work_order_id, event_type, actor_user_id, source, payload_json)
         VALUES (?, ?, 'technician.work_order_created', ?, 'field_portal', ?)`,
      ).bind(eventId, workOrderId, identity.userId, expectedPayload),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id,
           after_json, request_id)
         VALUES (?, ?, ?, 'technician.work_order_created', 'work_order', ?, ?, ?)`,
      ).bind(
        auditId,
        TECHFLEX_ORG_ID,
        identity.userId,
        workOrderId,
        JSON.stringify({
          technicianId: identity.technicianId,
          accountId: facility.accountId,
          locationId: facility.locationId,
          assetIds,
          primaryAssetId,
          selectedAssetCount: assetIds.length,
          scheduledStart: input.scheduledStart || null,
          billingCreated: false,
        }),
        input.requestId,
      ),
    ];
    try {
      await env.DB.batch(statements);
    } catch (error) {
      const reconciled = await findReplay(input.requestId);
      if (reconciled)
        return replayResponse(reconciled, identity, expectedPayload);
      throw error;
    }
    return Response.json(
      {
        workOrder: {
          id: workOrderId,
          externalId,
          scheduledStart: input.scheduledStart || null,
          selectedAssetCount: assetIds.length,
        },
        alreadySaved: false,
      },
      { status: 201, headers: privateNoStore },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error:
            "Enter what needs attention and choose a saved Biomedical/PM facility.",
          details: error.flatten(),
        },
        { status: 400, headers: privateNoStore },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}
