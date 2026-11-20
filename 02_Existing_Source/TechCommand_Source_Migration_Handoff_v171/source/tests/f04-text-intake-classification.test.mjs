import test from "node:test";
import assert from "node:assert/strict";
import { parseSpinLifeDocument } from "../lib/spinlife-intake.ts";

// Ticket F04: Explicit equipment and job types are misclassified.
// The five audit fixtures below are taken directly from the client audit's
// "What the parser returned" table (QA-BED-18N-1 .. QA-UNKN-18N-5).

test("Ticket F04 Case 1 (QA-BED-18N-1): 'Bed delivery / Hospital bed' must not become Power Wheelchair", () => {
  const text = `Work Order Number: QA-BED-18N-1
Job Type: Bed delivery
Equipment: Hospital bed
Requested Work: Deliver and set up hospital bed`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.externalId, "QA-BED-18N-1");
  assert.equal(parsed.equipmentType, "Hospital Bed", "Equipment must honor the explicit label, not scan the rest of the document");
  assert.equal(parsed.serviceType, "bed_delivery");
  assert.equal(parsed.customerComplaint, "Deliver and set up hospital bed");
});

test("Ticket F04 Case 2 (QA-WGD-18N-2): 'White-glove delivery / Mobility scooter' must not become Bed delivery", () => {
  const text = `Work Order Number: QA-WGD-18N-2
Job Type: White-glove delivery
Equipment: Mobility scooter
Requested Work: White-glove delivery and setup of mobility scooter`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.externalId, "QA-WGD-18N-2");
  assert.equal(parsed.equipmentType, "Mobility Scooter");
  assert.equal(parsed.serviceType, "wgd_basic", "'White-glove delivery' must be recognized despite the hyphen, not silently fail to match");
});

test("Ticket F04 Case 3 (QA-REP-18N-3): 'Repair / Power wheelchair' must not become Lift Chair", () => {
  const text = `Work Order Number: QA-REP-18N-3
Job Type: Repair
Equipment: Power wheelchair
Requested Work: Repair power wheelchair drive wheel`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.externalId, "QA-REP-18N-3");
  assert.equal(parsed.equipmentType, "Power Wheelchair");
  assert.equal(parsed.serviceType, "repair_single");
  assert.equal(
    parsed.dmeFamilyId,
    "dme:power_wheelchair",
    "'Power Wheelchair' contains the substring 'chair' and must not collide with the lift-chair family",
  );
});

test("Ticket F04 Case 4 (QA-PM-18N-4): 'Preventive maintenance (PM) / Training scale' must stay unclassified, not Power Wheelchair", () => {
  const text = `Work Order Number: QA-PM-18N-4
Job Type: Preventive maintenance (PM)
Equipment: Training scale
Requested Work: Annual PM on training scale`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.externalId, "QA-PM-18N-4");
  assert.equal(
    parsed.equipmentType,
    "Training scale",
    "An uncatalogued equipment type must be kept verbatim for human review, not forced into Power Wheelchair",
  );
  assert.equal(
    parsed.serviceType,
    "preventive_maintenance",
    "'Preventive maintenance (PM)' must be recognized despite the parentheses, not fall back to 'Choose later'",
  );
  assert.equal(parsed.dmeFamilyId, null, "An uncatalogued equipment type has no DME family");
});

test("Ticket F04 Case 5 (QA-UNKN-18N-5): 'Unspecified / Unspecified' must stay unclassified, not become Repair / Power Wheelchair", () => {
  const text = `Work Order Number: QA-UNKN-18N-5
Job Type: Unspecified
Equipment: Unspecified
Requested Work: Details to follow`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.externalId, "QA-UNKN-18N-5");
  assert.equal(parsed.equipmentType, null, "Unspecified equipment must stay null, never Power Wheelchair");
  assert.equal(parsed.serviceType, null, "Unspecified job type must stay null, never Repair");
  assert.equal(parsed.customerComplaint, "Details to follow", "The requested-work text must still be preserved");
});

test("Ticket F04: an explicit equipment label is honored even when other equipment words appear elsewhere in the paste", () => {
  // A technician note mentioning a different piece of equipment in passing must never
  // override the explicitly labeled Equipment field (the old code fell back to scanning
  // the entire document whenever keyword-matching ran, not just the labeled value).
  const text = `Work Order Number: QA-NOTE-18N-6
Equipment: Mobility scooter
Requested Work: Customer also asked about a possible future hospital bed and lift chair purchase, unrelated to this visit.`;

  const parsed = parseSpinLifeDocument(text);

  assert.equal(parsed.equipmentType, "Mobility Scooter", "The explicit Equipment label must win over incidental words in the requested-work text");
});
