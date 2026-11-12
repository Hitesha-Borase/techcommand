import type { ProcedureSnapshot } from "./asset-ai-procedure";
export const biomedicalActivities = [
  {serviceType:"biomed_cataloging",label:"Cataloging",description:"Identify equipment and record inventory discrepancies and follow-up needs."},
  {serviceType:"biomed_pm_a",label:"Annual PM visit",description:"Follow the applicable manufacturer procedure and record actual maintenance and test results."},
  {serviceType:"biomed_service_call",label:"Service call",description:"Record the reported issue, evaluation, observations and next action."},
  {serviceType:"biomed_repair",label:"Corrective repair",description:"Document symptoms, diagnosis, parts, repairs and post-repair verification."},
] as const;
export const catalogingSteps = [
  "Confirm the facility, department or room, physical equipment location and staff contact. Record access restrictions or equipment that could not be located.",
  "Read or scan the permanent asset tag and compare it with this inventory entry. Record discrepancies without merging similar units or replacing an existing tag.",
  "Record the exact manufacturer, model and serial from the physical label, preserving punctuation and leading zeros. Note missing or unreadable identifiers rather than guessing.",
  "Photograph the identification label and equipment overview in Evidence; identify the asset in each caption. Exclude patient information.",
  "Record the equipment description, intended use, accessories, configuration and observed condition. Cataloging is not an operational or electrical-safety test; do not claim the unit passed.",
  "Record available manufacturer manuals, revision or link, and existing PM label/history and due date as observed. Flag missing references; do not create a new PM date or label.",
  "Reconcile discrepancies, unlisted equipment, missing accessories and duplicate tags. Record proposed corrections for review; do not silently overwrite the master inventory.",
  "Record unresolved issues, urgency, who was notified and the next action. Follow facility safety escalation for observed hazards; do not operate unsafe equipment.",
];
export function catalogingSnapshot(asset:{assetId:string;manufacturer:string|null;model:string|null}):ProcedureSnapshot {
  return {id:`cataloging-v1:${asset.assetId}`,retrievedAt:"",reviewedAt:null,reviewedBy:null,document:{
    manufacturer:asset.manufacturer||"",model:asset.model||"",title:"TechFlex cataloging checklist — not a manufacturer test protocol",sourceUrl:"",revision:"TechFlex cataloging v1",
    applicability:"Inventory documentation only. Does not establish PM completion, diagnosis, calibration or fitness for use.",
    limitations:["Observations are saved with this asset's work record. Master-inventory corrections require review; existing identifiers and PM dates remain unchanged."],
    steps:catalogingSteps.map((instruction,i)=>({id:`catalog-${i+1}`,instruction,sourceUrl:"https://app.techcommandhq.com",locator:"TechFlex inventory documentation workflow",conditions:"Record observed information or explain why unavailable.",expectedResult:"A factual inventory record, not a passing test result.",photoGuidance:i===3?"Photograph the full identification label and a separate equipment overview. Keep patient information out of frame and caption each image with this asset tag.":"",photoRequired:false,branches:[],measurements:[]})),
  }};
}
export function biomedicalDocumentationSteps(type:string):string[] {
  if(type==="biomed_cataloging")return [...catalogingSteps];
  if(type.startsWith("biomed_pm"))return [
    "Confirm facility, exact equipment identity, authorized PM scope and prior service issues. Keep each device's record separate.",
    "Review the applicable manufacturer procedure and revision, warnings, qualifications and required test equipment. Record missing references; do not improvise tests.",
    "Record test instrument identifiers, calibration status, setup and test conditions before following the per-asset manufacturer sequence. Never copy one asset's measurements onto another.",
    "Document maintenance actually performed and actual measurements with units, manufacturer limits and results. Explain N/A; leave deferred work unfinished.",
    "Record failures, unresolved issues, safe disposition, staff notification and repair follow-up. Selecting equipment does not claim inspection.",
    "Review each asset's evidence and report. Record PM labels and next due dates only when established under the applicable procedure and facility policy.",
  ];
  return [
    "Confirm the exact unit, authorized complaint, symptoms, occurrence conditions and relevant service history with facility staff.",
    "Review applicable manufacturer troubleshooting instructions, warnings and qualifications. Make the equipment safe under facility/manufacturer procedures; never bypass safeguards.",
    "Record diagnostic steps, actual observations, error codes and measurements with units and conditions. Distinguish a confirmed cause from a suspected cause.",
    "Identify required parts by verified manufacturer part number and unit compatibility. Record ordering needs and approval status; a request is not an order or completed repair.",
    "Document repairs actually performed, parts replaced and adjustments. If parts or authorization are pending, save progress and record the next action.",
    "Follow applicable manufacturer post-repair verification. Record actual results, limitations and safe disposition; replacement alone does not establish a successful repair.",
    "Document facility handoff, staff notification, follow-up owner and factual report. A corrective repair does not automatically complete PM.",
  ];
}
