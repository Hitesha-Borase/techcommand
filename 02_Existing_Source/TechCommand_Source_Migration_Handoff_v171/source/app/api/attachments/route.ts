import { SupabaseBucket } from "@/lib/supabase-storage";
import { env } from "cloudflare:workers";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";
import { safeServerLog } from "@/lib/server-observability";

const entityTypes = new Set([
  "organization",
  "account",
  "location",
  "customer",
  "work_order",
  "work_order_intake",
  "asset",
  "technician",
]);
const categories = new Set([
  "client_work_order",
  "bill_of_lading",
  "intake",
  "before",
  "serial",
  "diagnosis",
  "repair",
  "after",
  "packaging",
  "test",
  "pm_label",
  "signature",
  "service_report",
  "invoice",
  "pay_stub",
  "credential",
  "general",
  "partner_contract",
]);
const contentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const extensionContentTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

function recognizedContentType(fileName: string, suppliedType: string) {
  if (contentTypes.has(suppliedType)) return suppliedType;
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return extensionContentTypes[extension] || null;
}
const restrictedEmployeeCategories = new Set([
  "w4",
  "w2",
  "i9",
  "pay_stub",
  "direct_deposit",
  "employment_agreement",
  "employee_other",
]);

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;

function maximumUploadBytes() {
  const configured = Number(
    (env as unknown as { MAX_UPLOAD_BYTES?: string }).MAX_UPLOAD_BYTES,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_UPLOAD_BYTES;
}

function safeUploadName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload.bin";
}

function storageDetails(
  entityType: string,
  entityId: string,
  category: string,
  fileName: string,
  contentType: string,
  recordLabel?: string | null,
) {
  const sourceName = safeUploadName(fileName);
  const label = (recordLabel || entityId).replace(/[^a-zA-Z0-9_-]+/g, "_");
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const extension =
    sourceName.match(/\.[a-zA-Z0-9]{2,5}$/)?.[0]?.toLowerCase() ||
    (contentType === "application/pdf" ? ".pdf" : ".jpg");
  const safeName =
    entityType === "work_order"
      ? `${label}_${category}_${timestamp}${extension}`
      : sourceName;
  return {
    safeName,
    storageKey: `techflex/${entityType}s/${label}/${category}/${Date.now()}_${safeName}`,
  };
}

type AttachmentRecordInput = {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  storageKey: string;
  safeName: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string | null;
  identity: PortalIdentity;
  recordLabel?: string | null;
  multipartUploadId?: string | null;
};

type MultipartUploadSession = {
  uploadId: string;
  attachmentId: string;
  entityType: string;
  entityId: string;
  category: string;
  storageKey: string;
  sourceFileName: string;
  safeName: string;
  contentType: string;
  sizeBytes: number;
  initiatedBy: string;
  status: string;
  expired: number;
};

async function multipartSession(uploadId: string) {
  return env.DB.prepare(
    `SELECT upload_id AS uploadId, attachment_id AS attachmentId,
            entity_type AS entityType, entity_id AS entityId, category,
            storage_key AS storageKey, source_file_name AS sourceFileName,
            safe_name AS safeName, content_type AS contentType,
            size_bytes AS sizeBytes, initiated_by AS initiatedBy, status,
            CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
       FROM multipart_upload_sessions
      WHERE upload_id=? AND organization_id=?
      LIMIT 1`,
  ).bind(uploadId, TECHFLEX_ORG_ID).first<MultipartUploadSession>();
}

