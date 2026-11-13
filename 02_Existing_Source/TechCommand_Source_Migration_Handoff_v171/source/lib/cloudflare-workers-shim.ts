// Real local SQLite-backed D1 shim for Cloudflare Workers under Node.js / Next.js
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import fs from "node:fs";

let dbInstance: DatabaseSync | null = null;

function getSqliteDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = path.resolve(process.cwd(), ".local-dev.sqlite");
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec("PRAGMA journal_mode = WAL;");

    try {
      const tableCheck = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
      if (!tableCheck) {
        console.log("[D1 Shim] Initializing local database schema from drizzle migrations...");
        dbInstance.exec("PRAGMA foreign_keys = OFF;");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        if (fs.existsSync(drizzleDir)) {
          const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort();
          for (const file of files) {
            try {
              const sqlContent = fs.readFileSync(path.join(drizzleDir, file), "utf-8");
              const statements = sqlContent.split("--> statement-breakpoint");
              for (const statement of statements) {
                const trimmed = statement.trim();
                if (trimmed) {
                  dbInstance.exec(trimmed);
                }
              }
            } catch (_fileErr) {
              // Ignore cumulative duplicate table/column alter errors across migrations
            }
          }
        }
        dbInstance.exec("PRAGMA foreign_keys = ON;");
        console.log("[D1 Shim] Local database schema initialized successfully.");
      }
    } catch (initErr) {
      console.warn("[D1 Shim] Table check error:", initErr);
    }
  }
  return dbInstance;
}

class D1PreparedStatementSync {
  private sql: string;
  private params: any[];

  constructor(sql: string, params: any[] = []) {
    this.sql = sql;
    this.params = params;
  }

  bind(...params: any[]) {
    return new D1PreparedStatementSync(this.sql, params);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    try {
      const db = getSqliteDb();
      const stmt = db.prepare(this.sql);
      const row = stmt.get(...this.params) as Record<string, any> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] ?? null) as T;
      return row as T;
    } catch (_err) {
      return null;
    }
  }

  async execute<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: { changes: number; last_row_id: number } }> {
    try {
      const db = getSqliteDb();
      const stmt = db.prepare(this.sql);
      const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql);
      if (isSelect) {
        const rows = stmt.all(...this.params) as T[];
        return { results: rows || [], success: true, meta: { changes: 0, last_row_id: 0 } };
      } else {
        const res = stmt.run(...this.params);
        return {
          results: [],
          success: true,
          meta: { changes: Number(res.changes || 0), last_row_id: Number(res.lastInsertRowid || 0) },
        };
      }
    } catch (_err) {
      console.error("[D1 Query Error]:", _err, "in SQL:", this.sql);
      return { results: [], success: false, meta: { changes: 0, last_row_id: 0 } };
    }
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    return this.execute<T>();
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    return this.execute();
  }

  async raw(): Promise<any[][]> {
    const res = await this.all();
    return res.results.map((r: any) => Object.values(r));
  }
}

export const d1Database = {
  prepare(sql: string) {
    return new D1PreparedStatementSync(sql);
  },
  async batch(statements: D1PreparedStatementSync[]) {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.execute());
    }
    return results;
  },
  async exec(sql: string) {
    const db = getSqliteDb();
    db.exec(sql);
    return { count: 1, duration: 0 };
  },
};

export const env: Record<string, any> = new Proxy(
  (typeof process !== "undefined" && process.env ? process.env : {}) as Record<string, any>,
  {
    get(target: Record<string, any>, prop: string) {
      if (prop === "DB") {
        return d1Database;
      }
      if (prop === "BUCKET") {
        return {
          get: async () => null,
          put: async () => null,
          delete: async () => null,
        };
      }
      return target[prop] ?? "";
    },
  }
);

export class WorkerEntrypoint<Env = unknown> {
  ctx: any;
  env: Env;
  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class DurableObject<Env = unknown> {
  ctx: any;
  env: Env;
  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  ctx: any;
  env: Env;
  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class RpcTarget {}

export default { env, WorkerEntrypoint, DurableObject, WorkflowEntrypoint, RpcTarget };
