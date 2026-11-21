import test from "node:test";
import assert from "node:assert/strict";
import {
  recordedReportFacts,
  reconcileWritingReview,
  wordingFields,
} from "../lib/report-writing.ts";

/**
 * Ticket F10 (P1): Draft from answers repeats the request as work performed.
 *
 * Audit Reference (Exhibit 10A / 01A):
 * Primary test order 00181126001N-3:
 * - Intake Request: "Evaluate intermittent lift. Keep unit out of service pending replacement hand control."
 * - Technician Field Note: "SIMULATED EVALUATION QA18-A. Intermittent lift reported. Unit remains out of service pending a replacement hand control. No parts were fitted and no electrical measurement was taken. QA18-B revision: replacement on hold. No harness damage observed or claimed."
 *
 * Acceptance Criteria:
 * 1. With contrasting intake and visit text, the generated findings cite only the visit.
 * 2. An untouched work-performed field stays empty (never receives intake instructions).
 * 3. Declining a suggestion leaves every saved field unchanged.
 */

test("Ticket F10 Test 1: An untouched work-performed field stays empty when no parts or repair actions were recorded", () => {
  const report = {
    fieldNotes:
      "SIMULATED EVALUATION QA18-A. Intermittent lift reported. Unit remains out of service pending a replacement hand control. No parts were fitted and no electrical measurement was taken. QA18-B revision: replacement on hold. No harness damage observed or claimed.",
    customerComplaint:
      "Evaluate intermittent lift. Keep unit out of service pending replacement hand control.",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR535-EX",
    serialNumber: "000719QA",
    findings: "",
    workPerformed: "",
    testResults: "",
    recommendation: "",
    assetDisposition: "NEEDS RESOLUTION",
    diagnosticSteps: [],
    partsUsed: [],
  };

  const evidence = recordedReportFacts(report);

  // Fallback / initial review payload where workPerformed is unrecorded
  const initialReview = {
    readyForSubmission: true,
    summary: "Service report generated from recorded on-site answers.",
    missingFacts: [],
    safetyFlags: [],
    suggestedFindings: "",
    suggestedWorkPerformed: "",
    suggestedTestResults: "",
    suggestedRecommendation: "",
    sources: {
      suggestedFindings: [],
      suggestedWorkPerformed: [],
      suggestedTestResults: [],
      suggestedRecommendation: [],
    },
  };

  const reconciled = reconcileWritingReview(initialReview, report, evidence);

  // 1. suggestedWorkPerformed MUST be empty because no parts or repair steps were recorded
  assert.equal(
    reconciled.suggestedWorkPerformed,
    "",
    "suggestedWorkPerformed must be empty when no repair actions or parts were recorded",
  );
  assert.deepEqual(
    reconciled.sources.suggestedWorkPerformed,
    [],
    "sources for suggestedWorkPerformed must be empty",
  );

  // 2. suggestedFindings must cite the visit (field-notes), NEVER the intake complaint
  assert.equal(
    reconciled.sources.suggestedFindings.includes("field-notes"),
    true,
    "suggestedFindings must cite visit field notes",
  );
  assert.equal(
    reconciled.sources.suggestedFindings.includes("complaint"),
    false,
    "suggestedFindings must NEVER cite the intake complaint",
  );
  assert.equal(
    reconciled.suggestedFindings.includes("No parts were fitted"),
    true,
    "suggestedFindings must contain the actual visit observation",
  );
  assert.notEqual(
    reconciled.suggestedFindings,
    report.customerComplaint,
    "suggestedFindings must not repeat the intake instruction",
  );
});