async function reusableMultipartSession(attachmentId: string) {
  return env.DB.prepare(
    `SELECT upload_id AS uploadId, attachment_id AS attachmentId,
            entity_type AS entityType, entity_id AS entityId, category,
            storage_key AS storageKey, source_file_name AS sourceFileName,
            safe_name AS safeName, content_type AS contentType,
            size_bytes AS sizeBytes, initiated_by AS initiatedBy, status
       FROM multipart_upload_sessions
      WHERE attachment_id=? AND organization_id=? AND status='active'
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(attachmentId, TECHFLEX_ORG_ID).first<MultipartUploadSession>();
}

function sameMultipartRequest(
  session: MultipartUploadSession,
  input: {
    attachmentId: string;
    entityType: string;
    entityId: string;
    category: string;
    storageKey?: string;
    sourceFileName?: string;
    contentType?: string;
    sizeBytes?: number;
  },
  identity: PortalIdentity,
) {
  return session.attachmentId === input.attachmentId &&
    session.entityType === input.entityType &&
    session.entityId === input.entityId &&
    session.category === input.category &&
    session.initiatedBy === identity.userId &&
    (!input.storageKey || session.storageKey === input.storageKey) &&
    (!input.sourceFileName || session.sourceFileName === input.sourceFileName) &&
    (!input.contentType || session.contentType === input.contentType) &&
    (input.sizeBytes === undefined || session.sizeBytes === input.sizeBytes);
}

function multipartRestartError() {
  return Response.json(
    {
      error: "This resumable upload no longer matches the record where it started. Start the upload again from that record.",
      retryMode: "restart_upload",
    },
    { status: 409 },
  );
}

async function closeMultipartSession(uploadId: string, status: "aborted" | "failed") {
  await env.DB.prepare(
    `UPDATE multipart_upload_sessions
        SET status=?, source_file_name='', ended_at=CURRENT_TIMESTAMP
      WHERE upload_id=? AND organization_id=? AND status='active'`,
  ).bind(status, uploadId, TECHFLEX_ORG_ID).run();
}

type CommittedAttachment = {
  id: string;
  storageKey: string;
  fileName: string;
  sizeBytes: number;
};

function createsVaultDocument(entityType: string, category: string) {
  return entityType === "work_order" && [
    "client_work_order",
    "service_report",
    "bill_of_lading",
    "invoice",
  ].includes(category);
}

function clientAttachmentId(value: unknown) {
  const id = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : crypto.randomUUID();
}

function validAttachmentId(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function committedAttachment(input: Pick<AttachmentRecordInput, "id" | "entityType" | "entityId" | "category">) {
  const documentCheck = createsVaultDocument(input.entityType, input.category)
    ? "AND EXISTS (SELECT 1 FROM document_records d WHERE d.attachment_id=a.id AND d.organization_id=a.organization_id)"
    : "";
  return env.DB.prepare(
    `SELECT a.id, a.storage_key AS storageKey, a.file_name AS fileName, a.size_bytes AS sizeBytes
       FROM attachments a
      WHERE a.id=? AND a.organization_id=? AND a.entity_type=? AND a.entity_id=? AND a.category=?
        AND EXISTS (
          SELECT 1 FROM audit_logs l
           WHERE l.organization_id=a.organization_id AND l.action='attachment.uploaded'
             AND l.entity_type=a.entity_type AND l.entity_id=a.entity_id
             AND json_extract(l.after_json, '$.attachmentId')=a.id
        ) ${documentCheck}
      LIMIT 1`,
  ).bind(input.id, TECHFLEX_ORG_ID, input.entityType, input.entityId, input.category).first<CommittedAttachment>();
}

type PendingAttachmentCleanup = { pendingId: string; attachmentId: string; storageKey: string };

async function completeAttachmentCleanup(item: PendingAttachmentCleanup) {
  try {
    const referenced = await env.DB.prepare(
      "SELECT id FROM attachments WHERE organization_id=? AND storage_key=? LIMIT 1",
    ).bind(TECHFLEX_ORG_ID, item.storageKey).first<{ id: string }>();
    if (referenced) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
      ).bind(
        `${item.pendingId}:completed`, TECHFLEX_ORG_ID, item.attachmentId,
        JSON.stringify({ storageKey: item.storageKey }),
        JSON.stringify({ storageRemoved: false, retainedBecauseReferenced: true }),
      ).run();
      return;
    }
    await SupabaseBucket.delete(item.storageKey);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
    ).bind(
      `${item.pendingId}:completed`, TECHFLEX_ORG_ID, item.attachmentId,
      JSON.stringify({ storageKey: item.storageKey }),
      JSON.stringify({ storageRemoved: true }),
    ).run();
  } catch (error) {
    safeServerLog("attachment_cleanup", error);
  }
}

async function queueAttachmentCleanup(attachmentId: string, storageKey: string) {
  const pendingId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_pending', 'attachment', ?, ?, ?)",
    ).bind(
      pendingId, TECHFLEX_ORG_ID, attachmentId,
      JSON.stringify({ storageKey }),
      JSON.stringify({ metadataSaved: false, storageRemoved: false }),
    ).run();
  } catch (error) {
    safeServerLog("attachment_cleanup", error);
  }
  await completeAttachmentCleanup({ pendingId, attachmentId, storageKey });
}

async function ensureAttachmentsSchema() {
  try {
    const db = (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB;
    if (!db) return;
    try {
      const check = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attachments'").first();
      if (check) return;
    } catch {}

    const ddlStatements = [
      `CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        checksum TEXT,
        category TEXT DEFAULT 'general' NOT NULL,
        uploaded_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        occurred_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS multipart_upload_sessions (
        upload_id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        category TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        source_file_name TEXT NOT NULL,
        safe_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        initiated_by TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        expires_at TEXT NOT NULL,
        completed_at TEXT,
        ended_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS document_records (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT,
        attachment_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        effective_on TEXT,
        expires_on TEXT,
        searchable_text TEXT,
        uploaded_by TEXT,
        status TEXT DEFAULT 'current' NOT NULL,
        deleted_at TEXT,
        record_version INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`
    ];
    for (const stmt of ddlStatements) {
      try {
        await db.prepare(stmt).run();
      } catch {}
    }
  } catch (err) {
    console.warn("ensureAttachmentsSchema warning:", err);
  }
}

async function retryPendingAttachmentCleanup() {
  try {
    await ensureAttachmentsSchema();
    const pending = await env.DB.prepare(
      `SELECT p.id AS pendingId, p.entity_id AS attachmentId,
              json_extract(p.before_json, '$.storageKey') AS storageKey
         FROM audit_logs p
        WHERE p.organization_id=? AND p.action='attachment.storage_cleanup_pending'
          AND NOT EXISTS (SELECT 1 FROM audit_logs c WHERE c.id=p.id || ':completed')
        LIMIT 100`,
    ).bind(TECHFLEX_ORG_ID).all<PendingAttachmentCleanup>();
    for (const item of pending.results || []) await completeAttachmentCleanup(item);
  } catch (error) {
    safeServerLog("attachment_cleanup", error);
  }
}

async function insertAttachmentRecord(input: AttachmentRecordInput) {
  const statements = [
    env.DB.prepare(
      "INSERT INTO attachments (id, organization_id, entity_type, entity_id, storage_key, file_name, content_type, size_bytes, checksum, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      input.id,
      TECHFLEX_ORG_ID,
      input.entityType,
      input.entityId,
      input.storageKey,
      input.safeName,
      input.contentType,
      input.sizeBytes,
      input.checksum || null,
      input.category,
      input.identity.userId,
    ),
    env.DB.prepare(
      "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'attachment.uploaded', ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      input.identity.userId,
      input.entityType,
      input.entityId,
      JSON.stringify({
        attachmentId: input.id,
        category: input.category,
        fileName: input.safeName,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum || null,
        uploadMode: input.checksum ? "direct" : "multipart",
      }),
    ),
  ];
  if (input.entityType === "work_order_intake") {
    statements.push(env.DB.prepare("UPDATE spinlife_visits SET record_version=record_version+1 WHERE intake_id=?").bind(input.entityId));
  }
  if (createsVaultDocument(input.entityType, input.category)) {
    const titles: Record<string, string> = {
      client_work_order: "Completed work order",
      service_report: "Service report",
      bill_of_lading: "Bill of lading",
      invoice: "Invoice",
    };
    statements.push(
      env.DB.prepare(
        "INSERT INTO document_records (id, organization_id, scope_type, scope_id, attachment_id, category, title, searchable_text, uploaded_by) VALUES (?, ?, 'work_order', ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        input.entityId,
        input.id,
        input.category === "client_work_order"
          ? "completed_work_order"
          : input.category,
        `${titles[input.category]} ${input.recordLabel || ""}`.trim(),
        `${titles[input.category]} ${input.recordLabel || ""} ${input.safeName}`.trim(),
        input.identity.userId,
      ),
    );
  }
  if (input.multipartUploadId) {
    statements.unshift(
      env.DB.prepare(`SELECT CASE WHEN EXISTS (
        SELECT 1 FROM multipart_upload_sessions
         WHERE upload_id=? AND organization_id=? AND attachment_id=?
           AND entity_type=? AND entity_id=? AND category=?
           AND storage_key=? AND initiated_by=? AND status='active'
           AND expires_at > CURRENT_TIMESTAMP
      ) THEN 1 ELSE json('multipart_session_conflict') END`).bind(
        input.multipartUploadId,
        TECHFLEX_ORG_ID,
        input.id,
        input.entityType,
        input.entityId,
        input.category,
        input.storageKey,
        input.identity.userId,
      ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE multipart_upload_sessions
            SET status='completed', source_file_name='',
                completed_at=CURRENT_TIMESTAMP, ended_at=CURRENT_TIMESTAMP
          WHERE upload_id=? AND organization_id=? AND status='active'`,
      ).bind(input.multipartUploadId, TECHFLEX_ORG_ID),
    );
  }
  try {
    await env.DB.batch(statements);
    return "saved" as const;
  } catch (error) {
    safeServerLog("attachment_commit", error);
    try {
      const committed = await committedAttachment(input);
      if (committed) {
        if (committed.storageKey !== input.storageKey)
          await queueAttachmentCleanup(input.id, input.storageKey);
        return "saved" as const;
      }
      const partial = await env.DB.prepare(
        "SELECT id FROM attachments WHERE id=? AND organization_id=? LIMIT 1",
      ).bind(input.id, TECHFLEX_ORG_ID).first<{ id: string }>();
      if (!partial) {
        await queueAttachmentCleanup(input.id, input.storageKey);
        return "failed" as const;
      }
    } catch (verificationError) {
      safeServerLog("attachment_commit", verificationError);
    }
    return "unconfirmed" as const;
  }
}

