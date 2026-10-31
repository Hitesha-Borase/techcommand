export type EvidenceFields = {
  externalSource?: string;
  clientAccountName?: string;
  externalId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceAddress?: string;
  serviceType?: string;
  summary?: string;
  customerComplaint?: string;
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  sourceAssignedTechnician?: string;
  sourceDispatchAddress?: string;
  authorization?: number;
  onsiteHours?: number;
  technicianCount?: number;
  weightLb?: number;
  partsCount?: number;
  stairsCount?: number;
  confidence?: number;
  warnings?: string[];
};

const valueAfter = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*(?:[:#-]|\\bis\\b)?\\s*([^\\n]{2,160})`, "im"));
    if (match?.[1]) return match[1].trim().replace(/\s{2,}/g, " ");
  }
  return "";
};

function labeledAddress(text: string) {
  const flattened = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const label = /(?:service|delivery|ship\s*to|customer|job|site|location)\s*address\s*(?:[:#-])?\s*/gi;
  const street = /\d{1,6}\s+[A-Z0-9][A-Z0-9.'’#\- ]{2,80}\s(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|DRIVE|DR|LANE|LN|COURT|CT|WAY|PARKWAY|PKWY|CIRCLE|CIR|HIGHWAY|HWY|ROUTE|TRAIL|TRL|TERRACE|TER|PLACE|PL)\b(?:[ ,\n]+(?:APT|APARTMENT|SUITE|STE|UNIT|#)\s*[A-Z0-9-]+)?[ ,\n]+[A-Z][A-Z.'’ -]{1,50}[ ,]+[A-Z]{2}\s+\d{5}(?:-\d{4})?/i;
  for (const match of flattened.matchAll(label)) {
    const candidate = flattened.slice(match.index! + match[0].length, match.index! + match[0].length + 240).match(street)?.[0];
    if (candidate) return normalizeAddress(candidate);
  }
  return "";
}

export function normalizeAddress(value: string) {
  return value
    .replace(/\n+/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b(ohio|oh)\b/i, "OH")
    .replace(/\b(indiana|in)\b/i, "IN")
    .replace(/\b(kentucky|ky)\b/i, "KY")
    .replace(/\b(west virginia|wv)\b/i, "WV")
    .replace(/\b(pennsylvania|pa)\b/i, "PA")
    .trim()
    .replace(/[.,;:-]+$/, "");
}

function serviceType(text: string) {
  const lowered = text.toLowerCase();
  if (/preventative maintenance|preventive maintenance|\bpm\b/.test(lowered)) return "biomed_pm_c";
  if (/bed.*(?:delivery|install)|(?:delivery|install).*bed/.test(lowered)) return "bed_delivery";
  if (/white[ -]?glove|\bwgd\b/.test(lowered)) return /complex|stairs|oversi[sz]e/.test(lowered) ? "wgd_complex" : "wgd_basic";
  if (/diagnostic|evaluation|evaluate|inspect/.test(lowered)) return "evaluation";
  if (/frame repair/.test(lowered)) return "frame_repair";
  if (/multi[ -]?part|multiple parts/.test(lowered)) return "repair_multi";
  if (/install(?:ation)?/.test(lowered)) return "consumer_install";
  if (/biomed|biomedical/.test(lowered)) return "biomed_service_call";
  if (/repair|service call|warranty/.test(lowered)) return "repair_single";
  return "";
}

function source(text: string) {
  const lowered = text.toLowerCase();
  if (lowered.includes("spinlife")) return "spinlife";
  if (lowered.includes("invacare")) return "invacare";
  if (lowered.includes("onpoint")) return "onpoint";
  return "manual";
}

export function extractEvidenceText(text: string): EvidenceFields {
  const clean = text.replace(/\r/g, "").replace(/[^\S\n]+/g, " ");
  const workOrder = clean.match(/(?:work\s*order|service\s*order|\bwo|order)\s*(?:#|no\.?|number|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] || "";
  const amount = clean.match(/(?:pays?|authorized|authorization|approved|not\s+to\s+exceed|\bnte|total)\s*(?:amount)?\s*[:$ ]+\$?([\d,]+(?:\.\d{2})?)/i)?.[1];
  const phone = clean.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/)?.[0] || "";
  const email = clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const technician = valueAfter(clean, ["assigned\\s+technician", "technician", "service\\s+provider"]);
  const dispatchAddress = valueAfter(clean, ["dispatch\\s+origin", "route\\s+origin", "start(?:ing)?\\s+address", "technician\\s+address", "service\\s+provider\\s+address"]);
  const customer = valueAfter(clean, ["customer(?:\\s+name)?", "patient(?:\\s+name)?", "facility(?:\\s+name)?", "consumer"]);
  const account = valueAfter(clean, ["client(?:\\s+account)?", "partner", "bill\\s+to"]);
  const complaint = valueAfter(clean, ["customer\\s+complaint", "reported\\s+issue", "problem", "reason\\s+for\\s+service"]);
  const equipment = valueAfter(clean, ["equipment(?:\\s+type)?", "product", "device"]);
  const manufacturer = valueAfter(clean, ["manufacturer", "make"]);
  const model = valueAfter(clean, ["model(?:\\s+number)?", "model\\s*#"]);
  const serial = valueAfter(clean, ["serial(?:\\s+number)?", "serial\\s*#", "s/n"]);
  const address = labeledAddress(clean);
  const classified = serviceType(clean);
  const warnings = [
    !address ? "No clearly labeled service destination was found. Enter the service address before calculating mileage." : "",
    !classified ? "Job type could not be classified from the scanned text." : "",
    "Basic device OCR was used. Confirm every populated field against the original evidence.",
  ].filter(Boolean);
  return {
    externalSource: source(clean), clientAccountName: account, externalId: workOrder,
    customerName: customer, customerPhone: phone, customerEmail: email,
    serviceAddress: address, serviceType: classified,
    customerComplaint: complaint, equipmentType: equipment, manufacturer, model,
    serialNumber: serial, sourceAssignedTechnician: technician,
    sourceDispatchAddress: dispatchAddress ? normalizeAddress(dispatchAddress) : "",
    authorization: amount ? Number(amount.replaceAll(",", "")) : 0,
    summary: complaint || (classified ? classified.replaceAll("_", " ") : "Review scanned work-order evidence"),
    confidence: address && workOrder && classified ? 0.72 : 0.45,
    warnings,
  };
}
