# TECH COMMAND OS
## Complete Work-Order Workflow and Branded PDF Generation

**Implementation specification | TechFlex Mobility Solutions | Version 1.0 | September 9, 2026**

**Purpose.** Upgrade the existing Tech Command OS workflow so an imported work order becomes a verified equipment record, a guided field-service visit, completed partner documentation, a polished TechFlex service report with on-site photographs, and a separately generated invoice. This is a functional application requirement, not a request for a prettier text export or a demonstration screen.

**Required final outputs.** For an ordinary billable SpinLife visit, produce exactly two primary customer-facing downloads: (1) one compressed PDF containing the completed original SpinLife work order, the TechFlex service report, and the required photographic evidence; and (2) one independently formatted TechFlex invoice PDF. Both must represent the same approved visit revision. The invoice must not be embedded in the service packet.

**Interpretation rule.** The two supplied examples govern visual direction and demonstrated naming conventions. Requirements identified as proposed defaults are implementation decisions, not verified SpinLife policies. Sample customer, equipment, pricing, and repair details are test fixtures only, never production defaults. The supplied invoice and Invacare report describe different jobs and must never be combined into one job record.

## 1. Source references, established facts, and limits

### 1.1 Service-report reference [R1]
The supplied file is `TechFlex_Service_Report_Invacare_RPS350-1_20JM011818.pdf.pdf`. Page 1 uses a full-width navy header, white TECHFLEX wordmark, right-aligned FIELD SERVICE REPORT title, a green RETURNED TO SERVICE banner, an equipment/serial/location summary, a two-column findings-and-repair panel, an amber unused-parts notice, and two captioned photographs in unequal-width cards. Its footer distinguishes the observed condition at completion from a general guarantee.

The example identifies Invacare RPS350-1, serial 20JM011818, service location Miracle Hill, service date August 1, 2026, and report ID TFMS-RPS350-20JM011818. It documents a replacement plug button cap and tie rod, linkage reconnection, steering-arm remounting, and operational verification. It separately identifies a supplied hand pendant and control box as unused and requests disposition instructions. These details demonstrate the required separation of work performed, final condition, and unresolved administrative follow-up.

The source has letter-page proportions but a 1224 x 1584 point PDF page. Production documents should normally use US Letter, 612 x 792 points, rather than copy that oversized media box. Preserve the visual proportions, not the oversized print dimensions.

### 1.2 Invoice reference [R2]
The supplied invoice image shows the full-color TechFlex logo at upper left and the business contact block at upper right; a gray-blue INVOICE band; a three-row metadata table; CUSTOMER INFORMATION; an equipment/manufacturer/service-type table; WORK PERFORMED; and a Description / Qty / Amount billing table ending in a blue-gray TOTAL DUE row.

The demonstrated invoice number is `TF-INV-163093570N-1`; the complete work-order reference is `163093570N-1`. The invoice date is July 6, 2026, the completion date is July 2, 2026, the bill-to account is SpinLife, the terms are Net 15, and the single charge is $246.40 for pickup for return to manufacturer. Equipment is a Jazzy Air 2 Elevating Power Chair with JAIR21001 shown in parentheses, manufactured by Pride Mobility. Do not treat JAIR21001 as a verified serial number merely because it appears next to the product name.

The contact block shown in the references is TechFlex Mobility Solutions; 611 Park Meadow Rd., Suite B; Westerville, OH 43081; 877-231-TECH; service@techflexmobility.com. Store these in administrator-controlled brand settings, rather than duplicating them throughout source code.

### 1.3 What is not established
No original SpinLife work-order form was supplied with this specification. Its actual fields, checkboxes, signature requirements, form versions, and upload limits must be mapped from a real source form before SpinLife completion can be certified. The invoice is an image, so its original PDF filename is not visible. The report filename contains an accidental double `.pdf` extension; generated files must use a single extension. No authoritative vector logo or official color guide was supplied. Use approved brand assets already in the application, or obtain them before production visual approval. Do not reconstruct or invent a replacement logo.

## 2. System architecture and the non-negotiable separation of responsibilities

Use one structured, versioned work-order record as the factual source for all outputs. The AI may extract information, suggest questions, summarize technician-approved observations, and locate relevant equipment documentation. It must not independently invent the final facts, monetary amounts, signatures, test results, or completion status.

Use deterministic document templates to control layout. The recommended implementation is ReportLab for TechFlex reports and invoices, pypdf for partner-form handling and PDF assembly, and Pillow for photographic derivatives. ReportLab's Platypus layer separates document layout, page templates, and flowing content; this is appropriate for variable-length narratives and evidence sections. [T1] A JavaScript application can call a dedicated Python PDF worker without being rewritten. If the deployment cannot run Python, use an equivalent server-side renderer only after it passes the same visual and functional tests.

Keep these modules separate: intake and extraction; equipment identification; approved technical-reference retrieval; adaptive technician workflow; evidence capture; partner-form adapter; TechFlex report renderer; invoice renderer; packet assembler; quality checks; secure artifact storage; and submission tracking. A change to an invoice layout must not change a partner form or a service report.

Preserve previously issued report identifiers. For new reports, assign a stable unique report ID tied to the work order and visit, with document revisions stored separately; do not use a serial number alone to identify every service event.

The service scope must support biomedical and facility equipment as well as mobility equipment. Include diagnostic visits, single- and multi-part repairs, preventive maintenance, white-glove delivery/setup, pickup/return, and other account-approved service types. Do not make wheelchair-only assumptions throughout the data model or interface.

