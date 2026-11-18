import { DatabaseSync } from "node:sqlite";
import { readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const projectRoot = resolve("C:/Users/hp/Downloads/Techcommand-OS/02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source");

const dbPaths = [
  join(projectRoot, ".local-dev.sqlite"),
  join(projectRoot, ".local-dev-backup.sqlite"),
];

const miniflareDir = join(projectRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
if (existsSync(miniflareDir)) {
  for (const file of readdirSync(miniflareDir)) {
    if (file.endsWith(".sqlite") && !file.includes("metadata")) {
      dbPaths.push(join(miniflareDir, file));
    }
  }
}

function runSql(sql) {
  for (const p of dbPaths) {
    if (existsSync(p)) {
      try {
        const db = new DatabaseSync(p);
        db.exec(sql);
        console.log(`Updated: ${p}`);
      } catch (err) {
        console.error(`Error updating ${p}:`, err.message);
      }
    }
  }
}

if (process.argv.includes("--clear")) {
  console.log("Clearing all operations reports test records (resetting to 0 / empty period)...");
  runSql(`
    DELETE FROM operations_margin_records WHERE organization_id = 'techflex';
    DELETE FROM operations_kpi_snapshots WHERE organization_id = 'techflex';
  `);
  console.log("Done! Reports page is now completely empty (0 records).");
} else {
  console.log("Inserting controlled test fixture for October 2026...");
  runSql(`
    DELETE FROM operations_margin_records WHERE organization_id = 'techflex';
    DELETE FROM operations_kpi_snapshots WHERE organization_id = 'techflex';

    -- Account 1: Mount Carmel Health System ($1,500 rev, $800 cost => 46.7% Healthy margin)
    INSERT INTO operations_margin_records (
      id, organization_id, work_order_id, month_year, client_account,
      billed_revenue, direct_labor_cost, direct_parts_cost, travel_cost, total_direct_cost,
      gross_margin_dollars, gross_margin_percent, meets_guardrail, audited_by
    ) VALUES (
      'om-mc-001', 'techflex', 'WO-BIO-2026-001', 'oct-2026', 'Mount Carmel Health System',
      1500.00, 500.00, 200.00, 100.00, 800.00,
      700.00, 46.67, 1, 'Demo Administrator'
    );

    -- Account 2: SpinLife Columbus Hub ($2,000 rev, $1,300 cost => 35.0% Flagged margin)
    INSERT INTO operations_margin_records (
      id, organization_id, work_order_id, month_year, client_account,
      billed_revenue, direct_labor_cost, direct_parts_cost, travel_cost, total_direct_cost,
      gross_margin_dollars, gross_margin_percent, meets_guardrail, audited_by
    ) VALUES (
      'om-sl-002', 'techflex', 'WO-DME-2026-002', 'oct-2026', 'SpinLife Columbus Hub',
      2000.00, 800.00, 400.00, 100.00, 1300.00,
      700.00, 35.00, 0, 'Demo Administrator'
    );

    -- Monthly KPI trend snapshots
    INSERT INTO operations_kpi_snapshots (
      id, organization_id, snapshot_date, total_billed, total_direct_cost, average_gross_margin
    ) VALUES 
      ('kpi-2026-09', 'techflex', '2026-09-01', 3200.00, 1800.00, 43.75),
      ('kpi-2026-10', 'techflex', '2026-10-01', 3500.00, 2100.00, 40.00);
  `);
  console.log("Done! Seeded 2 test accounts (Total $3,500 Revenue, $2,100 Cost, 40.0% Margin).");
}
