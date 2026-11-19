import test from "node:test";
import assert from "node:assert/strict";
import { parseScreenshotOcr } from "../lib/imports-sync-parser.ts";

test("Ticket F03 - Brandon Fictional_Order audit case (P0): avoids Order in Phone and 'Number' as Work Order", () => {
  const ocrText = `
TECHCOMMAND OS
Work Order Number: 00071118002N-4
Customer: Morgan Audit Fictional
Phone: (614) 555-0123
Service Address: 123 Demo Street, Columbus, OH 43215
Equipment: Lift Chair
Manufacturer: Golden Technologies
Model: GL-AUD-04
  `;

  const draft = parseScreenshotOcr(ocrText);

  // 1. Work order must NOT be the header stop word 'Number'
  assert.notEqual(draft.workOrder, "Number", "Work order must not be generic header word 'Number'");
  assert.equal(draft.workOrder, "00071118002N-4", "Work order should capture complete reference 00071118002N-4");

  // 2. Phone must NOT capture work order digits 0007111800
  assert.notEqual(draft.phone, "0007111800", "Phone must not capture the first 10 digits of work order");
  assert.equal(draft.phone, "(614) 555-0123", "Phone must capture the real telephone number");

  // 3. Customer name must be captured
  assert.equal(draft.customerName, "Morgan Audit Fictional");

  // 4. Service address must be captured
  assert.equal(draft.serviceAddress, "123 Demo Street, Columbus, OH 43215");

  // 5. Equipment / Product must not repeat the label 'Equipment:'
  assert.equal(draft.product, "Lift Chair");

  // 6. Manufacturer must not be truncated to 'Golden'
  assert.equal(draft.manufacturer, "Golden Technologies");
  assert.equal(draft.model, "GL-AUD-04");
});

test("Ticket F03 - User WhatsApp report image case: clean separation of address from product", () => {
  const ocrText = `
I~ TECHFLEX MOBILITY SOLUTIONS
— N 611 Park Meadow Rd., STE B | Westerville, OH 43081
TECH LEX 877-231-TECH (8324) | service@techflexmobility.com
FIELD SERVICE REPORT PREPARED: NOVEMBER 1, 2026
PREFERRED ACTION: REQUEST RETURN AND COMPLETE CHAIR REPLACEMENT.
IF EXCHANGE IS DECLINED: AUTHORIZE A MANUFACTURER-COORDINATED
MASSAGE-SYSTEM REPAIR covering the required assemblies and associated wiring.
Jack Solomon Golden Technologies Comforter PR-531
31265 Kennedy Lane, Cottage Grove, OR 97424 3-Position Lift Chair
(541) 912-9694 Serial: GT2505EBP09022
SpinLife work order: 146610383N-17 | Work-order date: October 20, 2026
Servicing technician: Kyle Ingram
  `;

  const draft = parseScreenshotOcr(ocrText);

  // 1. Work order must be captured
  assert.equal(draft.workOrder, "146610383N-17");

  // 2. Customer must be captured
  assert.equal(draft.customerName, "Jack Solomon");

  // 3. Phone must be captured
  assert.equal(draft.phone, "(541) 912-9694");

  // 4. Service address must capture the address cleanly
  assert.equal(draft.serviceAddress, "31265 Kennedy Lane, Cottage Grove, OR 97424");

  // 5. Product must NOT contain the street address
  assert.ok(!draft.product.includes("Kennedy Lane"), "Product field should not contain the street address");
  assert.ok(!draft.product.includes("97424"), "Product field should not contain the zip code");
  assert.equal(draft.product, "3-Position Lift Chair");

  // 6. Manufacturer & model
  assert.equal(draft.manufacturer, "Golden Technologies");
  assert.equal(draft.model, "Comforter PR-531");
  assert.equal(draft.assignedTo, "Kyle Ingram");
});
