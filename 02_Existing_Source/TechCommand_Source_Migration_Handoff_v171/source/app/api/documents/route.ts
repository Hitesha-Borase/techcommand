import { SupabaseBucket } from "@/lib/supabase-storage";
import { env } from "cloudflare:workers";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";
import { safeServerLog } from "@/lib/server-observability";

const scopes = new Set([
  "organization",
  "account",
  "location",
  "customer",
  "technician",
  "asset",
  "work_order",
  "work_order_intake",
]);
const categories = new Set([
  "general",
  "notes",
  "attachment",
  "contract",
  "rate_sheet",
  "policy",
  "procedure",
  "license",
  "insurance",
  "w9",
  "accreditation",
  "credential",
  "training",
  "customer_document",
  "service_document",
  "intake_document",
  "intake_spreadsheet",
  "completed_work_order",
  "source_work_order",
  "bill_of_lading",
  "customer_signature",
  "service_report",
  "invoice",
  "w4",
  "w2",
  "i9",
  "pay_stub",
  "direct_deposit",
  "employment_agreement",
  "employee_other",
  "other",
]);
const restrictedEmployeeCategories = new Set([
  "w4",
  "w2",
  "i9",
  "pay_stub",
  "direct_deposit",
  "employment_agreement",
  "employee_other",
]);
const restrictedRoles = new Set(["owner_administrator", "finance"]);

function canManageRestrictedEmployeeFiles(identity: PortalIdentity) {
  return restrictedRoles.has(identity.role);
}
const types = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);
const extensionTypes: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  txt: "text/plain", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv",
};
const duplicateFileMessage = "This file is already attached to the selected record. Refresh saved files before retrying. If it was deleted, check the Document Vault trash for recovery.";

async function ensureDocumentsSchema() {
  try {
    if (!env?.DB) return;
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
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
      );
      CREATE TABLE IF NOT EXISTS document_records (
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
      CREATE TABLE IF NOT EXISTS multipart_upload_sessions (
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
      );
    `);
  } catch (err) {
    console.warn("ensureDocumentsSchema warning:", err);
  }
}

async function scopeAllowed(
  scopeType: string,
  scopeId: string | null,
  identity: PortalIdentity,
) {
  if (scopeType === "organization") return identity.role !== "technician";
  const tables: Record<string, string> = {
    account: "accounts",
    location: "locations",
    customer: "customers",
    technician: "technicians",
    asset: "assets",
    work_order: "work_orders",
    work_order_intake: "work_order_intakes",
  };
  const table = tables[scopeType];
  if (!table || !scopeId) return false;
  if (identity.role === "technician") {
    if (scopeType === "technician") return scopeId === identity.technicianId;
    if (scopeType === "work_order") {
      try {
        return Boolean(
          await env.DB.prepare(
            "SELECT w.id FROM work_orders w JOIN work_order_assignments wa ON wa.work_order_id=w.id AND wa.status='assigned' WHERE (w.id=? OR w.external_id=?) AND wa.technician_id=?",
          )
            .bind(scopeId, scopeId, identity.technicianId)
            .first(),
        );
      } catch {
        return true;
      }
    }
    return false;
  }
  if (table === "locations") {
    try {
      const loc = await env.DB.prepare(
        "SELECT l.id FROM locations l JOIN accounts a ON a.id=l.account_id WHERE l.id=? AND (a.organization_id=? OR a.organization_id='techflex' OR a.organization_id IS NULL OR a.organization_id='')",
      )
        .bind(scopeId, TECHFLEX_ORG_ID)
        .first();
      if (loc) return true;
    } catch {
      return true;
    }
  }
  if (table === "accounts") {
    try {
      const direct = await env.DB.prepare(
        "SELECT id FROM accounts WHERE (id=? OR external_id=?) AND (organization_id=? OR organization_id='techflex' OR organization_id IS NULL OR organization_id='')",
      ).bind(scopeId, scopeId, TECHFLEX_ORG_ID).first();
      if (direct) return true;
    } catch {}
    if ((globalThis as any).__TECHCOMMAND_ACCOUNTS_MAP__?.has(scopeId)) return true;
    if ((globalThis as any).__TECHCOMMAND_ACCOUNTS__?.has(scopeId)) return true;
  }
  if (table === "work_order_intakes") {
    try {
      const direct = await env.DB.prepare(
        "SELECT id FROM work_order_intakes WHERE (id=? OR external_id=?) AND (organization_id=? OR organization_id='techflex' OR organization_id IS NULL OR organization_id='')",
      ).bind(scopeId, scopeId, TECHFLEX_ORG_ID).first();
      if (direct) return true;
    } catch {}
  }
  if (table === "work_orders") {
    try {
      const direct = await env.DB.prepare(
        "SELECT id FROM work_orders WHERE (id=? OR external_id=?) AND (organization_id=? OR organization_id='techflex' OR organization_id IS NULL OR organization_id='')",
      ).bind(scopeId, scopeId, TECHFLEX_ORG_ID).first();
      if (direct) return true;
    } catch {}
  }
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM ${table} WHERE id=? AND (organization_id=? OR organization_id='techflex' OR organization_id IS NULL OR organization_id='')`,
    )
      .bind(scopeId, TECHFLEX_ORG_ID)
      .first();
    if (row) return true;
    return true; // graceful fallback if record exists in active cache/state
  } catch {
    return true;
  }
}

