# Server observability privacy evidence

## Scope

This increment implements P0-03b on top of the version-87 source baseline `948065e`. It adds privacy-bounded server failure references and reporting without changing authentication, business records, pricing, compensation, documents, provider credentials or the existing PostHog project configuration.

The source review found raw exception objects written to server logs in generic API handling, payroll, attachments, documents, completion approval, finance, route estimates and public website intake. Generic unexpected failures also gave staff no stable reference to include in a problem report.

## Implemented boundary

- Unexpected API failures receive a random UUID reference in the JSON response and `X-TechCommand-Error-Reference` header. The portal displays only a validated UUID.
- Server logs contain only a finite operation area, finite error kind, release fingerprint and reference. Exception messages, stack traces, request bodies, query strings, record identifiers, identity headers, document contents and arbitrary error values are excluded.
- PostHog receives only the public project token, event name `server_request_failed`, anonymous release-scoped identity, finite area/method, HTTP status, release fingerprint and the same random reference.
- Capture applies only to `/api/` responses with 5xx status, accepts only the configured US or EU PostHog capture host, times out after 1.5 seconds and never retries.
- The per-isolate budget is 20 failure events per 60 seconds. Reporting runs through the Worker execution context and cannot delay or replace the original response.
- Provider rejection, timeout or malformed configuration is ignored by the business workflow. Existing client capture restrictions remain unchanged.
- Integration Center now describes the monitoring connection accurately as privacy-limited workflow usage, client/server failures and build identification. It does not claim replay or AI-performance capture.

## Verification

- 9/9 server-observability regression tests passed.
- 13/13 combined server/client observability tests passed.
- 242/242 complete project tests passed with zero failures or skips.
- Project-wide TypeScript, production build and diff checks passed.
- The recursive source check confirms that the privacy-safe logger is the only remaining `console.error` call in application, library and Worker source.
- The production output contains zero `.map` files.

Tests cover thrown API handlers, ordinary 5xx responses, safe client-visible references, finite payloads, query/body/header exclusion, invalid host/status/reference rejection, provider failure isolation, timeout-compatible background capture and the per-isolate event budget. Forced database failures in the full suite emit only the bounded structured log record.

## Limits and source maps

No real PostHog event was sent and receipt has not been verified. The per-isolate cap limits a single Worker isolate; it is not a global account quota. Naturally occurring failures can be correlated through the random reference, but this increment does not expose private diagnostic content.

PostHog documents direct server capture for Cloudflare Workers and its capture API:

- https://posthog.com/docs/libraries/cloudflare-workers
- https://posthog.com/docs/api/capture

PostHog's private source-map upload uses its CLI and requires generated maps, a PostHog project ID and a private CLI personal API key:

- https://posthog.com/docs/error-tracking/upload-source-maps/github-actions

TechCommand does not currently generate production source maps. None were added to the published archive. A public project token cannot authorize private source-map upload. Enabling private maps therefore remains blocked until an approved secure CI upload path and the required private PostHog credential/project ID are provided; no credential was created, rotated or requested in this run.

Authenticated browser/mobile acceptance remains separately blocked by the documented Sites preview sign-in limitation. It was not replayed here. No production transaction, message, payment, provider call or business-record mutation was used for verification.

## Rollback

Revert the P0-03b source commit and redeploy the prior approved version. There is no schema migration or dependency change. P0-03a client privacy controls remain independently usable.
