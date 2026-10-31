# Assigned administrator setup — P0-07

## Request and verified baseline

The owner reported that administrative upload/setup prompts appeared for everyone on login even though the assistant had already loaded business records. Only the existing assistant should receive this administrative checklist; other users should enter their usual authorized workspace.

Native Sites inspection confirmed live version 88, source `a0ef6db001d184ec0cf7238ae4b80dc5318ecb84`, a succeeded deployment, runtime revision 7 and custom audience revision 12. Fetched and fast-forwarded the clean checkout to its outcome commit `7d3351dae78bee19cbfe6635998014feb0ce8aa5`. Recovery branch: `checkpoint/admin-onboarding-20260911`. Held the exclusive checkout lock. Version 88's server telemetry and version 87's route planning are preserved.

The request spelled the assistant's name “Kristen.” Read-only native access inspection and the approved administrator configuration identify the existing account as **kristin.dunn@techflexmobility.com**. The active operations membership is bound to the existing `user_kristin_dunn`. The implementation targets this existing person/account, as explained to the owner; it creates no alias, user, membership or additional access grant.

The old administrator component mounted for every administrative workspace; the API gave every non-technician administrator the same nine setup items, while completion was stored per user. Its auto-open effect ran whenever incomplete items loaded. The bounded live progress read returned one open assistant item and no completed attestations. This is **not an inventory of uploaded records** and does not establish that any business document or list is missing. No production record was changed by the inspection.

## Implemented behavior

- A company-specific assignment policy identifies the approved assistant and requires an existing administrator role. Assignment never grants a role or bypasses portal authentication.
- `/api/me` returns the server-derived administrative-setup flag. The main workspace mounts no checklist query, button or dialog for unassigned users. They retain their normal role-based navigation.
- `/api/onboarding` independently enforces the assignment: unassigned staff receive an empty setup response; attempts to write administrative progress receive 403. Technician requests retain their six existing field setup steps. Missing identities, partners and unrelated-company memberships remain denied.
- Administrative query data is keyed by user ID and accepted only when the response's user ID and administrative scope match. Component state resets on identity change. A technician-preview screen rejects administrative checklist data.
- Existing progress remains in place. Saving retries do not duplicate rows or replace an existing completion time. Reopened items expose no completion date. The legacy non-null database timestamp remains compatible; no table rebuild or migration is needed. A conflicting user/item row belonging to another company cannot be overwritten.
- The checklist explains that the assistant should first review already-loaded records and add only missing information. Its percentage is labeled “Setup steps reviewed,” not a claim about uploaded data. Uploads are not guessed to satisfy all contractual/document requirements.
- The administrative checklist uses the established session-recovery/JSON helper. Failed saves leave the confirmed state visible with an error and a refresh action. Failed checklist loading presents a small retry control without blocking the workspace. An incomplete assigned checklist can still be closed; the existing setup button reopens it. Completing all steps removes automatic opening on subsequent loads.

## Affected components

`lib/onboarding-policy.ts`; `/api/me`; `/api/onboarding`; `AdministratorOnboarding`; `TechFlexCommandCenter`; technician checklist scope guard; `tests/onboarding-assignment.test.mjs`.

No dependencies, schema migrations, environment values, Site audience, authentication rules, branding, rates, work orders, uploaded documents or provider integrations changed. No real messages, invoices or provider calls were made. This is a bounded repair, not an application-wide permission certification.

## Verification

The six initial actual-handler regressions produced five expected contract failures on the pre-fix implementation after aligning synthetic role fixtures with the established schema. In particular, the owner could write administrative progress with HTTP 200 before the fix. Unauthenticated/partner/company denial already passed.

- **11/11 new focused tests passed**, using actual route/auth handlers against isolated in-memory SQLite plus server component rendering and synthetic cached responses.
- **15/15 combined tests passed**, including the four existing technician/calendar foundation checks.
- **Project-wide TypeScript passed.**
- **Production build passed** using the supported Sites build helper.
- **253/253 complete project tests passed**, zero failures, skips or cancellations (`node --test --test-concurrency=1 tests/*.test.mjs`, 38.066 seconds). This includes all 242 existing checks plus 11 new checks.
- **`git diff --check` passed.**

Covered scenarios: assigned/excluded users; exact email/company/role matching; normal `/api/me` access for owner and other staff; direct write rejection; existing progress reload; retry without duplicates or timestamp rewrite; reopened state; no guessed completion from existing data; separate technician steps; wrong-company key collision; database-save failure; cache/account mismatch; hidden owner controls; and administrator data excluded from technician preview.

No authenticated live-browser/mobile acceptance is claimed. The previously established unsupported preview sign-in remains a separate platform limitation; it was not replayed or bypassed. Rendering tests do not simulate an iPhone sign-in.

## Manual acceptance and location

1. In a fresh or refreshed owner session, open the normal TechCommand workspace: no administrative launch dialog or setup button should appear, including after Refresh data and reopening the app.
2. In the existing assistant's own authorized session, use the bottom-right **setup** button. Confirm saved marks survive refresh; review already-uploaded records instead of duplicating them. Mark a confirmed item complete, reload, and verify it remains complete. Reopen that item only if a further review is actually needed.
3. For another administrator and a technician, verify the ordinary workspace and assigned-job access. Only the technician's separate field setup may appear.
4. On a suitable isolated authenticated test environment, interrupt a progress save and verify visible recovery without false completion. Never manufacture a production failure or fake operational record for this check.

## Release, rollback and next task

**Deployed as version 89**, source `b8109fef3db4de3049f7e5311d63937cb95149e7`. Saved version: `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8~appgver_63ce13a7ac488191b6a50af512b439e1`. Native deployment `appgdep_6aa3903bfee88191b7feaa14a8d4c59c` confirmed **succeeded** at 2026-09-11 05:23:22 UTC with runtime revision 7. Existing custom audience revision 12 was retained. Native production URL: https://techcommandhq.techflex-8918.chatgpt.site; existing custom domain: https://app.techcommandhq.com. The validated artifact contains 494 files, the existing 22 SQL migrations and no environment files or public source maps. No new migration was added. Manual authenticated acceptance above remains unrun.

Rollback: revert this bounded source change on top of the latest main and publish after checks. If urgent and no newer required features would be lost, redeploy the prior approved version 88 artifact. Neither path requires data deletion, progress reset, secret rotation or migration reversal. Keep all existing progress rows.

After this user-reported interruption is released, resume **P0-06**, starting with company isolation of document/file reads and exports. **P0-04** authenticated acceptance, **P0-03c** real telemetry/private source maps and **INT-01B** real Google route acceptance remain separate tracked blockers. The full master roadmap remains in `MASTER-PROJECT-INSTRUCTION.md`.
