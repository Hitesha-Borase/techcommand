import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";

type RuntimeEnv = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;
};

export type SheetRowPayload = {
  sheetName: string;
  headers: string[];
  values: Array<string | number | boolean | null>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function runtime() {
  return env as unknown as RuntimeEnv;
}

export function googleSheetsStatus() {
  const current = runtime();
  const missing = [
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", current.GOOGLE_SERVICE_ACCOUNT_EMAIL],
    [
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
      current.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    ],
    ["GOOGLE_SHEETS_SPREADSHEET_ID", current.GOOGLE_SHEETS_SPREADSHEET_ID],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  return { configured: missing.length === 0, missing };
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
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.value;
  const current = runtime();
  if (
    !current.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !current.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  )
    throw new Error("Google Sheets credentials are not configured.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: current.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
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
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(data.error_description || "Google authorization failed.");
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function google<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      data.error?.message || "Google Sheets rejected the update.",
    );
  return data;
}

function columnName(count: number) {
  let value = count;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function ensureSheet(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
) {
  const metadata = await google<{
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
  );
  const exists = metadata.sheets?.some(
    (sheet) => sheet.properties?.title === sheetName,
  );
  if (!exists)
    await google(
      `spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        }),
      },
    );
  const range = encodeURIComponent(
    `'${sheetName.replaceAll("'", "''")}'!A1:${columnName(headers.length)}1`,
  );
  await google(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [headers] }),
    },
  );
}

async function upsertRow(payload: SheetRowPayload) {
  const spreadsheetId = runtime().GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId)
    throw new Error("Google Sheets spreadsheet ID is not configured.");
  if (
    !payload.headers.length ||
    payload.headers.length !== payload.values.length
  )
    throw new Error(
      "The spreadsheet row does not match its configured columns.",
    );
  await ensureSheet(spreadsheetId, payload.sheetName, payload.headers);
  const escaped = payload.sheetName.replaceAll("'", "''");
  const keyRange = encodeURIComponent(`'${escaped}'!A:A`);
  const existing = await google<{ values?: Array<[string]> }>(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${keyRange}`,
  );
  const syncKey = String(payload.values[0] ?? "");
  const rowIndex = existing.values?.findIndex(
    (row, index) => index > 0 && String(row[0] ?? "") === syncKey,
  );
  const lastColumn = columnName(payload.headers.length);
  if (rowIndex !== undefined && rowIndex >= 1) {
    const rowNumber = rowIndex + 1;
    const range = encodeURIComponent(
      `'${escaped}'!A${rowNumber}:${lastColumn}${rowNumber}`,
    );
    await google(
      `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [payload.values] }) },
    );
    return;
  }
  const range = encodeURIComponent(`'${escaped}'!A:${lastColumn}`);
  await google(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [payload.values] }) },
  );
}

export async function processGoogleSheetOutbox(limit = 20) {
  const status = googleSheetsStatus();
  if (!status.configured) return { ...status, processed: 0, failed: 0 };
  const current = runtime();
  const events = await current.DB.prepare(
    `SELECT id, payload_json AS payloadJson, attempt_count AS attemptCount
       FROM integration_events
      WHERE organization_id = ? AND integration_key = 'google_sheets'
        AND status IN ('pending','retry')
        AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY created_at LIMIT ?`,
  )
    .bind(TECHFLEX_ORG_ID, Math.min(Math.max(limit, 1), 50))
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
      await upsertRow(JSON.parse(event.payloadJson) as SheetRowPayload);
      await current.DB.prepare(
        "UPDATE integration_events SET status = 'processed', processed_at = CURRENT_TIMESTAMP, error_message = NULL, next_attempt_at = NULL WHERE id = ?",
      )
        .bind(event.id)
        .run();
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "Sync failed.";
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
      (id, organization_id, integration_key, provider, display_name, status, connection_mode, last_sync_at, last_success_at, last_error)
     VALUES (?, ?, 'google_sheets', 'google', 'TechFlex completion ledger', ?, 'service_account', CURRENT_TIMESTAMP,
       CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
     ON CONFLICT(organization_id, integration_key) DO UPDATE SET
       status = excluded.status, last_sync_at = CURRENT_TIMESTAMP,
       last_success_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE integration_connections.last_success_at END,
       last_error = excluded.last_error, record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      crypto.randomUUID(),
      TECHFLEX_ORG_ID,
      failed ? "error" : "connected",
      failed,
      failed ? `${failed} row update${failed === 1 ? "" : "s"} failed.` : null,
      failed,
    )
    .run();
  return { configured: true, missing: [], processed, failed };
}
