# Independent TechCommand login

## September 16, 2026 implementation

The owner requires individual technician credentials at https://app.techcommandhq.com without ChatGPT accounts or workspace seats. Supabase is connected; the earlier prerequisite is resolved. Existing company project gbtuufdxhazmvanstptf hosts managed passwords. No new project, subscription, email, invitation, domain change or business-data migration was created.

Technician: open the domain → email and temporary password → choose a personal password → existing assignments. Subsequent sign-ins open the portal. Administrator: Users & access → TechCommand logins → find the existing team member → Create login / Reset password. The owner-configured standard temporary password appears after successful creation/reset for private delivery; no email is sent. Disable login revokes direct password access. Existing authorized administrator sign-in remains in the collapsed Administrator recovery section.

Jim's exact email jmadigan45@yahoo.com and existing technician ID 03178620-122f-4482-97d7-8a626b3e4a5f were verified from the live creation audit and prior capability update. Owner-requested managed creation returned success; an independent count-only read confirmed one confirmed provider account. The temporary password is not stored in Git or this document. A personal password is required before business access. No login as Jim occurred; his real browser/phone acceptance remains unrun. September 16 follow-up: the verified existing Armstead Tucker, Joel Johnston and Kyle Ingram profiles now also have confirmed managed accounts. Jim and Armstead were reset to the newly specified company temporary password; Joel and Kyle were created with it. Each requires a personal password before business access. Count-only verification confirms exactly one confirmed account for each of the four known technicians. No real user login was performed.

## Identity and sessions

- Supabase verifies passwords. Each application request verifies the provider user and derives permissions from active local company memberships, never client metadata.
- Normal creation binds the existing local user ID. Initial owner-directed enrollment may bind an observed technician ID plus exact confirmed email. The Site requires both, one unambiguous active local user, technician role and active same-company technician. It cannot enroll administrators or create local users/technicians. An administrator reset subsequently binds the resolved local user ID.
- Access/refresh tokens are encrypted into Secure, HttpOnly, SameSite=Lax host-only cookies, inaccessible to browser JavaScript/localStorage. Sessions last seven days. The selected login method persists after expiry to prevent fallback into a lingering owner SSO session.
- A credential epoch invalidates old sessions and refresh after reset, personal password change or disabling login. Local membership deactivation is independent. Temporary credentials can reach only password setup/logout.
- Mutations require same origin. Reads may retry after refresh; writes never replay automatically. User-bound drafts, caches and offline restrictions remain intact.
- The login page does not mount business identity polling, offline synchronization or session recovery. Preview reproduced the old dialog covering login; moving these features into the authenticated shell fixed it. Existing forms retain recovery on session expiry.

## Provider/runtime configuration

Sites runtime revision8 added TC_AUTH_URL, TC_AUTH_PUBLIC_KEY, TC_AUTH_APP_ID, TC_AUTH_SESSION_KEY and TC_AUTH_ADMIN_KEY; the last two are secret. The follow-up adds secret TC_AUTH_TEMP_PASSWORD in revision9, applying the owner's standard to future creates/resets without exposing it in source or browser configuration. Existing provider configuration remains unchanged. Never export these values into source or logs.

The techcommand-access Edge Function (v2 after the follow-up) verifies an expiring ECDSA signature and exact app before every administrative operation. Its gateway JWT check is intentionally off because the body implements custom server authentication. The signing private key stays in Site secrets; only the public key is in source. Provider admin credentials remain in the Edge Function's built-in environment. Unsigned/browser-JWT-only, wrong-app, expired and replayed requests fail. Live signed health and list calls succeeded.

Generated migration 20260916203159_techcommand_auth_replay_protection adds a nonce table of random IDs, operation names and expiry times, never passwords. RLS and revoked public/anon/authenticated grants deny direct clients; only service_role reads/inserts. The advisor INFO notice for RLS without policies is intentional default-deny. Expiry cleanup may be added later without shortening replay protection.

The Site records credential-change intent before the external write. A final audit failure after provider success preserves the confirmed credential and displays a warning. Uncertain replies instruct refresh of login status before retry. Existing provider email collisions never silently merge.

## Verification and acceptance

The isolated actual-handler/SQLite and simulated-provider tests cover first sign-in, required password change, existing identity/capabilities, invalid credentials, malformed replies, inactive/foreign membership, role spoofing, cross-origin rejection, admin role limits, duplicates, audit failure, signed replay, encrypted cookies, revocation and safe refresh. These are not hosted signed-in E2E.

