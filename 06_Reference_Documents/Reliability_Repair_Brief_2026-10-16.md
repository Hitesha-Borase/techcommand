# Tech Command OS - Reliability Repair Brief

**Prepared:** October 16, 2026  
**Status:** Diagnostic findings and implementation requirements. No application fix has been deployed. No subscription, hosting configuration, authentication setting, or production data was changed during this investigation.

## 1. The reported failure

The owner used a technician profile on site and reported slow operation, freezing when enabling speech dictation, and work-order AI extraction that did not populate fields. The incident's exact time and device/browser have not been established. The findings below must not be represented as a confirmed root cause of that incident.

The priority is a dependable technician workflow: open an assigned job, read its existing information, enter notes and measurements, attach evidence, save, and submit. Speech, AI assistance, document generation, and optional modules must not block those core actions.

## 2. Verified observations

| Check | Observed result | Limit of the finding |
| --- | --- | --- |
| Production site record | TechCommand OS; project `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8`; slug `techcommandhq`; Library metadata reports source version 169. | This is site metadata, not a successful runtime test of that version. |
| Existing test site record | TechCommand OS - TEST; project `appgprj_6aa394ace6a081918fec475bdd564354`; slug `techcommand-os-test`; metadata reports source version 3. | Test isolation, current suitability, and parity with production have not been verified. Do not assume it is a safe production clone. |
| Connected Supabase project | `gbtuufdxhazmvanstptf`, region `us-east-2`, status `ACTIVE_HEALTHY`. | Health status is not proof that the entire application is fast or correct. |
| Public database schema | One table returned: `public.techcommand_auth_operations`, with row-level security enabled. | This is the public schema of this project, not the operational database of the entire application. |
| Supabase performance advisor | No performance warnings returned. | No query-plan audit or capacity benchmark of the main work-order backend was possible. |
| Accessible Edge Function | `techcommand-access`, version 3. Its source handles signed service-to-service login management and provisioning. Its configured app ID matches the production site record. | It is not the dictation implementation, technician interface, or work-order extraction pipeline. |
| Authentication failures | In the queried trailing 24-hour window, two `/auth/v1/user` requests returned HTTP 403 / `bad_jwt`. Authentication logs report: `token has invalid claims: token is expired`. | Expired tokens reached the service. The requests have not been attributed to the owner's onsite incident. This does not establish a broken refresh implementation by itself. |
| Function invocation | One returned invocation of `techcommand-access` was HTTP 200 with execution time 1,557 ms. | A single invocation is not a latency baseline and does not measure technician workflow speed. |
| Browser access | Connected browser rejected access because the originating browser context was unavailable in this session. | No authenticated mobile workflow, console trace, network waterfall, or microphone interaction was reproduced. |
| Main source export | Files returned: `files.materialize is unavailable for Site projections.` | The Library text projection is not editable application source. |
| Public URL fetches | Web fetches could not access the custom or native site URL. The container could not resolve the custom hostname. | These are access failures from this environment, not proof of a public outage or DNS misconfiguration. |

### Log summary returned in the diagnostic window

| Endpoint | Status | Count |
| --- | --- | ---: |
| `/auth/v1/user` | 200 | 3 |
| `/auth/v1/user` | 403, expired token | 2 |
| `/auth/v1/token` | 200 | 1 |
| `/auth/v1/admin/users` | 200 | 1 |
| `/rest/v1/techcommand_auth_operations` | 201 | 1 |
| `/functions/v1/techcommand-access` | 200 | 1 |

These are the returned records for the queried window, not a comprehensive application traffic report. No AI-provider logs or browser performance recordings were obtained.

## 3. Required access and baseline before editing

Use the existing editable Tech Command project, its real application source, and the associated operational backend/deployment controls. An application administrator login or the published technician portal alone is insufficient for code changes. Continue from a desktop browser with the connected extension and the editable project available; verify actual editing and deployment access before promising a release.

Record the exact production revision and rollback route before changing anything. Check whether the existing test site is isolated from production data, integrations, outgoing notifications, and billing. Use synthetic records and stubbed external side effects for load and failure testing. Do not run destructive tests or uncontrolled load tests against production.

Capture a baseline with both an actual technician account and the owner's technician-profile flow. Obtain browser errors, request durations/statuses, long tasks, memory behavior, and server/AI job logs for the same request IDs. Redact credentials, tokens, customer content, and document text from diagnostics.

