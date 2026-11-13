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

function getActiveDb(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB;
}

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

type CustomerRecord = {
  id: string;
  organizationId: string;
  organization_id: string;
  accountId: string;
  account_id: string;
  accountName: string;
  locationId: string | null;
  location_id: string | null;
  locationName: string | null;
  externalId: string | null;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  address_1: string | null;
  address2: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  postal_code: string | null;
  notes: string | null;
  status: string;
  workOrderCount: number;
  documentCount: number;
  updatedAt: string;
  updated_at: string;
};

type ContactRecord = {
  id: string;
  accountId: string;
  account_id: string;
  accountName: string;
  locationId: string | null;
  location_id: string | null;
  locationName: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  contactType: string;
  contact_type: string;
  isPrimary: number;
  is_primary: number;
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
    customers: [
      {
        id: "cust_demo_1",
        organizationId: "techflex",
        organization_id: "techflex",
        accountId: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        account_id: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        accountName: "TechFlex Mobility Solutions",
        locationId: "loc_demo_1",
        location_id: "loc_demo_1",
        locationName: "Main Facility Clinic",
        externalId: null,
        external_id: null,
        name: "John Smith",
        email: "john.smith@techflexmobility.com",
        phone: "614-555-0101",
        address1: "742 Evergreen Terrace",
        address_1: "742 Evergreen Terrace",
        address2: null,
        address_2: null,
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
        postal_code: "43215",
        notes: "Primary demo customer",
        status: "active",
        workOrderCount: 0,
        documentCount: 0,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "cust_demo_2",
        organizationId: "techflex",
        organization_id: "techflex",
        accountId: "e1531f3f-348a-4f14-9f38-9dad240c2bae",
        account_id: "e1531f3f-348a-4f14-9f38-9dad240c2bae",
        accountName: "demoooo",
        locationId: null,
        location_id: null,
        locationName: null,
        externalId: null,
        external_id: null,
        name: "Demo Customer Two",
        email: "demo2@example.com",
        phone: "614-555-0202",
        address1: null,
        address_1: null,
        address2: null,
        address_2: null,
        city: null,
        state: null,
        postalCode: null,
        postal_code: null,
        notes: null,
        status: "active",
        workOrderCount: 0,
        documentCount: 0,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ] as CustomerRecord[],
    contacts: [
      {
        id: "cont_demo_1",
        accountId: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        account_id: "df9041f0-012c-4b71-8a6c-f51c45284dc6",
        accountName: "TechFlex Mobility Solutions",
        locationId: "loc_demo_1",
        location_id: "loc_demo_1",
        locationName: "Main Facility Clinic",
        name: "Sarah Johnson",
        title: "Operations Manager",
        email: "sarah.johnson@techflexmobility.com",
        phone: "614-555-0303",
        contactType: "operations",
        contact_type: "operations",
        isPrimary: 1,
        is_primary: 1,
      },
      {
        id: "cont_demo_2",
        accountId: "e1531f3f-348a-4f14-9f38-9dad240c2bae",
        account_id: "e1531f3f-348a-4f14-9f38-9dad240c2bae",
        accountName: "demoooo",
        locationId: null,
        location_id: null,
        locationName: null,
        name: "Demo Contact",
        title: "Manager",
        email: "contact@demo.com",
        phone: "614-555-0404",
        contactType: "general",
        contact_type: "general",
        isPrimary: 0,
        is_primary: 0,
      },
    ] as ContactRecord[],
    audit_logs: [],
    training_schools: [
      {
        id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8001",
        name: "Columbus Technical College",
        coordinator_email: "coordinator@columbustech.edu",
        coordinatorEmail: "coordinator@columbustech.edu",
        active: 1,
        record_version: 0,
        version: 0,
        data_json: JSON.stringify({
          id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8001",
          name: "Columbus Technical College",
          program: "Biomedical Equipment Technology",
          coordinatorName: "Prof. Robert Davis",
          coordinatorEmail: "coordinator@columbustech.edu",
          requirements: "Clinical internship agreement on file",
          active: 1,
        }),
      },
      {
        id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8002",
        name: "Ohio Institute of Allied Health",
        coordinator_email: "health@oiah.edu",
        coordinatorEmail: "health@oiah.edu",
        active: 1,
        record_version: 0,
        version: 0,
        data_json: JSON.stringify({
          id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8002",
          name: "Ohio Institute of Allied Health",
          program: "DME & Assistive Technology",
          coordinatorName: "Dr. Karen Vance",
          coordinatorEmail: "health@oiah.edu",
          requirements: "40 hours minimum field placement",
          active: 1,
        }),
      },
    ],
    training_placements: [],
    technicians: [
      { id: "tech_demo_1", name: "Brandon (Lead Biomedical Engineer)" },
      { id: "tech_demo_2", name: "James (Field Service Specialist)" },
      { id: "tech_demo_3", name: "Floyd Boyer (Compliance Officer)" },
    ],
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
    const active = getActiveDb();
    if (active) {
      return active.prepare(this.sql).bind(...this.params).first(col);
    }
    const res = await this.all<T>();
    const row = res.results[0] || null;
    if (!row) return null;
    if (col) return (row as any)[col] ?? null;
    return row as T;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    const active = getActiveDb();
    if (active) {
      const res = await active.prepare(this.sql).bind(...this.params).all();
      return {
        results: (res?.results || []) as T[],
        success: true,
        meta: res?.meta || { changes: 0 },
      };
    }

    const db = g.__TECHCOMMAND_DB__;
    const s = this.sql.toLowerCase();

    // ACCOUNTS - hierarchy check (WHERE a.id = ?) or full list
    if (s.includes("from accounts")) {
      let rows = db.accounts.filter((a: AccountRecord) => a.status !== "archived");
      if (s.includes("where a.id = ?") || s.includes("where a.id=?")) {
        const accountId = this.params[0];
        rows = rows.filter((a: AccountRecord) => a.id === accountId);
      }
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

    // CUSTOMERS
    if (s.includes("from customers")) {
      let rows = db.customers.filter((c: CustomerRecord) => c.status !== "archived");
      if (s.includes("where c.id = ?") || s.includes("where c.id=?")) {
        const custId = this.params[0];
        rows = rows.filter((c: CustomerRecord) => c.id === custId);
      }
      return { results: rows as T[], success: true, meta: { changes: 0 } };
    }

    // CONTACTS
    if (s.includes("from contacts")) {
      let rows = db.contacts;
      if (s.includes("where c.account_id = ?") || s.includes("where c.account_id=?")) {
        const accId = this.params[0];
        rows = rows.filter((c: ContactRecord) => c.accountId === accId || c.account_id === accId);
      }
      return { results: rows as T[], success: true, meta: { changes: 0 } };
    }

    // TRAINING SCHOOLS
    if (s.includes("from training_schools")) {
      if (!db.training_schools || db.training_schools.length === 0) {
        db.training_schools = [
          {
            id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8001",
            name: "Columbus Technical College",
            coordinator_email: "coordinator@columbustech.edu",
            coordinatorEmail: "coordinator@columbustech.edu",
            active: 1,
            record_version: 0,
            version: 0,
            data_json: JSON.stringify({
              id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8001",
              name: "Columbus Technical College",
              program: "Biomedical Equipment Technology",
              coordinatorName: "Prof. Robert Davis",
              coordinatorEmail: "coordinator@columbustech.edu",
              requirements: "Clinical internship agreement on file",
              active: 1,
            }),
          },
          {
            id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8002",
            name: "Ohio Institute of Allied Health",
            coordinator_email: "health@oiah.edu",
            coordinatorEmail: "health@oiah.edu",
            active: 1,
            record_version: 0,
            version: 0,
            data_json: JSON.stringify({
              id: "7b43f9a2-2c5e-4db4-8cb3-1d2a4f6e8002",
              name: "Ohio Institute of Allied Health",
              program: "DME & Assistive Technology",
              coordinatorName: "Dr. Karen Vance",
              coordinatorEmail: "health@oiah.edu",
              requirements: "40 hours minimum field placement",
              active: 1,
            }),
          },
        ];
      }
      const schools = db.training_schools;
      if (/\bwhere\s+id\s*=\s*\?/i.test(s) || /\band\s+id\s*=\s*\?/i.test(s)) {
        const id = this.params[0] === "techflex" ? this.params[1] : this.params[0];
        const matched = schools.filter((sc: any) => sc.id === id);
        return { results: matched as T[], success: true, meta: { changes: 0 } };
      }
      return { results: schools as T[], success: true, meta: { changes: 0 } };
    }

    // TRAINING PLACEMENTS
    if (s.includes("from training_placements")) {
      const placements = db.training_placements || [];
      return { results: placements as T[], success: true, meta: { changes: 0 } };
    }

    // TECHNICIANS
    if (s.includes("from technicians")) {
      if (!db.technicians || db.technicians.length === 0) {
        db.technicians = [
          { id: "tech_demo_1", name: "Brandon (Lead Biomedical Engineer)" },
          { id: "tech_demo_2", name: "James (Field Service Specialist)" },
          { id: "tech_demo_3", name: "Floyd Boyer (Compliance Officer)" },
        ];
      }
      const techs = db.technicians;
      if (s.includes("where t.id=?") || s.includes("where id=?")) {
        return { results: [{ id: this.params[0] || "tech_demo_1", status: "active" }] as T[], success: true, meta: { changes: 0 } };
      }
      return { results: techs as T[], success: true, meta: { changes: 0 } };
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
    const active = getActiveDb();
    if (active) {
      const res = await active.prepare(this.sql).bind(...this.params).run();
      return {
        success: true,
        meta: { changes: Number(res?.meta?.changes || 0), last_row_id: Number(res?.meta?.last_row_id || 0) },
      };
    }

    const db = g.__TECHCOMMAND_DB__;
    const s = this.sql.toLowerCase();

    // INSERT / UPDATE ACCOUNTS
    if (s.includes("into accounts")) {
      const [
        id,
        orgId,
        extId,
        name,
        accType,
        email,
        terms,
        serviceLevel,
        discipline,
      ] = this.params;
      const existingIdx = db.accounts.findIndex((a: AccountRecord) => a.id === id);
      const record: AccountRecord = {
        id,
        organizationId: orgId || "techflex",
        organization_id: orgId || "techflex",
        externalId: extId || null,
        external_id: extId || null,
        name: name || "New Account",
        accountType: accType || "facility",
        account_type: accType || "facility",
        status: "active",
        billingEmail: email || null,
        billing_email: email || null,
        paymentTermsDays: Number(terms || 30),
        payment_terms_days: Number(terms || 30),
        serviceLevel: serviceLevel || null,
        service_level: serviceLevel || null,
        serviceDiscipline: discipline || null,
        service_discipline: discipline || null,
        locationCount: 0,
        assetCount: 0,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        db.accounts[existingIdx] = record;
      } else {
        db.accounts.unshift(record);
      }
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT LOCATIONS
    if (s.includes("into locations")) {
      const [id, accId, name, locType, addr1, addr2, city, state, zip] = this.params;
      const parentAcc = db.accounts.find((a: AccountRecord) => a.id === accId);
      const newLoc: LocationRecord = {
        id,
        organizationId: "techflex",
        organization_id: "techflex",
        accountId: accId,
        account_id: accId,
        accountName: parentAcc?.name || "Account",
        name: name || "New Location",
        locationType: locType || "healthcare_facility",
        location_type: locType || "healthcare_facility",
        address1: addr1 || "",
        address2: addr2 || null,
        city: city || "",
        state: state || "OH",
        postalCode: zip || "",
        departmentCount: 0,
        assetCount: 0,
        status: "active",
      };
      db.locations.unshift(newLoc);
      if (parentAcc) {
        parentAcc.locationCount = (parentAcc.locationCount || 0) + 1;
      }
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT CUSTOMERS
    if (s.includes("into customers")) {
      const [
        id,
        orgId,
        accountId,
        locationId,
        externalId,
        name,
        email,
        phone,
        address1,
        address2,
        city,
        state,
        postalCode,
        notes,
      ] = this.params;
      const parentAcc = db.accounts.find((a: AccountRecord) => a.id === accountId);
      const parentLoc = db.locations.find((l: LocationRecord) => l.id === locationId);
      const newCustomer: CustomerRecord = {
        id: id || crypto.randomUUID(),
        organizationId: orgId || "techflex",
        organization_id: orgId || "techflex",
        accountId: accountId,
        account_id: accountId,
        accountName: parentAcc?.name || "Unknown Account",
        locationId: locationId || null,
        location_id: locationId || null,
        locationName: parentLoc?.name || null,
        externalId: externalId || null,
        external_id: externalId || null,
        name: name || "New Customer",
        email: email || null,
        phone: phone || null,
        address1: address1 || null,
        address_1: address1 || null,
        address2: address2 || null,
        address_2: address2 || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
        postal_code: postalCode || null,
        notes: notes || null,
        status: "active",
        workOrderCount: 0,
        documentCount: 0,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.customers.unshift(newCustomer);
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT CONTACTS
    if (s.includes("into contacts")) {
      const [
        id,
        accountId,
        locationId,
        name,
        title,
        email,
        phone,
        contactType,
        isPrimary,
      ] = this.params;
      const parentAcc = db.accounts.find((a: AccountRecord) => a.id === accountId);
      const parentLoc = db.locations.find((l: LocationRecord) => l.id === locationId);
      const newContact: ContactRecord = {
        id: id || crypto.randomUUID(),
        accountId: accountId,
        account_id: accountId,
        accountName: parentAcc?.name || "Unknown Account",
        locationId: locationId || null,
        location_id: locationId || null,
        locationName: parentLoc?.name || null,
        name: name || "New Contact",
        title: title || null,
        email: email || null,
        phone: phone || null,
        contactType: contactType || "general",
        contact_type: contactType || "general",
        isPrimary: isPrimary ? 1 : 0,
        is_primary: isPrimary ? 1 : 0,
      };
      if (isPrimary) {
        db.contacts.unshift(newContact);
      } else {
        db.contacts.push(newContact);
      }
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT / UPDATE TRAINING SCHOOLS
    if (s.includes("training_schools")) {
      if (!db.training_schools) db.training_schools = [];
      if (s.includes("insert into training_schools")) {
        const [id, orgId, name, coordEmail, active, dataJson] = this.params;
        db.training_schools.unshift({
          id: id || crypto.randomUUID(),
          name,
          coordinator_email: coordEmail,
          coordinatorEmail: coordEmail,
          active: Number(active ?? 1),
          record_version: 0,
          version: 0,
          data_json: dataJson || JSON.stringify({ id, name, coordinatorEmail: coordEmail, active }),
        });
      }
      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // INSERT INTO TRAINING PLACEMENTS
    if (s.includes("training_placements")) {
      if (!db.training_placements) db.training_placements = [];
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
    const active = getActiveDb();
    if (active) return active.prepare(sql);
    return new D1PreparedStatementShim(sql);
  },
  async batch(stmts: any[]) {
    const active = getActiveDb();
    if (active) return active.batch(stmts);
    const results = [];
    for (const stmt of stmts) {
      results.push(await stmt.execute());
    }
    return results;
  },
  async exec(sql: string) {
    const active = getActiveDb();
    if (active) return active.exec(sql);
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
      return target[prop];
    },
  }
);

export default { env, WorkerEntrypoint, DurableObject, WorkflowEntrypoint, RpcTarget };
