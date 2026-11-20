/**
 * SpinLife Attachment Intake & Field Mapping
 * Ticket F02 (P0) — Attachment Intake Field Mapping
 *
 * Provides dynamic, non-hardcoded extraction for uploaded work order attachments
 * (PDF, JPG, PNG) and pasted text:
 * - Maps labeled fields: Work Order Number, Customer, Phone, Service Address, Equipment, Make, Model, Serial
 * - Prevents fallback from forcing "Power Wheelchair"
 * - Leaves unknown equipment blank/null for human review
 */

import zlib from "node:zlib";
import { parseScreenshotOcr } from "./imports-sync-parser.ts";

export interface ParsedWorkOrderFields {
  externalId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  serviceAddress: string | null;
  equipmentType: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  serviceType: string | null;
  customerComplaint: string | null;
  summary: string | null;
  dmeFamilyId: string | null;
}

/**
 * Normalizes labeled OCR / AI document fields (e.g. work_order_number -> externalId,
 * customer -> customerName, phone -> customerPhone, etc.) to match the portal schema.
 */
export function normalizeIntakeFields(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== "object") return obj;
  const normalized = { ...obj };

  if (!normalized.externalId && (normalized.work_order_number || normalized.workOrderNumber || normalized.work_order || normalized.order_number || normalized.orderNumber || normalized.reference)) {
    normalized.externalId = normalized.work_order_number || normalized.workOrderNumber || normalized.work_order || normalized.order_number || normalized.orderNumber || normalized.reference;
  }
  if (!normalized.customerName && (normalized.customer || normalized.client || normalized.patient)) {
    normalized.customerName = normalized.customer || normalized.client || normalized.patient;
  }
  if (!normalized.customerPhone && (normalized.phone || normalized.telephone || normalized.contact_phone)) {
    normalized.customerPhone = normalized.phone || normalized.telephone || normalized.contact_phone;
  }
  if (!normalized.serviceAddress && (normalized.service_address || normalized.address || normalized.location)) {
    normalized.serviceAddress = normalized.service_address || normalized.address || normalized.location;
  }
  if (!normalized.equipmentType && (normalized.equipment || normalized.equipment_type || normalized.device)) {
    normalized.equipmentType = normalized.equipment || normalized.equipment_type || normalized.device;
  }
  if (!normalized.serialNumber && (normalized.serial_number || normalized.serial || normalized.sn)) {
    normalized.serialNumber = normalized.serial_number || normalized.serial || normalized.sn;
  }
  if (!normalized.manufacturer && (normalized.make || normalized.brand)) {
    normalized.manufacturer = normalized.make || normalized.brand;
  }
  // Ticket F04 fix: never force "repair_single" when the job type text doesn't match a known
  // category - that silently relabeled uncatalogued/unspecified work as "Repair". Leave it
  // unset so the caller's own null-handling applies, same as equipmentType above.
  if (!normalized.serviceType && (normalized.job_type || normalized.jobType)) {
    const jt = String(normalized.job_type || normalized.jobType).toLowerCase();
    const inferred = jt.includes("repair")
      ? "repair_single"
      : jt.includes("preventive") || /\bpm\b/.test(jt)
      ? "preventive_maintenance"
      : jt.includes("eval")
      ? "evaluation"
      : jt.includes("bed")
      ? "bed_delivery"
      : jt.includes("delivery") || jt.includes("setup")
      ? "wgd_basic"
      : null;
    if (inferred) normalized.serviceType = inferred;
  }

  // Ensure default required fields for bidFields schema
  if (!normalized.clientAccountName) normalized.clientAccountName = "SpinLife";
  if (!normalized.externalSource) normalized.externalSource = "spinlife";
  if (normalized.confidence === undefined) normalized.confidence = 0.9;
  if (!Array.isArray(normalized.warnings)) normalized.warnings = [];
  if (!Array.isArray(normalized.checklistItems)) normalized.checklistItems = [];
  if (normalized.customerEmail === undefined) normalized.customerEmail = null;
  if (normalized.summary === undefined) normalized.summary = normalized.customerComplaint || (normalized.externalId ? `Work order ${normalized.externalId}` : "Work order details extracted");
  if (normalized.customerComplaint === undefined) normalized.customerComplaint = null;
  if (normalized.sourceAssignedTechnician === undefined) normalized.sourceAssignedTechnician = null;
  if (normalized.sourceDispatchAddress === undefined) normalized.sourceDispatchAddress = null;
  if (normalized.authorization === undefined) normalized.authorization = null;
  if (normalized.onsiteHours === undefined) normalized.onsiteHours = null;
  if (normalized.technicianCount === undefined) normalized.technicianCount = 1;
  if (normalized.weightLb === undefined) normalized.weightLb = null;
  if (normalized.partsCount === undefined) normalized.partsCount = 0;
  if (normalized.stairsCount === undefined) normalized.stairsCount = 0;

  return normalized;
}

