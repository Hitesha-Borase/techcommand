import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";

type RuntimeEnv = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GOOGLE_WORKSPACE_SENDER_EMAIL?: string;
  GOOGLE_REVIEW_URL?: string;
};

type EmailPayload = {
  feedbackRequestId: string;
  to: string;
  subject: string;
  body: string;
};

let cachedToken: { value: string; expiresAt: number; sender: string } | null =
  null;

function runtime() {
  return env as unknown as RuntimeEnv;
}

function base64Url(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function privateKeyBytes(pem: string) {
  const clean = pem
    .replaceAll("\\n", "\n")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function googleWorkspaceEmailStatus() {
  const current = runtime();
  const missing = [
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", current.GOOGLE_SERVICE_ACCOUNT_EMAIL],
    [
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
      current.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    ],
    ["GOOGLE_WORKSPACE_SENDER_EMAIL", current.GOOGLE_WORKSPACE_SENDER_EMAIL],
    ["GOOGLE_REVIEW_URL", current.GOOGLE_REVIEW_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  return { configured: missing.length === 0, missing };
}

export function configuredReviewUrl() {
  return runtime().GOOGLE_REVIEW_URL?.trim() || null;
}

async function accessToken() {
  const current = runtime();
  const sender = current.GOOGLE_WORKSPACE_SENDER_EMAIL || "";
  if (
    cachedToken &&
    cachedToken.sender === sender &&
    cachedToken.expiresAt > Date.now() + 60_000
  )
    return cachedToken.value;
  if (
    !current.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !current.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    !sender
  )
    throw new Error("Google Workspace email credentials are not configured.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: current.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      sub: sender,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(current.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(
      data.error_description || "Google Workspace authorization failed.",
    );
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    sender,
  };
  return data.access_token;
}

async function sendEmail(payload: EmailPayload) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to))
    throw new Error("Customer email address is invalid.");
  const sender = runtime().GOOGLE_WORKSPACE_SENDER_EMAIL!;
  const subject = payload.subject.replace(/[\r\n]+/g, " ");
  const message = [
    `From: TechFlex Mobility Solutions <${sender}>`,
    `To: ${payload.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    payload.body,
  ].join("\r\n");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(message) }),
    },
  );
  const data = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id)
    throw new Error(
      data.error?.message || "Gmail rejected the review request.",
    );
  return data.id;
}

export async function processGoogleWorkspaceEmailOutbox(limit = 10) {
  const status = googleWorkspaceEmailStatus();
  if (!status.configured) return { ...status, processed: 0, failed: 0 };
  const current = runtime();
  const events = await current.DB.prepare(
    `SELECT id, payload_json AS payloadJson, attempt_count AS attemptCount
       FROM integration_events
      WHERE organization_id = ? AND integration_key = 'google_workspace_email'
        AND status IN ('pending','retry')
        AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY created_at LIMIT ?`,
  )
    .bind(TECHFLEX_ORG_ID, Math.min(Math.max(limit, 1), 25))
    .all<{ id: string; payloadJson: string; attemptCount: number }>();
  let processed = 0;
  let failed = 0;
  for (const event of events.results) {
    try {
      await current.DB.prepare(
        "UPDATE integration_events SET status = 'processing' WHERE id = ?",
      )
        .bind(event.id)
        .run();
      const payload = JSON.parse(event.payloadJson) as EmailPayload;
      const externalId = await sendEmail(payload);
      await current.DB.batch([
        current.DB.prepare(
          "UPDATE integration_events SET status = 'processed', processed_at = CURRENT_TIMESTAMP, error_message = NULL, next_attempt_at = NULL WHERE id = ?",
        ).bind(event.id),
        current.DB.prepare(
          `UPDATE customer_feedback_requests SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
             external_id = ?, record_version = record_version + 1,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(externalId, payload.feedbackRequestId),
      ]);
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "Email failed.";
      const minutes = Math.min(60, 2 ** Math.min(event.attemptCount + 1, 5));
      await current.DB.prepare(
        `UPDATE integration_events SET status = 'retry', error_message = ?,
           next_attempt_at = datetime('now', ?), attempt_count = attempt_count + 1 WHERE id = ?`,
      )
        .bind(message, `+${minutes} minutes`, event.id)
        .run();
      failed += 1;
    }
  }
  await current.DB.prepare(
    `INSERT INTO integration_connections
      (id, organization_id, integration_key, provider, display_name, status,
       connection_mode, last_sync_at, last_success_at, last_error)
     VALUES (?, ?, 'google_workspace_email', 'google', 'Post-service review email', ?,
       'workspace_delegation', CURRENT_TIMESTAMP,
       CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
     ON CONFLICT(organization_id, integration_key) DO UPDATE SET
       status = excluded.status, last_sync_at = CURRENT_TIMESTAMP,
       last_success_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE integration_connections.last_success_at END,
       last_error = excluded.last_error, record_version = record_version + 1,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      failed ? "error" : "connected",
      failed,
      failed
        ? `${failed} review email${failed === 1 ? "" : "s"} failed.`
        : null,
      failed,
    )
    .run();
  return { configured: true, missing: [], processed, failed };
}