## 3. End-to-end workflow and status model

| Stage | Required system behavior | Exit condition |
| --- | --- | --- |
| 1. Import | Accept an uploaded PDF/image, pasted work order, or connected intake source; preserve the original. | Source saved and extraction completed or routed to review. |
| 2. Review intake | Show source and extracted fields together; resolve identity, scope, authorization, and ambiguous values. | Required intake fields confirmed. |
| 3. Prepare equipment | Identify category, manufacturer, model, variant, and available serial; retrieve matching approved references. | Knowledge status accurately shown; unresolved matches visible. |
| 4. Assign and schedule | Attach technician, visit, appointment, equipment, and applicable workflow/checklist. | Assignment and appointment saved. |
| 5. Start visit | Record actual arrival; confirm equipment identity and work scope; capture required pre-service evidence. | Technician confirms the asset and applicable checklist. |
| 6. Diagnose and document | Record complaint, observations, approved checks, readings, parts, and actual actions. | Required responses and evidence accounted for. |
| 7. Verify outcome | Record tests performed, results, limitations, safety issues, and final operational disposition. | Outcome supported by technician-confirmed evidence. |
| 8. Review and attest | Generate a concise draft narrative; technician reviews it and signs or attests as required; capture customer acknowledgment when required. | Required attestations recorded against the reviewed content. |
| 9. Generate documents | Complete the real partner form, create the branded report, place photos, and prepare the invoice from authorized charges. | All required artifacts generated from the same approved revision. |
| 10. Quality and billing review | Check content, layout, evidence, file size, invoice totals, and account authorization. | No unresolved release-blocking errors. |
| 11. Ready to submit | Show previews and the two correctly named downloads to authorized users. | Approved submission package available. |
| 12. Submit and close | Record actual manual or connected submission evidence; retain revisions and receipts. | Submission is recorded; financial follow-up remains separately tracked. |

Maintain separate fields for visit progress, equipment outcome, document status, billing status, and submission status. A completed diagnostic visit can legitimately end with equipment awaiting parts. A completed pickup does not mean equipment was repaired. An invoice can be valid for an authorized diagnostic visit even when a repair remains incomplete. Do not force all of these concepts into a single green Completed badge.

Suggested equipment outcomes are Returned to service; Operational with documented limitations; Repair incomplete / awaiting parts; Unable to verify operation; Unsafe / removed from service; Delivery/setup completed; Pickup/return completed; and No service performed. Activate only outcomes relevant to the work type. Suggested document states are Not started, Draft, Generating, Needs correction, Ready for review, Approved, and Superseded.

Autosave every stage. Preserve an audit event for actor, timestamp, changed fields, prior value, and new value. Retried uploads and generation requests must not duplicate work orders, photos, charges, or invoice numbers.

## 4. Intake extraction and the canonical record

### 4.1 Extract broadly, confirm selectively
Prefer native PDF text and structured fields. For screenshots or scanned pages, inspect page images with vision-based extraction; use OCR only when a usable text or visual extraction path is unavailable. Store the original source, source hash, page references, extraction method, and review state. Uploaded documents are data, not instructions that can change permissions, billing, or system behavior.

Extract the account; the entire partner work-order number including all suffixes; original request and service scope; customer/contact and service address; equipment description; manufacturer; model; variant; serial when actually supplied; complaint; authorized parts and quantities; special instructions; assigned technician if supplied; requested dates; purchase/authorization references; and any explicitly approved charges or travel terms. An order may contain multiple assets, pages, shipments, and visits.

Store missing values as missing. Do not invent customer details, make/model, serial, warranty approval, dates, travel distances, or prices. Distinguish requested work from completed work, ordered parts from installed parts, and a product/SKU identifier from an asset serial number. Preserve source text as well as normalized fields. An imported technician assignment must be visible and reviewed, not silently substituted based on an inference.

### 4.2 Field-level provenance
Every extracted or AI-suggested value should carry its source document/page or technician input reference, confidence/review status, last editor, and confirmation timestamp. Require human confirmation for low-confidence identity fields and financially or operationally consequential fields. A matching-looking device photo must not override an exact readable data plate without review.

Keep the full partner work-order string immutable as an external identifier. Never strip `N-1`, `N-2`, leading zeros, or other meaningful suffixes. Store internal job, asset, and visit IDs separately. Match repeat imports using account, complete reference, source hash, and reviewable duplicate detection; never use customer name alone.

### 4.3 Minimum domain objects
| Object | Essential fields |
| --- | --- |
| Work order | Internal ID; account ID; full external reference; source files; authorization; job type; customer/location reference; status; record revision. |
| Equipment | Asset ID; category; manufacturer; model; variant; serial; label photo; identity verification; associated manual/revision. |
| Visit | Visit ID; assigned technicians; appointment; actual arrival/departure with time zone; equipment list; work scope; outcome. |
| Finding / action / test | Equipment link; observed fact or action; actor; timestamp; result; measurement and unit when applicable; evidence reference. |
| Part | Description; part number if confirmed; quantity supplied, installed, unused, returned; disposition and authorization. |
| Photo | Stable ID; equipment/visit link; original asset path and hash; derivative path; category; caption; capture/upload times; export approval. |
| Attestation | Signer/role; exact statement; timestamp; captured signature or attestation method; reviewed content revision. |
| Invoice | Stable invoice number; account; approved line items; currency; terms; totals; issue date; status; source authorization. |
| Artifact | Type; internal version; approved snapshot ID; template versions; stored filename; hash; byte size; page count; generation and review states. |