Supervised preview confirmed the branded login form, username autocomplete and absence of the recovery dialog after reload. No production credentials were copied into preview. Physical-phone and authenticated technician browser tests remain unrun. No identity-header injection, cookie copying or production test transaction occurred. Transient provisioning timeouts were followed by existence checks before retry; exactly one Jim account was created.

Published as v121 from 1834090962edc2c05509abcd898f9fbce7cbc833, with 436 tests, TypeScript, lint and build passing. Native deployment/runtime/audience checks passed. Canonical-domain automated HTTP verification was blocked before the application by Cloudflare 1010 browser-signature protection; testing stopped without bypass. This is not evidence of a failure in a normal user browser. Actual technician sign-in remains unrun.

User acceptance:
1. Jim (or another provisioned technician) opens https://app.techcommandhq.com, enters his stated email and owner-specified temporary password, then chooses a personal password. Pass: existing assignments and Biomedical/DME capabilities, without ChatGPT or financial permissions.
2. An administrator uses Users & access → TechCommand logins for another existing technician. Pass: the configured temporary password, then access only to that person's existing authorized work.
3. Verify reload, sign-out and reset in real sessions. Pass: old credentials/session cannot reopen work; drafts stay with the original identity.

The implementation agent owns any failed-step diagnosis against its exact error/time and current status. Do not recreate profiles or request source documents again. Exact publication details are in RELIABILITY-LEDGER.md.

Official references checked September16: https://supabase.com/docs/reference/javascript/auth-admin-createuser ; https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid ; https://supabase.com/docs/guides/functions/auth-headers ; https://learn.chatgpt.com/docs/sites .


## September 16 follow-up — facility login administration and standard initial password

Existing technician emails remain usernames; no placeholder mailbox, technician profile, permission or assignment is created. The requested standard temporary password is in a secret runtime entry, not this repository. New/reset credentials always require a personal password before portal access; existing personal passwords are not reset when facility permissions change. The first-use policy is unchanged.

**Partner Portal → Add facility access → name/email, client account, permitted location → Save facility access & create login.** The profile/permission save remains atomic in D1. Password provisioning is a separate confirmed operation: a provider outage is displayed as saved permissions with login setup pending, and the existing directory offers Create login to resume. Retrying profile setup preserves one local profile and does not reset a working personal password. The screen displays confirmed login state and Copy login details; no email or invitation is sent. Removed the obsolete ChatGPT Site-viewer prerequisite.

Operations administrators can now create/reset technician and client logins, while any protected secondary membership still prevents a credential change. Facility setup rejects duplicate-case emails, internal-team identities and other-company identities rather than replacing their permissions. The account-access replacement is limited to the company. Facility password login uses the same existing account/location checks and suspension enforcement; it does not grant contract, payroll, company-wide or other-facility access.

The signed management function permits an owner-directed initial-enrollment reset only when the existing email and exact technician binding match. It cannot replace a different profile binding. This allowed the requested Jim/Armstead temporary-password update without guessing their local user IDs, impersonation, or altering profile records.

New synthetic actual-handler regressions verify the configured default cannot be overridden from a browser, missing configuration cannot alter credentials, exact enrollment reset/revocation, operations-created facility login through mandatory password change and one-location access, suspension, protected secondary-role denial, duplicate-email/internal/foreign identity protection and cross-origin denial. The prior synthetic helper now supplies an explicit same-origin header because the facility mutation endpoint validates it. Actual technician/facility browser and phone sign-in remain unrun; do not retry the known automation-client Cloudflare block or claim it represents a normal browser failure.

Follow-up publication: v122 from 7d9a19463b1fe6547f55b6c87efa291821328d7d succeeded September 16 at 21:11:32 UTC, runtime revision9 / unchanged audience revision16. All 441 automated tests, TypeScript, lint and build passed. Canonical app.techcommandhq.com was confirmed by native Sites metadata; real user browser acceptance remains unrun.

## October 2, 2026 mobile reliability

Use `/login` directly in Safari or Chrome. Native form POST preserves actual password-manager/autofill input and removes the client bootstrap dependency from login and first-password setup. POST redirects with a non-credential session digest; the subsequent server page verifies the provider user, local membership and exact persisted cookie before proceeding. An old, missing, replaced, foreign or inactive identity cannot satisfy the confirmation. Hidden email is only an autofill hint during password setup; the verified session remains authoritative. Native password confirmation is checked on the server, duplicate fields and cross-origin requests are rejected, and unsupported native actions are denied. No automatic credential mutation retry is added. All credentials remain outside URLs and browser storage.

The login and recovery buttons are native forms; password visibility remains an optional hydrated enhancement. Existing JSON refresh/logout endpoints and identity-bound device cleanup remain unchanged. Never infer that actual technician acceptance passed from synthetic handler or layout tests.
