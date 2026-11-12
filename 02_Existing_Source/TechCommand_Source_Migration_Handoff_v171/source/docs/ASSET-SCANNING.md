# Permanent asset tags and scan-to-PM — September 11, 2026

This is an increment of the existing TechCommand OS application, using its existing TechFlex branding, account/facility records, asset UUIDs, permissions, assignments, service history and document workflows. It does not rebuild the registry or connect a vendor's separate inventory database.

## Recovery and scope

- Opened project `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8`, native title TechCommand OS, custom domain `https://app.techcommandhq.com`.
- Reconciled fetched main with saved version 90 at `ede17d404d65d3559b639b542f180f7aec3b6d8d`. Its attachment-isolation fix and 262-test baseline were preserved. The version-90 response had no deployment attached; saved source was not treated as publication evidence.
- Created `checkpoint/asset-scanning-20260911` at that exact source and held the existing checkout lock. Fetched main again before preparing publication; no upstream source change was found.
- Owner's explicit scanner request advances P1-03a/P1-04a on the existing registry foundation. The full Phase 1 acceptance, Phase 0 isolation work and approved procedure engine remain separate tracker tasks.

## Controls and intended user journey

1. An owner/operations administrator or biomedical lead opens **Biomedical Assets**, finds the existing asset, opens its **Asset lifetime record**, then **Permanent asset tags**. Import/create the actual asset first if it does not exist.
2. Select IntelliScanner or another custom tag, use **Scan the unused sticker**, check the displayed facility, manufacturer, model and serial, confirm the physical match, then **Link tag to this asset**. A changed equipment snapshot requires confirmation again. This links an alias to the existing UUID; it does not create a second asset or overwrite its primary identifier.
3. A technician opens **Scan asset**. Administrators also have **Scan an asset** at the top of Biomedical Assets. Select **Use scanner** for a keyboard/HID scanner, **Camera**, **Barcode photo**, or type the full printed number.
4. Keep **Any authorized facility** for a company-issued tag. A facility's old number instead requires **Facility's existing asset number** and the exact facility. Duplicate legacy numbers within that facility require administrator resolution.
5. Confirm the returned equipment identity. View its recorded history or choose an existing **Open assignment**. The application checks the tag, asset and assignment again immediately before opening the scheduled field view. It retains other scheduled assignments even when only some jobs are on the route.
6. If no work order is linked, ask dispatch to plan/link/schedule the service. Managers can use **Plan PM / service**, which opens the existing intake/planning flow. A scan never automatically creates a visit, marks PM passed, issues a charge or submits paperwork.

**Test scanner only** displays the received identifier locally without calling the resolver or saving a label. **Scanner setup** has optional literal prefix/suffix fields. Enter, CR/LF endings and Tab are handled; prefix/suffix settings are not guessed or saved to analytics. Settings currently last only while the control is mounted.

## Compatibility and verification boundary

| Input | Implemented handling | Evidence and remaining acceptance |
|---|---|---|
| IntelliScanner custom asset tags | Code 39; exact 7–8 digits, including leading zeros | Official format verified; independent synthetic Code 39 pixels decoded by the real WASM engine. Actual customer stickers/scanner not yet tested |
| USB/Bluetooth keyboard/HID scanner | Focused text input, Enter/Tab, configured affixes, duplicate-read debounce | Parser and server tests pass. Pairing, keyboard layout, transmission settings and rapid scanning require the actual device/browser pilot |
| Phone/tablet camera | Explicit start/stop, rear-camera preference, permission messages, stops on hide/unmount; local frames only | Decoder/capability/error fallback tests pass; physical iPhone/iPad/Android camera and permission recovery remain unrun |
| Barcode photograph | Up to 10 MB; reads one supported code locally, rejects ambiguous results | Real pixel-decoder fixtures pass; device image loading/HEIC/browser combinations not certified |
| Code 128 / QR | Exact string asset tags; existing `techflex:asset:<asset-id>` QR values supported | Independent Code 128/QR fixtures pass; QR prefix truncation found and corrected |
| Number-only label | Typed identifier | Ordinary numbers are not a barcode. Text OCR is not implemented in this control |
| Manufacturer product/serial barcode | No automatic match by model/product/serial | Only an explicitly linked asset tag or internal asset QR resolves; unrelated barcode formats are not advertised as tested |

IntelliScanner's official [tag documentation](https://help.intelliscanner.com/support/tags/) states Code 39 and 7–8-digit tag numbers. Its [third-party application documentation](https://help.intelliscanner.com/support/thirdparty/) describes keyboard emulation for supported models and the Enter suffix. This does not establish universal compatibility for every device sold under that name. No vendor API, scanner SDK or paid subscription is needed for keyboard input; no purchase was made.

