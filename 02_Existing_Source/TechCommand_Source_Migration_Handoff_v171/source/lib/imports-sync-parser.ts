export type SpinLifeDraft = {
  workOrder: string;
  customerName: string;
  serviceAddress: string;
  email: string;
  phone: string;
  jobType: string;
  authorization: string;
  createdOn: string;
  product: string;
  manufacturer: string;
  model: string;
  specifications: string;
  jobNotes: string;
  assignedTo: string;
};

/**
 * Universal dynamic parser for work order screenshots and OCR text (Ticket F03).
 * Extracts strictly verified fields:
 * - Rejects generic header tokens ("Number", "No", "ID", "Order") from becoming order references.
 * - Strictly validates and binds Phone to standard telephone patterns, never grabbing raw digits from order IDs.
 * - Cleanly separates US service addresses from product/equipment descriptions.
 * - Strips redundant field label prefixes ("Equipment: ", "Product: ") from equipment values.
 * - Captures full manufacturer names (e.g. "Golden Technologies") without truncation.
 */
export function parseScreenshotOcr(text: string): SpinLifeDraft {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);

  const match = (pattern: RegExp) => clean.match(pattern)?.[1]?.trim() || "";

  // 1. Email
  const email = match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/i);

  // 2. Work Order Number
  // Must avoid stopping at 'Number' or generic header words.
  let workOrder = "";
  const woExplicit = clean.match(/(?:SpinLife\s+)?(?:Work\s*Order|WO|Reference)\s*(?:Number|No\.?|#|ID)?\s*[:.]?\s*([A-Za-z0-9-]+)/i);
  if (woExplicit) {
    let candidate = woExplicit[1].trim();
    // If candidate is a header stop word, look right after it
    if (/^(Number|No|ID|Order|Date|Type)$/i.test(candidate)) {
      const after = clean.slice(clean.indexOf(candidate) + candidate.length).match(/^[:.\s-]*([A-Za-z0-9-]+)/);
      if (after) candidate = after[1].trim();
    }
    if (candidate && !/^(Number|No|ID|Order|Date|Type)$/i.test(candidate) && /\d/.test(candidate)) {
      workOrder = candidate;
    }
  }
  if (!workOrder) {
    const woFallback = clean.match(/\b(ORD-[\w-]+|\d{8,12}[A-Za-z0-9-]*)\b/);
    if (woFallback) workOrder = woFallback[1].trim();
  }

  // 3. Phone Number
  // Priority 1: Labeled phone
  let phone = "";
  const labeledPhone = clean.match(/(?:Phone|Tel|Telephone|Cell|Mobile|Contact)\s*(?:Number|No\.?|#)?\s*[:.]?\s*(\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})/i);
  if (labeledPhone) {
    phone = labeledPhone[1].trim();
  } else {
    // Priority 2: Unlabeled standard phone with delimiters e.g. (XXX) XXX-XXXX or XXX-XXX-XXXX
    // NEVER match raw 10 digits without separators or matching order number
    const formattedPhone = clean.match(/(?:\+?1[\s.-]?)?\((\d{3})\)[\s.-]*(\d{3})[\s.-]*(\d{4})/);
    if (formattedPhone) {
      phone = `(${formattedPhone[1]}) ${formattedPhone[2]}-${formattedPhone[3]}`;
    } else {
      const hyphenPhone = clean.match(/\b(\d{3})[-.](\d{3})[-.](\d{4})\b/);
      if (hyphenPhone) {
        phone = `(${hyphenPhone[1]}) ${hyphenPhone[2]}-${hyphenPhone[3]}`;
      }
    }
  }

  // 4. Address & Product Separation
  let serviceAddress = "";
  let product = "";
  let addressLine = "";
  let cityLine = "";

  // Check labeled address
  const labeledAddress = clean.match(/(?:Service\s*Address|Customer\s*Address|Address)\s*[:.]\s*([^\n]+)/i);
  if (labeledAddress) {
    serviceAddress = labeledAddress[1].trim();
  }

  // Check labeled equipment / product
  const labeledProduct = clean.match(/(?:Primary\s*Product|Equipment|Product)\s*[:.]\s*([^\n]+)/i);
  if (labeledProduct) {
    product = labeledProduct[1].replace(/^(?:Equipment|Product|Primary\s*Product)\s*[:.]?\s*/i, "").trim();
  }

  // Check for combined address lines in OCR (e.g. "31265 Kennedy Lane, Cottage Grove, OR 97424 3-Position Lift Chair")
  const addrRegex = /(\d+\s+[A-Za-z0-9\s.,'#-]+?,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/;
  for (const line of lines) {
    const addrMatch = line.match(addrRegex);
    if (addrMatch) {
      if (!serviceAddress) {
        serviceAddress = addrMatch[1].trim();
      }
      // Check if remainder of line contains equipment / product
      const remainder = line.replace(addrMatch[1], "").trim();
      if (remainder && !product && /(?:chair|lift|scooter|wheelchair|bed|recliner|power)/i.test(remainder)) {
        product = remainder;
      }
    }
  }

  // If serviceAddress is still not found, check customerBlock or street patterns
  if (!serviceAddress) {
    const customerBlock = match(/Customer\s*Information\s*([\s\S]*?)(?:Primary\s*Product|Job\s*Details|Assigned\s*To)/i);
    if (customerBlock) {
      const customerLines = customerBlock.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !l.includes("@") && !/\d{3}.?\d{3}.?\d{4}/.test(l));
      addressLine = customerLines.find((l) => /^\d+\s+/.test(l)) || match(/\n(\d+\s+[A-Za-z0-9 .'-]+?)(?=\s+\d+\s+|\n)/);
      cityLine = customerLines.find((l) => /,\s*[A-Z]{2}\s+\d{5}/.test(l)) || match(/\n([A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5})\b/);
      serviceAddress = [addressLine, cityLine].filter(Boolean).join(", ");
    }
  }

  // If product is still empty, search for equipment keywords but EXCLUDE lines that look like addresses!
  if (!product) {
    const productLine = lines.find((line) => {
      if (addrRegex.test(line)) return false;
      if (/^\d+\s+[A-Za-z]+/.test(line)) return false; // street address
      return /(?:VivaLift|lift chair|power chair|power wheelchair|scooter|hospital bed|recliner)/i.test(line);
    });
    if (productLine) {
      product = productLine.replace(/^(?:Equipment|Product|Primary\s*Product)\s*[:.]?\s*/i, "").split(/\s{2,}|\s+Install\b/i)[0].trim();
    }
  }

  // Clean product if it accidentally captured an address
  if (product && addrRegex.test(product)) {
    const addrMatch = product.match(addrRegex);
    if (!serviceAddress && addrMatch) serviceAddress = addrMatch[1].trim();
    product = product.replace(addrRegex, "").trim();
  }

  // 5. Customer Name
  let customerName = "";
  const labeledCustomer = clean.match(/(?:Customer(?:\s*Name)?|Client)\s*[:.]\s*([A-Za-z][A-Za-z .'-]+)/i);
  if (labeledCustomer && !/^(Information|Details|Address|Phone)$/i.test(labeledCustomer[1].trim())) {
    customerName = labeledCustomer[1].trim();
  } else {
    // Check line before address or line with name + manufacturer
    for (const line of lines) {
      const nameBeforeMfg = line.match(/^([A-Za-z]{2,}\s+[A-Za-z]{2,})\s+(?:Golden|Pride|Drive|Invacare|Permobil)/i);
      if (nameBeforeMfg) {
        customerName = nameBeforeMfg[1].trim();
        break;
      }
    }
    if (!customerName) {
      const customerBlock = match(/Customer\s*Information\s*([\s\S]*?)(?:Primary\s*Product|Job\s*Details|Assigned\s*To)/i);
      if (customerBlock) {
        const customerLines = customerBlock.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !l.includes("@") && !/\d{3}.?\d{3}.?\d{4}/.test(l));
        customerName = customerLines.find((l) => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(l)) || "";
      }
    }
  }

  // 6. Manufacturer & Model
  let manufacturer = "";
  const labeledMfg = clean.match(/Manufacturer\s*[:.]\s*([^\r\n]+)/i);
  if (labeledMfg && !labeledMfg[1].toUpperCase().includes("COORDINATED")) {
    manufacturer = labeledMfg[1].trim();
  }

  if (!manufacturer || manufacturer.length < 3) {
    if (/Golden\s*Technologies/i.test(clean)) manufacturer = "Golden Technologies";
    else if (/Pride\s*Mobility/i.test(clean)) manufacturer = "Pride Mobility";
    else if (/Drive\s*Medical/i.test(clean)) manufacturer = "Drive Medical";
    else {
      const mfgFound = ["Pride", "Golden", "Invacare", "Drive", "Joerns", "Permobil"].find((name) => new RegExp(`\\b${name}\\b`, "i").test(clean));
      if (mfgFound) manufacturer = mfgFound === "Golden" ? "Golden Technologies" : mfgFound;
    }
  }

  let model = match(/Model\s*(?:No\.?|Number|#)?\s*[:.]\s*([A-Za-z0-9-]+)/i);
  if (!model) {
    const modelInText = clean.match(/\b(Comforter\s*PR-?\d+|PR-?\d+|GL-AUD-\d+|VivaLift|Atlas|Maxicomfort)\b/i);
    if (modelInText) model = modelInText[1].trim();
  }

  const authorization = match(/Job\s*Pays\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const createdOn = match(/(?:Job\s*Created\s*On|Work-order\s*date)\s*[:.]?[\s\S]{0,30}?(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+\s+\d{1,2},\s*\d{4})/i);

  return {
    workOrder,
    customerName,
    serviceAddress,
    email,
    phone,
    jobType: match(/Job\s*Type\s*([A-Za-z ]+)/i).split("\n")[0] || "Repair",
    authorization,
    createdOn,
    product,
    manufacturer,
    model,
    specifications: match(/Product\s*Specifications\s*([\s\S]*?)(?:Job\s*Details|Assigned\s*To|Job\s*Type)/i).slice(0, 1000),
    jobNotes: match(/(?:Job\s*Notes|REPORTED\s*SERVICE\s*HISTORY)\s*([\s\S]*?)(?:Repair\s*Parts|Work\s*Order|CURRENT\s*EVALUATION)/i).slice(0, 3000),
    assignedTo: match(/(?:Assigned\s*To|Servicing\s*technician)\s*[:.]?\s*([^\n]+(?:\n[^\n]+)?)/i).slice(0, 500),
  };
}
