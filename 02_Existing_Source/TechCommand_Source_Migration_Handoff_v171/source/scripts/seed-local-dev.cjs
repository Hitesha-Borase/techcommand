const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const dbPath = path.resolve(__dirname, "../.local-dev.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
  INSERT OR IGNORE INTO organizations (id, legal_name, display_name, timezone, currency)
  VALUES ('techflex', 'Astute Restorations LLC', 'TechFlex Mobility Solutions', 'America/New_York', 'USD');

  INSERT OR IGNORE INTO quickbooks_connections (id, organization_id, realm_id, company_name, is_connected, last_sync_at, auto_sync_enabled)
  VALUES ('qbc-techflex-primary', 'techflex', '', 'TechFlex Mobility Solutions', 0, NULL, 0);
  UPDATE quickbooks_connections SET is_connected = 0, realm_id = '', last_sync_at = NULL WHERE organization_id = 'techflex';
`);

console.log("Seeded .local-dev.sqlite successfully!");