## 5. Equipment identification and useful AI assistance

Build an equipment knowledge panel before the technician begins the detailed checklist. Show the reported identity and the verified identity separately until matched. Request a readable manufacturer/model/serial label photo when necessary. For relevant units, capture controller type, accessories, firmware, configuration, or serial-range information only when supported and needed.

Retrieve approved manufacturer service manuals, owner manuals, parts diagrams, troubleshooting references, and verified internal service knowledge. Attach manufacturer, document title, model coverage, revision/date, source location, and relevant page/section to recommendations. Give exact-model documents priority. Keep model-family guidance visibly distinct from exact-model guidance. If only generic information is available, say so and limit the assistance accordingly.

The panel should show Identity unverified, Exact-model reference available, Model-family reference only, or No verified reference. It must not say Knowledge ready because a generic AI paragraph exists. Show the source behind each specific diagnostic suggestion. When a cited document is missing or inaccessible, do not invent its contents or pretend a page was reviewed.

Ask the next useful question from the confirmed device category, complaint, prior answers, and applicable procedure. Suggestions are hypotheses until the technician records findings. Never convert a possible cause into the recorded diagnosis automatically. Keep technical assistance within the technician's authorization and training; stop and escalate when an applicable procedure, safe method, required equipment, or service authorization is unavailable. Do not invent torque values, electrical limits, load-test conditions, calibration tolerances, or instructions to bypass protective systems.

## 6. Adaptive technician forms

Prepopulate known administrative and equipment details so the technician does not retype the work order. The technician should primarily verify identity, answer applicable questions, record work and tests, capture evidence, and review the final narrative. Reveal additional fields only when earlier answers make them relevant.

| Work category | Examples of documentation prompts, not technical test instructions |
| --- | --- |
| Diagnostic / repair | Reported symptom; whether reproduced; relevant observed conditions; error codes; checks actually performed; confirmed cause or unresolved findings; actions; verification. |
| Patient lift / transfer equipment | Verified lift identity; affected assembly; complaint; relevant mechanical/electrical observations; parts used; verification required by the applicable procedure. |
| Bed / table / powered positioning equipment | Affected function or section; controller/accessory identity when relevant; observed movement or fault; repairs; applicable post-service checks. |
| Power wheelchair / scooter / lift chair | Verified model/configuration; reported operating issue; displayed fault information; component observations; action and actual functional verification. |
| Biomedical / facility preventive maintenance | Asset inventory; applicable procedure/version; inspection items; measurements with units; instrument and calibration status where required; results; deficiencies. |
| Delivery / setup | Correct equipment received; condition; accessories; setup steps; applicable operation check; education actually provided; delivery acknowledgment; exceptions. |
| Pickup / return | Correct unit identified; condition; accessories collected; packaging/securing work; pickup acknowledgment; return/shipping instructions and exceptions. |

Provide Pass, Fail, Not tested, and Not applicable as distinct results. Require a reason when a required check is not performed or is marked not applicable. Never interpret a blank, unchecked box, or absent photograph as a passed test. Measurements must preserve values and units as entered and reviewed; do not generate plausible-looking readings.

Record technician credentials and test-instrument details only from verified application records or confirmed input. If work involves multiple assets, every finding, part, photo, and outcome must attach to the correct asset, and the report must visibly separate those assets.

## 7. On-site photo capture and evidence management

Offer camera capture and file upload inside the visit, with category prompts tied to the work type. Typical evidence categories are equipment overview; data plate/serial; complaint or damage; relevant component before work; relevant component after work; verification evidence when appropriate; and delivered or collected equipment/accessories. These are configurable requirements, not a claim that SpinLife mandates a particular universal photo count.

Save originals unchanged in restricted storage. Record the uploading user, visit, asset, capture timestamp when available, upload timestamp, original hash, and caption. Do not equate a file's metadata timestamp with a verified arrival time. Use stable photo IDs to prevent duplicate uploads and maintain references when photos are reordered. Mobile capture must have an explicit Pending upload / Uploaded / Failed state and retry support; temporary connectivity loss must not silently discard evidence.

The technician reviews the photos and captions before submission. Captions should state what is visibly documented, not claim a test passed or a component was replaced merely because an image exists. No AI-generated, stock, or cosmetically altered equipment photos may substitute for field evidence. Preserve originals behind any approved annotation or privacy redaction, with a clear record of the derivative.

Correct image orientation before embedding and preserve aspect ratio. Pillow provides orientation normalization and aspect-ratio-preserving containment operations; use those rather than stretching or automatically cropping evidence. [T5] Support the image formats actually accepted by the deployed capture pipeline, including a verified conversion path for mobile formats such as HEIC. Show an actionable error for unsupported or corrupted files.

Avoid customer faces, medical paperwork, unrelated interiors, or other unnecessary personal details. Do not require GPS collection by default. Strip unnecessary metadata from outbound derivatives while preserving permitted audit data separately. Where documentation cannot be obtained, record the reason and route required exceptions for approval rather than fabricate evidence.

## 8. Technician narrative and content approval

Keep the technician's original notes or dictated transcript. Produce a separate, editable draft organized as Reported concern; Findings; Work performed; Verification; Final condition; and Follow-up. The invoice receives a shorter factual service summary; the partner form receives a version that fits its mapped fields; the TechFlex report receives the full approved account.

