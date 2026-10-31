# TechFlex invoice reference

The invoice renderer in `lib/techflex-pdfs.ts` follows the recovered TechFlex Master Invoice Prompt, the Work Order and PDF Build Specification, and the most recent approved invoice reference. The existing application branding is unchanged.

`lib/techflex-invoice-logo.json` contains only the original logo image, embedded in the approved invoice (`libfile_cfb381e129e881919c9b882fba42a7c9`, image object 3 and its alpha mask object 4). The original 1254-by-1254 RGB pixels and transparency were extracted from the PDF without redrawing, resizing or cropping. PNG SHA-256: `bfbbcb5151e85cf95ce5add07af63c0028384d904b7029c272891a6de15e98f0`. Placement uses the visible artwork bounds while preserving the complete image and its proportions. No customer information, transaction data, accreditation banner or original invoice page is embedded in the application asset.

The company name, legal entity and contact block match the supplied master. The blue-gray invoice band, metadata grid, equipment table, actual work performed, aligned charges and total follow the provided document specification. Invoice fields come from the approved job and report; historical reference charges, payment terms and customers are never copied. The invoice total is not a claim about independently verified outstanding balance or tax exemption. Existing pricing/account records remain authoritative. A zero-day account term is due on receipt, not Net 30.

This template is for an approved service job. Facility-wide annual contract billing, installment schedules, discounts, tax determination, credits and remittance details require their own verified source data; this change does not infer those from asset counts. Other partner form mappings and the service-report-specific artwork remain separate work.

Verification: synthetic normal and overflow invoices were rendered with MuPDF and every page inspected. Automated checks cover original image embedding, complete work-order suffix and serial identity, factual limitations, due-on-receipt terms, pagination and cent-based reconciliation. No live invoice was issued during testing.