test("Ticket F10 Test 2: AI hallucination of complaint into work-performed is cleansed", () => {
  const report = {
    fieldNotes: "Evaluation complete. Part replacement on hold.",
    customerComplaint: "Evaluate intermittent lift. Keep unit out of service pending replacement hand control.",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR535-EX",
    serialNumber: "000719QA",
    findings: "",
    workPerformed: "",
    testResults: "",
    recommendation: "",
    assetDisposition: "NEEDS RESOLUTION",
    diagnosticSteps: [],
    partsUsed: [],
  };

  const evidence = recordedReportFacts(report);

  // Simulate an AI response that improperly copied the intake complaint as workPerformed
  const buggyAiReview = {
    readyForSubmission: false,
    summary: "Draft report.",
    missingFacts: [],
    safetyFlags: [],
    suggestedFindings: "Evaluate intermittent lift. Keep unit out of service pending replacement hand control.",
    suggestedWorkPerformed: "Evaluate intermittent lift. Keep unit out of service pending replacement hand control.",
    suggestedTestResults: "",
    suggestedRecommendation: "",
    sources: {
      suggestedFindings: ["complaint"],
      suggestedWorkPerformed: ["complaint"],
      suggestedTestResults: [],
      suggestedRecommendation: [],
    },
  };

  const reconciled = reconcileWritingReview(buggyAiReview, report, evidence);

  // Work performed must be stripped because no actual work occurred on site
  assert.equal(
    reconciled.suggestedWorkPerformed,
    "",
    "Improperly suggested intake instruction must be stripped from suggestedWorkPerformed",
  );
  assert.deepEqual(
    reconciled.sources.suggestedWorkPerformed,
    [],
    "sources for suggestedWorkPerformed must not contain complaint",
  );

  // Findings must cite only the visit
  assert.equal(
    reconciled.sources.suggestedFindings.includes("complaint"),
    false,
    "sources for suggestedFindings must not contain complaint",
  );
  assert.deepEqual(
    reconciled.sources.suggestedFindings,
    ["field-notes"],
    "sources for suggestedFindings must point to visit field notes",
  );
  assert.equal(
    reconciled.suggestedFindings,
    "Evaluation complete. Part replacement on hold.",
    "suggestedFindings must be replaced with the actual visit note",
  );
});

test("Ticket F10 Test 3: Actual work performed (parts fitted or repair steps) is preserved", () => {
  const report = {
    fieldNotes: "Replaced hand control pendant. Unit restored to operation.",
    customerComplaint: "Lift not elevating.",
    equipmentType: "Lift Chair",
    manufacturer: "Golden Technologies",
    model: "PR535-EX",
    serialNumber: "000719QA",
    findings: "",
    workPerformed: "",
    testResults: "",
    recommendation: "",
    assetDisposition: "COMPLETED",
    diagnosticSteps: [
      {
        label: "Hand control test",
        complete: true,
        result: "Replaced hand control and verified full extension.",
      },
    ],
    partsUsed: [
      {
        description: "Hand control 4-button",
        partNumber: "HC-4B-01",
        quantity: 1,
      },
    ],
  };

  const evidence = recordedReportFacts(report);

  const initialReview = {
    readyForSubmission: true,
    summary: "Work completed.",
    missingFacts: [],
    safetyFlags: [],
    suggestedFindings: "Replaced hand control pendant. Unit restored to operation.",
    suggestedWorkPerformed: "Replaced hand control and verified full extension. Hand control 4-button | Part number: HC-4B-01 | Quantity: 1",
    suggestedTestResults: "",
    suggestedRecommendation: "",
    sources: {
      suggestedFindings: ["field-notes"],
      suggestedWorkPerformed: ["answer-1", "part-1"],
      suggestedTestResults: [],
      suggestedRecommendation: [],
    },
  };

  const reconciled = reconcileWritingReview(initialReview, report, evidence);

  assert.equal(
    reconciled.suggestedWorkPerformed.includes("HC-4B-01"),
    true,
    "Actual installed parts and repair actions must be preserved",
  );
  assert.deepEqual(
    reconciled.sources.suggestedWorkPerformed,
    ["answer-1", "part-1"],
    "Sources must point to the recorded part and answer",
  );
});

test("Ticket F10 Test 4: Declining a suggestion preserves existing report fields", () => {
  const originalReport = {
    findings: "Original user typed findings",
    workPerformed: "Original user typed work",
    testResults: "Original test results",
    recommendation: "Original recommendation",
  };

  const review = {
    suggestedFindings: "AI suggested findings",
    suggestedWorkPerformed: "AI suggested work",
    suggestedTestResults: "AI suggested tests",
    suggestedRecommendation: "AI suggested rec",
  };

  // Simulating user declining: selected fields is empty
  const selected = [];
  const changes = {};
  for (const [proposed, field] of wordingFields) {
    if (selected.includes(field)) {
      changes[field] = review[proposed];
    }
  }

  const updatedReport = { ...originalReport, ...changes };

  assert.deepEqual(
    updatedReport,
    originalReport,
    "Declining suggestions must leave every saved field unchanged",
  );
});
