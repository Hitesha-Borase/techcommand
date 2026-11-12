# SpinLife digital documents — September 2026

The two incoming PDFs and AH/JS completed packets supplied September 9 define the content mapping and naming references. The owner explicitly requires clean digital pages, not scan overlays. No source customer contact information or original signatures or source PDFs are shipped in code or the demonstration.

## Implemented production path

Use the existing Bid Intelligence drop zone for source PDFs/images and reviewed extraction. Keep originals as private work-order attachments. Field Completion now merges the delivery or repair-specific SpinLife checklist into the visit. Each check supports observed results and reasoned not-applicable responses; identity, final photo and technician attestation cannot be waived. The repair path separately records battery rest/load readings, motor resistance, error codes, controls, frame, hardware, motor, connections, wear, parts quote and returns. Delivery maps damage, demonstration, comfort, working condition, final photo, charging, manual, packaging, accessories and serial confirmation.

QA generates a digital SpinLife work order, the blue/teal TechFlex service report, and readable JPEG/PNG evidence pages, in that order. The incoming scanned pages remain on the record and are not appended to SpinLife's digital submission. Customer acknowledgement uses the actual saved image. Technician electronic attestation is identified as electronic, tied to submission time, never drawn as a fabricated handwritten signature. Separate invoice generation and existing atomic QA controls remain in place.

Names use customer first/last initials, complete external identifier and one of COMPLETED, NEEDS PART, NEEDS REVIEW or NEEDS RESOLUTION. Preserve N-1/N-14 and leading zeros. Never derive customer initials from a representative's signature. Unknown or quarantined outcomes map to NEEDS REVIEW, never completed. A completed visit can still need parts or resolution.

Native PDF text remains selectable. Wrapping handles long identifiers and narratives; tables continue across pages. PDF object streams are compressed. Damaged or unsupported required files stop release with correction instructions. The 24 MB processing budget is a Worker resource bound, not a claimed SpinLife upload limit. Original images are retained. Technicians enter per-photo factual captions and choose either large detail pages or a six-photo gallery. Captions and layout are saved in the versioned report, displayed in QA, and generated from the reviewed snapshot. Missing SpinLife photo captions block release.

The existing AI review is instructed to distinguish symptom, observation, interpretation, action, verification, limitations and follow-up. It must not invent tests, procedures, part numbers or certainty. Existing model/reference guidance and PDF extraction depend on runtime configuration and approved knowledge. No live AI call or SpinLife exchange was performed during this release.

## Validation and remaining acceptance

139 automated checks passed in the working source, including actual route approval with isolated SQLite/R2, digital delivery checklist enforcement, exact filenames, N/A and attestation validation, damaged-file blocking, long-form generation and existing concurrency/atomicity protection. PDF sample pages were rendered and inspected. Production build and TypeScript validation are required before publication.

The digital forms preserve mapped content but are rebuilt layouts; long content flows to additional pages. They are not certified as pixel-identical replicas or as accepted by SpinLife. Outstanding acceptance includes owner's review of live-job digital output, full authenticated mobile/browser workflow, production PDF extraction and model-specific AI, any confirmed portal size limit, and real FaST/API submission with receipts. Original work-order issue date has its own editable field, separate from service acknowledgement date; unentered issue dates display Not recorded. No full-platform demo completion is implied.

An interrupted-import mapping snapshot fix was included because release testing exposed it. Matching source rows resume their original reviewed mapping after a reusable plan changes; different source data cannot reuse that checkpoint.
