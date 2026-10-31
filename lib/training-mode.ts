export type TrainingQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  rationale: string;
};

export type TrainingLesson = {
  moduleKey: string;
  version: number;
  title: string;
  objective: string;
  coaching: Record<"identify" | "evidence" | "service" | "signature" | "review", string>;
  questions: TrainingQuestion[];
};

const common = {
  identify: "Match the physical manufacturer label to the work order. A guessed serial number breaks warranty, asset history, and future diagnostics.",
  evidence: "Photograph the condition you actually found. Frame the full unit first, then capture readable labels and the exact fault area.",
  signature: "Review the final condition and unresolved recommendations with the customer before requesting acknowledgement.",
  review: "Read the report as if another technician must continue tomorrow. If they cannot understand the fault, action, and final test, the record is not finished.",
};

export function trainingLesson(serviceType: string): TrainingLesson {
  if (serviceType.startsWith("biomed_pm")) return {
    moduleKey: "biomed-pm-field-standard", version: 1, title: "Biomedical PM field standard",
    objective: "Verify identity, perform the approved PM procedure, record measured results, and isolate unsafe equipment.",
    coaching: { ...common, service: "Use the current manufacturer or approved facility procedure. Record the measurement and allowable limit—not only the word ‘pass.’ A safety-critical failure requires quarantine and escalation." },
    questions: [
      { id: "pm-failure", prompt: "What happens when a safety-critical device fails a required test?", options: ["Return it to service with a note", "Quarantine it and escalate", "Delete the failed result"], correctIndex: 1, rationale: "A safety-critical failure must not be returned to patient use." },
      { id: "pm-measurement", prompt: "What makes a PM test result defensible?", options: ["A check mark", "The measured value, limit, and pass/fail result", "A photo of the building"], correctIndex: 1, rationale: "The result needs enough detail for QA and a future reviewer to verify the decision." },
      { id: "pm-identity", prompt: "Which record must match the physical equipment label?", options: ["Only the room number", "Manufacturer, model, serial, and asset identity", "Technician home address"], correctIndex: 1, rationale: "PM history is only reliable when it is attached to the correct physical asset." },
    ],
  };
  if (serviceType.startsWith("wgd") || serviceType === "bed_delivery" || serviceType === "consumer_install") return {
    moduleKey: "delivery-installation-field-standard", version: 1, title: "Delivery and installation field standard",
    objective: "Document freight condition, verify every component, assemble safely, test under load, and teach the customer.",
    coaching: { ...common, evidence: "Photograph every carton before opening, especially crushed corners, punctures, wet areas, broken bands, or re-taping. Then capture the complete assembled unit and readable serial label.", service: "Inventory every carton and accessory before assembly. Follow the approved setup sequence, then perform unloaded and loaded functional tests before demonstration." },
    questions: [
      { id: "delivery-damage", prompt: "When should freight damage be photographed?", options: ["After the cartons are discarded", "Before opening the packaging", "Only if the customer asks"], correctIndex: 1, rationale: "Arrival-condition evidence protects the customer, carrier claim, client, and TechFlex." },
      { id: "delivery-test", prompt: "What must happen before customer demonstration?", options: ["Unloaded and loaded functional testing", "Invoice creation", "Technician payout approval"], correctIndex: 0, rationale: "The equipment must be verified operational and safe before it is presented as complete." },
      { id: "delivery-weight", prompt: "What should a technician do if the unit or site requires more crew than assigned?", options: ["Attempt it alone", "Stop and escalate the crew/safety issue", "Ask the customer to lift it"], correctIndex: 1, rationale: "Crew and handling limits are safety controls, not suggestions." },
    ],
  };
  return {
    moduleKey: "diagnostic-repair-field-standard", version: 1, title: "Diagnostic and repair field standard",
    objective: "Confirm the complaint, reproduce the symptom, isolate root cause, document the repair, and prove the final condition.",
    coaching: { ...common, service: "Move from symptom to root cause in a repeatable order: visual inspection, power and connection checks, approved diagnostic sequence, measured result, corrective action, then a loaded final test." },
    questions: [
      { id: "repair-symptom", prompt: "What comes before replacing a part?", options: ["Confirm and reproduce the reported symptom", "Write the invoice", "Mark the job complete"], correctIndex: 0, rationale: "Replacing parts without confirming the symptom creates repeat visits and weak reports." },
      { id: "repair-proof", prompt: "What best proves the repair outcome?", options: ["‘Fixed’", "A documented loaded functional test and final condition", "The technician’s confidence"], correctIndex: 1, rationale: "A specific final test is repeatable evidence; ‘fixed’ is not." },
      { id: "repair-safety", prompt: "May a failed safety interlock be bypassed to finish the job?", options: ["Yes, temporarily", "Only with customer permission", "No—stop, make safe, and escalate"], correctIndex: 2, rationale: "Safety devices and interlocks may not be bypassed." },
    ],
  };
}

export function publicTrainingLesson(lesson: TrainingLesson) {
  return {
    ...lesson,
    questions: lesson.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      rationale: question.rationale,
    })),
  };
}

export function gradeTrainingLesson(lesson: TrainingLesson, answers: Record<string, number>) {
  const results = lesson.questions.map((question) => ({ id: question.id, correct: answers[question.id] === question.correctIndex, correctIndex: question.correctIndex, rationale: question.rationale }));
  const correct = results.filter((result) => result.correct).length;
  const scorePercent = Math.round((correct / Math.max(lesson.questions.length, 1)) * 100);
  return { scorePercent, passed: scorePercent >= 80, results };
}
