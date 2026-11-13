// Robust in-memory & global D1 database shim for local development
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

type AccountRecord = {
  id: string;
  organizationId: string;
  organization_id: string;
  externalId: string | null;
  external_id: string | null;
  name: string;
  accountType: string;
  account_type: string;
  status: string;
  billingEmail: string | null;
  billing_email: string | null;
  paymentTermsDays: number;
  payment_terms_days: number;
  serviceLevel: string | null;
  service_level: string | null;
  serviceDiscipline: string | null;
  service_discipline: string | null;
  locationCount: number;
  assetCount: number;
  updatedAt: string;
  updated_at: string;
};

type LocationRecord = {
  id: string;
  organizationId: string;
  organization_id: string;
  accountId: string;
  account_id: string;
  accountName: string;
  name: string;
  locationType: string | null;
  location_type: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  departmentCount: number;
  assetCount: number;
  status: string;
};

const g = globalThis as any;
if (!g.__TECHCOMMAND_DB__) {
  g.__TECHCOMMAND_DB__ = {
    accounts: [
      {
        id: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        organizationId: "techflex",
        organization_id: "techflex",
        externalId: null,
        external_id: null,
        name: "TechFlex Mobility Solutions",
        accountType: "facility",
        account_type: "facility",
        status: "active",
        billingEmail: "billing@techflexmobility.com",
        billing_email: "billing@techflexmobility.com",
        paymentTermsDays: 30,
        payment_terms_days: 30,
        serviceDiscipline: "biomedical",
        service_discipline: "biomedical",
        serviceLevel: "standard",
        service_level: "standard",
        locationCount: 2,
        assetCount: 5,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "e1531f3f-348a-4f14-9f38-9dad240c2bae",
        organizationId: "techflex",
        organization_id: "techflex",
        externalId: null,
        external_id: null,
        name: "demoooo",
        accountType: "manufacturer",
        account_type: "manufacturer",
        status: "active",
        billingEmail: "demooo@gmail.com",
        billing_email: "demooo@gmail.com",
        paymentTermsDays: 30,
        payment_terms_days: 30,
        serviceDiscipline: "dme_mobility",
        service_discipline: "dme_mobility",
        serviceLevel: "normal",
        service_level: "normal",
        locationCount: 1,
        assetCount: 3,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ] as AccountRecord[],
    locations: [
      {
        id: "loc_demo_1",
        organizationId: "techflex",
        organization_id: "techflex",
        accountId: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        account_id: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        accountName: "TechFlex Mobility Solutions",
        name: "Main Facility Clinic",
        locationType: "healthcare_facility",
        location_type: "healthcare_facility",
        address1: "742 Evergreen Terrace",
        address2: "Suite 100",
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
        departmentCount: 3,
        assetCount: 5,
        status: "active",
      },
    ] as LocationRecord[],
    customers: [],
    contacts: [],
    audit_logs: [],
  };
}

class D1PreparedStatementShim {
  private sql: string;
  private params: any[];

  constructor(sql: string, params: any[] = []) {
    this.sql = sql;
    this.params = params;
  }

  bind(...params: any[]) {
    return new D1PreparedStatementShim(this.sql, params);
  }

  async first<T = unknown>(col?: string): Promise<T | null> {
    const res = await this.all<T>();
    const row = res.results[0] || null;
    if (!row) return null;
    if (col) return (row as any)[col] ?? null;
    return row as T;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    const db = g.__TECHCOMMAND_DB__;
    const s = this.sql.toLowerCase();

    // ACCOUNTS
    if (s.includes("from accounts")) {
      const rows = db.accounts.filter((a: AccountRecord) => a.status !== "archived");
      return { results: rows as T[], success: true, meta: { changes: 0 } };
    }

    // LOCATIONS
    if (s.includes("from locations")) {
      const rows = db.locations.filter((l: LocationRecord) => l.status !== "archived");
      return { results: rows as T[], success: true, meta: { changes: 0 } };
    }

    // USERS / AUTH
    if (s.includes("from users")) {
      const userRows = [
        {
          userId: "user_demo_admin",
          id: "user_demo_admin",
          email: "admin@demo.com",
          displayName: "Demo Administrator",
          display_name: "Demo Administrator",
          role: "owner_administrator",
          technicianId: null,
          status: "active",
        },
        {
          userId: "user_demo_finance",
          id: "user_demo_finance",
          email: "finance@demo.com",
          displayName: "Demo Finance Officer",
          display_name: "Demo Finance Officer",
          role: "finance",
          technicianId: null,
          status: "active",
        },
      ];
      return { results: userRows as T[], success: true, meta: { changes: 0 } };
    }

    // ORGANIZATIONS
    if (s.includes("from organizations")) {
      return {
        results: [{ id: "techflex", legal_name: "Astute Restorations LLC", display_name: "TechFlex Mobility Solutions" }] as T[],
        success: true,
        meta: { changes: 0 },
      };
    }

    return { results: [] as T[], success: true, meta: { changes: 0 } };
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const db = g.__TECHCOMMAND_DB__;
    const s = this.sql.toLowerCase();

    // INSERT INTO ACCOUNTS
    if (s.includes("insert into accounts")) {
      const [id, orgId, extId, name, accType, billEmail, terms, sLevel, sDisc] = this.params;
      const accountId = id || crypto.randomUUID();
      const newAccount: AccountRecord = {
        id: accountId,
        organizationId: orgId || "techflex",
        organization_id: orgId || "techflex",
        externalId: extId || null,
        external_id: extId || null,
        name: name || "New Account",
        accountType: accType || "facility",
        account_type: accType || "facility",
        status: "active",
        billingEmail: billEmail || null,
        billing_email: billEmail || null,
        paymentTermsDays: Number(terms || 30),
        payment_terms_days: Number(terms || 30),
        serviceLevel: sLevel || "Standard",
        service_level: sLevel || "Standard",
        serviceDiscipline: sDisc || null,
        service_discipline: sDisc || null,
        locationCount: 0,
        assetCount: 0,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Prepend so newest appears first
      db.accounts.unshift(newAccount);
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT INTO LOCATIONS
    if (s.includes("insert into locations")) {
      const [id, orgId, accId, name, locType, a1, city, state, zip, dept] = this.params;
      const parentAcc = db.accounts.find((a: AccountRecord) => a.id === accId);
      const locId = id || crypto.randomUUID();
      const newLoc: LocationRecord = {
        id: locId,
        organizationId: orgId || "techflex",
        organization_id: orgId || "techflex",
        accountId: accId,
        account_id: accId,
        accountName: parentAcc?.name || "Customer Account",
        name: name || "New Location",
        locationType: locType || "healthcare_facility",
        location_type: locType || "healthcare_facility",
        address1: a1 || "",
        address2: null,
        city: city || "",
        state: state || "OH",
        postalCode: zip || "",
        departmentCount: dept ? 1 : 0,
        assetCount: 0,
        status: "active",
      };
      db.locations.unshift(newLoc);
      if (parentAcc) {
        parentAcc.locationCount = (parentAcc.locationCount || 0) + 1;
      }
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    return { success: true, meta: { changes: 1, last_row_id: 1 } };
  }

  async execute<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql);
    if (isSelect) {
      return this.all<T>();
    }
    const runRes = await this.run();
    return { results: [], success: runRes.success, meta: runRes.meta };
  }
}

export const d1Database = {
  prepare(sql: string) {
    return new D1PreparedStatementShim(sql);
  },
  async batch(stmts: D1PreparedStatementShim[]) {
    const results = [];
    for (const stmt of stmts) {
      results.push(await stmt.execute());
    }
    return results;
  },
  async exec(sql: string) {
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
      return target[prop];
    },
  }
);

export default { env, WorkerEntrypoint, DurableObject, WorkflowEntrypoint, RpcTarget };