## Data integrity and permission rules

- New additive migration `drizzle/0022_permanent_asset_labels.sql` creates `asset_labels`, a company/code unique index, immutable ownership/code rules, retirement history and collision triggers against primary asset tags. Existing rows/PM dates are preserved; there is no mass backfill, inferred interval, deletion or reset. The Drizzle schema mirrors the added table/indexes; this repository already uses hand-authored incremental SQL migrations.
- Primary identifiers and label values stay strings. Existing primary tags resolve without a backfill. If a primary tag is later changed through the existing update path, its previous value is retained as a legacy alias. Retired labels remain reserved permanently; replacing a sticker means retiring that label and assigning a new unused one to the same equipment.
- Linking requires an allowed active company membership plus an exact equipment/version snapshot inside the database transaction. Retries return the same active link, with one audit event and no duplicate record. A concurrent identity/facility/membership change aborts without partial writes.
- Lookup filters company, valid active account/facility hierarchy and, for technicians, their own current assignment and active profile. Unknown and unauthorized asset identities return the same generic 404. Wrong-facility, ambiguous, retired and arbitrary URL inputs never open a guessed record.
- Camera/photo frames remain on the device. Only the code and explicit facility selection are posted to the protected lookup endpoint; there is no scanned-URL navigation, ambient keyboard hook or code in a query string. Responses use private/no-store caching.
- Existing PostHog privacy rules remain in place. New events are finite scan/link success/failure names with only approved enum context and the build release. No labels, serials, asset/facility identifiers, images, raw errors or device frames go to analytics. Real PostHog ingestion remains separately unverified.
- Higher-risk equipment and equipment on hold can be identified and its history reviewed. This scan flow does not provide an approved technical procedure or enable the assignment shortcut for high/critical risk or non-in-service equipment. It does not grant competence or declare safety/compliance.

## Dependency review and release assessment

