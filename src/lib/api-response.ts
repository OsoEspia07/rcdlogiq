import "server-only";
import { randomUUID } from "node:crypto";

type JsonBody = Record<string, unknown> | unknown[];

export function safeJson(body: JsonBody, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", headers.get("x-request-id") ?? randomUUID());
  return Response.json(body, { ...init, headers });
}

export function okJson(data: unknown, init?: ResponseInit) {
  return safeJson({ success: true, data }, init);
}

export function errorJson(error: string, status = 400, metadata?: Record<string, unknown>) {
  return safeJson({ success: false, error, ...(metadata ? { metadata } : {}) }, { status });
}

export function internalErrorJson() {
  return errorJson("No se pudo procesar la solicitud.", 500);
}
