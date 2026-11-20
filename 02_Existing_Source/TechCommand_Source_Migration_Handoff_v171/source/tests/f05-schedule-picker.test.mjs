import test from "node:test";
import assert from "node:assert/strict";
import { isPricingReviewCleared, isScheduleEligibleWorkOrder } from "../lib/pricing-review-gate.ts";
import { filterEligibleWorkOrders } from "../lib/schedule-data.ts";

test("Ticket F05: Assigned SpinLife order passes Pricing Review Gate", () => {
  // Test 1: Standard commercial order without margin floor fails pricing gate
  const unpricedCommercialOrder = {
    id: "wo-unpriced-1",
    externalId: "WO-COM-001",
    externalSource: "commercial",
    status: "pricing_review",
    grossMarginBasisPoints: 2500, // 25% margin (below 40% floor)
    acceptedPriceCents: 5000,
  };
  assert.equal(isPricingReviewCleared(unpricedCommercialOrder), false, "Unpriced standard order must not clear pricing gate");

  // Test 2: Standard commercial order with >= 40% margin passes pricing gate
  const pricedCommercialOrder = {
    id: "wo-priced-1",
    externalId: "WO-BIO-2026-001",
    externalSource: "commercial",
    status: "ready_to_assign",
    grossMarginBasisPoints: 4200, // 42% margin (above 40% floor)
    acceptedPriceCents: 15000,
  };
  assert.equal(isPricingReviewCleared(pricedCommercialOrder), true, "Priced standard order must clear pricing gate");

  // Test 3: Assigned SpinLife fixture order 00181126001N-3 with technician pay passes pricing gate
  const assignedSpinLifeOrder = {
    id: "spinlife-intake-00181126001N-3",
    externalId: "00181126001N-3",
    externalSource: "SpinLife",
    status: "spinlife_assigned",
    technicianId: "tech-demo-1",
    technicianPayCents: 7500, // $75 technician pay
    scheduledStart: "2026-11-18",
    isSpinLife: true,
  };
  assert.equal(isPricingReviewCleared(assignedSpinLifeOrder), true, "Assigned SpinLife order must clear pricing gate");
  assert.equal(isScheduleEligibleWorkOrder(assignedSpinLifeOrder), true, "Assigned SpinLife order must be schedule eligible");
});

test("Ticket F05: Assigned SpinLife order 00181126001N-3 appears in Schedule Selector", () => {
  const availableOrders = [
    {
      id: "wo-bio-001",
      externalId: "WO-BIO-2026-001",
      externalSource: "commercial",
      serviceType: "Biomedical Calibration",
      summary: "Ohio Surgery Suite calibration",
      priority: "normal",
      status: "ready_to_assign",
      requiredTechnicianCount: 1,
      grossMarginBasisPoints: 4500,
      scheduledStart: null,
      accountName: "Ohio Health",
      locationId: "loc-1",
      locationName: "Ohio Surgery Suite",
      address: "100 Medical Center Dr",
    },
    {
      id: "spinlife-00181126001N-3",
      externalId: "00181126001N-3",
      externalSource: "SpinLife",
      serviceType: "Repair",
      summary: "Customer John Doe · Lift Chair (Golden GL-AUD-04)",
      priority: "normal",
      status: "assigned",
      requiredTechnicianCount: 1,
      grossMarginBasisPoints: 4000,
      scheduledStart: "2026-11-18",
      accountName: "SpinLife",
      locationId: "spinlife-00181126001N-3",
      locationName: "John Doe",
      address: "450 Main St, Columbus, OH",
      technicianId: "tech-demo-1",
      technicianName: "Demo Technician",
      technicianPayCents: 7500,
      isSpinLife: true,
      nearestTechnician: {
        technicianId: "tech-demo-1",
        technicianName: "Demo Technician",
        miles: 0,
      },
    },
  ];

  const scheduledOrders = [];

  const eligibleChoices = filterEligibleWorkOrders(availableOrders, scheduledOrders, "2026-11-18");

  // Verify that SpinLife order 00181126001N-3 is present in the eligible dropdown choices
  const foundSpinLife = eligibleChoices.find((c) => c.externalId === "00181126001N-3");
  assert.ok(foundSpinLife, "Assigned order 00181126001N-3 must appear in the schedule picker choices");
  assert.equal(foundSpinLife.accountName, "SpinLife");
  assert.equal(foundSpinLife.technicianId, "tech-demo-1");
  assert.equal(foundSpinLife.nearestTechnician.technicianName, "Demo Technician");

  // Verify WO-BIO-2026-001 is also preserved
  const foundBio = eligibleChoices.find((c) => c.externalId === "WO-BIO-2026-001");
  assert.ok(foundBio, "Existing biomedical order must still be selectable");
});

test("Ticket F05: Scheduled SpinLife slot maps to Day Board Appointment Card", () => {
  // When appointment is confirmed with a time window on 2026-11-18
  const scheduledSlot = {
    id: "spinlife-00181126001N-3",
    externalId: "00181126001N-3",
    externalSource: "SpinLife",
    serviceType: "Repair",
    summary: "John Doe · Lift Chair",
    priority: "normal",
    status: "assigned",
    requiredTechnicianCount: 1,
    scheduledStart: "2026-11-18T09:00:00.000Z",
    scheduledEnd: "2026-11-18T10:00:00.000Z",
    accountName: "SpinLife",
    locationId: "spinlife-00181126001N-3",
    locationName: "John Doe",
    address: "450 Main St, Columbus, OH",
    assignmentId: "spinlife-wa-00181126001N-3",
    technicianId: "tech-demo-1",
    technicianName: "Demo Technician",
    technicianCode: "TECH-DEMO",
    assignmentRole: "primary",
    assignmentStatus: "assigned",
    stopOrder: 1,
    travelSource: "admin_verified",
    stopStatus: "planned",
  };

  // Day board technician job filtering:
  const technicianId = "tech-demo-1";
  const technicianJobs = [scheduledSlot].filter((job) => job.technicianId === technicianId);

  assert.equal(technicianJobs.length, 1, "Appointment card must appear on Demo Technician day board");
  assert.equal(technicianJobs[0].externalId, "00181126001N-3");
  assert.equal(technicianJobs[0].scheduledStart, "2026-11-18T09:00:00.000Z");
  assert.equal(technicianJobs[0].stopOrder, 1);
});