function decodeHexPdfString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

/**
 * Extracts the operands of (text)Tj, <hex>Tj and [(text)/<hex> ...]TJ text-showing operators.
 * Each Tj/TJ call is joined with a newline (not a space) because each one is normally a
 * separate visual line (positioned via its own Td/Tm) - joining with spaces instead merges
 * adjacent label/value lines (e.g. "Customer: Morgan Audit Fictional" + "Phone: (614)...")
 * into one run, which broke the line-based field regexes below.
 */
function extractShowTextOperands(content: string): string {
  let text = "";
  const parenTj = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")/g;
  let match: RegExpExecArray | null;
  while ((match = parenTj.exec(content)) !== null) text += match[1] + "\n";
  const hexTj = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")/g;
  while ((match = hexTj.exec(content)) !== null) text += decodeHexPdfString(match[1]) + "\n";
  const arrayTJ = /\[([^[\]]*)\]\s*TJ/g;
  while ((match = arrayTJ.exec(content)) !== null) {
    const parenParts = match[1].match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
    const hexParts = match[1].match(/<([0-9A-Fa-f\s]+)>/g) || [];
    const pieces = [
      ...parenParts.map((p) => p.slice(1, -1)),
      ...hexParts.map((h) => decodeHexPdfString(h.slice(1, -1))),
    ];
    if (pieces.length) text += pieces.join(" ") + "\n";
  }
  return text;
}

/**
 * Extracts human-readable text from raw PDF bytes (uncompressed strings and FlateDecode streams).
 */
export function extractTextFromPdfBuffer(buf: Buffer | Uint8Array): string {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let extracted = "";

  // 1. Text-showing operators sitting directly in the (rare, uncompressed) outer bytes.
  extracted += extractShowTextOperands(buffer.toString("latin1"));

  // 2. FlateDecode compressed content streams - the common case for real-world PDFs.
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
        const decStr = zlib.inflateSync(buffer.subarray(start, end)).toString("latin1");
        // Ticket F02 fix: only extract real text-showing operators from the decompressed
        // stream. The previous loose alphanumeric scan here pulled in PDF operators,
        // coordinates and font names as if they were document text, which broke the
        // label/value adjacency that parseSpinLifeDocument's field regexes rely on -
        // leaving reference/customer/phone/address/equipment all empty.
        extracted += extractShowTextOperands(decStr);
      } catch {}
      pos = end + 9;
    } else {
      pos = streamIdx + 6;
    }
  }

  return extracted;
}

/**
 * Parses labeled work order fields from plain text or OCR output.
 * Strictly adheres to dynamic parsing with NO hardcoded test data.
 */
