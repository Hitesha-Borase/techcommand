import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite');
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

// 1. Account 1: Hospital / Healthcare Facility (Biomedical)
const hospitalAccountId = 'acc_hospital_01';
db.prepare(`
  INSERT OR REPLACE INTO accounts (id, organization_id, name, account_type, service_discipline, status, billing_email, payment_terms_days, service_level, notes, created_at, updated_at, record_version)
  VALUES (?, 'techflex', 'OhioHealth Riverside Methodist Hospital', 'facility', 'biomedical', 'active', 'biomed-billing@ohiohealth.com', 30, 'standard', 'Major regional hospital campus with 800+ clinical assets', ?, ?, 1)
`).run(hospitalAccountId, now, now);

// Hospital Location
const hospitalLocationId = 'loc_hospital_01';
db.prepare(`
  INSERT OR REPLACE INTO locations (id, account_id, name, location_type, department, status, address_1, city, state, postal_code, country, timezone, latitude, longitude, created_at, updated_at, record_version)
  VALUES (?, ?, 'Main Hospital Tower - Biomedical Engineering', 'healthcare_facility', 'Biomedical Engineering', 'active', '3535 Olentangy River Rd', 'Columbus', 'OH', '43214', 'US', 'America/New_York', 40.035, -83.033, ?, ?, 1)
`).run(hospitalLocationId, hospitalAccountId, now, now);

// 2. Account 2: DME / Mobility Partner
const mobilityAccountId = 'acc_mobility_02';
db.prepare(`
  INSERT OR REPLACE INTO accounts (id, organization_id, name, account_type, service_discipline, status, billing_email, payment_terms_days, service_level, notes, created_at, updated_at, record_version)
  VALUES (?, 'techflex', 'SpinLife Mobility Services & Home Care', 'facility', 'dme_mobility', 'active', 'dispatch@spinlife.com', 30, 'standard', 'Nationwide mobility provider service contract', ?, ?, 1)
`).run(mobilityAccountId, now, now);

// Mobility Location
const mobilityLocationId = 'loc_mobility_02';
db.prepare(`
  INSERT OR REPLACE INTO locations (id, account_id, name, location_type, department, status, address_1, city, state, postal_code, country, timezone, latitude, longitude, created_at, updated_at, record_version)
  VALUES (?, ?, 'Westerville Regional Service Hub', 'warehouse', 'Field Mobility Services', 'active', '611 Park Meadow Rd, Suite B', 'Westerville', 'OH', '43081', 'US', 'America/New_York', 40.125, -82.932, ?, ?, 1)
`).run(mobilityLocationId, mobilityAccountId, now, now);

// 3. Technician 1: Biomedical BMET Lead (Brandon Schlaegel)
db.prepare(`
  UPDATE technicians
     SET service_disciplines_json = '["biomedical"]',
         technician_code = 'TECH-BIO-001',
         dispatch_address_1 = '611 Park Meadow Road',
         dispatch_city = 'Westerville',
         dispatch_state = 'OH',
         dispatch_postal_code = '43081',
         max_radius_miles = 150
   WHERE id = 'add0f8a7-07b4-4134-8736-03d84a4f9fca'
`).run();

// 4. Technician 2: DME Mobility Field Specialist (Marcus Vance)
const dmeUserId = 'user_tech_dme_02';
db.prepare(`
  INSERT OR REPLACE INTO users (id, auth_subject, email, display_name, phone, status, last_seen_at, created_at, updated_at)
  VALUES (?, 'email:marcus.vance@techflexmobility.com', 'marcus.vance@techflexmobility.com', 'Marcus Vance (DME Tech)', '614-555-0244', 'active', ?, ?, ?)
`).run(dmeUserId, now, now, now);

db.prepare(`
  INSERT OR REPLACE INTO memberships (id, organization_id, user_id, role_id, status, created_at, updated_at)
  VALUES ('mem_tech_dme_02', 'techflex', ?, 'role_technician', 'active', ?, ?)
`).run(dmeUserId, now, now);

const dmeTechId = 'tech_dme_02';
db.prepare(`
  INSERT OR REPLACE INTO technicians (
    id, organization_id, user_id, technician_code, employment_type, status, phone, home_postal_code, max_radius_miles,
    payout_type, payout_rate, compensation_tier, current_hourly_rate_cents, protected_rate_cents, rate_status,
    dispatch_address_1, dispatch_city, dispatch_state, dispatch_postal_code, service_disciplines_json,
    created_at, updated_at, record_version
  ) VALUES (
    ?, 'techflex', ?, 'TECH-DME-002', 'contractor', 'active', '614-555-0244', '43215', 75,
    'percentage', 0.55, 'field_tech_1', 2500, 2500, 'active',
    '123 Oak Street', 'Columbus', 'OH', '43215', '["dme_mobility"]',
    ?, ?, 1
  )
`).run(dmeTechId, dmeUserId, now, now);

console.log('--- UPDATED ACCOUNTS ---');
console.table(db.prepare('SELECT id, name, account_type, service_discipline, status FROM accounts').all());

console.log('--- UPDATED TECHNICIANS ---');
console.table(db.prepare('SELECT t.id, t.technician_code, u.display_name, t.service_disciplines_json FROM technicians t JOIN users u ON u.id = t.user_id').all());
