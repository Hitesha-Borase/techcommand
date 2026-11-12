import { diagnosticWorkflow, type DiagnosticStep } from "@/lib/completion-policy";
import { biomedicalDocumentationSteps } from "./biomedical-workflows";

export type EquipmentContext = { serviceType: string; equipmentType?: string; manufacturer?: string; model?: string; summary?: string; instructions?: string[] };

/** Documentation prompts, not diagnostic findings or substitutes for model procedures. */
export function equipmentWorkflow(context: EquipmentContext): DiagnosticStep[] {
  if(context.serviceType.startsWith("biomed_"))return [...biomedicalDocumentationSteps(context.serviceType),...(context.instructions||[]).map(text=>`Dispatch scope — confirm applicability to this activity: ${text}`)].slice(0,50).map(label=>({label,complete:false,result:""}));
  const equipment = `${context.equipmentType || ""} ${context.model || ""} ${context.summary || ""}`;
  const delivery = context.serviceType.startsWith("wgd") || context.serviceType === "bed_delivery";
  const biomed = context.serviceType.startsWith("biomed");
  const poweredMobility = /power\s*(chair|wheelchair)|electric\s*(chair|wheelchair)|scooter|joystick|jazzy|hoveround/i.test(equipment);
  const liftChair = /lift\s*(chair|recliner)|power\s*recliner|reclining\s*chair/i.test(equipment);
  const questions = [
    "Verify the manufacturer, exact model and serial number against a readable label photo. Record every relevant label; do not guess an unreadable serial.",
    "Confirm the authorized scope, current manufacturer procedure and any dispatch restrictions. Record the manual or support reference; stop and escalate if a required procedure is unavailable.",
    ...(context.instructions || []),
    ...diagnosticWorkflow(context.serviceType).map(step => step.label),
  ];
  if (delivery) questions.splice(2, 0,
    "Compare the delivered cartons, accessories and options with the order. Record any shortage, damage, assembly limitation or customer concern before marking delivery complete.");
  if (poweredMobility) questions.push(
    "Inspect joystick/controller cable routing, connector seating and strain relief. Record pinch, snag or abrasion risks. Secure only as the manufacturer specifies, including approved ties where required; preserve movement and service slack.",
    "When applicable and authorized, record battery voltage at rest, powered on at idle, and under the manufacturer-specified load. Include units, individual battery or pack identity, test conditions, instrument and documented limits. If a test is unsafe or unsupported, record why it was not performed; never infer a pass.",
  );
  if (liftChair) questions.push(
    "Record the reported lift/recline symptom and observable response of the hand control, power supply and actuator functions. Identify the exact components from their labels. Follow the approved sequence; do not assume a component has failed from a symptom alone.",
    "Document cord routing, connector retention, clearance and any interference through manufacturer-authorized movement. Keep people clear of pinch points; do not bypass controls or safety devices.",
  );
  if (biomed) questions.push(
    "For this asset, record its facility tag, serial, applicable PM procedure and revision, test equipment identifier and calibration status, measured values with units and limits, and pass/fail or not-performed reasons. Never copy one asset’s measurements onto another.",
    "Record the final asset disposition, next PM due date when established, and the person notified of any failure or unresolved issue. Follow the facility’s removal-from-service process for safety-critical failures.",
  );
  questions.push("Record the actual final operating condition, remaining limitations, customer or facility handoff, and who owns the next action. Completion requires evidence; an unresolved job must retain its unresolved status.");
  return [...new Set(questions)].slice(0, 50).map(label => ({ label, complete: false, result: "" }));
}

export function nextUnansweredStep(steps: DiagnosticStep[]) {
  return steps.findIndex(step => !step.complete || !step.result.trim());
}

export function manufacturerSupport(manufacturer: string) {
  const name = manufacturer.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const contacts = [
    { matches: /^(pride|pride mobility)( |$)/, name: "Pride Mobility", phone: "800-800-8586", label: "Provider / dealer support", sourceUrl: "https://www.pridemobility.com/contact-us.asp" },
    { matches: /^(golden|golden technologies)( |$)/, name: "Golden Technologies", phone: "800-624-6374", label: "Customer & technical service", sourceUrl: "https://goldentech.com/contact/" },
    { matches: /^(hoveround|hms hoveround)( |$)/, name: "Hoveround", phone: "800-332-9279", label: "Technical support", sourceUrl: "https://www.hoveround.com/service-aftercare/tech-support" },
    { matches: /^invacare( |$)/, name: "Invacare", phone: "800-333-6900", label: "General inquiries — request product technical support", sourceUrl: "https://www.invacare.com/prospective-customer-registration/" },
  ];
  const contact = contacts.find(item => item.matches.test(name));
  return contact ? { name: contact.name, phone: contact.phone, label: contact.label, sourceUrl: contact.sourceUrl, verifiedOn: "2026-09-10" } : null;
}
