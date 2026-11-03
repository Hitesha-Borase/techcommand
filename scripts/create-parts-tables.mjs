import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = resolve("02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
const db = new DatabaseSync(dbPath);

const ddl = `
CREATE TABLE IF NOT EXISTS parts_catalog (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  part_number TEXT NOT NULL,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT 'Generic OEM',
  category TEXT NOT NULL DEFAULT 'Hardware & Cables',
  warehouse_stock INTEGER NOT NULL DEFAULT 0,
  total_van_stock INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  unit_cost REAL NOT NULL DEFAULT 0,
  retail_price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'In Stock',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_catalog_org_num ON parts_catalog(organization_id, part_number);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_cat ON parts_catalog(organization_id, category);

CREATE TABLE IF NOT EXISTS van_stock (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  van_id TEXT NOT NULL,
  van_name TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  technician_id TEXT,
  part_id TEXT,
  part_number TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Hardware & Cables',
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  par_level INTEGER NOT NULL DEFAULT 2,
  unit_cost REAL NOT NULL DEFAULT 0,
  retail_price REAL NOT NULL DEFAULT 0,
  bin_location TEXT DEFAULT 'BIN-A1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_van_stock_van_part ON van_stock(organization_id, van_id, part_number);
CREATE INDEX IF NOT EXISTS idx_van_stock_van ON van_stock(organization_id, van_id);

CREATE TABLE IF NOT EXISTS installed_parts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  technician_id TEXT,
  equipment_model TEXT NOT NULL,
  serial_number TEXT,
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  warranty_status TEXT NOT NULL DEFAULT 'Billable to Customer',
  installed_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_installed_parts_wo ON installed_parts(organization_id, work_order_id);

CREATE TABLE IF NOT EXISTS parts_purchase_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  po_number TEXT NOT NULL,
  vendor TEXT NOT NULL,
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  total_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Ordered',
  tracking_number TEXT,
  order_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_po_number ON parts_purchase_orders(organization_id, po_number);
CREATE INDEX IF NOT EXISTS idx_parts_po_vendor ON parts_purchase_orders(organization_id, vendor);
`;

db.exec(ddl);

// Seed initial records for parts_catalog so user can verify immediately
const orgId = "org_techflex_primary";

const checkExisting = db.prepare("SELECT COUNT(*) as count FROM parts_catalog").get();
if (checkExisting.count === 0) {
  const insertCatalog = db.prepare(`
    INSERT INTO parts_catalog (id, organization_id, part_number, name, manufacturer, category, warehouse_stock, total_van_stock, min_threshold, unit_cost, retail_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCatalog.run("cat-1", orgId, "BAT-12V-55AH", "12V 55Ah Gel Cell Deep Cycle Battery", "MK Battery", "Batteries", 24, 8, 15, 110, 185, "In Stock");
  insertCatalog.run("cat-2", orgId, "JOY-VR2-4K", "PG Drives VR2 4-Key Joystick Controller", "Curtiss-Wright", "Electronics", 6, 3, 5, 245, 420, "In Stock");
  insertCatalog.run("cat-3", orgId, "MOT-INV-TDX", "Invacare TDX SP2 4-Pole Motor/Gearbox LH", "Invacare", "Motors & Actuators", 2, 1, 3, 480, 790, "Low Stock");
  insertCatalog.run("cat-4", orgId, "TIR-14X3-FOAM", "14x3 Foam-Filled Drive Tire (Grey)", "Primo Primo", "Tires & Casters", 32, 12, 20, 55, 95, "In Stock");
  insertCatalog.run("cat-5", orgId, "BIO-CAL-SEN-01", "O2 Flow Sensor Transducer Kit", "Philips Healthcare", "Biomedical", 4, 5, 6, 180, 290, "Low Stock");
  insertCatalog.run("cat-6", orgId, "ACT-LIN-LINAK", "Linak LA31 High-Torque Lift Actuator", "Linak Inc", "Motors & Actuators", 1, 2, 4, 320, 560, "Critical");
  insertCatalog.run("cat-7", orgId, "BIO-BATT-LION", "Stryker Smart Power 14.4V Lithium Pack", "Stryker Medical", "Biomedical", 8, 4, 5, 310, 520, "In Stock");

  const insertVan = db.prepare(`
    INSERT INTO van_stock (id, organization_id, van_id, van_name, technician_name, part_number, name, category, qty_on_hand, par_level, unit_cost, retail_price, bin_location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertVan.run("vs-1", orgId, "van-101", "Van 101", "Marcus Vance", "BAT-12V-55AH", "12V 55Ah Gel Cell Deep Cycle Battery", "Batteries", 4, 6, 110, 185, "BIN-A1");
  insertVan.run("vs-2", orgId, "van-101", "Van 101", "Marcus Vance", "JOY-VR2-4K", "PG Drives VR2 4-Key Joystick Controller", "Electronics", 2, 2, 245, 420, "BIN-B3");
  insertVan.run("vs-3", orgId, "van-101", "Van 101", "Marcus Vance", "TIR-14X3-FOAM", "14x3 Foam-Filled Drive Tire (Grey)", "Tires & Casters", 6, 4, 55, 95, "BIN-C1");
  insertVan.run("vs-4", orgId, "van-102", "Van 102", "Elena Rostova", "BIO-CAL-SEN-01", "O2 Flow Sensor Transducer Kit", "Biomedical", 3, 4, 180, 290, "BIN-BIO-1");
  insertVan.run("vs-5", orgId, "van-103", "Van 103", "David Chen", "ACT-LIN-LINAK", "Linak LA31 High-Torque Lift Actuator", "Motors & Actuators", 1, 2, 320, 560, "BIN-A2");

  const insertInstalled = db.prepare(`
    INSERT INTO installed_parts (id, organization_id, work_order_id, technician_name, equipment_model, serial_number, part_number, part_name, qty, unit_price, warranty_status, installed_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertInstalled.run("inst-1", orgId, "WO-2026-8812", "Marcus Vance", "Permobil M300 Corpus", "M3-948102-OH", "BAT-12V-55AH", "12V 55Ah Gel Cell Deep Cycle Battery", 2, 185, "Billable to Customer", "Today at 09:30 AM");

  const insertPO = db.prepare(`
    INSERT INTO parts_purchase_orders (id, organization_id, po_number, vendor, part_number, part_name, qty, total_cost, status, tracking_number, order_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPO.run("po-1", orgId, "PO-77401", "MK Battery Inc.", "BAT-12V-55AH", "12V 55Ah Gel Cell Deep Cycle Battery", 20, 2200, "Shipped", "1Z9999999999999991", "Oct 28, 2026");
}

console.log("SUCCESS: Parts & Inventory tables created and seeded!");

