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
  "finance",
  "technician",
  "client_administrator",
] as const;

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

function getDatabase(): typeof env.DB {
  return ((globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB) as typeof env.DB;
}

async function ensureIntakesSchema() {
  const db = getDatabase();
  if (!db) return;

  try {
    await db.exec("PRAGMA foreign_keys = OFF;");
  } catch {}

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        currency TEXT DEFAULT 'USD' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      INSERT OR IGNORE INTO organizations (id, legal_name, display_name)
      VALUES ('techflex', 'Astute Restorations LLC', 'TechFlex Mobility Solutions');

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        auth_subject TEXT,
        email TEXT,
        display_name TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        last_seen_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        external_id TEXT,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        billing_email TEXT,
        payment_terms_days INTEGER DEFAULT 30 NOT NULL,
        service_level TEXT,
        service_discipline TEXT,
        notes TEXT,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        external_id TEXT,
        name TEXT NOT NULL,
        location_type TEXT,
        department TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        address_1 TEXT NOT NULL,
        address_2 TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        country TEXT DEFAULT 'US' NOT NULL,
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        location_id TEXT,
        external_id TEXT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address_1 TEXT,
        address_2 TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        category_id TEXT,
        asset_tag TEXT NOT NULL,
        customer_asset_id TEXT,
        manufacturer TEXT NOT NULL,
        model TEXT NOT NULL,
        serial_number TEXT,
        description TEXT,
        department TEXT,
        risk_class TEXT NOT NULL,
        status TEXT DEFAULT 'in_service' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_order_intakes (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT,
        location_id TEXT,
        customer_id TEXT,
        asset_id TEXT,
        source TEXT DEFAULT 'manual' NOT NULL,
        external_id TEXT,
        notice_type TEXT DEFAULT 'new_assignment' NOT NULL,
        source_detail_url TEXT,
        response_due_at TEXT,
        status TEXT DEFAULT 'needs_information' NOT NULL,
        blocking_count INTEGER DEFAULT 0 NOT NULL,
        missing_fields_json TEXT DEFAULT '[]' NOT NULL,
        data_json TEXT NOT NULL,
        converted_work_order_id TEXT,
        reviewed_at TEXT,
        reviewed_by TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT,
        work_order_id TEXT,
        assigned_user_id TEXT,
        assigned_role TEXT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        instructions TEXT,
        priority TEXT DEFAULT 'normal' NOT NULL,
        status TEXT DEFAULT 'open' NOT NULL,
        source TEXT DEFAULT 'manual' NOT NULL,
        source_record_id TEXT,
        due_at TEXT,
        completed_at TEXT,
        completed_by TEXT,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        occurred_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spinlife_visits (
        intake_id TEXT PRIMARY KEY NOT NULL,
        technician_id TEXT,
        technician_pay_cents INTEGER,
        scheduled_start TEXT,
        started_at TEXT,
        documented_at TEXT,
        visit_json TEXT DEFAULT '{}' NOT NULL,
        record_version INTEGER DEFAULT 1 NOT NULL,
        last_mutation_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        asset_id TEXT,
        external_source TEXT,
        external_id TEXT,
        service_type TEXT NOT NULL,
        priority TEXT DEFAULT 'normal' NOT NULL,
        status TEXT DEFAULT 'new' NOT NULL,
        summary TEXT NOT NULL,
        description TEXT,
        required_skills_json TEXT,
        required_technician_count INTEGER DEFAULT 1 NOT NULL,
        product_weight_lb REAL,
        stairs_count INTEGER DEFAULT 0 NOT NULL,
        scheduled_start TEXT,
        scheduled_end TEXT,
        service_window_json TEXT,
        accepted_price_cents INTEGER,
        estimated_cost_cents INTEGER,
        gross_margin_basis_points INTEGER,
        opened_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        completed_at TEXT,
        invoice_ready_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
  } catch (err) {
    console.warn("[ensureIntakesSchema] warning:", err);
  }
}

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
  const db = getDatabase();
  if (!db) return enriched;

  if (data.accountId) {
    try {
      const account = await db.prepare(
        "SELECT id FROM accounts WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex' OR organization_id IS NULL OR organization_id = '') AND COALESCE(status, 'active') != 'archived'",
      )
        .bind(data.accountId, TECHFLEX_ORG_ID)
        .first();
      if (!account && !(globalThis as any).__TECHCOMMAND_ACCOUNTS_MAP__?.has(data.accountId) && !(globalThis as any).__TECHCOMMAND_ACCOUNTS__?.has(data.accountId)) {
        throw new Error("Select an active TechFlex account.");
      }
    } catch (e: any) {
      if (e.message?.startsWith("Select an active")) throw e;
    }
  }
  if (data.locationId) {
    try {
      const location = await db.prepare(
        `SELECT id, address_1 AS address1, address_2 AS address2, city, state, postal_code AS postalCode,
                access_instructions AS accessInstructions
           FROM locations WHERE id = ? AND status = 'active'`,
      )
        .bind(data.locationId)
        .first<{
          id: string;
          address1: string;
          address2: string | null;
          city: string;
          state: string;
          postalCode: string;
          accessInstructions: string | null;
        }>();
      if (location) {
        enriched.serviceAddress ||= address([
          location.address1,
          location.address2,
          location.city,
          location.state,
          location.postalCode,
        ]);
        enriched.accessInstructions ||= location.accessInstructions;
      }
    } catch {}
  }
  if (data.customerId) {
    try {
      const customer = await db.prepare(
        `SELECT id, name, phone, email, address_1 AS address1, address_2 AS address2, city, state,
                postal_code AS postalCode
           FROM customers
          WHERE id = ? AND status = 'active'`,
      )
        .bind(data.customerId)
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
      if (customer) {
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
    } catch {}
  }
  if (data.assetId) {
    try {
      const asset = await db.prepare(
        `SELECT id, description, manufacturer, model, serial_number AS serialNumber
           FROM assets
          WHERE id = ? AND status != 'retired'`,
      )
        .bind(data.assetId)
        .first<{
          id: string;
          description: string | null;
          manufacturer: string;
          model: string;
          serialNumber: string | null;
        }>();
      if (asset) {
        enriched.equipmentType ||= asset.description;
        enriched.manufacturer ||= asset.manufacturer;
        enriched.model ||= asset.model;
        enriched.serialNumber ||= asset.serialNumber;
      }
    } catch {}
  }
  return enriched;
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...allowedRoles]);
    await ensureIntakesSchema();
    const db = getDatabase();
    if (!db) return Response.json({ intakes: [] }, { headers: privateNoStore });

    const includeClosed =
      new URL(request.url).searchParams.get("includeClosed") === "1";
    const requestedId = new URL(request.url).searchParams.get("id");
    const result = await db.prepare(
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
         LEFT JOIN accounts a ON a.id = i.account_id AND (a.organization_id = i.organization_id OR a.organization_id = 'techflex' OR a.organization_id IS NULL)
         LEFT JOIN locations l ON l.id = i.location_id AND l.account_id = i.account_id
         LEFT JOIN customers c ON c.id = i.customer_id AND c.account_id = i.account_id
         LEFT JOIN assets ast ON ast.id = i.asset_id AND ast.account_id = i.account_id
         LEFT JOIN users u ON u.id = i.updated_by
        WHERE (i.organization_id = ? OR i.organization_id = 'techflex' OR i.organization_id IS NULL)
          ${requestedId ? "AND i.id = ?" : includeClosed ? "" : "AND i.status NOT IN ('converted', 'archived')"}
        ORDER BY CASE i.status WHEN 'cancellation_review' THEN 1 WHEN 'needs_information' THEN 2 WHEN 'ready_for_pricing' THEN 3 ELSE 8 END,
                 CASE WHEN i.response_due_at IS NULL THEN 1 ELSE 0 END, i.response_due_at, i.updated_at DESC
        LIMIT 250`,
    )
      .bind(...(requestedId ? [TECHFLEX_ORG_ID, requestedId] : [TECHFLEX_ORG_ID]))
      .all();
    const intakes = (result.results || []).map((row: any) => {
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
    await ensureIntakesSchema();
    const db = getDatabase();

    const body = z.object({requestId:z.string().uuid().optional()}).passthrough().parse(await request.json());
    const requestId = body.requestId;
    const parsed = intakeDataSchema.parse(body);
    const data = await validateLinks(parsed);
    const id = requestId ? `intake:${identity.userId}:${requestId}` : crypto.randomUUID();

    if (requestId && db) {
      try {
        const saved = await db.prepare("SELECT data_json AS dataJson, status, record_version AS recordVersion FROM work_order_intakes WHERE id=? AND (organization_id=? OR organization_id='techflex')")
          .bind(id, TECHFLEX_ORG_ID).first<{dataJson:string;status:string;recordVersion:number}>();
        if (saved) {
          if (saved.dataJson !== JSON.stringify(data) || ["converted", "archived"].includes(saved.status))
            return Response.json({error:"This request was already saved. Open the saved record before applying further edits. Your entries remain here.",existingIntakeId:id,target:{kind:"intake",id}},{status:409,headers:privateNoStore});
          const evaluation = evaluateIntake(data);
          return Response.json({intake:{id,data,status:saved.status,recordVersion:saved.recordVersion,blockingCount:evaluation.blockers.length},alreadySaved:true},{headers:privateNoStore});
        }
      } catch {}
    }

    if (!data.externalId && !data.rawText)
      return Response.json(
        {
          error:
            "Paste the source notice or enter the work-order number before saving.",
        },
        { status: 400 },
      );

    if (data.externalId && db) {
      try {
        const duplicate = await db.prepare(
          "SELECT id, status FROM work_order_intakes WHERE (organization_id = ? OR organization_id = 'techflex') AND source = ? AND external_id = ? LIMIT 1",
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
      } catch {}
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

    if (db) {
      try {
        await db.exec("PRAGMA foreign_keys = OFF;");
        await db.batch([
          db.prepare(
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
          db.prepare(
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
          db.prepare(
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
      } catch (insertErr) {
        console.error("[POST INTAKES] Batch insert error, retrying individual inserts:", insertErr);
        try {
          await db.prepare(
            `INSERT OR REPLACE INTO work_order_intakes
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
          ).run();
        } catch (individualErr) {
          console.error("[POST INTAKES] Individual intake insert error:", individualErr);
        }
      }
    }

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
    await ensureIntakesSchema();
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database not available." }, { status: 503 });

    const input = z
      .object({
        id: z.string().min(1),
        expectedVersion: z.number().int().positive().optional(),
        action: z.enum(["update", "archive"]).default("update"),
        data: intakeDataSchema.optional(),
      })
      .parse(await request.json());

    const current = await db.prepare(
      "SELECT id, status, data_json AS dataJson, record_version AS recordVersion, converted_work_order_id AS convertedWorkOrderId FROM work_order_intakes WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex')",
    )
      .bind(input.id, TECHFLEX_ORG_ID)
      .first<{ id: string; status: string; dataJson: string; recordVersion:number;convertedWorkOrderId:string|null }>();
    if (!current)
      return Response.json(
        { error: "Intake record not found." },
        { status: 404 },
      );
    if (await db.prepare("SELECT intake_id FROM spinlife_visits WHERE intake_id=?").bind(input.id).first())
      return Response.json({error:"This saved order uses the SpinLife editor. Open it to update the same assignment and fieldwork; your entries remain here.",target:{kind:"intake",id:input.id}},{status:409,headers:privateNoStore});
    if (current.status === "converted" || current.convertedWorkOrderId)
      return Response.json(
        { error: "This intake is already linked to a work order. Open the existing record; your entries remain here.",target:{kind:"intake",id:input.id} },
        { status: 409 },
      );
    if(input.expectedVersion!==undefined && input.expectedVersion!==current.recordVersion)
      return Response.json({error:"This intake changed after you opened it. Your entries remain here; open the saved record to review the newer changes.",target:{kind:"intake",id:input.id}},{status:409,headers:privateNoStore});
    const guard=()=>db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_intakes i WHERE i.id=? AND (i.organization_id=? OR i.organization_id='techflex') AND i.record_version=? AND i.converted_work_order_id IS NULL AND NOT EXISTS(SELECT 1 FROM spinlife_visits v WHERE v.intake_id=i.id)) THEN 1 ELSE json('intake_update_conflict') END`).bind(input.id,TECHFLEX_ORG_ID,current.recordVersion);

    if (input.action === "archive") {
      await db.batch([
        guard(),
        db.prepare(
          "UPDATE work_order_intakes SET status = 'archived', updated_by = ?, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(identity.userId, input.id),
        db.prepare(
          "UPDATE admin_tasks SET status = 'complete', completed_at = CURRENT_TIMESTAMP, completed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE source = 'work_order_intake' AND source_record_id = ?",
        ).bind(identity.userId, `intake:${input.id}`),
        db.prepare(
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
      const duplicate = await db.prepare(
        "SELECT id FROM work_order_intakes WHERE (organization_id = ? OR organization_id = 'techflex') AND source = ? AND external_id = ? AND id != ? LIMIT 1",
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
    await db.batch([
      guard(),
      db.prepare(
        `UPDATE work_order_intakes
            SET account_id = ?, location_id = ?, customer_id = ?, asset_id = ?, source = ?, external_id = ?,
                notice_type = ?, source_detail_url = ?, response_due_at = ?, status = ?, blocking_count = ?,
                missing_fields_json = ?, data_json = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?,
                updated_by = ?, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (organization_id = ? OR organization_id = 'techflex')`,
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
      db.prepare(
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
      db.prepare(
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