Added exactly pinned `zxing-wasm@3.1.4`, using only its reader distribution with a bundled same-origin WASM URL. Native BarcodeDetector is used only when all required formats are supported; empty/error results recover through the maintained decoder. No remote decoder CDN or camera-upload service is required. The official [README](https://github.com/Sec-ant/zxing-wasm) and [releases](https://github.com/Sec-ant/zxing-wasm/releases) were inspected. MIT wrapper and Apache-2.0 decoder notices are shipped in `public/third-party-licenses/asset-barcode-reader.txt`; no Python service or barcode generator was added to production.

The initial production dependency audit reported six existing affected packages, including Next.js, Sharp, PostCSS, fast-uri and nanoid. Applied compatible pinned Next/eslint-config-next 16.3.4, React/react-dom/react-server-dom-webpack 19.2.8, and lockfile updates for the affected transitive production packages. The official [Next Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [Next image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), and [React server-function advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g) support those patched versions. React server DOM was explicitly treated as deployed code even though the manifest puts it under development dependencies.

The final production-package audit reports **zero known advisories**. This is not a clean full development dependency tree: the full audit retains 18 entries (12 high, 5 moderate, 1 low) in the existing toolchain. Their observed scope is build/lint/development tooling, including Vite/Miniflare/Wrangler, image-size and related packages. The high Vite advisory targets Windows development paths; this execution profile is Linux. image-size is called from Vinext's build-time static-image import/metadata processing, not the uploaded-document endpoints. The packaged server has an empty external-module manifest; inspection found no image-size, ICNS parser, Miniflare, native Sharp, undici, browserslist, brace-expansion or js-yaml implementation in the shipped worker. The one `wrangler` mention is an entry-point documentation comment. The runtime React vulnerability was patched and the emitted worker/SSR identify 19.2.8.

These remaining tool advisories are **not certified fixed** and must not be described as an all-project clean audit. They do not establish an unresolved high-severity defect in this shipped scanner/Worker path under the reviewed conditions. P0-08 records the remaining compatible toolchain update/reachability work before exposing a development server or processing untrusted repository/build inputs. Do not force the audit's suggested downgrade of Drizzle or major Vinext beta migration into this feature release. Preserve controlled build inputs and the supervised preview boundary. Raw audit evidence is under `docs/evidence/`.

## Automated evidence and manual limits

Tests use synthetic records in isolated SQLite, actual API route handlers, the actual WASM decoder and rendered component markup. Independent barcode fixtures were generated with ReportLab/PyMuPDF; the committed fixtures require neither Python nor a new image library at test time. No production records, files, messages, invoices or provider exchanges were created.

Final verification: **289/289 full-project tests**, **26/26 scanner/decoder tests**, TypeScript, production build and diff checks passed; no tests were skipped. The release evidence records parser preservation, exact QR resolution, role/company/facility/assignment isolation, concurrent changes, idempotent tag linking, collision prevention, retirement/replacement, schedule handoff selection, real Code 39/128/QR and rotated/blank-frame decoding, native fallback, safe analytics and additive migration preservation. The full project suite also covers the preceding attachment and administrative-onboarding fixes and existing intake, route, service-report and billing behavior. See the release ledger for final counts and deployment outcome.

The supported authenticated-preview sign-in failure is already documented in `BLOCKER-RESOLUTION.md`; it was not replayed or bypassed. Local Playwright browser binaries are absent and the available remote preview is not an authorized substitute for a physical scanner/mobile pilot. No browser/device compatibility matrix is marked passed from decoder tests. The separate TEST Site remains owned by its other implementation session.

## Software print and reprint controls - September 20, 2026

The existing **Permanent asset tags** panel can prepare an actual-size one-page Code 128 PDF for an active linked label. The owner, operations administrator or Biomedical administrator enters stock dimensions from 2-6 inches wide and 1-4 inches high, reconfirms the physical match and downloads the artifact. The generator retains a ten-module quiet zone and rejects a code too dense for the chosen width. The readable exact number, asset tag, equipment context and print reference remain visible.

Every successful preparation records an immutable print number. Reprints require a reason. The record retains dimensions, exact label/asset revision and identity snapshot, actor and server time; it never alters the permanent identity. Unchanged network retries reconcile the same event/PDF, including from the browser's retained pending request. Changed retries, retired labels, stale assets, cross-company IDs, concurrent sequence numbers and failed audits do not leave a partial print event.

This is software output and audit evidence, not physical certification. Print at 100 percent/actual size, keep the label clear of plates, controls and vents, test-scan it before application and confirm the selected material against the facility cleaning process. Printer driver scaling, alignment, darkness, adhesive, chemical resistance and physical scanner/phone behavior remain in the P1-04b/P1-05 pilot.

## Exact next acceptance task — P1-04b

Owner: Brandon/designated facility lead, assisted by the implementation engineer.

1. Record the actual scanner model, host phone/tablet/computer, browser version and one sample tag's printed number/barcode format. Do not send patient labels or credentials; a blank/sample IntelliScanner asset sticker is sufficient.
2. Use **Scan asset → Test scanner only**, connect in supported keyboard mode, choose **Use scanner** and scan the sample. Pass: every digit matches, including zeros, and Enter/Tab submits only to the scanner control.
3. Once the already-planned isolated TEST Site and synthetic identities/storage are verified, link a sample tag to a fictional facility asset. Reopen the record, scan by HID/manual/camera, confirm identity and open its existing scheduled PM assignment. Pass: one asset, one existing assignment, no scan-created visit/invoice, correct date and retained history after refresh.
4. Repeat denied camera permission/retry, two visible labels, unknown/retired tags, wrong facility, an unassigned technician, rapid repeated reads and loss/recovery of connectivity. Pass: visible recovery and no guessed asset, unauthorized data or duplicate write.
5. Log actual device results. Label-sheet/thermal printing, alignment, quiet zones, cleaning-compatible media and PM-event stickers remain P1-05; direct printer SDKs are not included.

Safe alternative while physical/authenticated acceptance is pending: use the existing authorized registry and manually enter the exact permanent number, confirming the equipment before selecting service. Lookup requires connectivity; there is no claim of offline scan resolution.

## Rollback

Before publication, recoverable source is the checkpoint above. After publication, prefer a forward revert of the scanner UI/routes while retaining the verified dependency security patches and earlier attachment fixes. Leave migration 0022 and its data in place: additive tables/triggers are safe to preserve, and deleting them would discard permanent identifier history. Do not downgrade dependency fixes, drop production tables, reset users or recycle labels. A read-only label lookup/history fallback can remain available while investigating a problem. Use the native deployment history and the same audience; record the terminal deployment result in the ledger.

Deployment: **published version 91**, source `c971b8255ff779ab5c29d5851189bb9d9cf8b4c8`; saved version `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8~appgver_d9d98b836b5c8191ab7eef55dd6aaaa6`; deployment `appgdep_6aa3a343a97c819185eb70bd31a3b108` confirmed **succeeded** at 2026-09-11 06:44:37 UTC. Runtime revision 7 and the existing custom audience revision 12 were preserved. Native URL: https://techcommandhq.techflex-8918.chatgpt.site; existing custom domain: https://app.techcommandhq.com. Validated archive contains 820 files (834 entries including directories), 23 SQL migrations including 0022, the local decoder WASM and license notices, and no environment files or public source maps. A post-deployment native D1 overview confirmed `asset_labels` exists in the existing DB binding alongside `assets` and `asset_visits`; no production rows were added for testing. Authenticated/device acceptance remains unrun as described above.
