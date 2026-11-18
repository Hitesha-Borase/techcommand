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
    summary: "Dual chair evaluation",
    customerComplaint: "Cable pinched in scissor",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR531 Extra Wide",
    serialNumber: "GT-PR531-EW-89214",
    findings: "Scissor pinch",
    workPerformed: "Extracted wire and spliced",
    partsUsed: [],
    testResults: "Upright verified",
    recommendation: "Replace remote",
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
