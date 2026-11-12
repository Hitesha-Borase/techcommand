# SpinLife simplification increment — 2026-09-11

## User-facing behavior

Administrators open **DME & Mobility → SpinLife Work Portal → Assign a work order**. Select an active company technician and enter agreed pay, or leave either for later. Drop PDFs/images or paste text. Available fields and source-stated checks are proposed by the existing extraction service; populated values are not silently replaced and technician pay is never copied from the partner authorization. Save without CRM, location, biomedical asset, pricing, travel, equipment identity, signature or completed-check prerequisites. On-site fields are collapsed for administrators until work starts.

Technicians land on their own new SpinLife assignments, including unscheduled work. **Start Work Order** records the real timestamp without requiring travel or arrival steps. Serial number, checks, N/A, later/not-done answers, notes, outcome, photos and an optional customer signature can be saved. The original document stays accessible. **Generate service PDF** produces the digital SpinLife form, existing TechFlex report and captioned photos, retaining the full work-order suffix and truthful incomplete/missing information. Past PDF versions and source documents remain retained.

Existing converted work orders remain in the established workflow, available through **Other assignments, routes & profile** for technicians. Existing unconverted SpinLife intakes can be opened and adopted in place. This increment does not backfill, merge or invent customer/facility/asset records.

## Components and migration

- New `components/spinlife-portal.tsx`, `lib/spinlife-simple.ts`, `lib/spinlife-store.ts`, `/api/spinlife`, `/api/spinlife/packet`.
- Additive generated migration `0024_spinlife_simple_visits.sql`: visit assignment/pay/timing/version metadata linked to the original intake; immutable packet snapshots keyed by intake/version. No production rows are seeded, deleted or rewritten by migration.
- Main navigation/technician entry, source extraction, attachment permissions/revision invalidation, legacy intake/work-order duplicate guards, and PDF missing-signature/approval wording updated.
- Existing company auth, account pricing, old finance/completion APIs, logos/branding, route planning and biomedical registry remain in place. Query caches and form instances are scoped to the signed-in user.

The repository's historical Drizzle metadata has a parent collision between `0012_snapshot.json` and `0018_snapshot.json`, and later applied SQL has incomplete snapshot history. Default generation reported this error. No applied migration/metadata was rewritten. A separate generator output compared `git show HEAD:db/schema.ts` with the new schema using installed Drizzle; its delta consists only of the two new tables and two indexes. Original generated baseline/delta snapshots and journal are retained under `docs/migration-evidence/spinlife-simple`. The new SQL and snapshot are appended to the release. The historical default-generator collision remains a documented tooling issue; future migrations must use a verified baseline until history is reconciled safely.

## Test evidence

- Thirteen focused actual-handler tests pass against SQLite with every migration applied and a synthetic R2 implementation. They cover empty saving; adoption preserving source/prices; admin-selected pay; no-date assignment; direct start and stable actual time; N/A and exact notes/measurements; cross-company and wrong-technician denial; unauthorized pay/attestation edits; attachment replay; signature provenance and amendment invalidation; immutable/retried packets; upload/write failure recovery; and pasted extraction with a simulated provider.
- A first full regression run completed **346 passed / 1 failed of 347**. The failure was a pre-existing source-text assertion for the phrase “files together” in the extraction prompt. Compatible wording was restored without removing the assertion or changing its multi-file behavior. The final full run is recorded below when complete.
- TypeScript and production builds have succeeded during implementation. Final exact-source gate and deployment outcome must be checked below rather than inferred from these earlier builds.
- A five-page synthetic incomplete packet was rendered and visually reviewed. The updated packet has readable fields, explicit missing signature/technician approval, preserved N/A and “not independently verified” wording, full suffix, and a captioned synthetic image. No actual customer documents were used as test fixtures.

## Limits and remaining acceptance

This is a separate simple SpinLife fieldwork path, not complete accounting closeout. Agreed pay is saved and visible, but this path does not create an invoice, payroll liability or payment; it requires a subsequent explicit billing/compensation handoff. Existing separate invoice generation continues in the established completion/finance workflow. Do not process the same SpinLife order there as a second job.

Live AI output, authenticated mobile interaction, real drag/drop/camera/signature behavior, actual technician profile/assignment, and SpinLife acceptance of digitally recreated forms remain unverified. Extraction tests use a simulated provider. The existing managed-preview sign-in failure is separate from application tests; no identity injection or permission removal was used and unchanged failing sign-in steps were not repeated. No automatic partner submission is implemented by this increment.

New uploads accept up to 20 MB per file; the PDF processing budget is 24 MB across evidence metadata. PDFs use the existing object-stream compression; configurable partner-size targets and phone-photo downsampling/original retention need further work. SIMPLE-02A adds automatic 24-hour, user-scoped recovery for unsaved form fields after refresh or browser interruption. It does not store selected file bytes or promise offline server synchronization; use **Save for later** and retry an upload when online. Source proposals are editable and are not approved manufacturer procedures.

## Recovery and exact next step

Checkpoint: `checkpoint/spinlife-simple-20260911`, source baseline `eccdca0`; prior published application version 100. Rolling back application code must leave migration 0024 and all new records/files intact. Pause editing new SpinLife jobs during rollback; those field records are not automatically converted into the old work-order workflow. Reapply a corrected release or recover through a reviewed handoff. Never delete the new tables or replay the same orders into billing.

Next task **SIMPLE-05 / LIVE-03**: the owner/administrator and assigned technician, preferably with the hired implementation expert, perform one fictional mobile assignment → start → save → reload → signature → PDF walkthrough and document obstacles. See `EXPERT-HANDOFF.md`. Then implement the billing/compensation handoff using existing account rules and exact agreed pay, with no double billing. The broader master roadmap remains in `MASTER-PROJECT-INSTRUCTION.md` and `IMPLEMENTATION-TRACKER.md`.

## Final gate / deployment

Final exact-source production build and TypeScript check passed. `node --test --test-concurrency=1 tests/*.test.mjs` completed **347/347 passed**, zero failures/skips, in 54,345 ms. `git diff --check` passed. The complete synthetic test log is retained in `docs/test-evidence/spinlife-simple-20260911.txt`. No browser/physical acceptance is included in that count.

Native deployment **succeeded** for existing project `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8`, version **101**, at **2026-09-11 16:24:15.356175 UTC**. Published source: `6265957aaaea8c517b2fcafb1132681f40f23987`. Version ID: `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8~appgver_9f28c4d1d7008191b82ce3f513855dde`. Deployment ID: `appgdep_6aa42b1a422c8191b25a06e7ba09e3c2`. Native URL: <https://techcommandhq.techflex-8918.chatgpt.site>. Existing custom production: <https://app.techcommandhq.com>.

Runtime environment revision **7** was preserved. The existing audience was public, revision **15**, before publication; no access or environment mutation was requested. The verified archive contains 25 SQL migrations and no environment files or source maps. This confirms deployment, not the unrun live AI/mobile/partner acceptance described above.