Ask the technician to confirm what was actually done, which parts were installed, which tests were performed, what the results were, and whether the final condition is accurate. Missing facts should generate a question, not a sentence that fills the gap. Require explicit review before the AI draft becomes the approved record.

Use plain, professional service language. For example, the supplied Invacare report supports a summary that the missing plug button cap and tie rod were replaced, the linkage reconnected, the steering arm secured, and the unit operated to verify function. It does not justify adding unrecorded electrical safety tests, load measurements, or a claim that the unused control box was installed. [R1]

Treat installed, unused, defective, returned, and retained parts separately. An amber client-direction notice must state the issue, requested action, and responsible party. Such an administrative follow-up can coexist with a verified Returned to service outcome when it does not affect equipment operation. A genuinely unresolved safety or functional issue cannot be concealed in a footnote under a green success banner.

A signature or attestation must be collected from the actual person and bound to the reviewed content and exact statement. Do not auto-draw signatures, reuse signatures from another visit, or substitute a typed name for a required captured signature. If reviewed content changes after approval, invalidate the affected approval and obtain the required review again. Customer absence or refusal must be documented through an allowed exception, not a fabricated acknowledgment.

## 9. Complete the original SpinLife documentation

### 9.1 Preserve the actual form
Complete the actual work-order document supplied for the job. Do not create a TechFlex summary and label it Completed SpinLife Work Order. Retain all relevant original pages, headings, instructions, and original customer/account information. Do not place TechFlex branding over SpinLife's form or rewrite its required statements.

The partner adapter must identify account, form version, page count, page dimensions, and known template signature/hash. Maintain reviewed mappings from canonical fields to AcroForm field names or page coordinates. Keep field type, requiredness, maximum fitting content, checkbox export value, source, and conditional rule in the mapping. A changed or unrecognized form must be reviewed rather than silently filled using outdated coordinates.

### 9.2 Fillable and flat forms
For an AcroForm PDF, fill its actual fields and establish visible field appearances. Current pypdf documentation describes `update_page_form_field_values`, `auto_regenerate=False`, and explicit flattening plus widget removal for a flattened output; validate the behavior against the pinned deployed version. [T3] Preserve an editable/internal source when needed, and generate the customer-facing submission copy according to the partner's requirements.

For a flat or scanned form, use a registered overlay with reviewed page-specific coordinates, rotation, and scaling. Keep writing inside the intended boxes. If a narrative exceeds a field's capacity, put a concise accurate summary there with a clearly identified continuation page. Do not shrink the text into illegibility, clip it, omit facts, or cover existing instructions. Test every form version with realistic long values and signatures.

For a cryptographically signed source, preserve the original signed file untouched. A merged or flattened visual copy is not a substitute for preserving its signature validation; route special signed-document handling through a reviewed partner policy. Do not advertise the output as digitally signed merely because it contains a signature image.

### 9.3 Mapping verification and exceptions
Show the technician or reviewer a completed-form preview with missing requirements identified by field. Required dates, names, findings, acknowledgments, and signatures must be verified from the real form rather than assumed from this specification. Retain mapping version and approved input revision with the artifact. Until the actual SpinLife form is supplied and successfully tested, label the adapter Unconfigured or Needs template review; do not claim the full SpinLife workflow is complete.

For another partner, use that partner's configured source-form adapter. When no partner form is required, the packet can begin with the TechFlex report; clearly distinguish that configured case from a missing required form.

## 10. Visual design system

### 10.1 Shared production standards
Generated TechFlex pages use US Letter portrait, 612 x 792 points, with approximately 36-point left/right margins and a 540-point usable content width. Preserve original partner-page sizes when assembling their documents unless a tested account rule explicitly permits normalization. Generated headers, tables, notices, and photo cards share the same aligned content edges.

Use a clean sans-serif type family with regular and bold weights, licensed for the intended use. Target 10-11 point body text, 8.5-9 point captions and metadata, 11-13 point section headings, and 20-25 point main titles. Avoid body text below 9 points in newly generated TechFlex pages. Increase page count before sacrificing legibility. Original partner forms may have their own established typography.

Use restrained borders around 0.5-0.75 point, adequate cell padding, consistent vertical spacing, and intentional hierarchy. All narratives must wrap. Keep a heading with at least the first related content, a photo with its caption, and a total with its label. Split long content cleanly with continued headings; never force a long visit onto one page.

### 10.2 Color tokens
The following are sampled/approximate implementation tokens from the attachments, not a verified official brand palette. Store them centrally and confirm against the approved assets during visual review.

| Token | Proposed hex | Use |
| --- | --- | --- |
| report_navy | #073B62 | Service-report header and strong headings. |
| brand_blue | #195A9B | Invoice title and company accent. |
| report_section_fill | #EAF3FA | Service findings heading band. |
| invoice_band_fill | #DADDE4 | Invoice title and section/table headers. |
| invoice_label_fill | #E9EAEE | Metadata label cells. |
| invoice_total_fill | #CBD7E5 | TOTAL DUE row. |
| success_fill | #EAF7EE | Verified successful-outcome notice. |
| success_text | #168251 | Successful-outcome label and icon. |
| warning_fill | #FEF5E6 | Parts/follow-up attention notice. |
| warning_text | #A76415 | Attention heading. |
| photo_card_fill | #F3F7FA | Evidence-card background. |
| body_text / border | #27313D / #D5DCE3 | Main text and restrained dividers. |

