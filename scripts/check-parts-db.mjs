import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
const db = new DatabaseSync(dbPath);

console.log("\n=======================================================");
console.log("       LIVE SQLITE DATABASE: PARTS & INVENTORY        ");
console.log("=======================================================\n");

const catalogRows = db.prepare("SELECT part_number, name, category, warehouse_stock, unit_cost, retail_price FROM parts_catalog").all();
console.log(`📦 Master Catalog (${catalogRows.length} items):`);
if (catalogRows.length === 0) {
  console.log("   (Empty - No parts in master catalog)\n");
} else {
  console.table(catalogRows);
}

const vanRows = db.prepare("SELECT part_number, name, van_name, technician_name, qty_on_hand, par_level, bin_location FROM van_stock").all();
console.log(`🚐 Van Stock (${vanRows.length} items):`);
if (vanRows.length === 0) {
  console.log("   (Empty - No parts currently in service vans)\n");
} else {
  console.table(vanRows);
}

console.log("=======================================================\n");

