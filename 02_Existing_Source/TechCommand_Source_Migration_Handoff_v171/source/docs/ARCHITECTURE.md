# TechFlex Command Center — Foundation Architecture

## Product objective

Build one operational system that owns the complete TechFlex service record from customer intake through technician payout. The portal must support biomedical/HTM programs, manufacturer and retailer field service, white-glove delivery, repair, inspection, recurring preventive maintenance, and future service categories without creating separate data silos.

The application is a private, role-aware progressive web application. Administrators use the full desktop command center; technicians receive a mobile-first field workflow; clients receive access only to their own accounts and locations.

## Non-negotiable design rules

1. **One source of truth.** Accounts, locations, departments, assets, work orders, estimates, reports, invoices, and payouts are linked records—not copied text.
2. **Configurable business logic.** Prices, PM procedures, required evidence, status transitions, SLAs, notifications, and approval thresholds are versioned configuration.
3. **Offline-first field work.** Technicians can view assigned work, complete forms, capture timestamps, scan assets, and queue photos or signatures without a connection. Synchronization resumes automatically when a connection returns.
4. **Server-enforced permissions.** Hiding a button is not security. Every read and write must be authorized by role, account scope, and location scope on the server.
5. **Immutable history.** Material changes create timeline and audit events. Reports, estimates, rate cards, invoices, and procedures retain the exact version used at the time.
6. **Integration by events.** SpinLife and future partners enter through idempotent integration events. External system failures never corrupt the underlying work order.
7. **No unnecessary PHI.** Store service and equipment data, not patient clinical records. If a future workflow truly requires PHI, complete a separate security and compliance review first.
8. **Modular monolith first.** Keep one deployable application with clear modules and interfaces. Split services only when real scale or organizational ownership justifies it.

## Canonical record hierarchy

```text
TechFlex organization
└── Account
    ├── Contract + versioned rate card
    └── Location
        └── Department
            └── Asset
                ├── PM plan
                ├── Work-order history
                ├── Service reports
                └── Documents / photos
```

Technicians are separate organization resources. Assignments connect technicians to work orders; routes connect assignments into an optimized day plan.

## Core modules

| Module | Owns |
| --- | --- |
| CRM | Accounts, locations, departments, contacts, contracts, client access |
| HTM / CMMS | Asset registry, risk class, PM plans, procedures, compliance history |
| Work management | Intake, triage, status lifecycle, assignment, SLA, service reports |
| Dispatch | Coverage, skills matching, availability, routes, time windows, mileage |
| Pricing | Rate cards, rules, cost model, margin guardrail, estimates, approvals |
| Field app | Assigned work, navigation, evidence, parts, signatures, offline queue |
| Finance | Invoice generation, receivables status, technician payouts |
| Quality | Required evidence, QA review, credential expiration, audit log |
| Files | Photos, PDFs, signatures, certificates, manuals, shipping documents |
| Integrations | Partner intake, outbound updates, accounting, maps, email, SMS |
| Automation | Event triggers, conditions, actions, retries, exception queue |
| Intelligence | Revenue, margin, SLA, utilization, PM compliance, concentration risk |

## Permission model

Initial system roles:

- **Owner Administrator:** unrestricted configuration, financials, security, exports.
- **Operations Administrator:** accounts, locations, assets, work orders, dispatch, QA.
- **Dispatcher:** intake, assignment, route planning, schedule, customer updates.
- **Biomedical Lead:** asset standards, PM procedures, inspections, QA approval.
- **Finance:** estimates, invoices, receivables, payouts; no credential or private profile editing.
- **Technician:** only assigned work, allowed customer/location context, own credentials and payout statements.
- **Client Administrator:** own account and all permitted locations, assets, service history, reports, invoices.
- **Client Location User:** only assigned locations and approved actions.
- **Read-only Auditor:** time-limited, export-controlled access to specified modules.

Permissions are stored as explicit action keys, such as `assets.read`, `assets.edit`, `pricing.approve`, `work_orders.assign`, and `reports.export`.

## Work-order state machine

```text
Received → Needs pricing → Awaiting approval → Ready to assign
→ Offered → Accepted → Scheduled → En route → On site
→ Work complete → Technician submitted → QA review
→ Ready to invoice → Invoiced → Paid → Closed
```

Exception states include declined, reschedule required, parts hold, customer unavailable, safety hold, canceled, return visit required, and disputed.

Every transition has:

- an allowed source state;
- required permission;
- required evidence;
- timestamp and actor;
- optional automation;
- client-visible and internal wording;
- a reversible or corrective path when appropriate.

## Pricing engine

Pricing is never hardcoded to a single partner. Each account can select a versioned rate card containing ordered rules. Inputs can include:

- service category and equipment type;
- product weight, box count, stairs, carry distance, calibration, or scale work;
- required technician count and required skill;
- round-trip mileage, drive time, on-site time, hotel, tolls, trailer, and other direct costs;
- geography, rural coverage, urgency, after-hours, warranty status, and contract tier;
- parts count and repair complexity;
- target gross margin and approval threshold.

The engine returns itemized client-facing charges, internal estimated cost, margin, rule trace, approval status, and a permanent pricing snapshot. A later rate-card edit cannot silently change an old estimate.

## Route optimization

The RoadWarrior-style module separates routing logic from the map provider. A route request contains technician origin, stops, service durations, time windows, skills, crew constraints, vehicle limits, priorities, and optional end location. A provider adapter returns stop order, ETA, distance, drive time, and the full optimization snapshot.

This makes Google Routes, Mapbox, HERE, or another supported provider replaceable without rebuilding dispatch.

## Offline synchronization

The browser keeps a local encrypted-capable record cache and a mutation queue. Each local write receives a unique client mutation ID and the last known server record version.

On reconnect:

1. Upload pending files safely.
2. Submit mutations in dependency order.
3. Reject duplicates by client mutation ID.
4. Apply clean changes and increment record version.
5. Return conflicts for human resolution instead of overwriting newer server data.
6. Download authorized changes since the last sync cursor.

High-risk actions—price approval, payout approval, user access changes, and destructive record merges—require an online server confirmation.

## Storage and audit

- Structured records: relational database.
- Photos, PDFs, certificates, signatures, manuals, and exports: object storage.
- File metadata and ownership: relational database.
- Sensitive values and integration secrets: managed server environment only.
- Material mutations: append-only audit event with actor, request, device, before, and after values.
- External events and outbound actions: idempotent queue with status, retries, and error context.

## Acquisition-value layer

The system becomes a real company asset when it proves:

- repeatable service delivery independent of the owner;
- measured margins by account, service type, region, and technician;
- dependable nationwide technician coverage;
- recurring PM revenue and asset-level customer retention;
- clean SLA and quality history;
- portable, documented business rules;
- defensible service and equipment data;
- low-friction onboarding for new clients, locations, and technicians;
- reduced customer concentration and clear integration capability.

The valuable thing is not a large menu. It is clean operational data moving through a controlled, measurable machine.
