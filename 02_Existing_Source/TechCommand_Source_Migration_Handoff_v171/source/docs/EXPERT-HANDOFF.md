# TechCommand OS — implementation and usability handoff

Owner objective: make everyday work easy for an administrator and a field technician. Improve the existing application in place. A simple delivery must not depend on creating biomedical assets, complete CRM profiles, travel calculations, or pricing approvals before it can be saved.

## First paid milestone

Observe the owner’s administrator and a technician using one fictional SpinLife white-glove delivery, then correct the barriers they encounter. Deliver a working, demonstrated workflow:

1. Administrator drops or pastes a SpinLife work order, chooses the technician, and enters that technician’s agreed pay. Extract available details, allow corrections, and save blanks for later.
2. Technician signs in, immediately sees the assignment, and clicks **Start Work Order**. Scheduling and travel/arrival steps must not block starting.
3. Technician records simple checks, N/A or unfinished answers, serial number when available, photos, a customer signature when obtained, and a plain description of the work. Save at any point.
4. Generate the digital SpinLife paperwork, TechFlex report, and captioned photos as one PDF. Preserve the entire work-order identifier and suffix in the filename. Missing/unperformed information stays truthful. Invoice and technician compensation processing remain separate from the customer report.
5. Repeat the save, upload, and report steps after an interrupted connection; prove that the records persist without duplicate billing. Demonstrate access as an actual authorized administrator and assigned technician on their phones.

Approve the milestone based on that observed journey and readable documents. Automated test counts alone are not usability acceptance. Request an agreed fee for the initial review and a written estimate for subsequent implementation; no candidate’s price or availability has been confirmed.

## Hiring profile / job-post title

**Senior React / TypeScript developer to simplify and complete an existing field-service portal**

Seek demonstrated work with React, TypeScript, Cloudflare Workers, D1/SQLite, R2 object storage, server-side permissions, document uploads, and PDF generation. Request examples of operations or field-service software used by nontechnical staff, plus experience investigating an existing codebase. The developer should be able to screen-share with the administrator, explain tradeoffs plainly, and maintain a small release and rollback process. Confirm they can work within the actual ChatGPT Sites hosting/access environment before committing to a larger engagement.

Public hiring directories reviewed on 2026-09-11:

- [Codementor Cloudflare experts](https://www.codementor.io/cloudflare-experts): offers live sessions and project work. Suitable for an initial paid review and discussion of ongoing work.
- [Upwork React developers](https://www.upwork.com/hire/react-js-developers/): a place to post the ongoing implementation role and compare proposals.

These are places to find candidates, not endorsements of a vetted individual. Screen specifically for Workers/D1/R2 and usability experience; a general Cloudflare listing does not establish those skills.

## Verified project and stack

- Production: <https://app.techcommandhq.com>.
- Existing Sites project: `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8`.
- Source uses React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1 (`DB`), R2 (`BUCKET`), and `pdf-lib`. Existing PostHog monitoring and OpenAI extraction code are present.
- Authentication uses Sites-supplied identity headers followed by application membership/role checks. A Site visitor grant is not an application administrator or technician profile.
- Existing source, pricing, branding, attachments, and business records must be preserved. No new subscription or migration to another host has been approved for this handoff.

## Source map and continuing work

The separate SpinLife simplification increment is published as version **101** (native deployment succeeded 2026-09-11 16:24:15 UTC). Its final local automated suite passed **347/347**. See `SPINLIFE-SIMPLE-RELEASE.md` for exact source/deployment evidence and limitations. The new path saves assignment/pay and produces service packets; its accounting/payroll handoff and observed mobile acceptance remain open.

- `docs/WORKFLOW-SIMPLIFICATION.md`: latest owner decisions, including flexible saving and administrator-selected technician/pay.
- `docs/IMPLEMENTATION-TRACKER.md`, `docs/RELIABILITY-LEDGER.md`: persistent roadmap, prior checks, release evidence, known limitations.
- `components/techflex-command-center.tsx`: navigation and role-specific entry points.
- `components/spinlife-portal.tsx`, `app/api/spinlife/`: current simplification increment; consult the release record before assuming it is published.
- `components/bid-intelligence-workspace.tsx`, `app/api/bid-intelligence/route.ts`: original intake/extraction; new SpinLife intake reuses extraction.
- `app/api/intakes/route.ts`, `app/api/work-orders/route.ts`, `app/api/dispatch/route.ts`: established intake, work-order creation, assignment and routing.
- `components/field-completion.tsx`, `app/api/completions/route.ts`: existing completion/review/billing workflow; retained separately.
- `lib/techflex-pdfs.ts`, `lib/spinlife-document-policy.ts`: existing branded digital paperwork and filename logic.
- `docs/FIRST-LIVE-JOB.md`: first-job handoff and remaining live checks.

The latest simplification must be judged separately from the prior version-100 baseline. Backend fixtures are synthetic; they do not prove live AI extraction, customer signatures on a physical phone, partner acceptance, or a technician’s real assignment. Prior authenticated preview failure is a platform sign-in problem; do not remove permissions or inject identities to bypass it.

Keep DME/mobility screens separate from biomedical asset PM. Broader biomedical procedures, approved technical sources, competency controls, offline support, and integrations remain in the master roadmap. Do not expand the first usability milestone to all of those items.

## Access and ownership

Arrange access through owner-controlled project invitations and secure credential processes. No passwords, API keys, customer documents or real patient records belong in a public job posting. Keep repository, hosting, billing accounts, backups, and business data under the owner’s control. The initial review should establish the supported source/deployment/test access the expert will actually use before promising delivery.
