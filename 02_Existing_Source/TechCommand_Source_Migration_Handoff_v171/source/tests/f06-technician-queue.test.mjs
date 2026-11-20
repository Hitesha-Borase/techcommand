import test from "node:test";
import assert from "node:assert/strict";
import {
  unifyTechnicianAssignedJobs,
  calculateTechnicianQueueCounters,
} from "../lib/schedule-data.ts";

test("Ticket F06: Assigned SpinLife order unifies into technician assigned queue (Zero-Work Fix)", () => {
  const targetTechId = "tech-demo-1";

  // Simulate scheduled commercial work orders for this technician
  const scheduledOrders = [
    {
      id: "wo-bio-101",
      externalId: "WO-BIO-2026-101",
      externalSource: "commercial",
      serviceType: "biomed_pm_a",
      summary: "Biomedical Tier A PM",
      priority: "normal",
      status: "assigned",
      requiredTechnicianCount: 1,
      scheduledStart: "2026-11-20T09:00:00.000Z",
      accountName: "Ohio Health",
      locationId: "loc-1",
      locationName: "Main Hospital",
      address: "100 Medical Center Dr",
      technicianId: targetTechId,
      technicianName: "Demo Technician",
      assignmentId: "wa-101",
      assignmentRole: "primary",
      assignmentStatus: "assigned",
    },
  ];

  // Simulate SpinLife assigned orders returned in available pool (because exact time is pending)
  const availableOrders = [
    {
      id: "spinlife-order-1",
      externalId: "00181126001N-3",
      externalSource: "SpinLife",
      serviceType: "Repair",
      summary: "John Doe · Lift Chair (Golden GL-AUD-04)",
      priority: "normal",
      status: "assigned",
      requiredTechnicianCount: 1,
      scheduledStart: "2026-11-20", // Planned date for today without exact clock time
      accountName: "SpinLife",
      locationId: "loc-spin-1",
      locationName: "John Doe",
      address: "450 Main St, Columbus, OH",
      technicianId: targetTechId,
      technicianName: "Demo Technician",
      technicianPayCents: 7500,
      isSpinLife: true,
    },
    {
      id: "spinlife-order-2",
      externalId: "ORD-998877-XY",
      externalSource: "SpinLife",
      serviceType: "Repair",
      summary: "Jane Smith · Mobility Scooter",
      priority: "normal",
      status: "assigned",
      requiredTechnicianCount: 1,
      scheduledStart: null, // Unscheduled
      accountName: "SpinLife",
      locationId: "loc-spin-2",
      locationName: "Jane Smith",
      address: "800 Broad St, Columbus, OH",
      technicianId: targetTechId,
      technicianName: "Demo Technician",
      technicianPayCents: 10000,
      isSpinLife: true,
    },
    {
      id: "spinlife-order-other-tech",
      externalId: "00071118002N-4",
      externalSource: "SpinLife",
      serviceType: "Repair",
      summary: "Other Tech Order",
      priority: "normal",
      status: "assigned",
      requiredTechnicianCount: 1,
      scheduledStart: "2026-11-20",
      accountName: "SpinLife",
      locationId: "loc-spin-3",
      locationName: "Other Customer",
      address: "123 Elm St",
      technicianId: "tech-other-999", // Different technician
      technicianName: "Other Technician",
      technicianPayCents: 8000,
      isSpinLife: true,
    },
  ];

  const unified = unifyTechnicianAssignedJobs(scheduledOrders, availableOrders, targetTechId);

  // Assertions:
  // 1. Must include the commercial scheduled job
  assert.ok(unified.some(j => j.externalId === "WO-BIO-2026-101"), "Commercial scheduled job must be present");

  // 2. Must include both SpinLife jobs assigned to targetTechId
  assert.ok(unified.some(j => j.externalId === "00181126001N-3"), "SpinLife order 00181126001N-3 must be present in queue");
  assert.ok(unified.some(j => j.externalId === "ORD-998877-XY"), "SpinLife unscheduled order ORD-998877-XY must be present in queue");

  // 3. Must exclude job assigned to a different technician
  assert.ok(!unified.some(j => j.externalId === "00071118002N-4"), "Job of other technician must NOT appear in queue");

  // 4. Total Work must equal exactly 3 (1 commercial + 2 SpinLife)
  assert.equal(unified.length, 3, "Total Work count must be exactly 3");
});

test("Ticket F06: Technician Dashboard queue counters reflect Total Work and Today", () => {
  const todayStr = "2026-11-20";

  const jobs = [
    {
      id: "j-1",
      externalId: "WO-001",
      status: "assigned",
      assignmentStatus: "assigned",
      scheduledStart: "2026-11-20T10:00:00.000Z", // Today
    },
    {
      id: "j-2",
      externalId: "00181126001N-3",
      status: "assigned",
      assignmentStatus: "assigned",
      scheduledStart: "2026-11-20", // Today (SpinLife planned date)
    },
    {
      id: "j-3",
      externalId: "ORD-FUTURE-1",
      status: "assigned",
      assignmentStatus: "assigned",
      scheduledStart: "2026-11-25", // Upcoming
    },
    {
      id: "j-4",
      externalId: "ORD-UNSCHEDULED-1",
      status: "assigned",
      assignmentStatus: "assigned",
      scheduledStart: null, // Unscheduled
    },
    {
      id: "j-5",
      externalId: "ORD-DONE-1",
      status: "completed",
      assignmentStatus: "submitted",
      scheduledStart: "2026-11-19", // Prior & Completed
    },
  ];

  const counters = calculateTechnicianQueueCounters(jobs, todayStr);

  assert.equal(counters.totalWork, 5, "Total Work must be 5");
  assert.equal(counters.todayJobsCount, 2, "Today jobs must be 2 (WO-001 + 00181126001N-3)");
  assert.equal(counters.upcomingJobsCount, 1, "Upcoming jobs must be 1 (ORD-FUTURE-1)");
  assert.equal(counters.unscheduledJobsCount, 1, "Unscheduled jobs must be 1 (ORD-UNSCHEDULED-1)");
  assert.equal(counters.completedJobsCount, 1, "Completed jobs must be 1 (ORD-DONE-1)");
  assert.equal(counters.activeJobsCount, 4, "Active To-Do jobs must be 4");
});
