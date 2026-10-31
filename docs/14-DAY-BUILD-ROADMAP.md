# TechFlex Command Center — 14-Day Build Roadmap

Two focused hours per day. Each session must leave behind a working, reviewable slice.

| Day | Build target | Definition of done |
| --- | --- | --- |
| 1 | Platform foundation | Private portal shell, module map, data architecture, permissions model, audit/offline foundations, initial bid and route prototypes |
| 2 | Account and location CRM | Create/edit accounts, contracts, contacts, locations, departments, notes, and account timeline |
| 3 | Biomedical asset registry | Asset intake, unique tags, manufacturer/model/serial, risk, status, location hierarchy, QR-ready identifier |
| 4 | PM program engine | PM plans, procedure versions, recurring due dates, bulk scheduling, overdue logic, compliance dashboard |
| 5 | Work-order intake | Manual intake plus normalized partner-import format; deduplication and source tracking |
| 6 | Pricing engine | Editable versioned rate cards, rule evaluation, cost/margin guardrails, approval levels, itemized estimate |
| 7 | Dispatch and coverage | Skill/radius matching, technician availability, assignment offers, crew rules, time windows |
| 8 | Routing and offline core | Route-provider adapter, optimized stop order, PWA shell, local record cache, mutation queue, reconnect handling |
| 9 | Technician field workflow | Accept job, navigation, en route/on-site timestamps, checklist, parts, photos, notes, signature, submit |
| 10 | QA and compliance | Required evidence, exception handling, report review, credential expiration, immutable event timeline |
| 11 | Invoicing and payouts | TechFlex invoice template, ready-to-invoice queue, line items, payment terms, 55% baseline payout logic and overrides |
| 12 | Client and partner access | Scoped account/location dashboards, service history, reports, approvals, invoice visibility, intake endpoints |
| 13 | Automations and reporting | Trigger/action rules, notification queue, retry console, KPI dashboards, margin and SLA reporting |
| 14 | Hardening and launch plan | End-to-end workflow review, security checks, backup/export strategy, data import plan, deployment and training checklist |

## First integration sequence

1. SpinLife assignment intake and status updates.
2. Mapping/geocoding and route optimization.
3. Email/SMS notifications.
4. Accounting export or direct accounting connection.
5. Manufacturer/retailer partner adapters using the same normalized event format.

## Scope rule

Each new feature must attach to the canonical records and permission model. No disconnected spreadsheets hiding inside the app, no one-off client logic buried in screens, and no automation without an exception queue. That is how the system stays editable instead of becoming expensive digital archaeology.
