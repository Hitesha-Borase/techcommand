/** Keep gateway/sign-in HTML out of API JSON parsers. Never replay a write. */
export class PortalResponseError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let passwordRefresh: Promise<boolean> | null = null;
const responseCleanup = new WeakMap<Response, () => void>();
async function boundedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const callerSignal = init.signal || (input instanceof Request ? input.signal : null);
  const abort = () => controller.abort();
  if (callerSignal?.aborted) abort();
  callerSignal?.addEventListener("abort", abort, { once: true });
  // Slow connections produce a recoverable message, not an endless empty shell.
  // Writes are never replayed and get longer to finish, especially file uploads.
  const timer = setTimeout(abort, ["GET", "HEAD"].includes(method) ? 20_000 : 90_000);
  timer.unref?.();
  const cleanup=()=>{clearTimeout(timer);callerSignal?.removeEventListener("abort",abort);};
  try {
    const response=await fetch(input, { ...init, signal: controller.signal });
    // Keep the deadline active while the body is arriving, not just its headers.
    // JSON consumers release it in finally; other consumers remain bounded.
    responseCleanup.set(response,cleanup);
    return response;
  } catch(error) {cleanup();throw error;}
}
async function refreshPasswordLogin() {
  if (!passwordRefresh) passwordRefresh = boundedFetch("/api/auth", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) })
    .then(r => r.ok).catch(() => false).finally(() => { passwordRefresh = null; });
  return passwordRefresh;
}

export async function portalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  let response: Response;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  try {
    response = await boundedFetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error(["GET", "HEAD"].includes(method) ? "The portal could not load this information. Check your connection and try again. Your saved records and local drafts have not been deleted." : "Connection interrupted. Keep this form open and check the record list before submitting again; the save could not be confirmed.");
  }
  if (response.status === 401 && response.headers.get("X-TechCommand-Refresh") === "password" && typeof window !== "undefined" && await refreshPasswordLogin()) {
    if (method === "GET" || method === "HEAD") {
      try { response = await boundedFetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" }); }
      catch { throw new Error("Your session is restored, but the information could not load. Check your connection and try again."); }
    }
    else throw new PortalResponseError(409, "Your session has been restored. Your entries remain here; press Save again to send them.");
  }
  const type = response.headers.get("content-type") || "";
  if (response.status === 413) {
    throw new PortalResponseError(413, "This file is too large for this upload. The maximum is 20 MB. Your file remains selected; choose a smaller or compressed copy and try again.");
  }
  if (response.status === 428 || response.status === 401 || ((response.status === 403 || response.redirected) && type.includes("text/html"))) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("techcommand:session-required"));
    throw new Error("Sign-in or site access is required. Keep this form open, sign in using the recovery link, then check access before submitting again.");
  }
  if (type.includes("text/html")) {
    throw new Error(`The portal received a webpage instead of a save confirmation (HTTP ${response.status}). Keep this form open and check the record list before retrying. If this continues, report the time and action to your administrator.`);
  }
  return response;
}

function responseError(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const error = (data as { error?: unknown }).error;
  if (typeof error !== "string" || !error.trim()) return null;
  const reference = (data as { reference?: unknown }).reference;
  return typeof reference === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reference)
    ? `${error} Error reference: ${reference}`
    : error;
}

/**
 * Parse a portal response without turning an empty/malformed reply into a crash or
 * a false success. Callers keep their form open and decide whether a retry is safe.
 */
export async function portalJson<T>(
  response: Response,
  fallback: string,
  allowedStatuses: readonly number[] = [],
): Promise<T> {
  if (response.status === 413)
    throw new PortalResponseError(413, "This file is too large for this upload. The maximum is 20 MB. Your file remains selected; choose a smaller or compressed copy and try again.");
  let data: unknown;
  try {
    const body = await response.text();
    data = body.trim() ? JSON.parse(body) : null;
  } catch {
    throw new Error(
      `${fallback} The portal returned an unreadable response. Keep this form open and check the record list before retrying.`,
    );
  } finally {responseCleanup.get(response)?.();responseCleanup.delete(response);}
  if (!response.ok && !allowedStatuses.includes(response.status))
    throw new PortalResponseError(response.status, responseError(data) || fallback, data);
  if (!data || typeof data !== "object")
    throw new Error(
      `${fallback} The portal did not return a save confirmation. Keep this form open and check the record list before retrying.`,
    );
  return data as T;
}
