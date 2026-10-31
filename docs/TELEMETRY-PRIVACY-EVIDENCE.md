# P0-03a — client telemetry privacy and build identity

2026-09-11. Baseline: version 85, source outcome `8096d2ace591ffed1fb01f7fe29485a466c26063`. Recoverable local checkpoint: `checkpoint/privacy-telemetry-20260911`; remote main already contained the baseline. Exclusive checkout lock held. This is the client portion of P0-03, not completed backend monitoring or signed-in acceptance.

## Reproduced defects

Five new isolated tests failed on the unchanged client: allowed property names could carry arbitrary private strings; custom Error.name and unknown event names could carry content; page views transmitted arbitrary record paths; a throwing analytics client interrupted the calling business action; and an account switch flushed queued events under the next raw user identity. Existing tests asserted the literal stale release `36` and did not exercise these behaviors.

## Implemented boundary

- Operational event names and string values are finite allowlists. Numeric counts are finite bounded integers; file categories are only PDF/image. Unknown fields and nested objects are dropped. Queued events are sanitized snapshots, capped at 100, not references to editable input.
- The final SDK `before_send` rebuilds approved events from known properties. No arbitrary paths, query strings, referrers, stacks, exception lists, person mutations, or nested SDK enrichment pass through. Required public ingestion token is supplied from configuration, not trusted from a captured property. Anonymous SDK UUIDs are retained for event/session grouping; raw portal user IDs are never identified to PostHog. This is pseudonymous telemetry, not a claim that all provider-held data is anonymous.
- Memory-only persistence and person profiles disabled. Replay, console capture, network headers/bodies, performance collection, autocapture, rage clicks, surveys and flags are explicitly disabled in the application. Existing useful manually captured operational milestones and bounded error kinds remain. No remote PostHog settings were changed; historical data is neither rewritten nor deleted.
- Session-required events, sign-out links and component teardown clear pending identity/events. Changing the current portal account clears the previous queue. The current user ID is retained only in memory for comparison. Unit tests exercise queue/account-reset behavior; sign-out/listener wiring has source assertions, not a real browser logout test.
- Synchronous and asynchronous SDK failures are contained and never recursively logged. An analytics outage cannot turn an otherwise successful save into a client error.
- Build configuration embeds a deterministic `source-…` fingerprint of application/build/config/migration/public inputs. It changes with compiled inputs, not documentation-only commits or environment secrets. The verified bundle contains `source-1fc8b2397cf60b87f3842193`; it does not pretend this is a Sites version number. Unbundled development uses the explicit `development-unverified` label.

## Verification

- New focused regressions: **10/10 passed**, including the five reproduced failures, final payload reconstruction, SDK settings, queue bounds/snapshot/reset, build fingerprint and lifecycle wiring.
- Existing instrumentation assertions now validate the stronger policy and reject stale release 36 instead of requiring it. No safeguard was removed merely to pass testing.
- Full suite: **221/221 passed**, zero failures/skips, 34.65 seconds. Production build, TypeScript and diff checks passed. Compiled client asset was independently searched for the computed fingerprint.
- Tests used only synthetic local fixtures and mocked analytics callbacks. No production event was sent and no live ingestion, IP handling, provider retention, source-map upload or browser replay acceptance is claimed. Existing source/identity isolation, intake, upload, completion, document and finance regressions remain passing.
- The previously diagnosed missing Sites preview sign-in flow is unchanged. Per the saved diagnosis, did not repeat the same blocked browser launch. Authenticated desktop/mobile and physical-device acceptance remain unrun; no privileged header injection or production tests.

## Documentation and remaining work

Publication confirmed: version 86, source `6cd6a37fb91ddecc8ce2dc227917778892dfd4b9`, deployment `appgdep_6aa37d66d0108191850b05a3ef12fecf`, succeeded `2026-09-11T04:03:11.056439+00:00`; same audience and environment revision 6. No UI control was added; this repair operates behind existing workflows.

Current PostHog documentation and installed SDK declarations were checked before configuring the existing client: [JavaScript configuration](https://posthog.com/docs/libraries/js/config), [PostHogConfig](https://posthog.com/docs/references/posthog-js/types/PostHogConfig), [privacy controls](https://posthog.com/docs/product-analytics/privacy). No dependency or credential changed.

Next: **P0-03b**, bounded backend failure events with safe references and explicit time/volume limits, plus supported private source-map delivery assessment. Inspect existing server logging separately; this release does not certify all backend logs as content-free. Do not expand raw exception/replay/network capture or provision source-map upload credentials without the necessary approval. Real ingestion verification waits for authorized isolated acceptance or permitted read-only evidence of naturally occurring safe events.

Rollback: no schema migration or business-data change. Prefer a forward fix to preserve minimization. If necessary, revert the specific source increment while preserving later work, then rebuild/test/publish to the same audience; do not restore old telemetry by changing remote privacy settings or resetting production data.