## 4. Priority 0 - stop stalls and preserve work

### A. Session recovery

Inspect the actual client's session initialization, token refresh, role lookup, navigation guards, and server-side token forwarding. Do not assume the provisioning function controls these paths.

Use bounded initialization and refresh handling. A rejected or expired session must result in a successful refresh or a clear sign-in recovery action, never an endless role-verification screen. Prevent simultaneous refresh storms and uncontrolled retries. Preserve pending technician work through recovery without exposing another user's cached data. Test return from a locked phone, backgrounded tab, lost connection, and expired access token.

Do not disable token verification, authorization, row-level security, or signed provisioning to make the interface appear faster. Do not change expiry settings merely to conceal faulty session recovery.

### B. Dictation isolation

Keep typed notes fully usable without the app's custom microphone feature. Initialize speech only after an explicit user action. Feature-detect the browser implementation, guard repeated starts, and handle permission rejection, unanswered permission prompts, no speech, network failure, unexpected end, and navigation away.

Use a bounded startup state and a visible cancel action; a timeout in the UI must not leave a late-arriving microphone stream running. Release streams, recognition handlers, timers, and listeners when the operation ends or the component closes. Do not restart indefinitely on permission errors. Do not rerender or resave the entire work order for every interim recognition result.

Microphone failure must remain a local failure: typed text, photos, save, and navigation must continue working. Preserve any accepted transcript. Do not describe unsupported speech functionality as available.

### C. Saving and recovery

Use local draft persistence and a controlled upload/save queue with explicit states such as `Saved on this device`, `Waiting to sync`, and `Saved to server`. Mark a cloud save as successful only after server acknowledgement. Verify it by reloading the record during testing.

Scope draft storage to the authenticated user and account. Define safe recovery and logout behavior without silently discarding unsynced drafts. Handle storage failure visibly. Do not depend exclusively on a browser background-sync feature; flush pending work when the app returns to the foreground or regains a connection.

Use bounded, backoff-based retries and idempotent writes. Prevent duplicate photos, reports, work orders, and submissions. Reconcile concurrent edits so a late AI result or retry cannot overwrite a technician's newer work.

## 5. Priority 0 - repair the work-order extraction pipeline

Trace one representative failing work order through every real stage:

`Source stored -> content extracted -> AI/structured parser called -> response validated -> fields mapped -> authorized database write -> saved record reread -> technician form hydrated`

Attach one correlation ID across the stages and measure each stage separately. Inspect the real provider credentials/configuration, request schema, limits, errors, and field names without exposing secrets. A successful provider response alone is not a successful import.

Start extraction when the administrator imports a work order, rather than waiting for the technician to open it on site. Persist completed results and reuse them. Do not rerun extraction on every page render or job opening. Deduplicate by an appropriate combination of source revision/hash and work-order identity.

Make processing, completion, partial results, and failure visible. Provide a safe retry or manual entry path without blocking field work or adding a new mandatory administrator gate.

Populate only source-supported facts: the full work-order reference, customer/service location, equipment details actually present, reported complaint, requested scope, supplied parts, and instructions. Preserve meaningful suffixes and leading zeros. Keep missing values missing; do not invent serial numbers, performed work, readings, safety-test results, signatures, or charges. Do not overwrite existing administrator or technician edits with lower-confidence extraction.

Use a test set of actual partner document formats with expected field values, including scans, multi-page orders, missing serial numbers, and multiple assets. Report per-field correctness and verify persisted values after reload, not just whether some blanks were filled.

## 6. Priority 1 - reduce the technician interface's workload

Load only the technician's assigned-job list and currently opened job initially. Defer administrative dashboards, analytics, training modules, maps, PDF viewers, report designers, and other optional bundles until needed. Hiding a component is not enough if its code, queries, subscriptions, and timers still run.

Profile and remove repeated requests, duplicated subscriptions, uncontrolled polling, render loops, expensive per-keystroke processing, and excessive in-memory images. Paginate large lists; request only required fields. Use thumbnails while preserving original evidence. Defer heavy document/image processing to a worker or server where appropriate, with bounded concurrency and usable progress states.

AI generation, uploads, and reports should execute independently from the form's interactive state. Cancel stale work where appropriate; release resources on route changes. Handle stale application chunks and application-update failures without deleting drafts or leaving a white screen.

Preserve the simple existing field workflow. Do not introduce mandatory credential/career-ladder checks into ordinary job execution.

