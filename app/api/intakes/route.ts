import { env } from "cloudflare:workers";
import { z } from "zod";
import { assignmentSource } from "@/lib/assignment-source";
import {
  evaluateIntake,
  intakeStatus,
  type IntakeData,
} from "@/lib/intake-completeness";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const nullableText = (max: number) =>
  z.string().trim().max(max).optional().nullable();
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS link.");

const intakeDataSchema = z.object({
  accountId: nullableText(120),
  locationId: nullableText(120),
  customerId: nullableText(120),
  assetId: nullableText(120),
  technicianId: nullableText(120),
  externalSource: z.string().trim().max(80).transform(assignmentSource)
    .default("manual"),
  externalId: nullableText(140),
  noticeType: z
    .enum([
      "new_assignment",
      "scheduling_reminder",
      "cancellation",
      "authorization_update",
      "general_update",
    ])
    .default("new_assignment"),
  sourceDetailUrl: httpUrl.optional().nullable(),
  responseRequirement: nullableText(1000),
  responseDueAt: z.string().datetime().optional().nullable(),
  serviceType: nullableText(100),
  summary: nullableText(500),
  rawText: nullableText(30000),
  customerName: nullableText(240),
  customerPhone: nullableText(80),
  customerEmail: z
    .string()
    .trim()
    .email()
    .max(320)
    .optional()
    .nullable()
    .or(z.literal("")),
  serviceAddress: nullableText(1000),
  customerComplaint: nullableText(5000),
  equipmentType: nullableText(240),
  manufacturer: nullableText(160),
  model: nullableText(160),
  serialNumber: nullableText(160),
  authorization: z.number().min(0).max(1000000).optional().nullable(),
  recommendedBid: z.number().min(0).max(1000000).optional().nullable(),
  proposedBid: z.number().min(0).max(1000000).optional().nullable(),
  roundTripMiles: z.number().min(0).max(10000).optional().nullable(),
  driveHours: z.number().min(0).max(200).default(0),
  onsiteHours: z.number().min(0).max(200).default(1),
  technicianCount: z.number().int().min(1).max(10).optional().nullable(),
  weightLb: z.number().min(0).max(10000).default(0),
  partsCount: z.number().int().min(0).max(100).default(0),
  stairsCount: z.number().int().min(0).max(20).default(0),
  hotelCost: z.number().min(0).max(10000).default(0),
  partsCost: z.number().min(0).max(100000).default(0),
  assetCount: z.number().int().min(1).max(10000).default(1),
  shipmentStatus: nullableText(120),
  accessInstructions: nullableText(5000),
  scheduledStart: z.string().datetime().optional().nullable(),
});

type IntakeInput = z.infer<typeof intakeDataSchema>;

const allowedRoles = [
  "owner_administrator",
  "operations_administrator",
  "dispatcher",
  "biomedical_lead",
] as const;
const privateNoStore = { "Cache-Control": "private, no-store" } as const;

function taskCopy(
  data: IntakeInput,
  blockers: { label: string }[],
  warnings: { label: string }[],
) {
  const reference = data.externalId || "unidentified work order";
  if (data.noticeType === "cancellation")
    return {
      title: `Review cancellation ${reference}`,
      instructions:
        "Confirm the cancellation in the source portal, stop scheduling or dispatch activity, notify any assigned technician, and document the final disposition.",
      category: "Work orders",
      priority: "urgent",
    };
  if (!blockers.length)
    return {
      title: `Price and create ${reference}`,
      instructions: warnings.length
        ? `Critical intake is complete. Review pricing and create the work order. Recommended follow-up: ${warnings.map((item) => item.label).join(", ")}.`
        : "Critical intake is complete. Review pricing, verify the source record, and create the work order.",
      category: "Work orders",
      priority: data.noticeType === "scheduling_reminder" ? "urgent" : "high",
    };
  return {
    title:
      data.noticeType === "scheduling_reminder"
        ? `Schedule and complete intake ${reference}`
        : `Complete intake ${reference}`,
    instructions: `Obtain and enter: ${blockers.map((item) => item.label).join(", ")}.`,
    category:
      data.noticeType === "scheduling_reminder" ? "Scheduling" : "Inbox",
    priority: "urgent",
  };
}

function address(parts: Array<string | null | undefined>) {
  return parts.filter((part) => part?.trim()).join(", ");
}

