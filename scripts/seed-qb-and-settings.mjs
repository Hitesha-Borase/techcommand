import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
const db = new DatabaseSync(dbPath);

console.log("Checking and seeding QuickBooks connection & ledger...");

// 1. Seed quickbooks_connections if empty
const existingConn = db.prepare("SELECT * FROM quickbooks_connections WHERE organization_id = 'techflex'").get();
if (!existingConn) {
  db.prepare(`
    INSERT INTO quickbooks_connections (id, organization_id, realm_id, company_name, is_connected, last_sync_at, auto_sync_enabled, created_at, updated_at)
    VALUES ('qbc-techflex-primary', 'techflex', '934145209382', 'TechFlex Mobility Solutions', 1, datetime('now'), 1, datetime('now'), datetime('now'))
  `).run();
  console.log("Seeded primary QuickBooks connection.");
} else {
  console.log("QuickBooks connection already exists:", existingConn);
}

// 2. Ensure system_settings has custom_config_json column (safe migration)
const cols = db.prepare("PRAGMA table_info(system_settings)").all();
const hasCustomConfig = cols.some((c) => c.name === "custom_config_json");
if (!hasCustomConfig) {
  db.prepare("ALTER TABLE system_settings ADD COLUMN custom_config_json TEXT").run();
  console.log("Added custom_config_json column to system_settings.");
}

// 3. Seed 6 initial QuickBooks invoices in quickbooks_sync_ledger
const seedInvoices = [
  {
    id: "qb-1",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0891",
    qboId: "QB-10942",
    syncStatus: "Synced",
    attemptCount: 1,
    lastAttemptAt: "Today at 10:45 AM",
    errorMessage: null,
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0891",
      workOrderId: "WO-2026-8812",
      customerName: "Ohio VA Healthcare System",
      amount: 1480.00,
      paymentStatus: "Net 30"
    })
  },
  {
    id: "qb-2",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0892",
    qboId: "QB-10943",
    syncStatus: "Synced",
    attemptCount: 1,
    lastAttemptAt: "Today at 10:45 AM",
    errorMessage: null,
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0892",
      workOrderId: "WO-2026-8809",
      customerName: "MetroHealth Biomedical",
      amount: 2150.00,
      paymentStatus: "Paid"
    })
  },
  {
    id: "qb-3",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0893",
    qboId: null,
    syncStatus: "Pending",
    attemptCount: 1,
    lastAttemptAt: "Scheduled for next batch",
    errorMessage: null,
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0893",
      workOrderId: "WO-2026-8815",
      customerName: "SpinLife DME Mobility",
      amount: 645.00,
      paymentStatus: "Net 30"
    })
  },
  {
    id: "qb-4",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0894",
    qboId: null,
    syncStatus: "Pending",
    attemptCount: 1,
    lastAttemptAt: "Scheduled for next batch",
    errorMessage: null,
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0894",
      workOrderId: "WO-2026-8818",
      customerName: "Sunrise Medical Specialty",
      amount: 1220.00,
      paymentStatus: "Pending"
    })
  },
  {
    id: "qb-5",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0888",
    qboId: null,
    syncStatus: "Error",
    attemptCount: 2,
    lastAttemptAt: "Today at 09:12 AM",
    errorMessage: "Account mapping code missing: DME_COLUMBUS_TAX",
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0888",
      workOrderId: "WO-2026-8795",
      customerName: "CareSource Community DME",
      amount: 890.00,
      paymentStatus: "Pending"
    })
  },
  {
    id: "qb-6",
    orgId: "techflex",
    entityType: "invoice",
    entityId: "INV-2026-0885",
    qboId: "QB-10939",
    syncStatus: "Synced",
    attemptCount: 1,
    lastAttemptAt: "Yesterday at 04:30 PM",
    errorMessage: null,
    payload: JSON.stringify({
      invoiceNumber: "INV-2026-0885",
      workOrderId: "WO-2026-8782",
      customerName: "Mount Carmel Rehabilitation",
      amount: 3410.00,
      paymentStatus: "Paid"
    })
  }
];

const insertOrReplaceStmt = db.prepare(`
  INSERT INTO quickbooks_sync_ledger (id, organization_id, entity_type, entity_id, qbo_id, sync_status, sync_direction, attempt_count, last_attempt_at, error_message, response_payload_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    qbo_id = excluded.qbo_id,
    sync_status = excluded.sync_status,
    last_attempt_at = excluded.last_attempt_at,
    error_message = excluded.error_message,
    response_payload_json = excluded.response_payload_json,
    updated_at = datetime('now')
`);

for (const inv of seedInvoices) {
  insertOrReplaceStmt.run(
    inv.id,
    inv.orgId,
    inv.entityType,
    inv.entityId,
    inv.qboId,
    inv.syncStatus,
    inv.attemptCount,
    inv.lastAttemptAt,
    inv.errorMessage,
    inv.payload
  );
}

console.log("Seeded/Updated 6 QuickBooks ledger entries successfully!");
const allLedger = db.prepare("SELECT id, entity_id, qbo_id, sync_status FROM quickbooks_sync_ledger WHERE organization_id = 'techflex'").all();
console.log("Current Ledger in DB:", allLedger);