Use outcome labels and icons as well as color; do not rely on red/green alone. These tokens do not authorize recoloring the approved logo.

### 10.3 Brand assets
The invoice reference uses a full-color illustrated TechFlex logo. The service-report reference instead uses a white TECHFLEX / MOBILITY SOLUTIONS wordmark on navy. Preserve this distinction. Use an approved reverse/white wordmark asset for the report if available, or the approved typographic treatment shown in the reference. Do not substitute a generic accessibility icon, redraw the brand, stretch the logo, or insert an accreditation badge not present in the approved template.

Leave clear space around the logo and keep the entire mark visible. Correct screenshot artifacts in the implementation: no invoice banner touching or obscuring the logo/tagline, no mismatched table widths, and no excessive empty blocks. Match the design identity, not accidental clipping or capture artifacts.

## 11. TechFlex field-service-report template

The TechFlex report is the polished technical narrative and visual evidence document. It must remain distinct from both the original partner form and the invoice.

| Sequence | Layout and content requirement |
| --- | --- |
| 1. Branded header | Full-width navy band, approximately 88-98 points high on the first page, with a thin brighter-blue lower rule. White wordmark and contact information at left. Right-aligned FIELD SERVICE REPORT, Prepared for account, report ID, and service date. Keep header text out of the body frame. |
| 2. Outcome banner | Rounded, lightly bordered card with a clear label, icon, and one-sentence factual explanation. Green only for a supported successful outcome; amber or red for limitations, incompletion, or unsafe status as appropriate. |
| 3. Equipment summary | White rounded card with light border. Three primary columns: EQUIPMENT, SERIAL NUMBER, SERVICE LOCATION. Use uppercase small gray labels and bold values. Include full WO, visit, and technician in a separate compact metadata line when necessary. |
| 4. Findings and work | Light-blue SERVICE FINDINGS AND WORK PERFORMED band. Approximately 36% left column for REPAIR NEED / REPORTED CONCERN and 64% right for COMPLETED REPAIR / WORK PERFORMED; use an unobtrusive divider. Include actual verification in this section or an adjacent labeled panel. |
| 5. Conditional follow-up | Amber card when parts disposition, client direction, pending authorization, or another meaningful follow-up exists. Approximately 62% explanation and 38% NEXT ACTION. Omit when not applicable; never print an empty warning box. |
| 6. Photo documentation | PHOTO DOCUMENTATION heading with a thin horizontal rule. One or more padded photo cards with pale background, subtle border, and numbered factual captions. Place key evidence with the report and continue additional evidence in an appendix. |
| 7. Attestations / final determination | Technician name and reviewed statement, plus required acknowledgments. Final determination must match the verified outcome. Do not display the reference's successful determination as boilerplate on every report. |
| 8. Footer | Thin divider; concise observed-at-completion statement; TechFlex Mobility Solutions; report page X of Y. Include enough WO/report identification on continuation pages to identify a separated page. |

For a short repair with two photos, target a clean one-page report like the reference. A landscape close-up can occupy about 62% of the evidence row and a portrait equipment view about 34%, with the remainder used as a gutter. Preserve the full image; use contain/letterbox placement, not automatic cropping. For other photo sets, choose one- or two-column layouts according to aspect ratio and readability. Do not stretch every photo into identical rectangles.

For longer repairs, multiple units, large narratives, or many photos, expand to multiple pages. Repeat a compact branded header and identifying information. Keep per-asset findings, actions, results, and photographs visibly associated. Make photo references stable across the report and appendix. Use labeled continuation pages, not unlabeled overflow.

The footer may state that the report records work performed and operational condition observed at completion. It must not make an unconditional warranty or an unsupported claim that future failure is impossible.

## 12. Separate TechFlex invoice template

The invoice must reproduce the reference's blue/gray accounting-document character, not reuse the navy report design. Use white space, deliberate section bands, a consistent table grid, and a prominent total. Do not put service photos in the invoice by default.

| Sequence | Layout and content requirement |
| --- | --- |
| 1. Header | Full-color approved TechFlex logo at upper left, approximately 165-180 points wide with preserved aspect ratio. Right-aligned company name and contact block at upper right. Clear space below the complete logo. |
| 2. INVOICE band | Full usable-width gray-blue band, about 32-38 points high, with large centered blue INVOICE text and a restrained border. |
| 3. Metadata grid | Three rows and four columns: Invoice Number / value / Invoice Date / value; Work Order / value / Terms / value; Completion Date / value / Bill To / value. Approximate width ratios 22% / 28% / 22% / 28%. Label cells light gray and bold; value cells white. |
| 4. Customer information | Full-width CUSTOMER INFORMATION band and bordered white body. Show only appropriate customer/service-location contact details for the recipient. Keep Bill To separate from the person receiving service. |
| 5. Equipment table | Equipment / Manufacturer / Service Type columns, approximately 51% / 28% / 21%. Include a verified model and asset identifier where relevant without mislabeling a SKU as a serial. |
| 6. Work performed | Full-width WORK PERFORMED band and a concise, factual summary of the billable work. Do not paste the full technical narrative or charge for unperformed work. |
| 7. Charges | Description / Qty / Amount columns, approximately 67% / 12% / 21%, or an approved expanded table when unit pricing is needed. Descriptions wrap, quantities align consistently, and currency aligns right. Repeat the header on continued pages. |
| 8. Total | A blue-gray TOTAL DUE row with bold label and bold currency total. Show approved discounts, tax, credits, or other adjustments only when applicable and configured. Keep the final calculation visible. |
| 9. Remittance note | Ask the recipient to reference the invoice number and show the applicable account terms. Do not invent banking instructions or late-payment terms. |

