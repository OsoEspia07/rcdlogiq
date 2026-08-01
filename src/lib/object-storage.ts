import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isProductionRuntime } from "@/lib/env";
import { query } from "@/lib/postgres";

type StoredObject = {
  bytes: Buffer;
  contentType: string;
};

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export function normalizeStorageKey(key: string) {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (parts[0] !== "storage" || parts.some((part) => !part || part === ".." || part.includes("\\"))) {
    throw new Error("Ruta de storage no permitida.");
  }
  return parts.join("/");
}

export function contentTypeForKey(key: string, fallback = "application/octet-stream") {
  return contentTypes[path.extname(key).toLowerCase()] ?? fallback;
}

function localStoragePath(storageKey: string) {
  const [, ...relativeParts] = storageKey.split("/");
  return path.join(process.cwd(), "storage", ...relativeParts);
}

function shouldUseDatabaseStorage() {
  return process.env.FILE_STORAGE_DRIVER === "database" || isProductionRuntime();
}

export async function putStoredObject(key: string, bytes: Buffer, contentType?: string) {
  const storageKey = normalizeStorageKey(key);
  const resolvedContentType = contentType || contentTypeForKey(storageKey);

  if (shouldUseDatabaseStorage()) {
    await query(
      `insert into file_objects (key, content_type, data_base64, size_bytes)
       values ($1, $2, $3, $4)
       on conflict (key) do update
       set content_type = excluded.content_type,
           data_base64 = excluded.data_base64,
           size_bytes = excluded.size_bytes,
           created_at = now()`,
      [storageKey, resolvedContentType, bytes.toString("base64"), bytes.byteLength],
    );
    return storageKey;
  }

  const absolutePath = localStoragePath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  return storageKey;
}

export async function getStoredObject(key: string): Promise<StoredObject> {
  const storageKey = normalizeStorageKey(key);

  if (shouldUseDatabaseStorage()) {
    const result = await query<{ content_type: string; data_base64: string }>(
      "select content_type, data_base64 from file_objects where key = $1 limit 1",
      [storageKey],
    );
    const object = result.rows[0];
    if (!object) throw new Error("Archivo no encontrado.");
    return {
      bytes: Buffer.from(object.data_base64, "base64"),
      contentType: object.content_type,
    };
  }

  const absolutePath = localStoragePath(storageKey);
  return {
    bytes: await readFile(absolutePath),
    contentType: contentTypeForKey(storageKey),
  };
}
