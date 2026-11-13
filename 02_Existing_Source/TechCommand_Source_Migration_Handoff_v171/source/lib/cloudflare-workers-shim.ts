// Real local SQLite-backed D1 shim for Cloudflare Workers under Node.js / Next.js
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

let dbInstance: DatabaseSync | null = null;

function getActiveDb(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB;
}

function getSqliteDb(): DatabaseSync | null {
  if (!dbInstance) {
    try {
      const dbPath = path.resolve(process.cwd(), ".local-dev.sqlite");
      dbInstance = new DatabaseSync(dbPath);
      dbInstance.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    } catch {
      return null;
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
    const active = getActiveDb();
    if (active) {
      return active.prepare(this.sql).bind(...this.params).first(colName);
    }
    try {
      const db = getSqliteDb();
      if (!db) return null;
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
    const active = getActiveDb();
    if (active) {
      const res = await active.prepare(this.sql).bind(...this.params).all();
      return {
        results: (res?.results || []) as T[],
        success: true,
        meta: { changes: Number(res?.meta?.changes || 0), last_row_id: Number(res?.meta?.last_row_id || 0) },
      };
    }
    try {
      const db = getSqliteDb();
      if (!db) return { results: [], success: false, meta: { changes: 0, last_row_id: 0 } };
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
      return { results: [], success: false, meta: { changes: 0, last_row_id: 0 } };
    }
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    const active = getActiveDb();
    if (active) {
      const res = await active.prepare(this.sql).bind(...this.params).all();
      return {
        results: (res?.results || []) as T[],
        success: true,
        meta: res?.meta || {},
      };
    }
    return this.execute<T>();
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const active = getActiveDb();
    if (active) {
      const res = await active.prepare(this.sql).bind(...this.params).run();
      return {
        success: true,
        meta: { changes: Number(res?.meta?.changes || 0), last_row_id: Number(res?.meta?.last_row_id || 0) },
      };
    }
    return this.execute();
  }

  async raw(): Promise<any[][]> {
    const res = await this.all();
    return res.results.map((r: any) => Object.values(r));
  }
}

export const d1Database = {
  prepare(sql: string) {
    const active = getActiveDb();
    if (active) return active.prepare(sql);
    return new D1PreparedStatementSync(sql);
  },
  async batch(statements: any[]) {
    const active = getActiveDb();
    if (active) return active.batch(statements);
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.execute());
    }
    return results;
  },
  async exec(sql: string) {
    const active = getActiveDb();
    if (active) return active.exec(sql);
    const db = getSqliteDb();
    if (db) db.exec(sql);
    return { count: 1, duration: 0 };
  },
};

export const env: Record<string, any> = new Proxy(
  (typeof process !== "undefined" && process.env ? process.env : {}) as Record<string, any>,
  {
    get(target: Record<string, any>, prop: string) {
      if (prop === "DB") {
        const active = getActiveDb();
        if (active) return active;
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
