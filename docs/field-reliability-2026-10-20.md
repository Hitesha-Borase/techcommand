# Field reliability repair — October 20, 2026

## Behavior

- SpinLife lists fetch compact, authorized summaries and open the exact full record on demand. Only 30 cards render initially. List polling pauses while editing a job.
- Optional guidance loads when opened. Other large portal workspaces load independently. A guidance service failure does not prevent typing or saving field notes.
- Device draft writes coalesce rapid typing, flush when the page is hidden or left, and serialize once. The interface distinguishes a pending device write from protected changes.
- One save can run at a time. Acknowledging a save reconciles newer edits instead of replacing them with the earlier snapshot. An interrupted response is checked against the exact server mutation ID before being reported as saved; writes are never blindly replayed.
- Normal note saves leave typing available. Related background refreshes do not hold a successful completion save open. Upload acknowledgments preserve newer notes, and failed file selections can be selected again.
- Dictation has bounded startup and recording times, cancels cleanly on navigation, and ignores late events from ended sessions. Network response bodies remain subject to their timeout after headers arrive.
- Production builds start with clean generated output, preventing removed static pages or stale assets from surviving a later release.

## Verification

- TypeScript typecheck and production build pass.
- 54 focused behavioral, recovery, offline, authentication, rendering, observation, navigation and identity-boundary tests pass.
- The separate API/asset regression run passes 54 of 68 tests. Its 14 failures are the same failures reproduced on the unchanged version 169 baseline; no new failures were introduced in that run. An additional device-state test has one pre-existing baseline failure. Several assertions describe earlier mandatory review/procedure gates, so this repair does not reintroduce those gates.
- The compact endpoint test verifies technician isolation, exact-order hydration, and retention of a complete N- suffix. An evidence-heavy synthetic job shrank from 109,704 bytes to 355 bytes in its list representation. This is a fixture measurement, not an overall application speed claim.
- Isolated browser testing used synthetic records and the real portal component: device draft recovery after reload, committed save with a lost response and no duplicate write, typing during a 2.5-second save, preservation and subsequent saving of newer notes, and optional guidance failure without disabling notes. No synthetic records were written to production. The QA page is not included in production assets.

## Boundaries and rollback

This release does not alter business rows, saved credentials, compensation, approval policy, roles, permissions, authentication, provider credentials, hosting plans or subscriptions. It does not fabricate completion, dispatch, acceptance or billing state.

Real-phone microphone behavior and live AI/PDF generation remain unverified. Earlier production logs contained AI and packet-generation errors; this release isolates optional tool failures but does not claim those upstream causes are resolved. Fifteen baseline test failures remain tracked above rather than being concealed.

Rollback source: commit `4ff08a502c2a24cc350db01621a13d28d457ad30`, production version 169, saved version `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8~appgver_c86ec996fa908191bda42bca3e9b6ccb`.
