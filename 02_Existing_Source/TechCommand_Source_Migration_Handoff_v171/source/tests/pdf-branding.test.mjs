import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { generateServiceReportPdf, generateCompletionPacketPdf } from "../lib/techflex-pdfs.ts";

// pdf-lib writes drawn text as hex strings (<...> Tj) inside FlateDecode-compressed content
// streams. Decompress each stream and decode both literal (...) and hex <...> Tj/TJ operands so
// tests can verify what our own generated reports actually say, not just that bytes exist.
function decodeHexString(hex) {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

function extractTjText(content) {
  let text = "";
  const parenTj = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")/g;
  let m;
  while ((m = parenTj.exec(content)) !== null) text += m[1] + " ";
  const hexTj = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")/g;
  while ((m = hexTj.exec(content)) !== null) text += decodeHexString(m[1]) + " ";
  const arrayTJ = /\[([^[\]]*)\]\s*TJ/g;
  while ((m = arrayTJ.exec(content)) !== null) {
    const parenParts = m[1].match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
    const hexParts = m[1].match(/<([0-9A-Fa-f\s]+)>/g) || [];
    for (const p of parenParts) text += p.slice(1, -1) + " ";
    for (const h of hexParts) text += decodeHexString(h.slice(1, -1)) + " ";
  }
  return text;
}

function extractGeneratedPdfText(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let text = extractTjText(buffer.toString("latin1"));
  let pos = 0;
  while (pos < buffer.length - 10) {
    const streamIdx = buffer.indexOf(Buffer.from("stream"), pos);
    if (streamIdx === -1) break;
    let start = streamIdx + 6;
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
    else if (buffer[start] === 0x0a) start += 1;
    const end = buffer.indexOf(Buffer.from("endstream"), start);
    if (end > start) {
      try {
        text += extractTjText(zlib.inflateSync(buffer.subarray(start, end)).toString("latin1"));
      } catch {}
      pos = end + 9;
    } else {
      pos = streamIdx + 6;
    }
  }
  return text;
}

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
  // Previously this fixture always produced 2+ pages only because free-text keywords
  // ("Husband companion PR535") triggered a fabricated second equipment row (ticket F01),
  // padding the page out. With that fabrication removed the accurate, single-chair report
  // now correctly fits on 1 page - this is the expected result of the fix, not a regression.
  assert.ok(doc.getPageCount() >= 1, "Report should generate at least 1 page");
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

  // Ticket F01 acceptance test: neither invented claim may appear anywhere in the PDF,
  // and the technician's actual recorded exception/negation must be preserved.
  const pdfText = extractGeneratedPdfText(packetBytes);
  assert.ok(
    !/scissor/i.test(pdfText),
    "PDF must not mention a scissor mechanism repair that was never recorded"
  );
  assert.ok(
    !/wiring harness requires full replacement/i.test(pdfText),
    "PDF must not claim a harness replacement that was never recorded"
  );
  assert.ok(
    !/temporar\w*\s+restor/i.test(pdfText),
    "PDF must not claim a temporary restoration that was never recorded"
  );
  assert.ok(
    /no harness damage observed or claimed/i.test(pdfText),
    "PDF must preserve the technician's actual recorded negation"
  );
});

test("PDF Customization Test 4: Ticket F01 - no fabricated companion-chair row from incidental keywords", async () => {
  // Regression guard: mentioning "companion"/"PR535"/"husband" in free-text notes must never
  // cause the PDF to invent a second, unrecorded piece of equipment with a fabricated
  // manufacturer, model and serial number.
  const reportBytes = await generateServiceReportPdf({
    workOrderNumber: "163093570N-1",
    accountName: "SpinLife",
    locationName: "Eleanor & Robert Vance",
    locationAddress: "1428 Elm Creek Dr., Westerville, OH 43082",
    technicianName: "Marcus Miller",
    serviceType: "lift_chair_repair",
    summary: "Evaluation of a single Golden Technologies chair",
    customerComplaint: "Husband mentioned his companion previously had a PR535, but only one chair was present today.",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR531 Extra Wide",
    serialNumber: "GT-PR531-EW-89214",
    findings: "Single chair evaluated. No second unit on site.",
    workPerformed: "Diagnostic evaluation only.",
    partsUsed: [],
    testResults: "Full raise tested.",
    recommendation: "No further action needed.",
    assetDisposition: "passed",
    checklist: [],
    customerSignatureName: "Eleanor Vance",
    customerSignedAt: "2026-11-12",
    evidenceCounts: {},
  });

  const pdfText = extractGeneratedPdfText(reportBytes);
  assert.ok(
    !/GT-PR535-MC-66230/i.test(pdfText),
    "PDF must not fabricate a serial number for a chair that was never actually serviced"
  );
  assert.ok(
    !/PR535 MaxiComfort/i.test(pdfText),
    "PDF must not fabricate a companion chair model that was never recorded"
  );
});