## 7. Paid upgrades - require measured justification

No purchase is recommended solely on the basis of this limited diagnostic snapshot. The available checks do not establish that Supabase compute is the bottleneck.

| Evidence from the actual application | Upgrade or change to evaluate |
| --- | --- |
| Sustained server CPU/memory saturation, worker queueing, or demonstrated cold-start delays | More appropriately sized compute, always-on capacity, or dedicated background workers. |
| Database connection saturation or slow, high-frequency queries | Query/index/pooling fixes first, then database capacity as justified. |
| AI rate-limit responses or provider-side queueing | Correct retries and request volume; evaluate provider limits or eligible service tiers only after checking the actual project and costs. |
| AI latency dominates an otherwise healthy request | Smaller validated task-specific model, less input/output, fewer calls, independent parallel work, caching, or suitable latency tier. Recheck extraction accuracy. |
| Large frontend bundles or browser main-thread stalls | Fix the client workload. Additional database capacity does not remove JavaScript running on the phone. |
| Weak connectivity and large media transfers | Smaller transfer payloads, local drafts, resilient sync, and appropriate caching. Never cache authenticated customer responses as public content. |

Name the exact provider, current and proposed capacity, expected recurring/usage cost, and measured benefit before a paid change. ChatGPT subscriptions and OpenAI API usage have separate billing; do not treat an unspecified ChatGPT upgrade as a verified upgrade to this site's AI backend.

## 8. Release acceptance - not yet run

All entries below are required tests, not completed results.

| Scenario | Passing condition |
| --- | --- |
| Owner using technician profile and independent technician account | Both complete the same authorized field workflow without owner-only privileges. |
| Import representative work order | Expected source-supported fields are correctly mapped, saved, and present after reopening. Missing data remains explicitly unresolved. |
| Extraction fails, times out, or returns malformed data | Clear status and recovery; form and manual entry remain usable; no fabricated completion. |
| Microphone allowed, denied, ignored, cancelled, or unsupported | No global freeze; typed notes remain usable; recording resources are released. |
| Repeated microphone start/stop and route changes | No duplicate handlers, uncontrolled restarts, or accumulating recorder instances. |
| Expired session and return after phone lock/backgrounding | Refresh or clear sign-in recovery; pending work is retained and access boundaries remain intact. |
| Connection lost mid-save or upload, then restored | Honest pending status, successful reconciliation, no duplicate writes, and persisted evidence after reload. |
| Multiple photos plus typing and background AI | Form remains responsive and edits are not overwritten by late responses. |
| Repeated jobs and extended field session | No unbounded resource growth or progressive slowdown. |
| Real iPhone/iPad and representative Android/desktop browsers | End-to-end checks pass on actual supported devices; desktop emulation alone is insufficient for microphone validation. |
| Final service submission/report | Exact saved facts and evidence are used; generation failure is recoverable; no duplicate external delivery or billing. |

**Performance criterion:** use the published good-INP target of 200 ms or less at the 75th percentile, segmented by mobile and desktop. Before release, also agree on explicit job-ready and save-acknowledgement targets for a documented device/network profile, collect before/after distributions, and keep slow background jobs separate from interface responsiveness. No current INP, job-ready, or save-latency benchmark was obtained in this investigation.

**Done means:** a recorded source revision, reviewed change set, passing tests, before/after measurements, a verified staged-to-production rollout, and a rollback path. A new specification, successful build, health response, or successful login alone is not proof that the field workflow is fixed.

## Reference basis

Private evidence: connected Supabase project/table/function/advisor/log results retrieved in this session; Files Library metadata for the production and test site records; Browser and Files materialization access errors. Source code for the login-management function was reviewed; the main application source was not available.

Existing project requirement: TechCommand_OS_Work_Order_and_PDF_Build_Spec (September 9, 2026), which describes extraction, provenance, verified facts, idempotency, and acceptance requirements but does not itself prove production implementation.

Public technical references, checked October 16, 2026:

- Supabase, User sessions: https://supabase.com/docs/guides/auth/sessions
- MDN, MediaDevices.getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN, SpeechRecognitionErrorEvent: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent
- Google web.dev, Optimize Interaction to Next Paint: https://web.dev/articles/optimize-inp
- OpenAI, Latency optimization: https://developers.openai.com/api/docs/guides/latency-optimization
- OpenAI, Managing billing for ChatGPT and the API platform: https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
