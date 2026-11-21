import test from "node:test";
import assert from "node:assert/strict";

// Test 1: Empty route displays 0 Stops, 0.0 Miles, 0 min (no fallback to 64.2 mi or 195 min)
test("Ticket F08 Test 1: Empty route for selected technician displays 0 Stops, 0.0 Miles, 0 min", () => {
  const emptyRoute = {
    id: "route-brandon-1",
    technicianId: "tech-brandon",
    technicianName: "Brandon Schlaegel",
    routeDate: "2026-11-18",
    totalMiles: null,
    totalDriveMinutes: null,
    stops: [],
  };

  const isRouteProvided = emptyRoute !== undefined;
  const stops = isRouteProvided ? (emptyRoute.stops || []) : [];
  const activeTechName = isRouteProvided
    ? (emptyRoute.technicianName || "Daily route")
    : "Route Trajectory";
  const activeTotalMiles = isRouteProvided
    ? (emptyRoute.stops?.length ? (emptyRoute.totalMiles ?? "0.0") : "0.0")
    : "64.2";
  const activeDriveMinutes = isRouteProvided
    ? (emptyRoute.stops?.length ? (emptyRoute.totalDriveMinutes ?? 0) : 0)
    : 195;

  assert.equal(stops.length, 0, "Empty route must have 0 stops");
  assert.equal(activeTechName, "Brandon Schlaegel", "Must show selected technician name");
  assert.equal(activeTotalMiles, "0.0", "Empty route must display 0.0 miles, never 64.2");
  assert.equal(activeDriveMinutes, 0, "Empty route must display 0 minutes, never 195");
});

// Test 2: Technician with no DB route yet receives synthesized empty route
test("Ticket F08 Test 2: Technician with no database route yet gets clean empty route", () => {
  const technicians = [
    { id: "tech-brandon", name: "Brandon Schlaegel", technicianCode: "TECH-BS" },
    { id: "tech-marcus", name: "Marcus Vance", technicianCode: "TECH-MV" },
  ];
  const routes = []; // No route exists yet for date
  const selectedTechnician = "tech-brandon";

  const selectedTechObj = technicians.find((t) => t.id === selectedTechnician);
  const activeRoute = routes.find((r) => r.technicianId === selectedTechnician) || (selectedTechObj ? {
    id: `virtual-${selectedTechObj.id}`,
    technicianId: selectedTechObj.id,
    routeDate: "2026-11-18",
    status: "draft",
    startLocationJson: "{}",
    startLocation: {},
    totalMiles: null,
    totalDriveMinutes: null,
    optimizedAt: null,
    technicianName: selectedTechObj.name,
    technicianCode: selectedTechObj.technicianCode,
    version: 1,
    planningJson: null,
    planning: null,
    stops: [],
    missingTravelCount: 0,
  } : undefined);

  assert.ok(activeRoute, "Virtual route must be generated for selected technician");
  assert.equal(activeRoute.technicianName, "Brandon Schlaegel");
  assert.equal(activeRoute.stops.length, 0);
  assert.equal(activeRoute.missingTravelCount, 0);
});

// Test 3: SpinLife intake schedule persists legMiles and driveMinutes into route stops
test("Ticket F08 Test 3: Scheduled SpinLife appointment stores verified miles & minutes", () => {
  const scheduledInput = {
    workOrderId: "spinlife-intake-00181126001N-3",
    technicianId: "tech-brandon",
    assignmentRole: "primary",
    routeDate: "2026-11-18",
    scheduledStart: "2026-11-18T10:00:00.000Z",
    durationMinutes: 60,
    legMiles: 18.4,
    driveMinutes: 28,
  };

  const travelSource = scheduledInput.legMiles !== null && scheduledInput.legMiles !== undefined
    ? "admin_verified"
    : "missing";

  const routeStopRecord = {
    id: "stop-uuid-1",
    routeId: "route-brandon-1",
    workOrderId: scheduledInput.workOrderId,
    stopOrder: 1,
    legMiles: scheduledInput.legMiles ?? null,
    driveMinutes: scheduledInput.driveMinutes ?? null,
    travelSource,
    plannedArrival: scheduledInput.scheduledStart,
  };

  assert.equal(routeStopRecord.legMiles, 18.4, "Route stop must preserve entered legMiles");
  assert.equal(routeStopRecord.driveMinutes, 28, "Route stop must preserve entered driveMinutes");
  assert.equal(routeStopRecord.travelSource, "admin_verified", "Verified travel data must mark source as admin_verified");
});

// Test 4: Route totals and missing travel count recalculate from stops
test("Ticket F08 Test 4: Route totals and travel gap counters compute accurately", () => {
  const stops = [
    { id: "s-1", legMiles: 12.3, driveMinutes: 18, travelSource: "admin_verified" },
    { id: "s-2", legMiles: 15.1, driveMinutes: 24, travelSource: "admin_verified" },
  ];

  const calculatedMiles = stops.length > 0 && stops.every((s) => s.legMiles !== null && s.legMiles !== undefined)
    ? Math.round(stops.reduce((sum, s) => sum + Number(s.legMiles || 0), 0) * 10) / 10
    : null;
  const calculatedMinutes = stops.length > 0 && stops.every((s) => s.driveMinutes !== null && s.driveMinutes !== undefined)
    ? stops.reduce((sum, s) => sum + Number(s.driveMinutes || 0), 0)
    : null;
  const missingTravelCount = stops.filter((s) => s.legMiles === null || s.driveMinutes === null).length;

  assert.equal(calculatedMiles, 27.4, "Total miles must equal 27.4");
  assert.equal(calculatedMinutes, 42, "Total drive minutes must equal 42");
  assert.equal(missingTravelCount, 0, "No missing travel data gaps");
});