async function validateLinks(data: IntakeInput): Promise<IntakeInput> {
  const enriched = { ...data };
  if (data.accountId) {
    const account = await env.DB.prepare(
      "SELECT id FROM accounts WHERE id = ? AND organization_id = ? AND status = 'active'",
    )
      .bind(data.accountId, TECHFLEX_ORG_ID)
      .first();
    if (!account) throw new Error("Select an active TechFlex account.");
  }
  if (data.locationId) {
    const location = await env.DB.prepare(
      `SELECT id, address_1 AS address1, address_2 AS address2, city, state, postal_code AS postalCode,
              access_instructions AS accessInstructions
         FROM locations WHERE id = ? AND account_id = ? AND status = 'active'`,
    )
      .bind(data.locationId, data.accountId || "")
      .first<{
        id: string;
        address1: string;
        address2: string | null;
        city: string;
        state: string;
        postalCode: string;
        accessInstructions: string | null;
      }>();
    if (!location)
      throw new Error("The selected location does not belong to that account.");
    enriched.serviceAddress ||= address([
      location.address1,
      location.address2,
      location.city,
      location.state,
      location.postalCode,
    ]);
    enriched.accessInstructions ||= location.accessInstructions;
  }
  if (data.customerId) {
    const customer = await env.DB.prepare(
      `SELECT id, name, phone, email, address_1 AS address1, address_2 AS address2, city, state,
              postal_code AS postalCode
         FROM customers
        WHERE id = ? AND account_id = ? AND organization_id = ? AND status = 'active'`,
    )
      .bind(data.customerId, data.accountId || "", TECHFLEX_ORG_ID)
      .first<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        address1: string | null;
        address2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
      }>();
    if (!customer)
      throw new Error("The selected customer does not belong to that account.");
    enriched.customerName ||= customer.name;
    enriched.customerPhone ||= customer.phone;
    enriched.customerEmail ||= customer.email;
    enriched.serviceAddress ||=
      address([
        customer.address1,
        customer.address2,
        customer.city,
        customer.state,
        customer.postalCode,
      ]) || null;
  }
  if (data.assetId) {
    const asset = await env.DB.prepare(
      `SELECT id, description, manufacturer, model, serial_number AS serialNumber
         FROM assets
        WHERE id = ? AND account_id = ? AND location_id = ? AND organization_id = ? AND status != 'retired'`,
    )
      .bind(
        data.assetId,
        data.accountId || "",
        data.locationId || "",
        TECHFLEX_ORG_ID,
      )
      .first<{
        id: string;
        description: string | null;
        manufacturer: string;
        model: string;
        serialNumber: string | null;
      }>();
    if (!asset)
      throw new Error(
        "The selected asset does not belong to that service location.",
      );
    enriched.equipmentType ||= asset.description;
    enriched.manufacturer ||= asset.manufacturer;
    enriched.model ||= asset.model;
    enriched.serialNumber ||= asset.serialNumber;
  }
  return enriched;
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...allowedRoles]);
    const includeClosed =
      new URL(request.url).searchParams.get("includeClosed") === "1";
    const requestedId = new URL(request.url).searchParams.get("id");
    const result = await env.DB.prepare(
      `SELECT i.id, i.source, i.external_id AS externalId, i.notice_type AS noticeType,
              i.source_detail_url AS sourceDetailUrl, i.response_due_at AS responseDueAt,
              i.status, i.record_version AS recordVersion, i.blocking_count AS blockingCount, i.missing_fields_json AS missingFieldsJson,
              CASE WHEN EXISTS (SELECT 1 FROM spinlife_visits sv WHERE sv.intake_id=i.id)
                OR (lower(replace(i.source,' ',''))='spinlife' AND i.notice_type!='cancellation' AND i.converted_work_order_id IS NULL)
                THEN 'spinlife' ELSE 'intake' END AS editor,
              i.data_json AS dataJson, i.converted_work_order_id AS convertedWorkOrderId,
              i.reviewed_at AS reviewedAt, i.created_at AS createdAt, i.updated_at AS updatedAt,
              a.name AS accountName, l.name AS locationName, u.display_name AS updatedByName
         FROM work_order_intakes i
         LEFT JOIN accounts a ON a.id = i.account_id AND a.organization_id = i.organization_id
         LEFT JOIN locations l ON l.id = i.location_id AND l.account_id = i.account_id
         LEFT JOIN customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id AND c.account_id = i.account_id
         LEFT JOIN assets ast ON ast.id = i.asset_id AND ast.organization_id = i.organization_id AND ast.account_id = i.account_id AND ast.location_id = i.location_id
         LEFT JOIN users u ON u.id = i.updated_by AND EXISTS (
           SELECT 1 FROM memberships um WHERE um.user_id = i.updated_by AND um.organization_id = i.organization_id AND um.status = 'active'
         )
        WHERE i.organization_id = ?
          AND (i.account_id IS NULL OR a.id IS NOT NULL)
          AND (i.location_id IS NULL OR l.id IS NOT NULL)
          AND (i.customer_id IS NULL OR c.id IS NOT NULL)
          AND (i.asset_id IS NULL OR ast.id IS NOT NULL)
          ${requestedId ? "AND i.id = ?" : includeClosed ? "" : "AND i.status NOT IN ('converted', 'archived')"}
          AND (i.converted_work_order_id IS NULL OR EXISTS (
            SELECT 1 FROM work_orders w JOIN accounts wa ON wa.id=w.account_id AND wa.organization_id=w.organization_id
            JOIN locations wl ON wl.id=w.location_id AND wl.account_id=w.account_id
            WHERE w.id=i.converted_work_order_id AND w.organization_id=i.organization_id))
        ORDER BY CASE i.status WHEN 'cancellation_review' THEN 1 WHEN 'needs_information' THEN 2 WHEN 'ready_for_pricing' THEN 3 ELSE 8 END,
                 CASE WHEN i.response_due_at IS NULL THEN 1 ELSE 0 END, i.response_due_at, i.updated_at DESC
        LIMIT 250`,
    )
      .bind(...(requestedId ? [TECHFLEX_ORG_ID, requestedId] : [TECHFLEX_ORG_ID]))
      .all();
    const intakes = result.results.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        data: JSON.parse(String(item.dataJson || "{}")) as IntakeData,
        missingFields: JSON.parse(String(item.missingFieldsJson || "[]")),
        dataJson: undefined,
        missingFieldsJson: undefined,
      };
    });
    if (requestedId && !intakes.length) return Response.json({error:"This saved intake is not available to your account. No new record was created."},{status:404,headers:privateNoStore});
    return Response.json({ intakes, ...(requestedId ? {intake:intakes[0]} : {}) }, { headers: privateNoStore });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...allowedRoles]);
    const body = z.object({requestId:z.string().uuid().optional()}).passthrough().parse(await request.json());
    const requestId = body.requestId;
    const parsed = intakeDataSchema.parse(body);
    const data = await validateLinks(parsed);
    // Reuse the same actor-owned identity after an interrupted response. Never
    // attribute another user's request or overwrite edits made after saving.
    const id = requestId ? `intake:${identity.userId}:${requestId}` : crypto.randomUUID();
    if (requestId) {
      const saved = await env.DB.prepare("SELECT data_json AS dataJson, status, record_version AS recordVersion FROM work_order_intakes WHERE id=? AND organization_id=? AND created_by=?")
        .bind(id, TECHFLEX_ORG_ID, identity.userId).first<{dataJson:string;status:string;recordVersion:number}>();
      if (saved) {
        if (saved.dataJson !== JSON.stringify(data) || ["converted", "archived"].includes(saved.status))
          return Response.json({error:"This request was already saved. Open the saved record before applying further edits. Your entries remain here.",existingIntakeId:id,target:{kind:"intake",id}},{status:409,headers:privateNoStore});
        const evaluation = evaluateIntake(data);
        return Response.json({intake:{id,data,status:saved.status,recordVersion:saved.recordVersion,blockingCount:evaluation.blockers.length},alreadySaved:true},{headers:privateNoStore});
      }
    }
    if (!data.externalId && !data.rawText)
      return Response.json(
        {
          error:
            "Paste the source notice or enter the work-order number before saving.",
        },
        { status: 400 },
      );
    if (data.externalId) {
      const duplicate = await env.DB.prepare(
        "SELECT id, status FROM work_order_intakes WHERE organization_id = ? AND source = ? AND external_id = ? LIMIT 1",
      )
        .bind(TECHFLEX_ORG_ID, data.externalSource, data.externalId)
        .first<{ id: string; status: string }>();
      if (duplicate)
        return Response.json(
          {
            error: `An intake for ${data.externalId} already exists. Resume that record instead of creating a duplicate.`,
            existingIntakeId: duplicate.id,
            target: {kind:"intake",id:duplicate.id},
          },
          { status: 409 },
        );
    }
    const evaluation = evaluateIntake(data);
    const status = intakeStatus(data);
    const taskId = crypto.randomUUID();
    const task = taskCopy(data, evaluation.blockers, evaluation.warnings);
    const missingFields = [
      ...evaluation.blockers.map((item) => ({ ...item, severity: "blocking" })),
      ...evaluation.warnings.map((item) => ({
        ...item,
        severity: "recommended",
      })),
    ];
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO work_order_intakes
          (id, organization_id, account_id, location_id, customer_id, asset_id, source, external_id,
           notice_type, source_detail_url, response_due_at, status, blocking_count, missing_fields_json,
           data_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        TECHFLEX_ORG_ID,
        data.accountId || null,
        data.locationId || null,
        data.customerId || null,
        data.assetId || null,
        data.externalSource,
        data.externalId || null,
        data.noticeType,
        data.sourceDetailUrl || null,
        data.responseDueAt || null,
        status,
        evaluation.blockers.length,
        JSON.stringify(missingFields),
        JSON.stringify(data),
        identity.userId,
        identity.userId,
      ),
      env.DB.prepare(
        `INSERT INTO admin_tasks
          (id, organization_id, account_id, assigned_user_id, assigned_role, category, title, instructions,
           priority, status, source, source_record_id, due_at)
         VALUES (?, ?, ?, ?, 'operations_administrator', ?, ?, ?, ?, 'open', 'work_order_intake', ?, ?)`,
      ).bind(
        taskId,
        TECHFLEX_ORG_ID,
        data.accountId || null,
        identity.userId,
        task.category,
        task.title,
        task.instructions,
        task.priority,
        `intake:${id}`,
        data.responseDueAt || null,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'work_order_intake.created', 'work_order_intake', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        id,
        JSON.stringify({ data, status, missingFields }),
      ),
    ]);
    return Response.json(
      {
        intake: {
          id,
          recordVersion: 1,
          data,
          status,
          blockingCount: evaluation.blockers.length,
          missingFields,
          score: evaluation.score,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the manual intake fields.", details: error.flatten() },
        { status: 400 },
      );
    if (error instanceof Error && error.message.startsWith("The selected"))
      return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("Select an active"))
      return Response.json({ error: error.message }, { status: 400 });
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...allowedRoles]);
    const input = z
      .object({
        id: z.string().min(1),
        expectedVersion: z.number().int().positive().optional(),
        action: z.enum(["update", "archive"]).default("update"),
        data: intakeDataSchema.optional(),
      })
      .parse(await request.json());
    const current = await env.DB.prepare(
      "SELECT id, status, data_json AS dataJson, record_version AS recordVersion, converted_work_order_id AS convertedWorkOrderId FROM work_order_intakes WHERE id = ? AND organization_id = ?",
    )
      .bind(input.id, TECHFLEX_ORG_ID)
      .first<{ id: string; status: string; dataJson: string; recordVersion:number;convertedWorkOrderId:string|null }>();
    if (!current)
      return Response.json(
        { error: "Intake record not found." },
        { status: 404 },
      );
    if (await env.DB.prepare("SELECT intake_id FROM spinlife_visits WHERE intake_id=?").bind(input.id).first())
      return Response.json({error:"This saved order uses the SpinLife editor. Open it to update the same assignment and fieldwork; your entries remain here.",target:{kind:"intake",id:input.id}},{status:409,headers:privateNoStore});
    if (current.status === "converted" || current.convertedWorkOrderId)
      return Response.json(
        { error: "This intake is already linked to a work order. Open the existing record; your entries remain here.",target:{kind:"intake",id:input.id} },
        { status: 409 },
      );
    if(input.expectedVersion!==undefined && input.expectedVersion!==current.recordVersion)
      return Response.json({error:"This intake changed after you opened it. Your entries remain here; open the saved record to review the newer changes.",target:{kind:"intake",id:input.id}},{status:409,headers:privateNoStore});
    const guard=()=>env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_intakes i WHERE i.id=? AND i.organization_id=? AND i.record_version=? AND i.converted_work_order_id IS NULL AND NOT EXISTS(SELECT 1 FROM spinlife_visits v WHERE v.intake_id=i.id)) THEN 1 ELSE json('intake_update_conflict') END`).bind(input.id,TECHFLEX_ORG_ID,current.recordVersion);
    if (input.action === "archive") {
      await env.DB.batch([
        guard(),
        env.DB.prepare(
          "UPDATE work_order_intakes SET status = 'archived', updated_by = ?, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(identity.userId, input.id),
        env.DB.prepare(
          "UPDATE admin_tasks SET status = 'complete', completed_at = CURRENT_TIMESTAMP, completed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE source = 'work_order_intake' AND source_record_id = ?",
        ).bind(identity.userId, `intake:${input.id}`),
        env.DB.prepare(
          `INSERT INTO audit_logs
            (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json, after_json)
           VALUES (?, ?, ?, 'work_order_intake.archived', 'work_order_intake', ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          identity.userId,
          input.id,
          current.dataJson,
          JSON.stringify({ status: "archived" }),
        ),
      ]);
      return Response.json({ intake: { id: input.id, status: "archived" } });
    }
    if (!input.data)
      return Response.json(
        { error: "Updated intake data is required." },
        { status: 400 },
      );
    if(current.status==="archived") return Response.json({error:"This intake is archived. Your entries remain here; it has not been reopened automatically."},{status:409,headers:privateNoStore});
    const data = await validateLinks(input.data);
    if (data.externalId) {
      const duplicate = await env.DB.prepare(
        "SELECT id FROM work_order_intakes WHERE organization_id = ? AND source = ? AND external_id = ? AND id != ? LIMIT 1",
      )
        .bind(TECHFLEX_ORG_ID, data.externalSource, data.externalId, input.id)
        .first<{id:string}>();
      if (duplicate)
        return Response.json(
          { error: `Another intake for ${data.externalId} already exists. Your entries remain here; open the saved record to review it.`,target:{kind:"intake",id:duplicate.id} },
          { status: 409 },
        );
    }
    const evaluation = evaluateIntake(data);
    const status = intakeStatus(data);
    const task = taskCopy(data, evaluation.blockers, evaluation.warnings);
    const missingFields = [
      ...evaluation.blockers.map((item) => ({ ...item, severity: "blocking" })),
      ...evaluation.warnings.map((item) => ({
        ...item,
        severity: "recommended",
      })),
    ];
    await env.DB.batch([
      guard(),
      env.DB.prepare(
        `UPDATE work_order_intakes
            SET account_id = ?, location_id = ?, customer_id = ?, asset_id = ?, source = ?, external_id = ?,
                notice_type = ?, source_detail_url = ?, response_due_at = ?, status = ?, blocking_count = ?,
                missing_fields_json = ?, data_json = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?,
                updated_by = ?, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ?`,
      ).bind(
        data.accountId || null,
        data.locationId || null,
        data.customerId || null,
        data.assetId || null,
        data.externalSource,
        data.externalId || null,
        data.noticeType,
        data.sourceDetailUrl || null,
        data.responseDueAt || null,
        status,
        evaluation.blockers.length,
        JSON.stringify(missingFields),
        JSON.stringify(data),
        identity.userId,
        identity.userId,
        input.id,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `UPDATE admin_tasks
            SET account_id = ?, title = ?, instructions = ?, category = ?, priority = ?, due_at = ?,
                status = 'open', completed_at = NULL, completed_by = NULL,
                record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE source = 'work_order_intake' AND source_record_id = ?`,
      ).bind(
        data.accountId || null,
        task.title,
        task.instructions,
        task.category,
        task.priority,
        data.responseDueAt || null,
        `intake:${input.id}`,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'work_order_intake.updated', 'work_order_intake', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.id,
        JSON.stringify({ data, status, missingFields }),
      ),
    ]);
    return Response.json({
      intake: {
        id: input.id,
        recordVersion: current.recordVersion+1,
        data,
        status,
        blockingCount: evaluation.blockers.length,
        missingFields,
        score: evaluation.score,
      },
    });
  } catch (error) {
    if(error instanceof Error && /intake_update_conflict|malformed JSON/.test(error.message))
      return Response.json({error:"This intake changed during saving. Your entries remain here. Reopen the saved record before applying your changes."},{status:409,headers:privateNoStore});
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the manual intake fields.", details: error.flatten() },
        { status: 400 },
      );
    if (
      error instanceof Error &&
      /selected|active TechFlex/.test(error.message)
    )
      return Response.json({ error: error.message }, { status: 400 });
    return apiError(error);
  }
}