ReportLab tables can use paragraph content, column widths, padding, and repeated header rows; use these mechanisms rather than manually positioning every text line. [T2] Do not use fixed-height narrative rows that clip longer content.

Use the account's approved rate schedule and job authorization. Do not infer prices from equipment weight or old examples unless that pricing rule is explicitly configured for the account and job. Store currency values as integer minor units or a decimal currency type, calculate totals deterministically, and reconcile the rendered total to the approved ledger. Never ask the language model to perform the authoritative invoice calculation.

The supplied example establishes Net 15 for that invoice only; it does not establish universal payment terms. Do not substitute a remembered global payment policy for the actual account's authorized terms. Keep internal technician pay, margin targets, cost breakdowns, pricing reasoning, and private notes out of all external documents.

By default, preserve the demonstrated invoice ID pattern `TF-INV-{full_work_order_reference}` for a first invoice where the account uses one invoice per full WO reference. Additional legitimately distinct invoices require the configured invoice-numbering policy and approval. A retry, download, or corrected rendering must not create another receivable or silently issue a new invoice number.

## 13. File naming, assembly, and compression

### 13.1 Naming rules and source fidelity
Use account-configurable naming templates, with the following proposed defaults. The invoice filename below is derived from the visible invoice ID; it is not claimed to be the missing original PDF filename.

| Artifact | Default / example |
| --- | --- |
| Primary combined packet | `TechFlex_Completed_Work_Order_{Account}_{FullWO}.pdf` |
| SpinLife packet example | `TechFlex_Completed_Work_Order_SpinLife_163093570N-1.pdf` |
| Separate invoice | `{InvoiceNumber}.pdf` |
| Invoice example | `TF-INV-163093570N-1.pdf` |
| Standalone report, internal/optional | `TechFlex_Service_Report_{Manufacturer}_{Model}_{Serial}.pdf` |
| Normalized reference filename | `TechFlex_Service_Report_Invacare_RPS350-1_20JM011818.pdf` |

When a serial is unavailable, use an explicit WO-based fallback such as `TechFlex_Service_Report_{Manufacturer}_{Model}_WO-{FullWO}.pdf`; do not invent a serial. For multiple assets, name the report by WO and visit rather than squeeze every serial into the filename. Store collision-proof internal artifact IDs and revision paths even when human-facing names remain stable.

Replace unsafe filesystem characters and normalize spaces for file naming, but retain the complete meaningful work-order reference, including its suffix, in all visible fields. Never silently change `N-1` to `N1`. Prevent path traversal, duplicate `.pdf.pdf` extensions, confusing double extensions, and customer names or addresses in filenames. Preserve original uploaded names in the audit record.

### 13.2 Packet order
The combined packet must contain, in order: completed original partner work-order page(s); the branded TechFlex field-service report; and the photo/continuation appendix when needed. Key photos already shown in the report should not be duplicated in the appendix unless an account rule explicitly requires that duplication. Required photos may appear in a partner form when that form has intended evidence areas, but never cover its instructions or signature spaces.

Use PDF assembly that preserves existing page content and order. pypdf provides page-level append/merge operations; form-field name collisions require attention when joining forms. [T4] Add useful bookmarks for the partner document, TechFlex report, and evidence appendix when supported. Keep partner-page numbering intact, and use a consistent separate numbering policy for TechFlex-generated pages.

The invoice stays outside this packet. A Download both option may create a ZIP containing the two primary PDFs, but the service packet itself must remain one normal, independently readable PDF. Keep internal raw photos and standalone component PDFs available by permission; do not make the user manually collect them to complete an ordinary submission.

### 13.3 Compression without sacrificing evidence
Use native/selectable PDF text for generated reports and invoices; do not turn the whole finished document into screenshots. Prepare appropriately sized photographic derivatives before embedding and apply PDF stream/object optimization where useful. Stream compression and image recompression are separate operations; pypdf documents both lossless compression and image-size reduction paths. [T6]

Proposed starting settings are 150-180 effective pixels per inch for general overview photographs at their placed size and JPEG quality around 82-88, subject to visual testing. Preserve higher effective resolution, often 250-300 pixels per inch or the available source detail, for data plates, small labels, close-up defects, and other critical evidence. These are project defaults, not a promise that every image will remain readable at a fixed setting. Never upscale a blurred source and claim the missing detail was recovered. Pillow exposes JPEG quality/optimization settings; verify the selected encoder and output visually. [T7]

Make the target size account-configurable. A 5 MB target may be used as a provisional product setting, but no SpinLife portal maximum has been verified here. Measure the final file and retry bounded compression settings only while required evidence remains readable. If it cannot meet the real limit, present a specific exception and permitted next action. Never silently remove required pages or photographs, hide an oversized result, or split the required single packet without approval.

## 14. Generation pipeline, synchronization, and operational controls

Build PDFs on the server or a controlled worker, not solely through browser Print. Use validated structured input rather than AI-generated HTML that can arbitrarily change the layout. Escape untrusted text before passing it into paragraph markup. Fetch assets from authorized storage IDs, not unrestricted user-supplied network URLs. Validate file types, sizes, decompression limits, permissions, and storage ownership before processing.

