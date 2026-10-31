# TechCommand OS production, domain, email, and desktop runbook

Status date: September 6, 2026

## Recommended domain

Recommended purchase: **techcommandhq.com**

Recommended layout:

- `techcommandhq.com` — public product and credibility site
- `app.techcommandhq.com` — authenticated TechCommand application
- `partners.techcommandhq.com` — optional partner-facing alias or future isolated partner application
- `api.techcommandhq.com` — future machine-to-machine integration gateway
- `status.techcommandhq.com` — future independent availability page

The `.com` registry lookup returned “not found” for `techcommandhq.com`, `gettechcommand.com`, `techcommandcloud.com`, and `techcommandplatform.com` on the status date. Availability is not reserved until checkout succeeds. `techcommandos.com` is registered and should not be used; it also reads as “Tech Commandos.”

Buy the domain only after a trademark attorney clears the **TechCommand** product name. Search results show adjacent “Command OS,” “Technology Command,” and “Command Technology” usage, so domain availability alone is not trademark clearance.

## Hosting recommendation

### Controlled pilot with no PHI

Keep the current ChatGPT Site and attach `app.techcommandhq.com`. This is the lowest-risk short-term path because it preserves the existing deployment, D1 data, R2 attachments, authenticated user identities, and current restricted audience.

ChatGPT Sites currently supports custom apex domains and subdomains where the feature is available. It provides the required DNS and validation records after a hostname is added. Sites currently allows 10 GB of D1 storage and reports no fixed aggregate R2 storage limit. Official documentation also says Sites must not process Protected Health Information or payment-card data and does not provide data-residency controls at launch: <https://learn.chatgpt.com/docs/sites?surface=app>

Therefore the current Site is suitable only for a controlled non-PHI pilot. Do not enter diagnoses, insurance identifiers, clinical notes, payment-card numbers, or other PHI/card data.

### Commercial or PHI-capable production

Before any workflow may contain PHI, migrate the application to a general-purpose cloud account covered by the necessary contracts and controls. Recommended target: Google Cloud Run, Cloud SQL for PostgreSQL, Cloud Storage, Identity Platform or an enterprise IdP, Cloud KMS, Secret Manager, Cloud Armor, centralized audit logging, and scheduled backups. Execute a Google Cloud BAA and use only covered services. Google describes HIPAA as shared responsibility and publishes its covered-product list here: <https://cloud.google.com/security/compliance/hipaa>

Cloudflare Workers/R2 remain an excellent non-PHI or separately contracted deployment option because the current code is already Worker-native. Contract and product eligibility must be confirmed before regulated data is stored.

## Exact custom-domain connection procedure

1. Purchase `techcommandhq.com` through Cloudflare Registrar or another reputable registrar. Cloudflare Registrar sells and renews at registry cost, includes WHOIS redaction where supported, and offers DNSSEC: <https://developers.cloudflare.com/registrar/>
2. Do not replace the existing `techflexmobility.com` MX records. The application domain and company email domain can coexist independently.
3. In ChatGPT, open **Sites**, find **TechCommand OS**, select **More actions → Settings → Add domain**.
4. Enter `app.techcommandhq.com`.
5. Copy every record Sites returns. For a subdomain, expect a CNAME target plus one or more validation records. Enter the names and values exactly in the registrar’s DNS console.
6. Do not invent or reuse a Cloudflare proxy target. If the registrar offers a proxy toggle, begin with DNS-only unless the Sites instructions explicitly say otherwise.
7. Return to the Site settings and refresh domain status after DNS propagates. Sites documents the same process here: <https://learn.chatgpt.com/docs/sites?surface=app#connect-a-custom-domain>
8. Confirm the custom hostname reports both routing and SSL as active.
9. Test with the owner, one administrator, one technician, and one external partner identity. Verify that cross-account URLs return 403/404 and that the original `chatgpt.site` address still redirects or remains available as expected.
10. Only then publish the new hostname in email signatures, partner onboarding, QR codes, and documents.

The domain has not been attached yet because TechFlex does not own it yet. Once it is purchased, the owner can provide the hostname and TechCommand can request the exact DNS records from Sites.

## Email and user routing

Connecting `app.techcommandhq.com` does not route email and does not change `@techflexmobility.com` mail. Web DNS records and MX records are separate.

For branded `@techcommandhq.com` aliases:

