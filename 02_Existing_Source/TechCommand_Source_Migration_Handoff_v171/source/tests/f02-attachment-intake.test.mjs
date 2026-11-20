import test from "node:test";
import assert from "node:assert/strict";
import { parseSpinLifeDocument, parseWorkOrderAttachment } from "../lib/spinlife-intake.ts";

test("Ticket F02 Test 1: Labeled Work Order Fields Dynamic Extraction (Fictional_Order)", () => {
  const fictionalDocument = `
Work Order Number: 00071118002N-4
Customer: Morgan Audit Fictional
Phone: (614) 555-0123
Service Address: 204 Example Lane, Columbus, OH 43215
Job Type: Repair
Equipment: Lift chair
Manufacturer: Golden Technologies
Model: GL-AUD-04
Serial Number: 00042QA
`;

  const parsed = parseSpinLifeDocument(fictionalDocument);

  assert.equal(parsed.externalId, "00071118002N-4", "Reference/Work Order number with suffix -4 must be preserved");
  assert.equal(parsed.customerName, "Morgan Audit Fictional", "Customer name must be extracted");
  assert.equal(parsed.customerPhone, "(614) 555-0123", "Phone number must be extracted strictly from phone field");
  assert.equal(parsed.serviceAddress, "204 Example Lane, Columbus, OH 43215", "Service address must be extracted");
  assert.equal(parsed.equipmentType, "Lift Chair", "Equipment must map to Lift Chair");
  assert.equal(parsed.manufacturer, "Golden Technologies", "Manufacturer must be extracted");
  assert.equal(parsed.model, "GL-AUD-04", "Model must be extracted");
  assert.equal(parsed.serialNumber, "00042QA", "Serial number must be extracted");
  assert.equal(parsed.dmeFamilyId, "dme:lift_chair", "DME Family ID must map to dme:lift_chair");
});

test("Ticket F02 Test 2: Unknown Equipment Stays Blank (NEVER Force Power Wheelchair)", () => {
  const genericDocument = `
Work Order Number: WO-998877-B
Customer: Jane Doe
Phone: (555) 123-4567
Service Address: 100 Main St, Suite 4
Equipment: Unknown Device
Manufacturer: Acme Corp
Model: X100
`;

  const parsed = parseSpinLifeDocument(genericDocument);

  assert.equal(parsed.externalId, "WO-998877-B");
  assert.equal(parsed.customerName, "Jane Doe");
  assert.notEqual(parsed.equipmentType, "Power Wheelchair", "Fallback must NOT force Power Wheelchair on unknown equipment");
});

test("Ticket F02 Test 3: Work Order Attachment Content Parser (Offline / Fallback)", () => {
  const content = [
    {
      text: "Analyze these 1 files together as one work order.\nPasted source:\nWork Order Number: 00071118002N-4\nCustomer: Morgan Audit Fictional\nPhone: (614) 555-0123\nEquipment: Lift chair\nModel: GL-AUD-04",
      filename: "Fictional_Order.pdf",
    },
  ];

  const parsed = parseWorkOrderAttachment(content);
  assert.equal(parsed.externalId, "00071118002N-4");
  assert.equal(parsed.customerName, "Morgan Audit Fictional");
  assert.equal(parsed.customerPhone, "(614) 555-0123");
  assert.equal(parsed.equipmentType, "Lift Chair");
  assert.equal(parsed.model, "GL-AUD-04");
});

test("Ticket F02 Test 4: Real uploaded PDF bytes are decoded and parsed (no pasted text fallback)", async () => {
  // This is the exact audit failure mode: an actual PDF attachment, not pasted text.
  // The PDF's content stream is FlateDecode-compressed, same as any real-world PDF.
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Work Order Number: 00071118002N-4",
    "Customer: Morgan Audit Fictional",
    "Phone: (614) 555-0123",
    "Service Address: 204 Example Lane, Columbus, OH 43215",
    "Equipment: Lift chair",
    "Manufacturer: Golden Technologies",
    "Model: GL-AUD-04",
    "Serial Number: 00042QA",
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 20, y: 380 - i * 20, size: 10, font }));
  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");

  const parsed = parseWorkOrderAttachment([
    { filename: "Fictional_Order.pdf", file_data: `data:application/pdf;base64,${base64}` },
  ]);

  assert.equal(parsed.externalId, "00071118002N-4", "Reference must be read from actual PDF bytes, not left empty");
  assert.equal(parsed.customerName, "Morgan Audit Fictional");
  assert.equal(parsed.customerPhone, "(614) 555-0123");
  assert.equal(parsed.serviceAddress, "204 Example Lane, Columbus, OH 43215");
  assert.equal(parsed.equipmentType, "Lift Chair", "Must read the real equipment type, not default to Power Wheelchair");
  assert.equal(parsed.manufacturer, "Golden Technologies");
  assert.equal(parsed.model, "GL-AUD-04");
  assert.equal(parsed.serialNumber, "00042QA");
});
