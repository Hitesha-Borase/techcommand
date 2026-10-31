# Compliance administrator and audit workspace — release checkpoint

## September 8 release verification
- Restored dependencies from the existing checkout with an identical package-lock.json.
- Full production build passed; all 60 existing automated tests passed, including rendered HTML, Floyd's role upgrade, organization isolation, audit sign-off rules, completion/billing generation, and website intake validation.
- Ran the tests after the build, sequentially, to avoid build-output races and test-server port collisions.
- Standalone TypeScript checking remains unclean: the project lacks Cloudflare runtime type declarations and has existing strict typing errors. Production compilation and automated runtime tests pass; this is not a claim of a clean type check.
- No browser QA or live WordPress delivery/upload test was performed in this release. The WordPress limitations below remain unresolved.
- Publishing is authorized for the Site's existing audience. Floyd's application administrator role activates at his next authenticated portal request.

Owner request: Floyd Boyer, fboyer@ahcc.com, full application administration and audit duties.

## Prepared changes
- Floyd is added to the approved administrator configuration using the existing highest application permission tier. Site ownership and existing Site sharing are not changed. His Site visitor permission already exists.
- First sign-in after deployment upgrades the existing Floyd user, disables the old product-review membership and records an access-activation event.
- Compliance & Audits includes eight review areas, actual survey results, complaint, incident and adverse-event registers, scope/period/sample, evidence references, findings, corrective-action ownership/deadlines, verification, authenticated sign-off, locked signed records, follow-up audits, history, and page-by-page CSV export.
- Uses existing admin_tasks and audit_logs; no database migration is required.
- Membership lookup is organization-scoped, the administrator list handles four approved emails, and generic task updates cannot bypass compliance sign-off.

## Audit format
Audit ID | period | locations/services | policy/requirement | population and sample method | area | evidence/work-order/invoice references | result | finding and impact | correction | responsible person | due date | verification | reviewer | sign-off timestamp.

Areas: customer satisfaction responses; complaints; incidents; adverse events/equipment malfunction; customer records; P&L/budgets; billing accuracy; service plans/handout delivery.

Method: define scope; review all reported complaints/incidents/adverse events/billing exceptions in period; document risk-based routine sample; gather evidence; assess eight areas; assign correction/owner/due date; verify effectiveness; sign and lock; track follow-up weekly. Formal cadence and sampling policy require Brandon/Floyd approval.

P&L and budget reports must be uploaded from accounting. Do not call portal billing totals a company P&L. Current system policy is non-PHI; patient-identifying forms require a separately approved handling process. Approved service-plan/handout templates and device purchase/reimbursement policy have not been supplied.

## Previous session validation and blockers (historical)
- 11 native Node tests pass: Floyd account upgrade, administrator listing, unauthorized/cross-organization denial, sign-off requirements, date handling, CSV formula protection.
- SQLite checks passed using all existing migrations, with persistence, stale-write rejection, signed-record lock and organization isolation.
- Changed TS/TSX files passed Babel syntax parsing; git whitespace check passed.
- Full build NOT completed: network dependency installation was cancelled/blocked; offline cache incomplete; vinext missing. Do not deploy without restoring locked dependencies and passing full build/tests and UI checks.
- Production remains v37. Floyd's live application role is not upgraded by this checkpoint alone.

## WordPress progress this session
- Authenticated WordPress admin session restored.
- Saved missing SMTP From Email and SMTP Username as brandon@techflexmobility.com; retained encrypted password, smtp.gmail.com, TLS, port 587.
- Test email was blocked by automatic approval review before send; requires explicit confirmation.
- PRO Elements 4.2.2 and intake connector 1.0.4 remain active.
- Biomedical service form is within container 43ce6af7, hidden on desktop/tablet/mobile; its section includes placeholder FAQ/contact content. Do not indiscriminately expose that section.
- Biomedical editor: post 2696. Separate request button widget 5b297b2 is currently a popup dynamic link. No Elementor changes saved this session.

## Subsequent website checks
- After Brandon renewed broad website-repair authorization, the SMTP test was submitted. WP Mail SMTP reported: "The test email might have sent, but its deliverability should be improved." SPF passed; DMARC was reported missing. Do not claim confirmed inbox receipt.
- Automatic approval review separately rejected removing the Biomedical button's popup dynamic link. No Elementor changes were saved. The concrete proposed repair is to make the separate Biomedical service-request entry visible and link it to the working Contact form without exposing the unfinished FAQ/placeholder section.
- Career form was populated with clearly labeled synthetic test data. File-chooser operations were unreliable and then the browser transport failed. No career submission was confirmed; do not mark the resume workflow passed or diagnose this transport failure as a WordPress bug.
- No paid service purchased.
- A three-page audit method/evidence checklist/worksheet PDF was created and saved for the user. Library identity: libfile_3ff83b50cf948191bb4a3e47433995f9.
