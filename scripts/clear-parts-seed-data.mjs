import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
const db = new DatabaseSync(dbPath);

console.log("--- Clearing Parts Seed Data from SQLite Database ---");

db.exec(`
  DELETE FROM van_stock;
  DELETE FROM parts_catalog;
  DELETE FROM installed_parts;
  DELETE FROM parts_purchase_orders;
`);

console.log("parts_catalog count:", db.prepare("SELECT count(*) as c FROM parts_catalog").get().c);
console.log("van_stock count:", db.prepare("SELECT count(*) as c FROM van_stock").get().c);
console.log("installed_parts count:", db.prepare("SELECT count(*) as c FROM installed_parts").get().c);
console.log("parts_purchase_orders count:", db.prepare("SELECT count(*) as c FROM parts_purchase_orders").get().c);
console.log("--- Seed data successfully cleared! ---");