function attachmentPayload(record: CommittedAttachment, category: string) {
  return { attachment: { id: record.id, fileName: record.fileName, category, sizeBytes: record.sizeBytes } };
}

function attachmentSaveError(status: "failed" | "unconfirmed") {
  return status === "failed"
    ? Response.json({ error: "File was not saved. The original remains selected or queued and can be retried safely.", retryMode: "restart_upload" }, { status: 500 })
    : Response.json({ error: "File save could not be confirmed. Refresh the record before retrying so a completed upload is not duplicated.", retryMode: "review_first" }, { status: 409 });
}

function canReadRestrictedEmployeeFile(
  identity: PortalIdentity,
  category: string,
  entityId: string,
) {
  if (identity.role === "owner_administrator" || identity.role === "finance")
    return true;
  if (identity.role !== "technician" || identity.technicianId !== entityId)
    return false;
  return category !== "i9" && category !== "direct_deposit";
}

async function authorizedEntity(
  entityType: string,
  entityId: string,
  identity: PortalIdentity,
) {
  if (entityType === "organization")
    return entityId === TECHFLEX_ORG_ID && identity.role !== "technician"
      ? { id: entityId }
      : null;
  const tables: Record<string, string> = {
    account: "accounts",
    location: "locations",
    customer: "customers",
    work_order: "work_orders",
    work_order_intake: "work_order_intakes",
    asset: "assets",
    technician: "technicians",
  };
  const table = tables[entityType];
  if (!table) return null;
  if (entityType === "asset") {
    // The attachment's tenant is insufficient: its asset and the assignment
    // granting technician access must describe the same company and facility.
    return env.DB.prepare(`SELECT s.id FROM assets s
      JOIN accounts a ON a.id=s.account_id AND a.organization_id=s.organization_id
      JOIN locations l ON l.id=s.location_id AND l.account_id=s.account_id
      WHERE s.id=? AND s.organization_id=?
        AND (?=0 OR EXISTS (
          SELECT 1 FROM work_orders w
          JOIN work_order_assignments wa ON wa.work_order_id=w.id
          JOIN technicians t ON t.id=wa.technician_id AND t.organization_id=s.organization_id
          WHERE w.asset_id=s.id AND w.organization_id=s.organization_id
            AND w.account_id=s.account_id AND w.location_id=s.location_id
            AND wa.technician_id=? AND t.user_id=? AND t.status='active'
            AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted')
        )) LIMIT 1`)
      .bind(entityId, TECHFLEX_ORG_ID, identity.role === "technician" ? 1 : 0, identity.technicianId, identity.userId)
      .first();
  }
  if (identity.role === "technician") {
    if (entityType === "work_order_intake")
      return env.DB.prepare(`SELECT i.id FROM work_order_intakes i JOIN spinlife_visits v ON v.intake_id=i.id
        WHERE i.id=? AND i.organization_id=? AND v.technician_id=? AND i.converted_work_order_id IS NULL
        AND i.status NOT IN ('archived','converted') LIMIT 1`)
        .bind(entityId, TECHFLEX_ORG_ID, identity.technicianId).first();
    if (entityType === "technician")
      return identity.technicianId === entityId ? { id: entityId } : null;
    if (entityType === "work_order")
      return env.DB.prepare(
        "SELECT w.id FROM work_orders w JOIN work_order_assignments wa ON wa.work_order_id = w.id AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted') WHERE w.id = ? AND w.organization_id = ? AND wa.technician_id = ? LIMIT 1",
      )
        .bind(entityId, TECHFLEX_ORG_ID, identity.technicianId)
        .first();
    return null;
  }
  if (table === "accounts")
    return env.DB.prepare(
      "SELECT id FROM accounts WHERE id = ? AND organization_id = ? LIMIT 1",
    )
      .bind(entityId, TECHFLEX_ORG_ID)
      .first();
  if (table === "locations")
    return env.DB.prepare(
      "SELECT l.id FROM locations l JOIN accounts a ON a.id=l.account_id WHERE l.id=? AND a.organization_id=? LIMIT 1",
    )
      .bind(entityId, TECHFLEX_ORG_ID)
      .first();
  return env.DB.prepare(
    `SELECT id FROM ${table} WHERE id = ? AND organization_id = ? LIMIT 1`,
  )
    .bind(entityId, TECHFLEX_ORG_ID)
    .first();
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
      "auditor",
    ]);
    await ensureAttachmentsSchema();
    const url = new URL(request.url);
    const attachmentId = url.searchParams.get("attachmentId");
    if (attachmentId) {
      const item = await env.DB.prepare(
        `SELECT a.storage_key AS storageKey, a.file_name AS fileName, a.content_type AS contentType,
                a.category, a.entity_id AS entityId
           FROM attachments a
          WHERE a.id = ? AND a.organization_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM document_records d
               WHERE d.attachment_id = a.id AND d.organization_id = a.organization_id
                 AND d.status = 'deleted'
            )`,
      )
        .bind(attachmentId, TECHFLEX_ORG_ID)
        .first<{
          storageKey: string;
          fileName: string;
          contentType: string;
          category: string;
          entityId: string;
        }>();
      if (!item)
        return Response.json({ error: "File not found." }, { status: 404 });
      if (
        restrictedEmployeeCategories.has(item.category) &&
        !canReadRestrictedEmployeeFile(identity, item.category, item.entityId)
      )
        return Response.json({ error: "File not found." }, { status: 404 });
      const attachmentEntity = await env.DB.prepare(
        "SELECT entity_type AS entityType, entity_id AS entityId FROM attachments WHERE id = ? AND organization_id = ?",
      )
        .bind(attachmentId, TECHFLEX_ORG_ID)
        .first<{ entityType: string; entityId: string }>();
      if (
        !attachmentEntity ||
        !(await authorizedEntity(
          attachmentEntity.entityType,
          attachmentEntity.entityId,
          identity,
        ))
      )
        return Response.json({ error: "File not found." }, { status: 404 });
      const object = await SupabaseBucket.get(item.storageKey);
      if (!object)
        return Response.json(
          { error: "Stored file not found." },
          { status: 404 },
        );
      const disposition =
        item.contentType === "application/pdf" ? "inline" : "attachment";
      return new Response(object.body, {
        headers: {
          "Content-Type": item.contentType,
          "Content-Disposition": `${disposition}; filename="${item.fileName.replace(/["\r\n]/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const entityType = url.searchParams.get("entityType") || "";
    const entityId = url.searchParams.get("entityId") || "";
    if (
      !entityTypes.has(entityType) ||
      !entityId ||
      !(await authorizedEntity(entityType, entityId, identity))
    )
      return Response.json(
        { error: "Select a valid record." },
        { status: 400 },
      );
    const restrictedFilter =
      entityType === "technician" &&
      identity.role !== "owner_administrator" &&
      identity.role !== "finance"
        ? identity.role === "technician"
          ? " AND category NOT IN ('i9','direct_deposit')"
          : " AND category NOT IN ('w4','w2','i9','pay_stub','direct_deposit','employment_agreement','employee_other')"
        : "";
    const rows = await env.DB.prepare(
      `SELECT id, file_name AS fileName, content_type AS contentType, size_bytes AS sizeBytes, category, created_at AS createdAt FROM attachments WHERE organization_id = ? AND entity_type = ? AND entity_id = ? AND NOT EXISTS (SELECT 1 FROM document_records d WHERE d.attachment_id = attachments.id AND d.organization_id = attachments.organization_id AND d.status = 'deleted')${restrictedFilter} ORDER BY created_at DESC`,
    )
      .bind(TECHFLEX_ORG_ID, entityType, entityId)
      .all();
    return Response.json({ attachments: rows.results });
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
      "technician",
    ]);
    await retryPendingAttachmentCleanup();
    if (request.headers.get("content-type")?.includes("application/json")) {
      const input = (await request.json()) as Record<string, unknown>;
      const action = String(input.action || "");
      const entityType = String(input.entityType || "");
      const entityId = String(input.entityId || "");
      const category = String(input.category || "general");
      if (
        !entityTypes.has(entityType) ||
        !categories.has(category) ||
        !(await authorizedEntity(entityType, entityId, identity))
      )
        return Response.json(
          { error: "Select an authorized record and upload category." },
          { status: 400 },
        );
      if (action === "multipart_init") {
        const fileName = String(input.fileName || "");
        const contentType = recognizedContentType(
          fileName,
          String(input.contentType || "application/octet-stream"),
        );
        const sizeBytes = Number(input.sizeBytes || 0);
        if (!contentType)
          return Response.json(
            { error: "Upload a PDF, JPEG, PNG, WEBP, or HEIC file." },
            { status: 415 },
          );
        if (
          !Number.isSafeInteger(sizeBytes) ||
          sizeBytes < 1 ||
          sizeBytes > maximumUploadBytes()
        )
          return Response.json(
            {
              error: `File exceeds the configured ${(maximumUploadBytes() / 1024 / 1024 / 1024).toFixed(0)} GB upload limit.`,
            },
            { status: 413 },
          );
        const record =
          entityType === "work_order"
            ? await env.DB.prepare(
                "SELECT external_id AS label FROM work_orders WHERE id = ?",
              )
                .bind(entityId)
                .first<{ label: string }>()
            : null;
        const details = storageDetails(
          entityType,
          entityId,
          category,
          fileName,
          contentType,
          record?.label,
        );
        const attachmentId = clientAttachmentId(input.attachmentId);
        const existing = await committedAttachment({ id: attachmentId, entityType, entityId, category });
        if (existing)
          return Response.json(attachmentPayload(existing, category), { status: 201 });
        const sourceFileName = safeUploadName(fileName);
        await env.DB.prepare(
          `UPDATE multipart_upload_sessions
              SET status='expired', source_file_name='', ended_at=CURRENT_TIMESTAMP
            WHERE organization_id=? AND attachment_id=? AND status='active'
              AND expires_at <= CURRENT_TIMESTAMP`,
        ).bind(TECHFLEX_ORG_ID, attachmentId).run();
        const reusable = await reusableMultipartSession(attachmentId);
        if (reusable) {
          if (!sameMultipartRequest(reusable, {
            attachmentId, entityType, entityId, category, sourceFileName,
            contentType, sizeBytes,
          }, identity)) return multipartRestartError();
          return Response.json({
            uploadId: reusable.uploadId,
            attachmentId: reusable.attachmentId,
            partSize: MULTIPART_PART_SIZE,
            storageKey: reusable.storageKey,
            safeName: reusable.safeName,
          });
        }
        const multipart = await SupabaseBucket.createMultipartUpload(
          details.storageKey,
          { httpMetadata: { contentType } },
        );
        try {
          await env.DB.prepare(
            `INSERT INTO multipart_upload_sessions
              (upload_id, organization_id, attachment_id, entity_type, entity_id,
               category, storage_key, source_file_name, safe_name, content_type,
               size_bytes, initiated_by, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+24 hours'))`,
          ).bind(
            multipart.uploadId, TECHFLEX_ORG_ID, attachmentId, entityType, entityId,
            category, details.storageKey, sourceFileName, details.safeName,
            contentType, sizeBytes, identity.userId,
          ).run();
        } catch (error) {
          try {
            await SupabaseBucket.resumeMultipartUpload(details.storageKey, multipart.uploadId).abort();
          } catch (cleanupError) {
            safeServerLog("attachment_cleanup", cleanupError);
          }
          const competing = await reusableMultipartSession(attachmentId);
          if (competing && sameMultipartRequest(competing, {
            attachmentId, entityType, entityId, category, sourceFileName,
            contentType, sizeBytes,
          }, identity)) {
            return Response.json({
              uploadId: competing.uploadId,
              attachmentId: competing.attachmentId,
              partSize: MULTIPART_PART_SIZE,
              storageKey: competing.storageKey,
              safeName: competing.safeName,
            });
          }
          safeServerLog("attachment_commit", error);
          return Response.json(
            { error: "The resumable upload could not be initialized. Retry when ready." },
            { status: 500 },
          );
        }
        return Response.json({
          uploadId: multipart.uploadId,
          attachmentId,
          partSize: MULTIPART_PART_SIZE,
          ...details,
        });
      }
      if (action === "multipart_complete" || action === "multipart_abort") {
        const uploadId = String(input.uploadId || "");
        const storageKey = String(input.storageKey || "");
        const attachmentId = String(input.attachmentId || "");
        if (!uploadId || !storageKey || !validAttachmentId(attachmentId))
          return Response.json(
            { error: "Invalid multipart upload." },
            { status: 400 },
          );
        const session = await multipartSession(uploadId);
        if (!session || !sameMultipartRequest(session, {
          attachmentId, entityType, entityId, category, storageKey,
        }, identity)) return multipartRestartError();
        const existing = await committedAttachment({ id: attachmentId, entityType, entityId, category });
        if (action === "multipart_complete" && session.status === "completed" && existing)
          return Response.json(attachmentPayload(existing, category), { status: 201 });
        if (session.status !== "active" || session.expired) return multipartRestartError();
        if (action === "multipart_abort") {
          await closeMultipartSession(uploadId, "aborted");
          const upload = SupabaseBucket.resumeMultipartUpload(storageKey, uploadId);
          try {
            await upload.abort();
          } catch (error) {
            safeServerLog("attachment_cleanup", error);
            return Response.json(
              { error: "The upload was closed, but storage cleanup could not be confirmed." },
              { status: 500 },
            );
          }
          return Response.json({ status: "aborted" });
        }
        if (existing) {
          if (existing.storageKey !== storageKey)
            await queueAttachmentCleanup(attachmentId, storageKey);
          return Response.json(attachmentPayload(existing, category), { status: 201 });
        }
        const upload = SupabaseBucket.resumeMultipartUpload(storageKey, uploadId);
        const parts = Array.isArray(input.parts)
          ? input.parts.map((part) => ({
              partNumber: Number((part as Record<string, unknown>).partNumber),
              etag: String((part as Record<string, unknown>).etag || ""),
            }))
          : [];
        if (!parts.length)
          return Response.json(
            { error: "No uploaded parts were supplied." },
            { status: 400 },
          );
        await upload.complete(parts);
        const object = await SupabaseBucket.head(storageKey);
        const safeName = session.safeName;
        const contentType = session.contentType;
        const sizeBytes = Number(object?.size || 0);
        if (!object || sizeBytes !== session.sizeBytes || sizeBytes > maximumUploadBytes()) {
          await SupabaseBucket.delete(storageKey);
          await closeMultipartSession(uploadId, "failed");
          return Response.json(
            { error: "The completed upload could not be verified." },
            { status: 400 },
          );
        }
        const record =
          entityType === "work_order"
            ? await env.DB.prepare(
                "SELECT external_id AS label FROM work_orders WHERE id = ?",
              )
                .bind(entityId)
                .first<{ label: string }>()
            : null;
        const saved = await insertAttachmentRecord({
          id: attachmentId,
          entityType,
          entityId,
          category,
          storageKey,
          safeName,
          contentType,
          sizeBytes,
          identity,
          recordLabel: record?.label,
          multipartUploadId: uploadId,
        });
        if (saved !== "saved") {
          await closeMultipartSession(uploadId, "failed");
          return attachmentSaveError(saved);
        }
        return Response.json(
          {
            attachment: {
              id: attachmentId,
              fileName: safeName,
              category,
              sizeBytes,
            },
          },
          { status: 201 },
        );
      }
      return Response.json(
        { error: "Unsupported multipart action." },
        { status: 400 },
      );
    }
    const form = await request.formData();
    const entityType = String(form.get("entityType") || "");
    const entityId = String(form.get("entityId") || "");
    const category = String(form.get("category") || "general");
    const file = form.get("file");
    if (
      !entityTypes.has(entityType) ||
      !categories.has(category) ||
      !(file instanceof File)
    )
      return Response.json(
        { error: "Choose a valid record, category, and file." },
        { status: 400 },
      );
    if (!(await authorizedEntity(entityType, entityId, identity)))
      return Response.json({ error: "Record not found." }, { status: 404 });
    if (file.size > 20 * 1024 * 1024)
      return Response.json(
        { error: "Use the resumable uploader for files larger than 20 MB." },
        { status: 413 },
      );
    const contentType = recognizedContentType(file.name, file.type);
    if (!contentType)
      return Response.json(
        { error: "Upload a PDF, JPEG, PNG, WEBP, or HEIC file." },
        { status: 415 },
      );
    const record =
      entityType === "work_order"
        ? await env.DB.prepare(
            "SELECT external_id AS label FROM work_orders WHERE id = ?",
          )
            .bind(entityId)
            .first<{ label: string }>()
        : null;
    const id = clientAttachmentId(form.get("attachmentId"));
    const existing = await committedAttachment({ id, entityType, entityId, category });
    if (existing)
      return Response.json(attachmentPayload(existing, category), { status: 201 });
    const { safeName, storageKey } = storageDetails(
      entityType,
      entityId,
      category,
      file.name,
      contentType,
      record?.label,
    );
    const bytes = await file.arrayBuffer();
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await SupabaseBucket.put(storageKey, bytes, {
      httpMetadata: { contentType },
    });
    const saved = await insertAttachmentRecord({
      id,
      entityType,
      entityId,
      category,
      storageKey,
      safeName,
      contentType,
      sizeBytes: file.size,
      checksum,
      identity,
      recordLabel: record?.label,
    });
    if (saved !== "saved") return attachmentSaveError(saved);
    return Response.json(
      {
        attachment: { id, fileName: safeName, category, sizeBytes: file.size },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "technician",
    ]);
    const url = new URL(request.url);
    const uploadId = url.searchParams.get("uploadId") || "";
    const storageKey = url.searchParams.get("storageKey") || "";
    const entityType = url.searchParams.get("entityType") || "";
    const entityId = url.searchParams.get("entityId") || "";
    const partNumber = Number(url.searchParams.get("partNumber") || 0);
    const session = uploadId ? await multipartSession(uploadId) : null;
    if (
      !uploadId ||
      !storageKey ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000 ||
      !(await authorizedEntity(entityType, entityId, identity))
    )
      return Response.json(
        { error: "Invalid multipart upload part." },
        { status: 400 },
      );
    if (
      !session ||
      session.storageKey !== storageKey ||
      session.entityType !== entityType ||
      session.entityId !== entityId ||
      session.initiatedBy !== identity.userId ||
      session.status !== "active" ||
      Boolean(session.expired)
    )
      return session ? multipartRestartError() : Response.json(
          { error: "This resumable upload is no longer active. Start the upload again.", retryMode: "restart_upload" },
          { status: 409 },
        );
    if (!request.body)
      return Response.json({ error: "Upload part is empty." }, { status: 400 });
    const part = await SupabaseBucket.resumeMultipartUpload(
      storageKey,
      uploadId,
    ).uploadPart(partNumber, request.body);
    return Response.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (error) {
    return apiError(error);
  }
}
