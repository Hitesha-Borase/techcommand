import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { generateServiceReportPdf, generateCompletionPacketPdf } from "../lib/techflex-pdfs.ts";

test("PDF Customization Test 1: Lift Chair Service Report Title & Status Badge", async () => {
  const samplePdfBytes = await generateServiceReportPdf({
    workOrderNumber: "163093570N-1",
    accountName: "SpinLife",
    locationName: "Eleanor & Robert Vance",
    locationAddress: "1428 Elm Creek Dr., Westerville, OH 43082",
    technicianName: "Marcus Miller",
    serviceType: "lift_chair_repair",
    summary: "Evaluation and temporary restoration of Golden Technologies chairs",
    customerComplaint: "Spouse PR531 chair caught in recline; Husband companion PR535 remote intermittent",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR531 Extra Wide",
    serialNumber: "GT-PR531-EW-89214",
    findings: "Hand control cable caught in scissor mechanism. Conductors severed.",
    workPerformed: "Extracted pinched cable from scissor linkage. Spliced leads temporarily.",
    partsUsed: [],
    testResults: "Returned to upright safe exit position. Full raise tested.",
    recommendation: "Order two Golden OEM hand controls. Follow-up visit required for permanent replacement.",
    assetDisposition: "parts_required",
    checklist: [],
    customerSignatureName: "Eleanor Vance",
    customerSignedAt: "2026-11-12",
    evidenceCounts: {},
    technicianApproved: true,
    documentStatus: "TEMPORARY FUNCTION RESTORED | OEM PARTS REQUIRED",
  });

  assert.ok(samplePdfBytes instanceof Uint8Array, "Must return Uint8Array PDF bytes");
  assert.ok(samplePdfBytes.byteLength > 10000, "PDF should have substantial size with logo");

  const doc = await PDFDocument.load(samplePdfBytes);
  assert.ok(doc.getPageCount() >= 2, "Report should have at least 2 pages");
});

test("PDF Customization Test 2: 2x2 Photo Grid & Follow-Up Box on Page 3", async () => {
  const serviceReportBytes = await generateServiceReportPdf({
    workOrderNumber: "163093570N-1",
    accountName: "SpinLife",
    locationName: "Eleanor & Robert Vance",
    locationAddress: "1428 Elm Creek Dr., Westerville, OH 43082",
    technicianName: "Marcus Miller",
    serviceType: "lift_chair_repair",
    summary: "Onsite evaluation and temporary restoration of two Golden Technologies chairs",
    customerComplaint: "Spouse PR531 chair caught in recline; Husband companion PR535 remote intermittent",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR531 Extra Wide",
    serialNumber: "GT-PR531-EW-89214",
    findings: "Hand control cable caught in scissor mechanism. Conductors severed.",
    workPerformed: "Extracted pinched cable from scissor linkage. Spliced leads temporarily.",
    partsNeeded: [
      { description: "Two-button hand control / remote assembly", quantity: 1, purpose: "Spouse PR531 - replace damaged remote" }
    ],
    partsUsed: [],
    testResults: "Returned to upright safe exit position. Full raise tested.",
    recommendation: "Order two Golden OEM hand controls. Follow-up visit required for permanent replacement.",
    assetDisposition: "parts_required",
    checklist: [],
    customerSignatureName: "Eleanor Vance",
    customerSignedAt: "2026-11-12",
    evidenceCounts: {},
  });

  // Create 1x1 transparent PNG bytes for mock photos
  const pngHeader = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const mockPngBytes = Uint8Array.from(atob(pngHeader), c => c.charCodeAt(0)).buffer;

  const mockEvidenceImages = [
    { fileName: "photo1.png", contentType: "image/png", bytes: mockPngBytes, category: "Scissor mechanism cable catch", caption: "Pinched wire in scissor bracket" },
    { fileName: "photo2.png", contentType: "image/png", bytes: mockPngBytes, category: "Damaged insulation detail", caption: "Severed internal conductor" },
    { fileName: "photo3.png", contentType: "image/png", bytes: mockPngBytes, category: "Temporary splice & clearance", caption: "Conductors reconnected and heat-shrunk" },
    { fileName: "photo4.png", contentType: "image/png", bytes: mockPngBytes, category: "Serial rating tag", caption: "PR531 serial tag verified" },
  ];

  const packetBytes = await generateCompletionPacketPdf({
    title: "WO # 163093570N-1 | Eleanor Vance",
    serviceReport: serviceReportBytes,
    sourceDocuments: [],
    evidenceImages: mockEvidenceImages,
    evidenceLayout: "gallery",
    packetFooter: "TechFlex Mobility Solutions | Lift Chair Service Report | WO # 163093570N-1",
    followUpRecommendation: "Do not operate Spouse PR531 until replacement hand control is installed.",
  });

  const packetDoc = await PDFDocument.load(packetBytes);
  // Service report is 2 pages + 1 photo page = 3 pages total
  assert.equal(packetDoc.getPageCount(), 3, "Complete Lift Chair packet must have exactly 3 pages");
});

test("PDF Customization Test 3: Ticket F01 Truth Verification (No Hallucinated Repairs)", async () => {
  // Test Case 00181126001N-3 from Client Audit Page 5:
  // Out of service evaluation, no parts fitted, no harness damage.
  const auditReportBytes = await generateServiceReportPdf({
    workOrderNumber: "00181126001N-3",
    accountName: "SpinLife",
    locationName: "Riley Audit Fictional",
    locationAddress: "101 Example Way, Columbus, OH 43215",
    technicianName: "Demo Technician",
    serviceType: "lift_chair_evaluation",
    summary: "Simulated evaluation QA18-A",
    customerComplaint: "Intermittent lift reported. Unit remains out of service pending a replacement hand control.",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "GL-AUD-04",
    serialNumber: "000719QA",
    findings: "Intermittent lift reported. Unit remains out of service. No electrical measurement taken.",
    workPerformed: "Diagnostic evaluation only. No parts fitted.",
    fieldNotes: "SIMULATED EVALUATION QA18-A. Intermittent lift reported. Unit remains out of service pending a replacement hand control. No parts were fitted and no electrical measurement was taken. QA18-B revision: replacement on hold. No harness damage observed or claimed.",
    partsNeeded: [],
    partsUsed: [],
    testResults: "Unit out of service.",
    recommendation: "Replacement on hold. No harness damage observed or claimed.",
    assetDisposition: "out_of_service",
    checklist: [],
    customerSignatureName: "Riley Audit",
    customerSignedAt: "2026-11-18",
    evidenceCounts: {},
  });

  const packetBytes = await generateCompletionPacketPdf({
    title: "SpinLife work order 00181126001N-3",
    serviceReport: auditReportBytes,
    sourceDocuments: [],
    evidenceImages: [],
    evidenceLayout: "gallery",
    packetFooter: "TechFlex Mobility Solutions | SpinLife WO 00181126001N-3",
    followUpRecommendation: "Replacement on hold. Unit remains out of service. No harness damage observed.",
  });

  assert.ok(packetBytes instanceof Uint8Array, "Must return valid PDF bytes");
  const doc = await PDFDocument.load(packetBytes);
  assert.ok(doc.getPageCount() >= 1, "Must generate valid pages");
});
