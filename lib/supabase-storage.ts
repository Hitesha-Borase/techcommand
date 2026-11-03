/**
 * Supabase Storage Adapter
 *
 * Full drop-in replacement for Cloudflare R2 (env.BUCKET).
 * All file uploads / downloads go to Supabase Storage bucket "techcommand-files".
 * Works 100% FREE without any credit or debit card required.
 */

import { env } from "cloudflare:workers";

const BUCKET_NAME = "techcommand-files";

function supabaseUrl(): string {
  return (
    (env as unknown as Record<string, string>).TC_AUTH_URL ||
    process.env.TC_AUTH_URL ||
    ""
  );
}

function serviceKey(): string {
  return (
    (env as unknown as Record<string, string>).TC_AUTH_ADMIN_KEY ||
    process.env.TC_AUTH_ADMIN_KEY ||
    ""
  );
}

function storageBase(): string {
  return `${supabaseUrl()}/storage/v1`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey()}`,
    apikey: serviceKey(),
  };
}

function encodeStorageKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Upload bytes or stream to Supabase Storage. */
export async function storagePut(
  storageKey: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream<any> | string,
  opts?: { contentType?: string; contentDisposition?: string },
): Promise<void> {
  const url = `${storageBase()}/object/${BUCKET_NAME}/${encodeStorageKey(storageKey)}`;
  
  let payload: BodyInit;
  if (ArrayBuffer.isView(body)) {
    payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  } else {
    payload = body as any;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": opts?.contentType || "application/octet-stream",
      ...(opts?.contentDisposition ? { "Content-Disposition": opts.contentDisposition } : {}),
      "x-upsert": "true",
    },
    body: payload,
    // @ts-ignore
    duplex: "half",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Supabase Storage upload failed [${res.status}]: ${text}`);
  }
}

/** Download bytes from Supabase Storage. Returns ArrayBuffer or null. */
export async function storageGet(
  storageKey: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const url = `${storageBase()}/object/${BUCKET_NAME}/${encodeStorageKey(storageKey)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404 || !res.ok) return null;
  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { bytes, contentType };
}

/** Delete a file or files from Supabase Storage. */
export async function storageDelete(storageKey: string | string[]): Promise<void> {
  const url = `${storageBase()}/object/${BUCKET_NAME}`;
  const prefixes = Array.isArray(storageKey) ? storageKey : [storageKey];
  await fetch(url, {
    method: "DELETE",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes }),
  });
}

/** R2-compatible shim — mirrors env.BUCKET interface across the application */
export const SupabaseBucket = {
  async put(
    key: string,
    body: ArrayBuffer | ArrayBufferView | ReadableStream<any> | string,
    opts?: { httpMetadata?: { contentType?: string; contentDisposition?: string } },
  ): Promise<any> {
    await storagePut(key, body, {
      contentType: opts?.httpMetadata?.contentType,
      contentDisposition: opts?.httpMetadata?.contentDisposition,
    });
    return { key, size: 0, etag: `etag_${Date.now()}` };
  },

  async head(key: string): Promise<any | null> {
    const item = await storageGet(key);
    if (!item) return null;
    return {
      key,
      size: item.bytes.byteLength,
      etag: "head_etag",
      httpMetadata: {
        contentType: item.contentType,
      },
    };
  },

  async get(key: string): Promise<any | null> {
    const item = await storageGet(key);
    if (!item) return null;

    const res = new Response(item.bytes, {
      headers: { "Content-Type": item.contentType },
    });

    return Object.assign(res, {
      key,
      size: item.bytes.byteLength,
      etag: "get_etag",
      httpMetadata: {
        contentType: item.contentType,
      },
      writeHttpMetadata: (headers: Headers) => {
        headers.set("content-type", item.contentType);
      },
    });
  },

  async delete(key: string | string[], _extra?: unknown): Promise<void> {
    await storageDelete(key);
  },

  createMultipartUpload(key: string, _options?: any) {
    const chunks: ArrayBuffer[] = [];
    return {
      uploadId: `supa_${Date.now()}_${key.slice(-8)}`,
      async uploadPart(partNumber: number, body: ReadableStream<any> | ArrayBuffer) {
        const bytes = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
        chunks.push(bytes);
        return { partNumber, etag: `etag_${partNumber}` };
      },
      async complete(parts: { partNumber: number; etag: string }[]) {
        const total = chunks.reduce((a, b) => a + b.byteLength, 0);
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        await storagePut(key, combined);
        return { etag: "combined" };
      },
      async abort() {},
    };
  },

  resumeMultipartUpload(key: string, uploadId: string) {
    return {
      async uploadPart(partNumber: number, body: ReadableStream<any> | ArrayBuffer) {
        const bytes = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
        await storagePut(`${key}/__part_${uploadId}_${partNumber}`, bytes);
        return { partNumber, etag: `etag_${partNumber}` };
      },
      async complete(parts: { partNumber: number; etag: string }[]) {
        const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        const chunks: ArrayBuffer[] = [];
        for (const p of sorted) {
          const item = await storageGet(`${key}/__part_${uploadId}_${p.partNumber}`);
          if (item) chunks.push(item.bytes);
        }
        const total = chunks.reduce((a, b) => a + b.byteLength, 0);
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        await storagePut(key, combined);
        for (const p of sorted) {
          await storageDelete(`${key}/__part_${uploadId}_${p.partNumber}`);
        }
        return { etag: "combined" };
      },
      async abort() {},
    };
  },
};
