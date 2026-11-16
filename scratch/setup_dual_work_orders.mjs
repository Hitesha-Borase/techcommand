import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite');
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

// 1. Customers for each account
// Hospital Lead Contact
db.prepare(`
  INSERT OR REPLACE INTO customers (
    id, organization_id, account_id, location_id, name, email, phone,
    address_1, city, state, postal_code, status, record_version, created_at, updated_at
  ) VALUES (
    'cust_hospital_01', 'techflex', 'acc_hospital_01', 'loc_hospital_01',
    'Dr. Robert Chen (Surgical Director)', 'rchen@ohiohealth.org', '614-566-5000',
    '3535 Olentangy River Rd', 'Columbus', 'OH', '43214', 'active', 1, ?, ?
  )
`).run(now, now);

// Mobility Customer
db.prepare(`
  INSERT OR REPLACE INTO customers (
    id, organization_id, account_id, location_id, name, email, phone,
    address_1, city, state, postal_code, status, record_version, created_at, updated_at
  ) VALUES (
    'cust_mobility_02', 'techflex', 'acc_mobility_02', 'loc_mobility_02',
    'Eleanor Vance (Patient)', 'eleanor.vance@example.com', '614-555-0188',
    '611 Park Meadow Rd, Suite B', 'Westerville', 'OH', '43081', 'active', 1, ?, ?
  )
`).run(now, now);

// 2. Assets
// Steris Amsco 400 for Hospital
db.prepare(`
  INSERT OR REPLACE INTO assets (
    id, organization_id, account_id, location_id, asset_tag, manufacturer, model,
    serial_number, description, department, risk_class, status, in_service_date,
    last_pm_on, next_pm_due_on, pm_interval_months, created_at, updated_at, record_version
  ) VALUES (
    'asset_bio_autoclave_01', 'techflex', 'acc_hospital_01', 'loc_hospital_01', 'TAG-BIO-001', 'Steris', 'Amsco 400',
    'SN-STERIS-4412', 'Steam Sterilizer / Autoclave - Surgery Suite', 'Sterile Processing', 'high', 'in_service', '2025-01-15',
    '2026-05-10', '2026-11-20', 6, ?, ?, 1
  )
`).run(now, now);

// Permobil M3 Corpus for SpinLife Mobility
db.prepare(`
  INSERT OR REPLACE INTO assets (
    id, organization_id, account_id, location_id, asset_tag, manufacturer, model,
    serial_number, description, department, risk_class, status, in_service_date,
    last_pm_on, next_pm_due_on, pm_interval_months, created_at, updated_at, record_version
  ) VALUES (
    'asset_mobility_permobil_02', 'techflex', 'acc_mobility_02', 'loc_mobility_02', 'TAG-DME-002', 'Permobil', 'M3 Corpus',
    'SN-PERM-8891', 'Complex Rehab Power Wheelchair with Tilt/Recline', 'Rehab Seating', 'medium', 'in_service', '2024-06-01',
    '2026-05-15', '2026-11-25', 6, ?, ?, 1
  )
`).run(now, now);

// 3. Work Order 1: Hospital Biomedical Safety Inspection & PM
const bioSkills = JSON.stringify({
  discipline: "biomedical",
  equipmentType: "Steam Sterilizer / Autoclave",
  manufacturer: "Steris",
  model: "Amsco 400",
  instructions: [
    "Verify chamber pressure sensor transducer against certified master gauge (30 psig ± 0.5)",
    "Perform NFPA 99 electrical safety ground wire resistance (< 0.200 Ω)",
    "Perform chassis leakage current test in normal (< 100 µA) and single-fault reverse condition (< 300 µA)",
    "Inspect chamber door silicone seal gasket and safety interlock microswitches",
    "Affix updated Green NFPA 99 Biomedical Electrical Safety pass label with calibration expiration"
  ]
});

db.prepare(`
  INSERT OR REPLACE INTO work_orders (
    id, organization_id, account_id, location_id, customer_id, asset_id,
    external_source, external_id, service_type, priority, status, summary,
    description, required_skills_json, required_technician_count,
    scheduled_start, accepted_price_cents, estimated_cost_cents,
    gross_margin_basis_points, offered_payment_cents, created_at, updated_at, record_version
  ) VALUES (
    'wo_bio_autoclave_01', 'techflex', 'acc_hospital_01', 'loc_hospital_01', 'cust_hospital_01', 'asset_bio_autoclave_01',
    'manual', 'WO-BIO-2026-001', 'preventive_maintenance', 'high', 'assigned',
    'Steris Amsco 400 - Clinical Electrical Safety & Calibration PM',
    'Hospital OR Suite 3: Semi-annual NFPA 99 electrical safety testing, chamber pressure transducer calibration, door gasket replacement.',
    ?, 1, '2026-11-14T09:00:00.000Z', 35000, 18000, 4857, 17500, ?, ?, 1
  )
`).run(bioSkills, now, now);