Freeze a consistent approved visit snapshot for a generation job, including current invoice authorization, photo manifest, field mappings, and template versions. All artifacts must name that snapshot. Preserve the exact input and template version that produced each issued output. When source content changes, mark obsolete artifacts Superseded and require appropriate approval rather than serve a stale invoice beside a new report.

```text
validate_user_and_job_access()
lock_or_snapshot(approved_record_revision)
validate_intake_identity_and_required_visit_fields()
validate_evidence_uploads_and_attestations()
validate_partner_mapping_and_billing_authorization()
render_completed_partner_document()
render_techflex_service_report_and_photo_appendix()
render_separate_invoice_from_approved_charges()
assemble_and_optimize_service_packet_only()
render_all_output_pages_and_run_quality_checks()
verify_totals_names_source_revision_and_file_limits()
publish_artifacts_and_manifest_atomically()
mark_ready_for_submission_only_after_required_checks_pass()
```

These are required processing stages, not already implemented function names. Use a job queue with visible progress and specific errors. An idempotency key should include job/visit, approved revision, account mapping version, and document-template version. A render failure can be retried without duplicating the invoice. A packet must not appear Ready while a required photo is still uploading or its companion invoice has failed.

Use an account-configured exception for nonbillable visits: show Invoice not required - approved nonbillable reason rather than fabricating a zero-charge invoice or blocking a legitimate service report forever. For an ordinary billable visit, both required downloads must be ready before the complete package is released.

Store final artifact hashes, page counts, byte sizes, template versions, generating actor/service, timestamps, review approvals, and source revision in an internal manifest. Serve files through authenticated or expiring access; never expose customer documents at a public predictable URL. Separate issued documents from editable drafts, and retain corrected versions without rewriting history.

## 15. Work-order interface and access permissions

The job page should expose a clear progression: Source and extracted details; Equipment and reference knowledge; Visit checklist; Findings and work performed; Photos; Tests and final condition; Review and acknowledgment; Documents; and Submission history. A compact progress panel must list missing requirements and link directly to the relevant input. Avoid generic Something went wrong messages when the system knows which field or upload failed.

The final document panel must show the equipment outcome, visit date, complete WO reference, technician, document revision, page counts, file sizes, generation/review states, and invoice total where the viewer is authorized. Provide Preview service packet, Download service packet, Preview invoice, Download invoice, and Download both for authorized roles. Supporting actions can include View original source, Review field mapping, and Regenerate approved revision.

Technicians should see their assigned work, equipment references, checklist, relevant photos, and their approved service documentation. Invoice/pricing visibility follows configured permissions, not a blanket default. Administrators and appropriately authorized compliance users must be able to inspect source evidence, audit history, template versions, exceptions, and revisions. Partners can access only their own permitted documents. No role may silently impersonate another person's approval or signature.

Keep customer names/contact details in protected fields when they are required for the actual partner submission. A WO-number-based interface reduces unnecessary exposure but does not make a source PDF, photo, or exported document non-sensitive. Use minimal equipment/technical context for AI assistance and exclude unnecessary customer information. Do not claim HIPAA compliance solely because the interface hides names; legal/compliance configuration requires its own review.

Downloading files does not mean a partner received them. Record Submitted only after an authorized user confirms a real manual submission or a configured integration records a verifiable receipt. Do not claim SpinLife portal/API integration is live merely because a button or generated document exists.

## 16. Acceptance tests and release gates

The feature is not finished until real downloadable PDFs and the full workflow pass these tests. Use the supplied jobs as distinct fixtures, anonymize customer contact details in development fixtures, and add deliberately difficult cases. Template screenshots alone do not establish functional completion.

| Test | Required result |
| --- | --- |
| A01 - Full WO suffix | `163093570N-1` survives import, all forms, report, invoice, filenames, and submission record without truncation. |
| A02 - Invoice fixture | The invoice example produces TF-INV-163093570N-1, July 6, 2026 invoice date, July 2, 2026 completion date, Net 15, quantity 1, and total $246.40; no invented extra charges. |
| A03 - Report fixture | The Invacare example retains RPS350-1, serial 20JM011818, Miracle Hill, the documented repairs, two captioned photos, and unused-parts direction without mixing in the SpinLife job. |
| A04 - Unknown identity | Missing or ambiguous model/serial stays unresolved; the system requests confirmation and does not fabricate exact-model guidance. |
| A05 - Real SpinLife form | A supplied original is correctly completed in its actual fields, including relevant checkboxes/signature areas; no replacement generic form is substituted. |
| A06 - New form version | Unrecognized layout/version is stopped for mapping review, not populated using stale coordinates. |
| A07 - Long content | Long names, addresses, part descriptions, findings, and multi-page narratives wrap and continue without overlap, missing text, or illegible shrinking. |
| A08 - Evidence formats | Portrait, landscape, mobile-format, and rotated images display correctly; corrupted uploads produce a clear error. |
| A09 - Photo integrity | Captions remain with the correct assets/photos; no stretching, unsafe cropping, substituted images, or missing required evidence. |
| A10 - Offline recovery | A disconnected mobile capture resumes reliably; incomplete uploads block release when required. |
| A11 - Outcome truth | Failed or unperformed required testing cannot yield a falsely verified Returned to service result. Pickup completion is not represented as repair completion. |
| A12 - Parts truth | Supplied-but-unused parts are not labeled installed or billed as installed parts; their disposition is documented. |
| A13 - Approval integrity | The actual reviewer approves the recorded content; later material edits invalidate affected approvals and stale exports. |
| A14 - Invoice authority | The total matches approved line items and configured adjustments exactly; no internal pay or margin information appears. |
| A15 - Correct package | The packet contains original completed partner pages, report, and evidence in order; the invoice is a separate PDF. |
| A16 - Names and versions | One `.pdf` extension; meaningful WO suffix preserved; no duplicate invoice on retry; corrected artifacts remain auditable. |
| A17 - Compression | Both files meet configured limits or present an explicit exception; labels, defects, signatures, and text remain readable. |
| A18 - Viewer verification | Every page is rendered and inspected; interactive-form outputs are additionally checked in a second viewer for appearances and signatures. |
| A19 - Access boundaries | Another account or unassigned user cannot retrieve the job's original files, photos, or exports through guessed IDs or URLs. |
| A20 - Atomic release | A failed artifact cannot leave a complete-package badge or pair files from different approved revisions. |
| A21 - Multiple assets/visits | Actions, photos, serials, outcomes, and invoice scope stay associated with the correct unit and visit. |
| A22 - Submission truth | Downloading or generating does not mark Submitted; actual submission evidence or an authorized manual record is required. |
| A23 - Nonbillable exception | An approved nonbillable visit produces the appropriate packet and explicit invoice-not-required status, not a fake charge. |
| A24 - Visual fidelity | Report matches the navy/status/card/photo reference; invoice matches the full-color-logo/blue-gray/table reference. They do not look like the same generic template. |

