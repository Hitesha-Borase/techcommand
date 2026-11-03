-- Parts Catalog & Van Stock
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

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL DEFAULT 'TechFlex Mobility Solutions',
  address TEXT NOT NULL DEFAULT '611 Park Meadow Rd, Suite B',
  city TEXT NOT NULL DEFAULT 'Westerville',
  state TEXT NOT NULL DEFAULT 'OH',
  zip_code TEXT NOT NULL DEFAULT '43081',
  phone TEXT NOT NULL DEFAULT '877-231-TECH',
  email TEXT NOT NULL DEFAULT 'service@techflexmobility.com',
  hub_latitude REAL DEFAULT 40.125,
  hub_longitude REAL DEFAULT -82.932,
  standard_hourly_rate REAL NOT NULL DEFAULT 85.0,
  overtime_hourly_rate REAL NOT NULL DEFAULT 125.0,
  weekend_hourly_rate REAL NOT NULL DEFAULT 145.0,
  travel_mileage_rate REAL NOT NULL DEFAULT 0.65,
  fixed_trip_fee REAL NOT NULL DEFAULT 45.0,
  emergency_dispatch_surcharge REAL NOT NULL DEFAULT 75.0,
  min_billable_hours REAL NOT NULL DEFAULT 1.0,
  max_daily_route_miles INTEGER NOT NULL DEFAULT 250,
  max_jobs_per_tech INTEGER NOT NULL DEFAULT 6,
  origin_precedence TEXT NOT NULL DEFAULT 'hub',
  default_travel_buffer_minutes INTEGER NOT NULL DEFAULT 30,
  require_photo_attestation INTEGER NOT NULL DEFAULT 1,
  enforce_40_percent_margin_floor INTEGER NOT NULL DEFAULT 1,
  auto_sync_quickbooks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Operations Margin Records
CREATE TABLE IF NOT EXISTS operations_margin_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  month_year TEXT NOT NULL,
  client_account TEXT NOT NULL,
  billed_revenue REAL NOT NULL DEFAULT 0,
  direct_labor_cost REAL NOT NULL DEFAULT 0,
  direct_parts_cost REAL NOT NULL DEFAULT 0,
  travel_cost REAL NOT NULL DEFAULT 0,
  total_direct_cost REAL NOT NULL DEFAULT 0,
  gross_margin_dollars REAL NOT NULL DEFAULT 0,
  gross_margin_percent REAL NOT NULL DEFAULT 0,
  meets_guardrail INTEGER NOT NULL DEFAULT 1,
  override_reason TEXT,
  audited_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ops_margin_org_wo ON operations_margin_records(organization_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_ops_margin_month ON operations_margin_records(organization_id, month_year);

CREATE TABLE IF NOT EXISTS operations_kpi_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_billed REAL NOT NULL DEFAULT 0,
  total_direct_cost REAL NOT NULL DEFAULT 0,
  average_gross_margin REAL NOT NULL DEFAULT 0,
  first_time_fix_rate REAL NOT NULL DEFAULT 0,
  sla_compliance_rate REAL NOT NULL DEFAULT 0,
  active_technician_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_kpi_snapshot_date ON operations_kpi_snapshots(organization_id, snapshot_date);

-- QuickBooks Sync Ledger
CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  realm_id TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'TechFlex Mobility QuickBooks',
  is_connected INTEGER NOT NULL DEFAULT 0,
  token_expires_at TEXT,
  last_sync_at TEXT,
  auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quickbooks_sync_ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  qbo_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'Pending',
  sync_direction TEXT NOT NULL DEFAULT 'outbound',
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TEXT,
  error_message TEXT,
  response_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qb_ledger_entity ON quickbooks_sync_ledger(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qb_ledger_status ON quickbooks_sync_ledger(organization_id, sync_status);

-- Dispatch Route Plans
CREATE TABLE IF NOT EXISTS dispatch_route_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  route_date TEXT NOT NULL,
  technician_id TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  vehicle_id TEXT NOT NULL DEFAULT 'Van 101',
  origin_address TEXT NOT NULL DEFAULT '611 Park Meadow Rd, Suite B, Westerville, OH 43081',
  origin_latitude REAL DEFAULT 40.125,
  origin_longitude REAL DEFAULT -82.932,
  destination_address TEXT,
  total_distance_miles REAL NOT NULL DEFAULT 0,
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 0,
  stops_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_route_plans_tech_date ON dispatch_route_plans(organization_id, technician_id, route_date);

CREATE TABLE IF NOT EXISTS dispatch_route_waypoints (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  route_plan_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  appointment_time TEXT,
  stop_status TEXT NOT NULL DEFAULT 'Pending',
  distance_from_last_stop REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_waypoints_route_seq ON dispatch_route_waypoints(organization_id, route_plan_id, stop_sequence);

-- Evidence Document Reviews
CREATE TABLE IF NOT EXISTS evidence_document_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  document_title TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_hash_sha256 TEXT,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  extracted_fields_json TEXT NOT NULL DEFAULT '{}',
  confidence_score REAL NOT NULL DEFAULT 1.0,
  review_status TEXT NOT NULL DEFAULT 'Needs Review',
  reviewer_id TEXT,
  reviewed_at TEXT,
  human_override_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_evidence_reviews_wo ON evidence_document_reviews(organization_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_evidence_reviews_status ON evidence_document_reviews(organization_id, review_status);
