import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.resolve(process.cwd(), '02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite');
console.log('dbPath exists:', fs.existsSync(dbPath));

const db = new DatabaseSync(dbPath);

function createSqliteD1(sqliteDb) {
  return {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first(col) {
              const stmt = sqliteDb.prepare(query);
              const row = stmt.get(...params);
              if (!row) return null;
              if (col) return row[col] ?? null;
              return row;
            },
            async all() {
              const stmt = sqliteDb.prepare(query);
              const results = stmt.all(...params);
              return { results, success: true, meta: { changes: 0 } };
            },
            async run() {
              const stmt = sqliteDb.prepare(query);
              const info = stmt.run(...params);
              return {
                success: true,
                meta: {
                  changes: Number(info?.changes || 0),
                  last_row_id: Number(info?.lastInsertRowid || 0)
                }
              };
            }
          };
        },
        async first(col) {
          return this.bind().first(col);
        },
        async all() {
          return this.bind().all();
        },
        async run() {
          return this.bind().run();
        }
      };
    },
    async batch(stmts) {
      const results = [];
      for (const s of stmts) {
        results.push(await s.run ? s.run() : s.all());
      }
      return results;
    },
    async exec(sql) {
      sqliteDb.exec(sql);
      return { count: 1, duration: 0 };
    }
  };
}

const d1 = createSqliteD1(db);
const test = await d1.prepare("SELECT count(*) as count FROM work_orders").first();
console.log('Total work orders from D1 shim:', test);
const woList = await d1.prepare("SELECT external_id, summary FROM work_orders").all();
console.table(woList.results);