Rendering review must include full-page inspection and close inspection of small print, labels, totals, photos, and signature areas. Check for clipped text, overlapping blocks, stretched logos, blank pages, broken glyphs, detached captions, incorrect page numbering, and stale sample data. Automated validations supplement, not replace, the initial human visual approval of each template and form version.

## 17. Implementation handoff and definition of done

First inspect the existing application's data model, current document exports, storage, role permissions, technician screens, and background-job architecture. Reuse functioning pieces. Fix the actual workflow and renderer rather than building a parallel static demo that cannot use real jobs.

Deliver versioned TechFlex service-report and invoice templates; a partner-template registry; the structured intake/visit/evidence model; equipment-aware question selection with cited reference context; required-field and billing checks; reliable photo capture; completed-form filling; approved-revision document generation; combined-packet assembly; compression and preview; permission-controlled downloads; audit history; and acceptance-test results. Preserve current production data and existing authorized access.

Provide a working staging demonstration that starts with a real imported work order and ends with the two downloadable artifacts. Show the exact original partner form before and after completion, the short technician input, the approved narrative, the placed photographs, the final report, and the separate invoice. Include a long/exception case as well as a short successful case. Clearly label any simulated fixture or unfinished integration.

The outstanding configuration items are the actual SpinLife form/version(s), confirmed partner submission rules and file-size limits, production-approved logo assets, and the applicable account billing configuration. These items do not prevent building the shared workflow and TechFlex templates now; they do prevent truthfully certifying the unconfigured portions. Do not claim that uploading this specification alone has installed or trained a production PDF engine.

**Definition of done:** the existing platform can take an authorized work order through the real technician workflow, retain accurate evidence, complete the correct partner document, generate visually approved TechFlex documents, pass the release checks, and provide the correctly named final downloads without manual document rebuilding.

## 18. Source registry and implementation references

**R1 - User-supplied service report.** `TechFlex_Service_Report_Invacare_RPS350-1_20JM011818.pdf.pdf`, page 1. Visual authority for the navy service-report layout, evidence cards, unused-parts notice, and demonstrated standalone report naming pattern. Reproduced in Appendix A of the PDF edition.

**R2 - User-supplied invoice image.** `IMG_0977.jpeg`. Visual authority for the invoice layout and visible invoice/WO identifiers, sample dates, terms, amount, and contact block. The original invoice PDF filename was not supplied. Reproduced in Appendix B of the PDF edition.

**T1 - ReportLab official documentation, Chapter 5: Platypus.** Page templates, frames, flowables, and separation of content from layout. https://docs.reportlab.com/reportlab/userguide/ch5_platypus/

**T2 - ReportLab official documentation, Chapter 7: Tables.** Table content, styles, widths, padding, and repeated rows. https://docs.reportlab.com/reportlab/userguide/ch7_tables/

**T3 - pypdf official documentation, Interactions with PDF Forms.** Fields, appearances, filling, flattening, and widget behavior. https://pypdf.readthedocs.io/en/stable/user/forms.html

**T4 - pypdf official documentation, Merging PDF files.** Appending, merging, and form-field naming collisions. https://pypdf.readthedocs.io/en/stable/user/merging-pdfs.html

**T5 - Pillow official documentation, ImageOps.** EXIF orientation handling and aspect-ratio-preserving containment. https://pillow.readthedocs.io/en/stable/reference/ImageOps.html

**T6 - pypdf official documentation, Reduce PDF File Size.** Lossless stream compression and image reduction. https://pypdf.readthedocs.io/en/stable/user/file-size.html

**T7 - Pillow official documentation, Image file formats: JPEG.** JPEG encoder settings. https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#jpeg

Technical documentation reviewed September 9, 2026. Pin and test the versions actually deployed; this document does not certify an application's current dependency versions. Numerical layout, compression, and UI defaults in this specification are proposed implementation requirements unless expressly identified as demonstrated by a supplied reference.
