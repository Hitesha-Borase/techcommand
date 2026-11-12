import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { createErrorReference, safeServerLog } from "@/lib/server-observability";
import {
  cleanWebsitePayload,
  isOperationalWorkflow,
  taskForWebsiteIntake,
  websiteFileTypes,
  websiteIntakeSchema,
  type WebsiteIntake,
} from "@/lib/website-intake";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_REQUESTS_PER_HOUR = 8;

type Runtime = {
  DB: D1Database;
  BUCKET: R2Bucket;
  WEBSITE_INTAKE_SECRET?: string;
};

function runtime() {
  return env as unknown as Runtime;
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = bytes(left);
  const rightBytes = bytes(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1)
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

function suppliedSecret(request: Request) {
  const direct = request.headers.get("x-techcommand-intake-secret");
  const authorization = request.headers.get("authorization") || "";
  return direct || (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
}

function authorize(request: Request, secret?: string) {
  return Boolean(secret && constantTimeEqual(suppliedSecret(request), secret));
}

function response(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function value(form: FormData, ...keys: string[]) {
  for (const key of keys) {
    const item = form.get(key);
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return undefined;
}

function booleanValue(form: FormData, ...keys: string[]) {
  const item = String(value(form, ...keys) || "").toLowerCase();
  return ["1", "true", "yes", "on", "consented"].includes(item);
}

function fromForm(form: FormData) {
  return {
    workflow: value(form, "workflow", "form_type"),
    submissionId: value(form, "submissionId", "submission_id", "idempotency_key"),
    name: value(form, "name", "full_name", "contact_name"),
    email: value(form, "email", "contact_email"),
    phone: value(form, "phone", "telephone", "contact_phone"),
    company: value(form, "company", "company_name", "organization"),
    jobTitle: value(form, "jobTitle", "job_title", "title"),
    serviceType: value(form, "serviceType", "service_type", "service"),
    equipmentType: value(form, "equipmentType", "equipment_type", "equipment"),
    manufacturer: value(form, "manufacturer", "make"),
    model: value(form, "model"),
    serialNumber: value(form, "serialNumber", "serial_number", "serial"),
    address: value(form, "address", "service_address"),
    message: value(form, "message", "details", "description", "comments"),
    sourcePageUrl: value(form, "sourcePageUrl", "source_page_url", "page_url"),
    marketingConsent: booleanValue(form, "marketingConsent", "marketing_consent", "consent"),
    consentText: value(form, "consentText", "consent_text"),
    honeypot: value(form, "honeypot", "fax_number", "leave_blank"),
  };
}

function filesFrom(form: FormData) {
  return [...form.values()].filter(
    (item): item is File => item instanceof File && item.size > 0,
  );
}

async function requestPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return { input: fromForm(form), files: filesFrom(form) };
  }
  if (!contentType.includes("application/json"))
    throw new Response("Unsupported content type", { status: 415 });
  return { input: await request.json(), files: [] as File[] };
}

async function sha256(value: string) {
  return sha256Data(bytes(value));
}

async function sha256Data(value: BufferSource) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", value)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload";
}

function summary(input: WebsiteIntake) {
  const subject = input.serviceType || input.equipmentType || input.company || input.workflow;
  return `${input.name || "Website visitor"}: ${subject}`.slice(0, 500);
}

async function ownerUserId(db: D1Database) {
  const owner = await db
    .prepare(
      `SELECT m.user_id AS userId
         FROM memberships m JOIN roles r ON r.id = m.role_id
        WHERE m.organization_id = ? AND m.status = 'active'
          AND r.name = 'owner_administrator'
        ORDER BY m.created_at LIMIT 1`,
    )
    .bind(TECHFLEX_ORG_ID)
    .first<{ userId: string }>();
  return owner?.userId || null;
}

export async function GET(request: Request) {
  const current = runtime();
  if (!authorize(request, current.WEBSITE_INTAKE_SECRET))
    return response({ error: "Unauthorized." }, 401);
  return response(
    {
      ready: true,
      integration: "techflex_website_intake",
      workflows: [
        "service_request",
        "quote_request",
        "contact",
        "career",
        "partnership",
        "newsletter",
      ],
    },
    200,
  );
}

export async function POST(request: Request) {
  const current = runtime();
  if (!authorize(request, current.WEBSITE_INTAKE_SECRET))
    return response({ error: "Unauthorized." }, 401);

  const uploadedKeys: string[] = [];
  try {
    const parsed = await requestPayload(request);
    const input = websiteIntakeSchema.parse(parsed.input);
    if (parsed.files.length > MAX_FILES)
      return response({ error: `No more than ${MAX_FILES} files may be attached.` }, 413);
    for (const file of parsed.files) {
      if (file.size > MAX_FILE_BYTES)
        return response({ error: "Each file is limited to 15 MB." }, 413);
      if (!websiteFileTypes.has(file.type))
        return response({ error: "Upload a PDF, Word document, JPEG, PNG, WEBP, or HEIC file." }, 415);
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const ipHash = await sha256(`${current.WEBSITE_INTAKE_SECRET}:${ip}`);
    const recent = await current.DB.prepare(
      `SELECT COUNT(*) AS count FROM website_intake_submissions
        WHERE client_ip_hash = ? AND created_at >= datetime('now', '-1 hour')`,
    )
      .bind(ipHash)
      .first<{ count: number }>();
    if (Number(recent?.count || 0) >= MAX_REQUESTS_PER_HOUR)
      return response({ error: "Too many submissions. Please try again later." }, 429);

    const existing = await current.DB.prepare(
      `SELECT id, workflow, status FROM website_intake_submissions
        WHERE organization_id = ? AND external_submission_id = ? LIMIT 1`,
    )
      .bind(TECHFLEX_ORG_ID, input.submissionId)
      .first<{ id: string; workflow: string; status: string }>();
    if (existing)
      return response({ accepted: true, duplicate: true, submission: existing }, 200);

    const submissionId = crypto.randomUUID();
    const intakeId = isOperationalWorkflow(input.workflow) ? crypto.randomUUID() : null;
    const taskId = crypto.randomUUID();
    const task = taskForWebsiteIntake(input);
    const ownerId = await ownerUserId(current.DB);
    const safePayload = cleanWebsitePayload(input);
    const attachmentRows: Array<{
      id: string;
      key: string;
      name: string;
      type: string;
      size: number;
      checksum: string;
    }> = [];

    for (const file of parsed.files) {
      const data = await file.arrayBuffer();
      const checksum = await sha256Data(data);
      const name = safeFileName(file.name);
      const key = `techflex/website-intakes/${submissionId}/${Date.now()}_${crypto.randomUUID()}_${name}`;
      await current.BUCKET.put(key, data, {
        httpMetadata: { contentType: file.type },
      });
      uploadedKeys.push(key);
      attachmentRows.push({
        id: crypto.randomUUID(),
        key,
        name,
        type: file.type,
        size: file.size,
        checksum,
      });
    }

    const statements: D1PreparedStatement[] = [
      current.DB.prepare(
        `INSERT INTO website_intake_submissions
          (id, organization_id, external_submission_id, workflow, status, contact_name,
           contact_email, contact_phone, company_name, message, source_page_url,
           marketing_consent, payload_json, client_ip_hash)
         VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        submissionId,
        TECHFLEX_ORG_ID,
        input.submissionId,
        input.workflow,
        input.name || null,
        input.email || null,
        input.phone || null,
        input.company || null,
        input.message || null,
        input.sourcePageUrl || null,
        input.marketingConsent ? 1 : 0,
        JSON.stringify(safePayload),
        ipHash,
      ),
      current.DB.prepare(
        `INSERT INTO admin_tasks
          (id, organization_id, assigned_user_id, assigned_role, category, title,
           instructions, priority, status, source, source_record_id)
         VALUES (?, ?, ?, 'operations_administrator', ?, ?, ?, ?, 'open',
           'website_intake', ?)`,
      ).bind(
        taskId,
        TECHFLEX_ORG_ID,
        ownerId,
        task.category,
        task.title,
        `Review the verified TechFlex website submission${attachmentRows.length ? ` and ${attachmentRows.length} attachment(s)` : ""}. Contact information and original form data are preserved on the source record.`,
        task.priority,
        `website_intake:${submissionId}`,
      ),
      current.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, action, entity_type, entity_id, after_json, request_id, ip_hash)
         VALUES (?, ?, 'website_intake.received', 'website_intake', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        submissionId,
        JSON.stringify({
          workflow: input.workflow,
          externalSubmissionId: input.submissionId,
          attachmentCount: attachmentRows.length,
          marketingConsent: input.marketingConsent,
        }),
        request.headers.get("cf-ray") || null,
        ipHash,
      ),
    ];

    if (intakeId && ownerId) {
      const intakeData = {
        externalSource: "direct",
        externalId: `WEB-${input.submissionId}`.slice(0, 140),
        noticeType: "new_assignment",
        sourceDetailUrl: input.sourcePageUrl || null,
        serviceType: input.serviceType || null,
        summary: summary(input),
        rawText: input.message || summary(input),
        customerName: input.name || input.company || null,
        customerPhone: input.phone || null,
        customerEmail: input.email || null,
        serviceAddress: input.address || null,
        equipmentType: input.equipmentType || null,
        manufacturer: input.manufacturer || null,
        model: input.model || null,
        serialNumber: input.serialNumber || null,
      };
      statements.push(
        current.DB.prepare(
          `INSERT INTO work_order_intakes
            (id, organization_id, source, external_id, notice_type, source_detail_url,
             status, blocking_count, missing_fields_json, data_json, created_by, updated_by)
           VALUES (?, ?, 'direct', ?, 'new_assignment', ?, 'needs_information', 1,
             ?, ?, ?, ?)`,
        ).bind(
          intakeId,
          TECHFLEX_ORG_ID,
          intakeData.externalId,
          input.sourcePageUrl || null,
          JSON.stringify([
            {
              key: "adminReview",
              label: "Administrator review",
              stage: "source",
              reason: "Verify the website request before pricing or dispatch.",
              severity: "blocking",
            },
          ]),
          JSON.stringify(intakeData),
          ownerId,
          ownerId,
        ),
      );
    }

    if (input.workflow === "newsletter")
      statements.push(
        current.DB.prepare(
          `INSERT INTO marketing_consents
            (id, organization_id, website_submission_id, email, status, source, consent_text)
           VALUES (?, ?, ?, ?, 'consented', 'techflex_website', ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          submissionId,
          input.email,
          input.consentText || "Affirmative newsletter enrollment submitted on TechFlexMobility.com.",
        ),
      );

    for (const item of attachmentRows)
      statements.push(
        current.DB.prepare(
          `INSERT INTO attachments
            (id, organization_id, entity_type, entity_id, storage_key, file_name,
             content_type, size_bytes, checksum, category, uploaded_by)
           VALUES (?, ?, 'website_intake', ?, ?, ?, ?, ?, ?, ?, NULL)`,
        ).bind(
          item.id,
          TECHFLEX_ORG_ID,
          submissionId,
          item.key,
          item.name,
          item.type,
          item.size,
          item.checksum,
          input.workflow === "career" ? "resume" : "supporting_document",
        ),
      );

    statements.push(
      current.DB.prepare(
        `INSERT INTO integration_connections
          (id, organization_id, integration_key, provider, display_name, status,
           connection_mode, last_sync_at, last_success_at, config_json)
         VALUES (?, ?, 'techflex_website', 'wordpress_elementor', 'TechFlexMobility.com',
           'transaction_verified', 'server_webhook', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(organization_id, integration_key) DO UPDATE SET
           status = 'transaction_verified', last_sync_at = CURRENT_TIMESTAMP,
           last_success_at = CURRENT_TIMESTAMP, last_error = NULL,
           config_json = excluded.config_json, record_version = record_version + 1,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        JSON.stringify({ lastWorkflow: input.workflow }),
      ),
    );

    await current.DB.batch(statements);
    return response(
      {
        accepted: true,
        duplicate: false,
        submission: {
          id: submissionId,
          workflow: input.workflow,
          status: "received",
          intakeId,
          attachmentCount: attachmentRows.length,
        },
      },
      202,
    );
  } catch (error) {
    for (const key of uploadedKeys) await current.BUCKET.delete(key);
    if (error instanceof Response)
      return response({ error: await error.text() }, error.status);
    if (error instanceof ZodError)
      return response({ error: "Review the submitted form fields.", details: error.flatten() }, 400);
    const reference = createErrorReference();
    safeServerLog("website_intake", error, reference);
    return response(
      { error: "The submission could not be accepted.", reference },
      500,
      { "X-TechCommand-Error-Reference": reference },
    );
  }
}