// Assignment to Brandon Schlaegel (TECH-BIO-001)
db.prepare(`
  INSERT OR REPLACE INTO work_order_assignments (
    id, work_order_id, technician_id, role, status, offered_at, responded_at, created_at, updated_at
  ) VALUES (
    'assign_bio_01', 'wo_bio_autoclave_01', 'add0f8a7-07b4-4134-8736-03d84a4f9fca', 'primary', 'assigned', ?, ?, ?, ?
  )
`).run(now, now, now, now);

// 4. Work Order 2: Mobility Wheelchair Repair
const dmeSkills = JSON.stringify({
  discipline: "dme_mobility",
  equipmentType: "Complex Rehab Power Wheelchair",
  manufacturer: "Permobil",
  model: "M3 Corpus",
  instructions: [
    "Confirm jerky joystick throttle complaint in reverse drive profile",
    "Measure open-circuit battery voltage and conduct 15A load drop test across dual 12V 55Ah AGM cells",
    "Connect R-Net dongle and calibrate joystick throw sensitivity and center deadband to manufacturer spec",
    "Inspect caster fork bearings, anti-tip wheels, and drive tire tread depth (> 2/32 in)",
    "Perform loaded test drive over 50-foot indoor corridor; obtain patient/caregiver signoff"
  ]
});

db.prepare(`
  INSERT OR REPLACE INTO work_orders (
    id, organization_id, account_id, location_id, customer_id, asset_id,
    external_source, external_id, service_type, priority, status, summary,
    description, required_skills_json, required_technician_count,
    scheduled_start, accepted_price_cents, estimated_cost_cents,
    gross_margin_basis_points, offered_payment_cents, created_at, updated_at, record_version
  ) VALUES (
    'wo_dme_wheelchair_02', 'techflex', 'acc_mobility_02', 'loc_mobility_02', 'cust_mobility_02', 'asset_mobility_permobil_02',
    'manual', 'WO-DME-2026-002', 'repair_single', 'normal', 'assigned',
    'Permobil M3 Corpus - Joystick Deadband Calibration & 24V Load Test',
    'Patient reports jerking during reverse maneuvers. Complete 24V dual AGM load test, recalibrate R-Net joystick deadband, test seat tilt.',
    ?, 1, '2026-11-14T13:30:00.000Z', 25000, 12000, 5200, 15000, ?, ?, 1
  )
`).run(dmeSkills, now, now);

// Assignment to Marcus Vance (TECH-DME-002)
db.prepare(`
  INSERT OR REPLACE INTO work_order_assignments (
    id, work_order_id, technician_id, role, status, offered_at, responded_at, created_at, updated_at
  ) VALUES (
    'assign_dme_02', 'wo_dme_wheelchair_02', 'tech_dme_02', 'primary', 'assigned', ?, ?, ?, ?
  )
`).run(now, now, now, now);

console.log('✅ Successfully configured Dual-Discipline Test Environment!');
console.log('\n--- ACCOUNTS ---');
console.table(db.prepare('SELECT id, name, account_type, service_discipline FROM accounts').all());

console.log('\n--- TECHNICIANS ---');
console.table(db.prepare(`
  SELECT t.id, t.technician_code, u.display_name, t.service_disciplines_json
  FROM technicians t
  JOIN users u ON u.id = t.user_id
`).all());

console.log('\n--- WORK ORDERS & ASSIGNMENTS ---');
console.table(db.prepare(`
  SELECT 
    w.external_id,
    w.summary,
    acc.name AS account_name,
    acc.service_discipline,
    u.display_name AS assigned_tech,
    t.technician_code,
    w.status,
    w.scheduled_start
  FROM work_orders w
  JOIN accounts acc ON acc.id = w.account_id
  LEFT JOIN work_order_assignments a ON a.work_order_id = w.id
  LEFT JOIN technicians t ON t.id = a.technician_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE w.external_id IN ('WO-BIO-2026-001', 'WO-DME-2026-002')
`).all());