1. In Google Admin, go to **Account → Domains → Manage domains → Add a domain**.
2. Choose a **user alias domain** if Brandon, James, and Kristin should receive the same mailbox at both domains without buying additional seats. Choose a **secondary domain** only for separate users/mailboxes.
3. Add Google’s ownership-verification TXT record to DNS.
4. Activate Gmail for the domain and add the MX records Google currently displays in Admin.
5. Configure SPF, DKIM, and DMARC. If Google Workspace is the only sender, Google’s current SPF example is `v=spf1 include:_spf.google.com ~all`: <https://support.google.com/a/answer/12082590>
6. Add every automated sender—such as a future transactional-email vendor—to the single SPF policy; never create two SPF TXT records.
7. Begin DMARC with reporting (`p=none`), review reports, then progress to quarantine/reject.

Google explains alias versus secondary domains here: <https://support.google.com/a/answer/7502379>

Application user access is separate from email delivery. Today, every human requires both:

- authorization in the Site audience, and
- a TechCommand role/account/location record.

The portal must remain restricted. “Anybody’s email can be added” means any specifically invited business email can be provisioned; it must never mean anonymous self-registration. For commercial SaaS, replace the Site-level external-viewer step with an enterprise identity layer supporting invitation expiry, MFA, SAML/OIDC SSO, SCIM provisioning, and tenant-aware authorization.

## Offline and installable application

The current web build includes a PWA manifest, service worker, device-local report recovery, automatic background draft saves, reconnection replay, and queued evidence uploads. On Chrome or Edge, open the application and choose **Install TechCommand OS** from the browser menu. This creates an app window on Windows, macOS, ChromeOS, and supported Linux distributions.

Important boundaries:

- A report already opened while online continues to save if connectivity drops.
- Final submission requires internet so server validation, evidence checks, and QA state cannot be bypassed.
- Device-local drafts are only as safe as the device account, disk encryption, screen lock, and browser profile. Managed devices should require BitLocker/FileVault, automatic lock, remote wipe, and current browser versions.
- A cold launch with no connection shows a safe offline page rather than cached client or employee data.

For signed native installers later, wrap the same front end in Tauri 2 and use a local encrypted SQLite database. Build signed `.msi`/`.exe`, `.dmg`, and Linux packages through CI. The native client should use the same idempotent sync protocol, device registration, conflict resolution, remote session revocation, and automatic updates. Do not create a second business-logic implementation.

## Upload behavior

Small uploads use the direct endpoint. Larger supported PDFs/photos use R2 multipart upload in 8 MiB chunks and can be retried without loading an entire large file into Worker memory. Cloudflare requires multipart parts to be at least 5 MiB except the final part: <https://developers.cloudflare.com/r2/objects/upload-objects/#multipart-upload>

The application default maximum is 10 GB per object and can be lowered with `MAX_UPLOAD_BYTES`. No responsible platform should advertise “unlimited file size.” Limits protect mobile data plans, storage cost, malware scanning, browser stability, and supportability. Add lifecycle cleanup for abandoned multipart uploads before broad production use.

## Partner integrations

TechCommand now supports revocable, account-scoped API keys for direct work-order intake. Every request requires:

- `Authorization: Bearer <credential>`
- a unique `Idempotency-Key`
- an allowed account location
- the `work_orders:create` scope

Credentials are displayed once; only a SHA-256 hash is stored. Cross-account customers, assets, and locations are rejected. Requests are rate-limited and written to both the intake queue and integration audit trail.

The private Site audience may block server-to-server calls before the application receives them. Do not make the whole portal public to solve this. At go-live, use either a supported machine-auth route on the custom hostname or deploy `api.techcommandhq.com` as a separate hardened gateway with WAF, rate limits, key rotation, optional mTLS, webhook signing, replay protection, and the same account boundary.

Next connector priorities are outbound signed webhooks, QuickBooks OAuth/reconciliation, Google Sheets/Drive export, SFTP batch intake for larger partners, and a versioned OpenAPI specification. Each connector must use the durable outbox already present so third-party downtime cannot lose an event.

## Go-live blockers and acceptance gates

Do not declare production-ready until all are true:

- no PHI/card data on ChatGPT Sites; regulated hosting and contracts completed if needed
- external penetration test and dependency/security scan complete
- MFA enforced for owners/admins; least-privilege roles reviewed
- backup restore tested, not merely configured
- offline interruption tests pass on real Android/iPhone/Windows devices
- multipart upload retry, abort, malware scanning, and lifecycle cleanup verified
- partner API gateway can authenticate machine clients without opening the human portal
- privacy policy, terms, data-retention schedule, incident-response plan, and vendor agreements approved
- Google/QuickBooks credentials stored only as hosted secrets and rotated
- one real work order completes intake → pricing → dispatch → offline field work → sync → QA → invoice → payment → pay confirmation
- custom-domain SSL, DNSSEC, SPF, DKIM, and DMARC verified

No engineering process can guarantee zero defects. The enterprise standard is documented controls, automated regression tests, observability, backups, recovery drills, incident response, and explicit release gates.
