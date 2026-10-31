// Generate this additive migration without rewriting the pre-existing forked
// Drizzle snapshot history. Old applied SQL and metadata are immutable.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";
const { loginUsernames, ...beforeSchema } = schema;
const tag = "0045_login_usernames";
if (existsSync(`drizzle/${tag}.sql`)) throw new Error("Migration already generated; do not overwrite it.");
const previous = await generateSQLiteDrizzleJson(beforeSchema);
const next = await generateSQLiteDrizzleJson(schema, previous.id);
const statements = await generateSQLiteMigration(previous, next);
if (statements.length !== 2 || !statements.every(sql => /^CREATE (TABLE|UNIQUE INDEX)/.test(sql) && sql.includes("login_username")))
  throw new Error("Unexpected schema delta; inspect before proceeding.");
writeFileSync(`drizzle/${tag}.sql`, statements.join("\n--> statement-breakpoint\n") + "\n", { flag: "wx" });
// Append a new snapshot; no historical snapshot is edited.
next.prevId = JSON.parse(readFileSync("drizzle/meta/0027_snapshot.json", "utf8")).id;
writeFileSync("drizzle/meta/0045_snapshot.json", JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
journal.entries.push({ idx: 45, version: "6", when: Date.now(), tag, breakpoints: true });
writeFileSync("drizzle/meta/_journal.json", JSON.stringify(journal, null, 2) + "\n");
console.log(statements.join("\n"));
