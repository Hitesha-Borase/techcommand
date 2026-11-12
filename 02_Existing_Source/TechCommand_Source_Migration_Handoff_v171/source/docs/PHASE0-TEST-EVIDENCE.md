# P0-02 test evidence — 2026-09-11

Scope: asset registry authorization, hierarchy validation and duplicate-label recovery. This file records actual local automated runs, not CI, live billing or authenticated browser acceptance. Every database fixture is synthetic and held in isolated in-memory SQLite with the checked-in migrations and foreign keys enabled. The tests call the actual application routes and authorization logic through Vite's test environment; synthetic identity headers are test fixtures, never injected into a browser or production request.

## Runs

| Check | Result |
|---|---|
| Baseline `node --test --test-concurrency=1 tests/*.test.mjs` | 203 passed, 0 failed, 0 skipped; 30.6 seconds |
| New `tests/asset-registry.test.mjs` against unchanged baseline | 1 passed, 7 failed; reproduced permission, hierarchy, duplicate recovery and transaction-time defects |
| Same focused tests after repair | 8 passed, 0 failed, 0 skipped |
| Final `node --test --test-concurrency=1 tests/*.test.mjs` | **211 passed, 0 failed, 0 skipped**, 36.8 seconds |
| `npx --no-install tsc --noEmit` | Passed, exit 0 |
| Supported production build helper | Passed, exit 0; existing large-chunk and proxy warnings only |
| `git diff --check` | Passed |

## Declared regression scenarios

1. Unauthenticated and unauthorized roles are denied; an unlinked technician cannot list assets; a technician record belonging to another company cannot confer access.
2. Technician reads include only assets linked to that user's current permitted assignments and matching company/account/facility. Query parameters cannot impersonate another technician. Offered, assigned, accepted, dispatched, arrived and submitted assignments remain usable; cancelled assignments do not.
3. Multiple permitted visits return one asset. Authorized administrators retain owned unassigned inventory. Malformed account/facility links cannot disclose foreign metadata; a department from another facility is not exposed.
4. Foreign, mismatched, missing or inactive account/facility/department selections cannot create an asset or success audit.
5. Valid creation persists stable UUID identity, full long/leading-zero label, customer ID and serial strings, correct hierarchy and exactly one audit entry. An omitted PM interval remains absent at the API layer; the existing UI default still needs policy work under P1-01.
6. Repeated label creation returns a recoverable 409 with one original asset/audit. Retired labels remain reserved. Another company's identical visible code is not silently merged or treated as this company's asset.
7. Changing account ownership between prevalidation and the transaction prevents insertion and success audit.
8. Moving a department between prevalidation and the transaction prevents insertion and success audit.

The full existing suite also retains route-planning/GPS URL, import/mapping, saved-equipment guidance, report review, uploads, completion, pricing, invoice, payroll and rendered-page regressions. URL construction tests do **not** establish actual Apple Maps, Google Maps or Waze app launches on phones.

## Manual and deployment limits

- Authenticated admin/technician UI and mobile tests: **blocked**, supported preview identity/sign-in path unavailable. No security bypass or production synthetic testing performed.
- Physical scan, microphone, label printing and GPS launch tests: **unrun**. No new support claim.
- Live AI extraction, transcript generation, partner submission, QuickBooks server synchronization and automatic road times: **unverified**.
- No PDF generator changed in this increment; previous PDF regressions pass, but no new visual PDF acceptance is claimed.
- No new dependencies or migrations. Deployment evidence is recorded separately in the release ledger only after native confirmation.

Admin location: **Biomedical → Biomedical Assets → Add asset**. The existing form displays the server's actionable validation/conflict messages. For users whose role exposes the registry, the technician description now explains that the list is linked to their assigned work orders. Other roles' navigation permissions are unchanged. This repair does not implement the future permanent-label/scanning wizard.
