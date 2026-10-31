# External consultant access — September 20, 2026

The owner approved an individual, restricted consultant login for initial product
review. This is not developer access, permission to modify production, or a
fictional full-application sandbox. The existing Consultant Review experience
shows workflow/architecture information and supports privacy-limited feedback.

Before this increment, the UI promised no production records, but legacy API
allowlists still included the `auditor` role. The central identity guard now
denies all operational endpoints for that role, even if an endpoint's own
allowlist includes it. Only the reviewer's own identity, disabled analytics
configuration, and submission of feedback are allowed. Password login, first
password replacement, refresh and logout retain the existing authentication
service and company membership checks.

External reviewers receive a unique server-generated temporary password with
192 random bits; the company staff temporary password is neither changed nor
disclosed. The existing first-sign-in password-change gate remains mandatory.
Secrets are returned only in the private/no-store provisioning response, not
stored in source, audit JSON, analytics, or this document.

Preparing an existing active reviewer is idempotent. Duplicate emails,
administrator identities, other-company profiles, operational/mixed roles and
suspended profiles are not silently repurposed or reactivated. Existing user
names and staff credentials remain intact. Suspension remains available in
Users & Access and is checked on subsequent requests.

Validation uses synthetic accounts and the actual password bridge/route
handlers. It covers first-password change, both password and SSO identity paths,
eight representative operational GET handlers, default-denied future routes,
mixed roles, duplicates, company boundaries, suspension, and secret-free audits.
No live identity is impersonated and no customer test transaction is authorized.

The work was isolated from the interrupted biomedical follow-up changes in the
original checkout. Those edits and migration 0038 are not included in this access
release. Existing audience, runtime configuration, documents and data must remain
unchanged. Release results and the account provisioning outcome follow after
verification; a prepared profile alone is not a working password login.

Two existing PDF tests assumed `.git` was a directory. Their synthetic output now
uses the ignored `.sites-runtime` directory so the regression suite also works in
an isolated Git worktree. This changes no invoice or report implementation.

## Verified release and provisioning outcome

- Production version 139, validated source
  `1835746eafca7d32383fe0cf096076af9694d57a`.
- Saved version
  `appgprj_6a9b93be6e1881918cbfe6c2dc9e54d8~appgver_d1180077b2bc8191bec17bc3ee6b6e59`.
- Deployment `appgdep_6aaf4f33970881918f881e5c49897119` succeeded at
  `2026-09-20T03:13:03.004297+00:00`.
- All 549 automated tests passed, with TypeScript, changed-source lint, whitespace
  checks and the production build. The focused authentication/compliance run
  passed 25 tests and the two PDF-handler suites passed 42 tests.
- Public audience revision 16 and runtime revision 9 with the same 11 entries
  were preserved. No migration, pricing, staff credential, customer document or
  operational record was modified by this release.
- The owner-approved external reviewer profile and individual login were then
  created through the authenticated owner interface. The live directory showed
  **Ready — change password on first sign-in** with no error. Only the requested
  new identity and its normal provisioning audit/provider records were created.
- The one-time setup panel retains the generated temporary password for private
  owner handoff. It is not copied into this source record or chat. No email
  invitation was sent and the reviewer was not impersonated for live sign-in.
- Initial access is the workflow/architecture walkthrough plus feedback. It does
  not provide operational sandbox, production records, source repository or
  deployment permissions. Any later hands-on testing/developer access must be
  scoped separately.

The biomedical follow-up edits in the original checkout remain unpublished and
must not be confused with this access release. This outcome-only update needs no
new application deployment.
