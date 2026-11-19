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
  if (!normalized.serviceType && (normalized.job_type || normalized.jobType)) {
    const jt = String(normalized.job_type || normalized.jobType).toLowerCase();
    normalized.serviceType = jt.includes("repair") ? "repair_single" : jt.includes("eval") ? "evaluation" : jt.includes("bed") ? "bed_delivery" : "repair_single";
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

/**
 * Extracts human-readable text from raw PDF bytes (uncompressed strings and FlateDecode streams).
 */
export function extractTextFromPdfBuffer(buf: Buffer | Uint8Array): string {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let extracted = "";

  // 1. Literal text objects: (Text) Tj or [(Text)] TJ
  const rawStr = buffer.toString("latin1");
  const tjRegex = /\(([^)]+)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjRegex.exec(rawStr)) !== null) {
    extracted += match[1] + " ";
  }

  // 2. FlateDecode compressed content streams
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
        const decompressed = zlib.inflateSync(buffer.subarray(start, end));
        const decStr = decompressed.toString("latin1");
        const decTjRegex = /\(([^)]+)\)\s*Tj/g;
        let dMatch: RegExpExecArray | null;
        while ((dMatch = decTjRegex.exec(decStr)) !== null) {
          extracted += dMatch[1] + " ";
        }
        // Extract word groupings
        const textTokens = decStr.match(/[A-Za-z0-9\s:,\.\(\)\#\-\/]{4,}/g);
        if (textTokens) {
          extracted += "\n" + textTokens.join(" ");
        }
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
  let equipmentType: string | null = null;
  const eqMatch = text.match(/Equipment(?:\s*Type)?\s*[:#=\-]?\s*([^\r\n]+)/i);
  const eqRaw = eqMatch ? eqMatch[1].trim() : "";

  if (/lift\s*chair|recliner/i.test(eqRaw || text)) {
    equipmentType = "Lift Chair";
  } else if (/power\s*wheelchair|powerchair/i.test(eqRaw || text)) {
    equipmentType = "Power Wheelchair";
  } else if (/mobility\s*scooter|\bscooter\b/i.test(eqRaw || text)) {
    equipmentType = "Mobility Scooter";
  } else if (/hospital\s*bed|\bbed\b/i.test(eqRaw || text)) {
    equipmentType = "Hospital Bed";
  } else if (/manual\s*wheelchair/i.test(eqRaw || text)) {
    equipmentType = "Manual Wheelchair";
  } else if (eqRaw && !/^(add|now|later|none|null|na|n\/a|unclassified)$/i.test(eqRaw)) {
    equipmentType = eqRaw;
  }
  // If unknown, leave equipmentType as null so human review notices it.

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
  let serviceType: string | null = null;
  const typeMatch = text.match(
    /(?:Job\s*Type|Service\s*Type)\s*[:#=\-]?\s*([A-Za-z\s]+)(?=\r?\n|$)/i,
  );
  if (typeMatch && typeMatch[1]) {
    const rawType = typeMatch[1].trim().toLowerCase();
    if (rawType.includes("repair")) serviceType = "repair_single";
    else if (rawType.includes("eval")) serviceType = "evaluation";
    else if (rawType.includes("bed")) serviceType = "bed_delivery";
    else if (rawType.includes("delivery") || rawType.includes("setup")) serviceType = "wgd_basic";
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
  let dmeFamilyId: string | null = null;
  if (equipmentType) {
    const eq = equipmentType.toLowerCase();
    if (eq.includes("lift") || eq.includes("chair") || eq.includes("recliner")) dmeFamilyId = "dme:lift_chair";
    else if (eq.includes("power") && eq.includes("wheelchair")) dmeFamilyId = "dme:power_wheelchair";
    else if (eq.includes("scooter")) dmeFamilyId = "dme:scooter";
    else if (eq.includes("bed")) dmeFamilyId = "dme:bed";
    else if (eq.includes("manual") && eq.includes("wheelchair")) dmeFamilyId = "dme:manual_wheelchair";
  }

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

  return parseSpinLifeDocument(combinedText);
}
