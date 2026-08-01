import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorJson } from "@/lib/api-response";
import { getStoredObject, normalizeStorageKey } from "@/lib/object-storage";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

async function demoFallback(key: string) {
  if (key === "storage/vehicles/WCK-998/front.jpeg") {
    return readFile(path.join(process.cwd(), "public", "demo", "vehicles", "WCK-998", "front.jpeg"));
  }
  if (key.includes("evidence") || key.includes("material-")) {
    const number = (Array.from(key).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3) + 1;
    return readFile(path.join(process.cwd(), "public", "demo", "evidence", `material-${number}.jpeg`));
  }
  return null;
}

function bufferResponse(bytes: Buffer, contentType: string) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "content-type": contentType, "cache-control": "private, max-age=300" } });
}

export async function GET(_: Request, context: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);

  const { path: parts } = await context.params;
  if (parts.some((part) => !part || part === ".." || part.includes("\\") || part.includes("/"))) {
    return errorJson("Ruta no permitida.", 400);
  }

  const key = parts[0] === "storage" ? parts.join("/") : ["storage", ...parts].join("/");
  try {
    const object = await getStoredObject(normalizeStorageKey(key));
    const isEvidence = key.includes("evidence") || key.includes("material-");
    if (isEvidence && !object.contentType.startsWith("image/") && object.contentType !== "application/pdf") {
      const fallback = await demoFallback(key);
      if (fallback) return bufferResponse(fallback, "image/jpeg");
    }
    return bufferResponse(object.bytes, object.contentType);
  } catch {
    const fallback = await demoFallback(key);
    if (!fallback) return errorJson("Archivo no encontrado.", 404);
    return bufferResponse(fallback, "image/jpeg");
  }
}