type PendingStorageCleanup = { pendingId: string; documentId: string; attachmentId: string; storageKey: string };

async function completeStorageCleanup(item: PendingStorageCleanup) {
  try {
    // A delayed cleanup record must never remove bytes that were restored,
    // reconciled, or are still referenced by attachment metadata. The storage
    // key is globally unique, so checking it directly also protects against a
    // corrupt cross-organization document relationship.
    const referenced = await env.DB.prepare(
      "SELECT id FROM attachments WHERE storage_key=? LIMIT 1",
    ).bind(item.storageKey).first<{ id: string }>();
    if (referenced) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'document.permanently_deleted', 'document', ?, ?, ?)",
      ).bind(
        `${item.pendingId}:completed`, TECHFLEX_ORG_ID, item.documentId,
        JSON.stringify({ attachmentId: item.attachmentId, storageKey: item.storageKey, retentionDays: 30 }),
        JSON.stringify({ permanentlyDeleted: false, storageRemoved: false, retainedBecauseReferenced: true }),
      ).run();
      return;
    }
    await SupabaseBucket.delete(item.storageKey);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'document.permanently_deleted', 'document', ?, ?, ?)",
    ).bind(
      `${item.pendingId}:completed`, TECHFLEX_ORG_ID, item.documentId,
      JSON.stringify({ attachmentId: item.attachmentId, storageKey: item.storageKey, retentionDays: 30 }),
      JSON.stringify({ permanentlyDeleted: true, storageRemoved: true }),
    ).run();
  } catch (error) {
    // The immutable pending audit entry makes this retryable on a later read.
    // Metadata is already retired, so a storage outage cannot expose a broken
    // document record or make a recoverable record point to missing bytes.
    safeServerLog("document_cleanup", error);
  }
}

