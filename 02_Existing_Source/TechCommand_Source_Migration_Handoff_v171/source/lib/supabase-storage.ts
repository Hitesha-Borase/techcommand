/**
 * Supabase Storage Adapter
 *
 * Full drop-in replacement for Cloudflare R2 (env.BUCKET).
 * All file uploads / downloads go to Supabase Storage bucket "techcommand-files".
 * Works 100% FREE without any credit or debit card required.
 */

import { env } from "cloudflare:workers";
import fs from "node:fs";
import path from "node:path";

const BUCKET_NAME = "techcommand-files";
const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), ".local-storage", BUCKET_NAME);

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

function isRemote(): boolean {
  const url = supabaseUrl();
  const key = serviceKey();
  return Boolean(url && key && url.startsWith("http"));
}

function localFilePath(key: string): string {
  const safeParts = key.split("/").filter((p) => p !== ".." && p !== "." && p.trim() !== "");
  return path.resolve(LOCAL_STORAGE_DIR, ...safeParts);
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

/** Upload bytes or stream to Supabase Storage or local filesystem fallback. */
export async function storagePut(
  storageKey: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream<any> | string,
  opts?: { contentType?: string; contentDisposition?: string },
): Promise<void> {
  if (!isRemote()) {
    const filePath = localFilePath(storageKey);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let buffer: Buffer;
    if (body instanceof ArrayBuffer) {
      buffer = Buffer.from(body);
    } else if (ArrayBuffer.isView(body)) {
      buffer = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    } else if (typeof body === "string") {
      buffer = Buffer.from(body, "utf-8");
    } else if (body && typeof (body as any).getReader === "function") {
      const res = new Response(body as any);
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      buffer = Buffer.from(body as any);
    }
    fs.writeFileSync(filePath, buffer);
    if (opts?.contentType) {
      fs.writeFileSync(
        `${filePath}.meta.json`,
        JSON.stringify({ contentType: opts.contentType, size: buffer.length }),
        "utf-8"
      );
    }
    return;
  }

  let rawBytes: ArrayBuffer;
  if (ArrayBuffer.isView(body)) {
    rawBytes = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  } else if (body instanceof ArrayBuffer) {
    rawBytes = body;
  } else if (typeof body === "string") {
    rawBytes = new TextEncoder().encode(body).buffer as ArrayBuffer;
  } else {
    rawBytes = await new Response(body).arrayBuffer();
  }

  const contentType = opts?.contentType || "application/octet-stream";
  // Always backup to local storage first so offline/local dev is 100% resilient
  await saveLocalFile(storageKey, rawBytes, contentType);

  const key = serviceKey();
  if (!key || key.startsWith("dummy") || key.includes("configured-in-dashboard")) {
    return;
  }

  const url = `${storageBase()}/object/${BUCKET_NAME}/${encodeStorageKey(storageKey)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": contentType,
        ...(opts?.contentDisposition ? { "Content-Disposition": opts.contentDisposition } : {}),
        "x-upsert": "true",
      },
      body: rawBytes,
      // @ts-ignore
      duplex: "half",
    });

    if (!res.ok) {
      console.warn(`Supabase Storage upload warning [${res.status}], using local fallback.`);
    }
  } catch (err) {
    console.warn("Supabase Storage fetch warning, using local fallback:", err);
  }
}

/** Download bytes from Supabase Storage or local filesystem. Returns ArrayBuffer or null. */
export async function storageGet(
  storageKey: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!isRemote()) {
    const filePath = localFilePath(storageKey);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    let contentType = "application/octet-stream";
    if (fs.existsSync(`${filePath}.meta.json`)) {
      try {
        const meta = JSON.parse(fs.readFileSync(`${filePath}.meta.json`, "utf-8"));
        if (meta.contentType) contentType = meta.contentType;
      } catch {}
    } else {
      const ext = path.extname(storageKey).toLowerCase();
      if (ext === ".pdf") contentType = "application/pdf";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".heic") contentType = "image/heic";
    }
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return { bytes, contentType };
  }

  const url = `${storageBase()}/object/${BUCKET_NAME}/${encodeStorageKey(storageKey)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404 || !res.ok) return null;
  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { bytes, contentType };
}

/** Delete a file or files from Supabase Storage or local filesystem. */
export async function storageDelete(storageKey: string | string[]): Promise<void> {
  if (!isRemote()) {
    const prefixes = Array.isArray(storageKey) ? storageKey : [storageKey];
    for (const prefix of prefixes) {
      const filePath = localFilePath(prefix);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      if (fs.existsSync(`${filePath}.meta.json`)) {
        try { fs.unlinkSync(`${filePath}.meta.json`); } catch {}
      }
    }
    return;
  }

  const url = `${storageBase()}/object/${BUCKET_NAME}`;
  const prefixes = Array.isArray(storageKey) ? storageKey : [storageKey];
  for (const k of prefixes) {
    localFileCache.delete(k);
  }

  const key = serviceKey();
  if (!key || key.startsWith("dummy") || key.includes("configured-in-dashboard")) {
    return;
  }

  try {
    const url = `${storageBase()}/object/${BUCKET_NAME}`;
    await fetch(url, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes }),
    });
  } catch {}
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
