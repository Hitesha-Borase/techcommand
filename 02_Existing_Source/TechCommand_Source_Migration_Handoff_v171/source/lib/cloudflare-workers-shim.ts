// Real local SQLite-backed D1 shim for Cloudflare Workers under Node.js / Next.js
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

let dbInstance: DatabaseSync | null = null;

function getSqliteDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = path.resolve(process.cwd(), ".local-dev.sqlite");
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  }
  return dbInstance;
}

class D1PreparedStatementSync {
  constructor(private sql: string, private params: any[] = []) {}

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

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    try {
      const db = getSqliteDb();
      const stmt = db.prepare(this.sql);
      const rows = stmt.all(...this.params) as T[];
      return { results: rows || [], success: true, meta: { changes: 0 } };
    } catch (_err) {
      return { results: [], success: false, meta: { changes: 0 } };
    }
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    try {
      const db = getSqliteDb();
      const stmt = db.prepare(this.sql);
      const res = stmt.run(...this.params);
      return {
        success: true,
        meta: { changes: Number(res.changes || 0), last_row_id: Number(res.lastInsertRowid || 0) },
      };
    } catch (_err) {
      return { success: false, meta: { changes: 0, last_row_id: 0 } };
    }
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
      results.push(await stmt.all());
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

export default { env };