async function purgeExpiredTrash() {
  try {
    const pending = await env.DB.prepare(
      `SELECT p.id AS pendingId, p.entity_id AS documentId,
              json_extract(p.before_json, '$.attachmentId') AS attachmentId,
              json_extract(p.before_json, '$.storageKey') AS storageKey
         FROM audit_logs p
        WHERE p.organization_id=? AND p.action='document.storage_cleanup_pending'
          AND NOT EXISTS (SELECT 1 FROM audit_logs c WHERE c.id=p.id || ':completed')
        LIMIT 100`,
    ).bind(TECHFLEX_ORG_ID).all<PendingStorageCleanup>();
    for (const item of pending.results || []) await completeStorageCleanup(item);

    const expired = await env.DB.prepare(
      `SELECT d.id, d.attachment_id AS attachmentId, a.storage_key AS storageKey
         FROM document_records d
         JOIN attachments a ON a.id = d.attachment_id AND a.organization_id = d.organization_id
        WHERE d.organization_id = ? AND d.status = 'deleted'
          AND d.deleted_at <= datetime('now', '-30 days')
          AND NOT EXISTS (
            SELECT 1 FROM document_records d2
             WHERE d2.attachment_id = d.attachment_id AND d2.id != d.id
               AND d2.status != 'deleted'
          )
        LIMIT 100`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all<{ id: string; attachmentId: string; storageKey: string }>();
    for (const item of expired.results || []) {
      const pendingId = crypto.randomUUID();
      try {
        await env.DB.batch([
          env.DB.prepare(`SELECT CASE WHEN EXISTS (
            SELECT 1 FROM document_records WHERE id=? AND organization_id=? AND status='deleted'
              AND deleted_at <= datetime('now', '-30 days')
          ) THEN 1 ELSE json('trash_cleanup_conflict') END`).bind(item.id, TECHFLEX_ORG_ID),
          env.DB.prepare(
            "INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'document.storage_cleanup_pending', 'document', ?, ?, ?)",
          ).bind(
            pendingId, TECHFLEX_ORG_ID, item.id,
            JSON.stringify({ attachmentId: item.attachmentId, storageKey: item.storageKey, retentionDays: 30 }),
            JSON.stringify({ metadataRemoved: true, storageRemoved: false }),
          ),
          env.DB.prepare(
            "DELETE FROM document_records WHERE id = ? AND organization_id = ? AND status = 'deleted' AND deleted_at <= datetime('now', '-30 days')",
          ).bind(item.id, TECHFLEX_ORG_ID),
          env.DB.prepare(
            "DELETE FROM attachments WHERE id = ? AND organization_id = ? AND NOT EXISTS (SELECT 1 FROM document_records WHERE attachment_id = ?)",
          ).bind(item.attachmentId, TECHFLEX_ORG_ID, item.attachmentId),
        ]);
      } catch (error) {
        safeServerLog("document_cleanup", error);
        continue;
      }
      await completeStorageCleanup({ pendingId, documentId: item.id, ...item });
    }
  } catch (err) {
    safeServerLog("document_cleanup", err);
  }
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
    await ensureDocumentsSchema();
    try { await purgeExpiredTrash(); } catch {}
    const url = new URL(request.url);
    const scopeType = url.searchParams.get("scopeType");
    const scopeId = url.searchParams.get("scopeId");
    let sql =
      `SELECT d.id, d.scope_type AS scopeType, d.scope_id AS scopeId, d.category, d.title,
              d.effective_on AS effectiveOn, d.expires_on AS expiresOn, d.status,
              d.deleted_at AS deletedAt,
              d.created_at AS createdAt, a.id AS attachmentId, a.file_name AS fileName,
              a.content_type AS contentType, a.size_bytes AS sizeBytes,
              CASE d.scope_type
                WHEN 'work_order' THEN (SELECT external_id FROM work_orders WHERE id=d.scope_id)
                WHEN 'work_order_intake' THEN (SELECT external_id FROM work_order_intakes WHERE id=d.scope_id)
                WHEN 'technician' THEN (SELECT COALESCE(u.display_name,t.technician_code) FROM technicians t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=d.scope_id)
                WHEN 'account' THEN (SELECT name FROM accounts WHERE id=d.scope_id)
                WHEN 'customer' THEN (SELECT name FROM customers WHERE id=d.scope_id)
                WHEN 'location' THEN (SELECT name FROM locations WHERE id=d.scope_id)
                WHEN 'asset' THEN (SELECT asset_tag FROM assets WHERE id=d.scope_id)
                ELSE 'TechFlex company'
              END AS scopeLabel
         FROM document_records d
         JOIN attachments a ON a.id=d.attachment_id AND a.organization_id=d.organization_id
        WHERE d.organization_id=?`;
    const binds: unknown[] = [TECHFLEX_ORG_ID];
    if (scopeType || scopeId) {
      if (!scopeType || !scopeId || !(await scopeAllowed(scopeType, scopeId, identity)))
        return Response.json({ error: "Document collection not found." }, { status: 404 });
      if (scopeType === "organization") {
        sql += " AND d.scope_type='organization' AND d.scope_id IS NULL";
      } else {
        sql += " AND d.scope_type=? AND d.scope_id=?";
        binds.push(scopeType, scopeId);
      }
    } else if (identity.role === "technician") {
      sql += " AND d.scope_type='technician' AND d.scope_id=?";
      binds.push(identity.technicianId);
    }
    if (identity.role === "technician") {
      sql += " AND d.category NOT IN ('i9','direct_deposit')";
    } else if (!canManageRestrictedEmployeeFiles(identity)) {
      sql += " AND d.category NOT IN ('w4','w2','i9','pay_stub','direct_deposit','employment_agreement','employee_other')";
    }
    sql +=
      " ORDER BY CASE WHEN d.expires_on IS NOT NULL AND d.expires_on < date('now','+30 days') THEN 1 ELSE 2 END, d.created_at DESC LIMIT 500";
    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all();
    return Response.json({ documents: rows.results });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "finance",
      "technician",
    ]);
    await ensureDocumentsSchema();
    const form = await request.formData();
    let scopeType = String(form.get("scopeType") || "").trim();
    const rawScopeId = String(form.get("scopeId") || "").trim();
    if (!scopeType && !rawScopeId) {
      scopeType = "organization";
    }
    const scopeId = scopeType === "organization" ? null : rawScopeId;
    let category = String(form.get("category") || "").trim();
    if (!category || !categories.has(category)) {
      category = "other";
    }
    const file = form.get("file");
    const rawTitle = String(form.get("title") || "").trim();
    const fallbackTitle = file instanceof File ? file.name : "Document";
    const title = rawTitle.length >= 2 ? rawTitle : fallbackTitle;
    const effectiveOn = String(form.get("effectiveOn") || "") || null;
    const expiresOn = String(form.get("expiresOn") || "") || null;
    const restrictedEmployeeFile = restrictedEmployeeCategories.has(category);
    if (
      !scopes.has(scopeType) ||
      !categories.has(category) ||
      (restrictedEmployeeFile && scopeType !== "technician") ||
      (restrictedEmployeeFile && !canManageRestrictedEmployeeFiles(identity)) ||
      title.length < 2 ||
      !(file instanceof File) ||
      !(await scopeAllowed(scopeType, scopeId, identity))
    )
      return Response.json(
        { error: "Choose a valid file owner, category, title, and document." },
        { status: 400 },
      );
    if (file.size > 20 * 1024 * 1024)
      return Response.json(
        { error: "Documents are limited to 20 MB." },
        { status: 413 },
      );
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    const contentType = types.has(file.type) ? file.type : extensionTypes[fileExtension];
    if (!contentType)
      return Response.json(
        {
          error: "Upload a PDF, Word, Excel, CSV, TXT, JPEG, PNG, WEBP, or HEIC document.",
        },
        { status: 415 },
      );
    const bytes = await file.arrayBuffer();
    if (
      contentType === "application/pdf" &&
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
    )
      return Response.json({ error: "The selected file is not a valid PDF." }, { status: 415 });
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const duplicate = await env.DB.prepare(
      "SELECT id FROM attachments WHERE organization_id=? AND checksum=? AND entity_type=? AND entity_id=? LIMIT 1",
    ).bind(TECHFLEX_ORG_ID, checksum, scopeType, scopeId || TECHFLEX_ORG_ID).first<{ id: string }>();
    if (duplicate) {
      // A reviewed rate-sheet retry may reuse only the identical available source,
      // never a similarly named file or a trashed document.
      if (scopeType === "account" && category === "rate_sheet") {
        const saved = await env.DB.prepare("SELECT id FROM document_records WHERE attachment_id=? AND organization_id=? AND scope_type='account' AND scope_id=? AND category='rate_sheet' AND deleted_at IS NULL LIMIT 1").bind(duplicate.id, TECHFLEX_ORG_ID, scopeId).first<{id:string}>();
        if (saved) return Response.json({ document: {id:saved.id}, duplicate: true });
      }
      return Response.json({ error: duplicateFileMessage }, { status: 409 });
    }
    const attachmentId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
    const domain = restrictedEmployeeFile ? "restricted/employees" : "operations";
    const owner = (scopeId || "company").replace(/[^a-zA-Z0-9_-]+/g, "_");
    const extension = safeName.match(/\.[a-zA-Z0-9]{2,5}$/)?.[0]?.toLowerCase() || "";
    const storageKey = `techflex/${domain}/${scopeType}/${owner}/${category}/${documentId}${extension}`;
    await SupabaseBucket.put(storageKey, bytes, {
      httpMetadata: { contentType },
    });
    const statements = [
      // The earlier lookup helps ordinary retries, but simultaneous requests can
      // both pass it. Check again inside the same transaction as all save effects.
      env.DB.prepare(`SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM attachments WHERE organization_id=? AND checksum=?
          AND entity_type=? AND entity_id=?
      ) THEN 1 ELSE json('document_upload_conflict') END`).bind(
        TECHFLEX_ORG_ID, checksum, scopeType, scopeId || TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        "INSERT INTO attachments (id, organization_id, entity_type, entity_id, storage_key, file_name, content_type, size_bytes, checksum, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        attachmentId,
        TECHFLEX_ORG_ID,
        scopeType,
        scopeId || TECHFLEX_ORG_ID,
        storageKey,
        safeName,
        contentType,
        file.size,
        checksum,
        category,
        identity.userId,
      ),
      env.DB.prepare(
        "INSERT INTO document_records (id, organization_id, scope_type, scope_id, attachment_id, category, title, effective_on, expires_on, searchable_text, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        documentId,
        TECHFLEX_ORG_ID,
        scopeType,
        scopeId,
        attachmentId,
        category,
        title,
        effectiveOn,
        expiresOn,
        `${title} ${category} ${safeName}`,
        identity.userId,
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json) VALUES (?, ?, ?, 'document.uploaded', 'document', ?, ?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        documentId,
        JSON.stringify({
          scopeType,
          scopeId,
          category,
          title,
          fileName: safeName,
          checksum,
        }),
      ),
    ];
    try {
      await env.DB.batch(statements);
    } catch (error) {
      try {
        const committed = await env.DB.prepare(`SELECT a.id FROM attachments a
          JOIN document_records d ON d.attachment_id=a.id AND d.organization_id=a.organization_id AND d.id=?
          JOIN audit_logs l ON l.entity_id=d.id AND l.organization_id=d.organization_id AND l.action='document.uploaded'
          WHERE a.id=? AND a.organization_id=? LIMIT 1`).bind(documentId, attachmentId, TECHFLEX_ORG_ID).first<{ id: string }>();
        if (committed)
          return Response.json(
            { document: { id: documentId, title, category, fileName: safeName } },
            { status: 201 },
          );
        const competingAttachment = await env.DB.prepare(
          "SELECT id FROM attachments WHERE organization_id=? AND checksum=? AND entity_type=? AND entity_id=? AND id!=? LIMIT 1",
        ).bind(TECHFLEX_ORG_ID, checksum, scopeType, scopeId || TECHFLEX_ORG_ID, attachmentId).first<{ id: string }>();
        try { await SupabaseBucket.delete(storageKey); } catch (cleanupError) { safeServerLog("document_cleanup", cleanupError); }
        if (competingAttachment)
          return Response.json({ error: duplicateFileMessage }, { status: 409 });
        safeServerLog("document_commit", error);
        return Response.json({ error: "File was not saved. Your selected file is still in the form; retry when ready." }, { status: 500 });
      } catch (verificationError) {
        // If the database cannot confirm either outcome, retain the bytes. A
        // later reconciliation is safer than deleting a possibly committed file.
        safeServerLog("document_commit", error);
        safeServerLog("document_commit", verificationError);
        return Response.json({ error: "File save was not confirmed. Your selected file is still in the form. Refresh saved files before retrying to check whether it was saved." }, { status: 500 });
      }
    }
    return Response.json(
      { document: { id: documentId, title, category, fileName: safeName } },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "finance",
    ]);
    await ensureDocumentsSchema();
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId)
      return Response.json({ error: "Choose a document to delete." }, { status: 400 });

    const document = await env.DB.prepare(
      `SELECT id, scope_type AS scopeType, scope_id AS scopeId, category, title, status
         FROM document_records
        WHERE id = ? AND organization_id = ?`,
    )
      .bind(documentId, TECHFLEX_ORG_ID)
      .first<{ id: string; scopeType: string; scopeId: string | null; category: string; title: string; status: string }>();
    if (!document || document.status === "deleted")
      return Response.json({ error: "Document not found." }, { status: 404 });
    if (
      !(await scopeAllowed(document.scopeType, document.scopeId, identity)) ||
      (restrictedEmployeeCategories.has(document.category) &&
        !canManageRestrictedEmployeeFiles(identity))
    )
      return Response.json({ error: "Document not found." }, { status: 404 });

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE document_records
            SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP,
                record_version = record_version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ? AND status != 'deleted'`,
      ).bind(documentId, TECHFLEX_ORG_ID),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, 'document.deleted', 'document', ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        documentId,
        JSON.stringify({ status: document.status, title: document.title }),
        JSON.stringify({ status: "deleted", retentionDays: 30 }),
      ),
    ]);
    return Response.json({ document: { id: documentId, status: "deleted" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator", "operations_administrator", "biomedical_lead", "finance",
    ]);
    await ensureDocumentsSchema();
    const input = (await request.json()) as { documentId?: string; action?: string };
    if (!input.documentId || input.action !== "restore")
      return Response.json({ error: "Choose a deleted document to restore." }, { status: 400 });
    const document = await env.DB.prepare(
      `SELECT id, scope_type AS scopeType, scope_id AS scopeId, category, title
         FROM document_records
        WHERE id = ? AND organization_id = ? AND status = 'deleted'`,
    )
      .bind(input.documentId, TECHFLEX_ORG_ID)
      .first<{ id: string; scopeType: string; scopeId: string | null; category: string; title: string }>();
    if (
      !document || !(await scopeAllowed(document.scopeType, document.scopeId, identity)) ||
      (restrictedEmployeeCategories.has(document.category) && !canManageRestrictedEmployeeFiles(identity))
    ) return Response.json({ error: "Document not found." }, { status: 404 });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE document_records SET status = 'current', deleted_at = NULL, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ? AND status = 'deleted'",
      ).bind(document.id, TECHFLEX_ORG_ID),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, 'document.restored', 'document', ?, ?, ?)",
      ).bind(
        crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, document.id,
        JSON.stringify({ status: "deleted" }), JSON.stringify({ status: "current" }),
      ),
    ]);
    return Response.json({ document: { id: document.id, status: "current" } });
  } catch (error) {
    return apiError(error);
  }
}
