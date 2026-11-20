/// <reference types="@cloudflare/vitest-plugin/types" />
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { loadDispatch } from "../app/api/dispatch/route";
import { TECHFLEX_ORG_ID, type PortalIdentity } from "../lib/portal-auth";

// Ticket F05 integration test: exercises the REAL eligibility SQL query in
// app/api/dispatch/route.ts (spinlifeSql + the available/scheduled bucket logic) against a
// real D1-compatible SQLite database with the production drizzle/ migrations applied - not
// just the pure helper functions (lib/pricing-review-gate.ts, lib/schedule-data.ts) that the
// pre-existing unit tests cover in isolation with hand-shaped fixtures.

const adminIdentity: PortalIdentity = {
  userId: "user-admin-1",
  authSubject: "auth-admin-1",
  email: "admin@example.test",
  displayName: "Test Admin",
  role: "owner_administrator",
  technicianId: null,
  organizationId: TECHFLEX_ORG_ID,
};

const INTAKE_ID = "intake-00181126001n-3";
const TECHNICIAN_ID = "tech-demo-1";
const PLANNED_DATE = "2026-11-18";
const UNRELATED_DATE = "2026-11-19";

async function seedAssignedSpinLifeFixture() {
  // Storage persists across tests within this file (it is not reset per-test), so the static
  // reference rows are seeded idempotently (INSERT OR IGNORE) and the mutable SpinLife visit
  // row is reset to its canonical fixture state (INSERT OR REPLACE) before every test, so one
  // test's mutation (e.g. confirming a time slot) can never leak into the next test.
  const db = env.DB;
  await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO organizations (id, legal_name, display_name) VALUES (?, ?, ?)`)
      .bind(TECHFLEX_ORG_ID, "TechFlex Mobility Solutions LLC", "TechFlex Mobility Solutions"),
    db
      .prepare(`INSERT OR IGNORE INTO users (id, auth_subject, email, display_name) VALUES (?, ?, ?, ?)`)
      .bind("user-tech-1", "auth-tech-1", "demo.technician@example.test", "Demo Technician"),
    db
      .prepare(`INSERT OR IGNORE INTO users (id, auth_subject, email, display_name) VALUES (?, ?, ?, ?)`)
      .bind("user-admin-1", "auth-admin-1", "admin@example.test", "Test Admin"),
    db
      .prepare(
        `INSERT OR IGNORE INTO technicians (id, organization_id, user_id, technician_code, employment_type, status) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(TECHNICIAN_ID, TECHFLEX_ORG_ID, "user-tech-1", "DEMO-1", "w2", "active"),
    db
      .prepare(
        `INSERT OR IGNORE INTO work_order_intakes (id, organization_id, source, external_id, status, data_json, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        INTAKE_ID,
        TECHFLEX_ORG_ID,
        "spinlife",
        "00181126001N-3",
        "spinlife_assigned",
        JSON.stringify({ customerName: "Riley Audit Fictional", equipmentType: "Lift Chair" }),
        "user-admin-1",
        "user-admin-1",
      ),
    db
      .prepare(
        `INSERT OR REPLACE INTO spinlife_visits (intake_id, technician_id, technician_pay_cents, scheduled_start, visit_json, last_mutation_id) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(INTAKE_ID, TECHNICIAN_ID, 7500, PLANNED_DATE, "{}", "mutation-1"),
  ]);
}

describe("Ticket F05: assigned SpinLife jobs are eligible in the real dispatch/appointment query", () => {
  beforeEach(async () => {
    await seedAssignedSpinLifeFixture();
  });

  it("includes the assigned SpinLife order in the appointment picker for its planned date", async () => {
    const result = await loadDispatch(PLANNED_DATE, adminIdentity);
    const match = (result.available as any[]).find((item) => item.externalId === "00181126001N-3");

    expect(match).toBeTruthy();
    expect(match.isSpinLife).toBe(true);
    expect(match.technicianId).toBe(TECHNICIAN_ID);
    expect(match.technicianPayCents).toBe(7500);
  });

  it("does not surface the SpinLife order when viewing an unrelated date", async () => {
    const result = await loadDispatch(UNRELATED_DATE, adminIdentity);
    const availableMatch = (result.available as any[]).find((item) => item.externalId === "00181126001N-3");
    const scheduledMatch = (result.scheduled as any[]).find((item) => item.externalId === "00181126001N-3");

    expect(availableMatch).toBeFalsy();
    expect(scheduledMatch).toBeFalsy();
  });

  it("includes the SpinLife order regardless of date when viewing all work", async () => {
    const result = await loadDispatch(UNRELATED_DATE, adminIdentity, true);
    const match = [...(result.available as any[]), ...(result.scheduled as any[])].find(
      (item) => item.externalId === "00181126001N-3",
    );

    expect(match).toBeTruthy();
  });

  it("moves the order into the scheduled bucket once a confirmed time is set", async () => {
    await env.DB.prepare(`UPDATE spinlife_visits SET scheduled_start = ? WHERE intake_id = ?`)
      .bind(`${PLANNED_DATE}T09:00:00.000Z`, INTAKE_ID)
      .run();

    const result = await loadDispatch(PLANNED_DATE, adminIdentity);
    const scheduledMatch = (result.scheduled as any[]).find((item) => item.externalId === "00181126001N-3");
    const availableMatch = (result.available as any[]).find((item) => item.externalId === "00181126001N-3");

    expect(scheduledMatch).toBeTruthy();
    expect(availableMatch).toBeFalsy();
  });
});
