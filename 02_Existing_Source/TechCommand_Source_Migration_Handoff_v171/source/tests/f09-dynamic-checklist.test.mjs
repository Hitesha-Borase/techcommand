import test from "node:test";
import assert from "node:assert/strict";
import {
  partnerChecks,
  partnerCheckProblems,
  isLiftChair,
  spinlifeLiftChairChecks,
  spinlifeRepairChecks,
} from "../lib/spinlife-document-policy.ts";
import { simpleChecks, spinlifeDataSchema, spinlifeVisitSchema } from "../lib/spinlife-simple.ts";
import { dmeFieldProgress } from "../lib/dme-guided-service.ts";

test("Ticket F09 Test 1: Lift chair equipment detection matches family and explicit text", () => {
  assert.equal(isLiftChair("Lift Chair"), true);
  assert.equal(isLiftChair("Golden Technologies PR531 Lift Recliner"), true);
  assert.equal(isLiftChair("Power recliner"), true);
  assert.equal(isLiftChair("", "dme:lift_chair"), true);
  assert.equal(isLiftChair("Power Wheelchair"), false);
  assert.equal(isLiftChair("Mobility Scooter"), false);
});

test("Ticket F09 Test 2: Lift chair evaluation checklist is dynamic (14 checks total, no wheelchair checks)", () => {
  const liftChairChecks = partnerChecks("evaluation", "Lift Chair");
  const keys = liftChairChecks.map((c) => c.key);

  // Check count should be 14 (11 base + 3 closeout), NOT 18!
  assert.equal(liftChairChecks.length, 14, "Lift chair evaluation should have exactly 14 checks, not 18");

  // Relevant lift chair checks MUST be present
  assert.ok(keys.includes("sl_motor"), "Must include lift motor check");
  assert.ok(keys.includes("sl_pendant"), "Must include hand control / pendant check");
  assert.ok(keys.includes("sl_scissor_mechanism"), "Must include scissor mechanism check");
  assert.ok(keys.includes("sl_power_supply"), "Must include power supply / transformer check");
  assert.ok(keys.includes("sl_battery_backup"), "Must include emergency battery backup check");
  assert.ok(keys.includes("sl_frame"), "Must include frame check");
  assert.ok(keys.includes("sl_hardware"), "Must include hardware check");
  assert.ok(keys.includes("sl_connections"), "Must include connections check");
  assert.ok(keys.includes("sl_upholstery_worn"), "Must include upholstery check");

  // Wheelchair-specific irrelevant checks MUST NOT be present
  assert.equal(keys.includes("sl_joystick"), false, "Lift chair must NOT include joystick check");
  assert.equal(keys.includes("sl_tires_worn"), false, "Lift chair must NOT include tires/casters check");
  assert.equal(keys.includes("sl_arm_worn"), false, "Lift chair must NOT include wheelchair arm pads check");
  assert.equal(keys.includes("sl_ohms"), false, "Lift chair must NOT include drive motor resistance (ohms) check");
  assert.equal(keys.includes("sl_battery_load"), false, "Lift chair must NOT include battery reading under load check");
  assert.equal(keys.includes("sl_codes"), false, "Lift chair must NOT include wheelchair error codes check");
});

test("Ticket F09 Test 3: Wheelchair evaluation preserves standard 18 checks", () => {
  const wheelchairChecks = partnerChecks("evaluation", "Power Wheelchair");
  const keys = wheelchairChecks.map((c) => c.key);

  assert.equal(wheelchairChecks.length, 18, "Wheelchair evaluation must preserve all 18 checks");
  assert.ok(keys.includes("sl_joystick"), "Wheelchair must include joystick check");
  assert.ok(keys.includes("sl_tires_worn"), "Wheelchair must include tires/casters check");
});

test("Ticket F09 Test 4: dmeFieldProgress banner for Lift Chair reports 14 checks (never 18)", () => {
  const liftChairJob = {
    id: "job-liftchair-1",
    version: 1,
    status: "assigned",
    data: spinlifeDataSchema.parse({
      externalId: "163093570N-1",
      customerName: "Eleanor Vance",
      serviceType: "evaluation",
      equipmentType: "Lift Chair",
      manufacturer: "Golden Technologies",
      model: "PR531",
      customerComplaint: "Chair raises but scissor linkage binds when lowering",
    }),
    visit: spinlifeVisitSchema.parse({}),
    technicianId: "tech-1",
    technicianName: "Marcus Miller",
    technicianPayCents: 7500,
    scheduledStart: "2026-11-18",
    startedAt: "2026-11-18T10:00:00Z",
    documentedAt: null,
    lastMutationId: null,
    packetAttachmentId: null,
    packetSourceVersion: null,
  };

  const progress = dmeFieldProgress(liftChairJob);
  assert.equal(progress.total, 14, "Total checks must be 14");
  assert.equal(progress.documented, 0, "Initial documented checks is 0");
  assert.equal(progress.remaining.length, 14, "Remaining checks must be 14, not 18");

  // Complaint prioritization brings scissor mechanism check to the front
  assert.equal(progress.checks[0].key, "sl_scissor_mechanism", "Scissor mechanism check must be prioritized to step 1");
});
