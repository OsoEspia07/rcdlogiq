import { randomUUID } from "node:crypto";
import path from "node:path";
import { errorJson, okJson } from "@/lib/api-response";
import { putStoredObject } from "@/lib/object-storage";
import { query } from "@/lib/postgres";
import { clientIpFromRequest, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { canAccessPickup, requirePermission } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/security-log";
import { getCurrentUser } from "@/lib/session";
import { requiredUuid } from "@/lib/validation";
import type { PhotoKind } from "@/lib/database.types";

const bucketByKind: Record<string, string> = {
  certificado: "certificates",
  bascula: "weight-tickets",
  manifiesto: "weight-tickets",
};

const allowedUploads: Record<string, { extensions: string[]; contentType: string }> = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], contentType: "image/jpeg" },
  "image/png": { extensions: ["png"], contentType: "image/png" },
  "application/pdf": { extensions: ["pdf"], contentType: "application/pdf" },
};

const maxUploadBytes = 10 * 1024 * 1024;
const photoKinds = ["residuo", "antes", "despues", "cargue", "bascula", "manifiesto", "certificado"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const ip = clientIpFromRequest(request);
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("uploads", user.id), limit: 10, windowMs: 60_000, type: "uploads", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "evidence.upload");
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.get("file");
  const pickupRequestId = requiredUuid(formData.get("pickup_request_id"));
  const kind = String(formData.get("kind") ?? "residuo") as PhotoKind;
  if (!photoKinds.includes(kind)) return errorJson("Tipo de evidencia invalido.", 400);

  if (!(file instanceof File) || !pickupRequestId) {
    return errorJson("Archivo y solicitud son requeridos.", 400);
  }
  if (file.size <= 0 || file.size > maxUploadBytes) {
    await logSecurityEvent({ type: "upload_rejected", severity: "warning", userId: user.id, userRole: user.role, ip, metadata: { reason: "size", size: file.size } });
    return errorJson("Archivo invalido o demasiado grande.", 400);
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const uploadRule = allowedUploads[file.type];
  if (!uploadRule || !uploadRule.extensions.includes(extension)) {
    await logSecurityEvent({ type: "upload_rejected", severity: "warning", userId: user.id, userRole: user.role, ip, metadata: { reason: "type", type: file.type, extension } });
    return errorJson("Tipo de archivo no permitido.", 415);
  }
  if (!(await canAccessPickup(user, pickupRequestId))) {
    return errorJson("Solicitud no disponible para este rol.", 403);
  }

  const bucket = bucketByKind[kind] ?? "evidence-photos";
  const fileName = `${kind}-${randomUUID()}.${extension}`;
  const relativePath = await putStoredObject(
    path.join("storage", bucket, pickupRequestId, fileName),
    Buffer.from(await file.arrayBuffer()),
    uploadRule.contentType,
  );

  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const result = await query(
    `insert into photos (pickup_request_id, uploaded_by, kind, storage_path, latitude, longitude, taken_at)
     values ($1, $2, $3, $4, $5, $6, now())
     returning *`,
    [pickupRequestId, user.id, kind, relativePath, Number.isFinite(latitude) ? latitude : null, Number.isFinite(longitude) ? longitude : null],
  );

  await handleOperationalEvent("evidence.uploaded", pickupRequestId, { id: user.id, role: user.role }, { kind, storage_path: relativePath });

  return okJson(result.rows[0], { status: 201 });
}
