import type { ProcedureSnapshot } from "./asset-ai-procedure";

/** Prompts are references, never evidence that a task or test was performed. */
export function fieldNotesTemplate(serviceType: string, snapshot?: ProcedureSnapshot | null) {
  const cataloging = serviceType === "biomed_cataloging";
  const prompts = cataloging
    ? ["Location / room:", "Asset tag, manufacturer, model and serial:", "Observed condition / accessories:", "Inventory discrepancies or missing information:", "Manufacturer manual / revision, if available:", "Follow-up / person notified:"]
    : ["Location / unit identity:", "Reported issue / observed findings:", "Manufacturer manual / revision used:", "Work actually performed / parts:", "Actual tests and measurements, units / limits / instrument:", "Outcome, limitations / work not performed:", "Follow-up / person notified:"];
  const document = snapshot?.document;
  if (document && !snapshot?.id.startsWith("cataloging-v1:")) {
    prompts.push("", `Reference: ${document.title} (${document.revision || "revision not recorded"})`, document.sourceUrl || "Source link not recorded", "Optional manufacturer prompts — record actual observations below each applicable item:");
    for (const step of document.steps) {
      prompts.push(`• ${step.instruction}`, `  Reference location: ${step.locator}`);
      if (step.measurements.length) prompts.push(`  Measurements: ${step.measurements.map(m => `${m.name} (${m.unit})`).join(", ")}`);
    }
  }
  return prompts.join("\n").slice(0, 9000);
}