export function parseSpinLifeDocument(rawText: string): ParsedWorkOrderFields {
  const text = rawText || "";

  // 1. Work Order / External ID (Preserve full reference and suffixes like -4 or -B)
  let externalId: string | null = null;
  const woMatch = text.match(
    /(?:Work\s*Order(?:\s*(?:Number|No\.?|ID|#))?|\bWO\b(?:\s*(?:Number|No\.?|ID|#))?|\bOrder\s*(?:Number|No\.?|ID|#|Ref(?:erence)?)?|\bJob\s*(?:Number|No\.?|ID|#)?)\s*[:#=\-]?\s*([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*)/i,
  );
  if (woMatch && woMatch[1]) {
    const candidate = woMatch[1].trim();
    if (!/^(work|order|number|none|null|undefined|na|n\/a|add|later)$/i.test(candidate)) {
      externalId = candidate;
    }
  }
  if (!externalId) {
    const broadWoMatch = text.match(/\b(00\d{8,}[A-Za-z0-9\-]*|WO[- ]?[0-9A-Za-z\-]+)\b/i);
    if (broadWoMatch) externalId = broadWoMatch[1].trim();
  }

  // 2. Customer Name
  let customerName: string | null = null;
  const custMatch = text.match(
    /(?:Customer(?:\s*Name)?|Client(?:\s*Name)?|Patient(?:\s*Name)?)\s*[:#=\-]?\s*([A-Za-z0-9\s.,'-]+?)(?=\r?\n|$)/i,
  );
  if (custMatch && custMatch[1]) {
    const candidate = custMatch[1].trim();
    if (!/^(add\s*now|add\s*now\s*or\s*later|none|null|undefined|na|n\/a)$/i.test(candidate)) {
      customerName = candidate;
    }
  }

  // 3. Customer Phone (Strictly validate standard phone structure)
  let customerPhone: string | null = null;
  const phoneMatch = text.match(
    /(?:Phone|Tel(?:ephone)?|Cell(?:ular)?|Mobile|Contact(?:\s*(?:Phone|Number|#))?)\s*[:#=\-]?\s*([+]?1?[\s.\-]?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4})/i,
  );
  if (phoneMatch && phoneMatch[1]) {
    customerPhone = phoneMatch[1].trim();
  }

  // 4. Service Address
  let serviceAddress: string | null = null;
  const addrMatch = text.match(
    /(?:Service\s*Address|Service\s*Location|Delivery\s*Address|Address)\s*[:#=\-]?\s*([A-Za-z0-9\s.,'#-]+?)(?=\r?\n(?:Job|Equipment|Make|Manufacturer|Model|Phone|Customer|Work|Serial|Diagnostic)|$)/i,
  );
  if (addrMatch && addrMatch[1]) {
    const candidate = addrMatch[1].trim().replace(/\s+/g, " ");
    if (!/^(add\s*now|add\s*now\s*or\s*later|none|null|undefined|na|n\/a)$/i.test(candidate)) {
      serviceAddress = candidate;
    }
  }

  // 5. Equipment Type (Strictly avoid defaulting to "Power Wheelchair" if unknown)
  // Ticket F04 fix: classify ONLY from the explicitly labeled "Equipment:" value. This
  // previously fell back to scanning the ENTIRE pasted text (`eqRaw || text`) whenever no
  // label was found, so an incidental word anywhere in unrelated notes/boilerplate could
  // override - or invent - the equipment type instead of honoring the explicit label.
  let equipmentType: string | null = null;
  const eqMatch = text.match(/Equipment(?:\s*Type)?\s*[:#=\-]?\s*([^\r\n]+)/i);
  const eqRaw = eqMatch ? eqMatch[1].trim() : "";

  if (eqRaw && !/^(add|now|later|none|null|na|n\/a|unclassified|choose\s*later|unspecified)$/i.test(eqRaw)) {
    if (/lift\s*chair|recliner/i.test(eqRaw)) {
      equipmentType = "Lift Chair";
    } else if (/power\s*wheelchair|powerchair/i.test(eqRaw)) {
      equipmentType = "Power Wheelchair";
    } else if (/mobility\s*scooter|\bscooter\b/i.test(eqRaw)) {
      equipmentType = "Mobility Scooter";
    } else if (/hospital\s*bed|\bbed\b/i.test(eqRaw)) {
      equipmentType = "Hospital Bed";
    } else if (/manual\s*wheelchair/i.test(eqRaw)) {
      equipmentType = "Manual Wheelchair";
    } else {
      // Uncatalogued (e.g. "Training scale") - kept verbatim so a human sees exactly what
      // was written and can classify it, instead of being silently forced into a wrong
      // catalog bucket like "Power Wheelchair".
      equipmentType = eqRaw;
    }
  }
  // If no explicit label was found at all, leave equipmentType as null so human review notices it.

  // 6. Manufacturer / Make
  let manufacturer: string | null = null;
  const makeMatch = text.match(
    /(?:Manufacturer|Make)\s*[:#=\-]?\s*([A-Za-z0-9\s.,'-]+?)(?=\r?\n|$)/i,
  );
  if (makeMatch && makeMatch[1]) {
    const candidate = makeMatch[1].trim();
    if (!/^(add|now|later|none|null|na|n\/a)$/i.test(candidate)) {
      manufacturer = candidate;
    }
  }

  // 7. Model
  let model: string | null = null;
  const modelMatch = text.match(
    /Model(?:\s*(?:Number|No\.?|#))?\s*[:#=\-]?\s*([A-Za-z0-9\s.,'_-]+?)(?=\r?\n|$)/i,
  );
  if (modelMatch && modelMatch[1]) {
    const candidate = modelMatch[1].trim();
    if (!/^(add|now|later|none|null|na|n\/a)$/i.test(candidate)) {
      model = candidate;
    }
  }

  // 8. Serial Number
  let serialNumber: string | null = null;
  const snMatch = text.match(
    /(?:Serial(?:\s*(?:Number|No\.?|#))?|SN)\s*[:#=\-]?\s*([A-Za-z0-9_-]+)/i,
  );
  if (snMatch && snMatch[1]) {
    const candidate = snMatch[1].trim();
    if (!/^(add|now|later|none|null|na|n\/a)$/i.test(candidate)) {
      serialNumber = candidate;
    }
  }

  // 9. Service / Job Type
  // Ticket F04 fix: the capture class previously excluded "-" and "(" "/" ")", so labels like
  // "White-glove delivery" or "Preventive maintenance (PM)" simply failed to match at all.
  let serviceType: string | null = null;
  const typeMatch = text.match(
    /(?:Job\s*Type|Service\s*Type)\s*[:#=\-]?\s*([A-Za-z0-9\s./()\-]+)(?=\r?\n|$)/i,
  );
  if (typeMatch && typeMatch[1]) {
    const rawType = typeMatch[1].trim().toLowerCase();
    if (rawType.includes("repair")) serviceType = "repair_single";
    else if (rawType.includes("preventive") || /\bpm\b/.test(rawType)) serviceType = "preventive_maintenance";
    else if (rawType.includes("eval")) serviceType = "evaluation";
    else if (rawType.includes("bed")) serviceType = "bed_delivery";
    else if (rawType.includes("delivery") || rawType.includes("setup")) serviceType = "wgd_basic";
    // Anything else (e.g. "Unspecified") stays null/unclassified rather than guessing.
  }

  // 10. Complaint / Requested Work
  let customerComplaint: string | null = null;
  const complaintMatch = text.match(
    /(?:Requested\s*Work|Problem|Complaint|Issue|Description)\s*[:#=\-]?\s*([^\r\n]+(?:\r?\n[^\r\n]+)?)/i,
  );
  if (complaintMatch && complaintMatch[1]) {
    customerComplaint = complaintMatch[1].trim();
  }

  // DME Family ID mapping
  // Ticket F04 fix: match the exact normalized equipmentType value, not loose substring
  // checks. "Power Wheelchair" contains the substring "chair" (wheel-chair), so the old
  // lift-chair check - listed first - matched it before the power-wheelchair check ever ran.
  let dmeFamilyId: string | null = null;
  if (equipmentType === "Lift Chair") dmeFamilyId = "dme:lift_chair";
  else if (equipmentType === "Power Wheelchair") dmeFamilyId = "dme:power_wheelchair";
  else if (equipmentType === "Mobility Scooter") dmeFamilyId = "dme:scooter";
  else if (equipmentType === "Hospital Bed") dmeFamilyId = "dme:bed";
  else if (equipmentType === "Manual Wheelchair") dmeFamilyId = "dme:manual_wheelchair";

  return {
    externalId,
    customerName,
    customerPhone,
    serviceAddress,
    equipmentType,
    manufacturer,
    model,
    serialNumber,
    serviceType,
    customerComplaint,
    summary: customerComplaint || (externalId ? `Work order ${externalId} intake.` : null),
    dmeFamilyId,
  };
}

/**
 * Extracts text from an array of upload parts and parses structured fields.
 */
export function parseWorkOrderAttachment(content: Array<Record<string, unknown>>): ParsedWorkOrderFields {
  let combinedText = "";

  for (const c of content) {
    if (typeof c.text === "string") {
      let t = c.text;
      const marker = "Pasted source:\n";
      const idx = t.indexOf(marker);
      if (idx !== -1) {
        t = t.slice(idx + marker.length);
      }
      combinedText += t + "\n";
    }
    if (typeof (c as any).filename === "string") {
      combinedText += (c as any).filename + "\n";
    }
    // If base64 PDF is present in fallback content, extract text from it
    if (typeof (c as any).file_data === "string" && (c as any).file_data.startsWith("data:")) {
      const match = (c as any).file_data.match(/^data:([^;]+);base64,(.+)$/);
      if (match && (match[1]?.includes("pdf") || (c as any).filename?.toLowerCase().endsWith(".pdf"))) {
        try {
          const pdfBuf = Buffer.from(match[2], "base64");
          const pdfText = extractTextFromPdfBuffer(pdfBuf);
          if (pdfText.trim()) combinedText += "\n" + pdfText + "\n";
        } catch {}
      }
    }
  }

  const primary = parseSpinLifeDocument(combinedText);
  const screenshot = parseScreenshotOcr(combinedText);

  return {
    externalId: primary.externalId || screenshot.workOrder || null,
    customerName: primary.customerName || screenshot.customerName || null,
    customerPhone: primary.customerPhone || screenshot.phone || null,
    serviceAddress: primary.serviceAddress || screenshot.serviceAddress || null,
    equipmentType: primary.equipmentType || (screenshot.product ? (
      /lift\s*chair|recliner/i.test(screenshot.product) ? "Lift Chair" :
      /power\s*wheelchair|powerchair/i.test(screenshot.product) ? "Power Wheelchair" :
      /scooter/i.test(screenshot.product) ? "Mobility Scooter" :
      /bed/i.test(screenshot.product) ? "Hospital Bed" :
      screenshot.product
    ) : null),
    manufacturer: primary.manufacturer || screenshot.manufacturer || null,
    model: primary.model || screenshot.model || null,
    serialNumber: primary.serialNumber || null,
    // Ticket F04 fix: do not force "repair_single" when nothing was actually specified -
    // leave it null so an unspecified job type stays unclassified for human review.
    serviceType: primary.serviceType || null,
    customerComplaint: primary.customerComplaint || screenshot.jobNotes || null,
    summary: primary.summary || (primary.externalId ? `Work order ${primary.externalId}` : screenshot.workOrder ? `Work order ${screenshot.workOrder}` : null),
    dmeFamilyId: primary.dmeFamilyId || null,
  };
}
