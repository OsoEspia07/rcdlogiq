import type { ServiceStatus, UserRole } from "@/lib/database.types";
import { query } from "@/lib/postgres";
import type { CurrentUser } from "@/lib/session";

export type Permission =
  | "pickup.create"
  | "pickup.read.own"
  | "pickup.read.all"
  | "pickup.assign"
  | "pickup.cancel.own"
  | "tracking.read"
  | "tracking.update"
  | "evidence.upload"
  | "weight.register"
  | "certificate.read"
  | "certificate.generate"
  | "admin.audit.read";

const fallbackPermissions: Record<UserRole, Permission[]> = {
  cliente: ["pickup.create", "pickup.read.own", "pickup.cancel.own", "tracking.read", "evidence.upload", "certificate.read"],
  transportador: ["pickup.read.own", "tracking.read", "tracking.update", "evidence.upload", "certificate.read"],
  planta: ["pickup.read.own", "tracking.read", "tracking.update", "evidence.upload", "weight.register", "certificate.generate", "certificate.read"],
  admin: ["pickup.create", "pickup.read.all", "pickup.assign", "tracking.read", "tracking.update", "evidence.upload", "weight.register", "certificate.generate", "certificate.read", "admin.audit.read"],
};

const transitions: Record<UserRole, Partial<Record<ServiceStatus, ServiceStatus[]>>> = {
  cliente: {
    pendiente: ["finalizado"],
  },
  transportador: {
    asignado: ["aceptado", "pendiente"],
    aceptado: ["en camino"],
    "en camino": ["cargando"],
    cargando: ["cargado"],
    cargado: ["en transito"],
    "en transito": ["recibido en planta"],
  },
  planta: {
    "en transito": ["recibido en planta"],
    "recibido en planta": ["pesado", "procesado", "certificado generado"],
    pesado: ["procesado", "certificado generado"],
    procesado: ["certificado generado"],
  },
  admin: {},
};

export async function getPermissions(user: CurrentUser): Promise<Set<Permission>> {
  try {
    const result = await query<{ id: Permission }>(
      `select p.id
       from permissions p
       join role_permissions rp on rp.permission_id = p.id
       left join user_roles ur on ur.role_id = rp.role_id and ur.user_id = $1
       where rp.role_id = $2 or ur.user_id is not null`,
      [user.id, user.role],
    );
    if (result.rows.length > 0) return new Set(result.rows.map((row) => row.id));
  } catch {
    // During first local setup, permissions may not be migrated yet.
  }
  return new Set(fallbackPermissions[user.role]);
}

export async function requirePermission(user: CurrentUser, permission: Permission) {
  const permissions = await getPermissions(user);
  if (!permissions.has(permission)) {
    return Response.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return null;
}

export function visibilityPredicate(user: CurrentUser, alias = "pr") {
  if (user.role === "admin") return { sql: "true", params: [] as unknown[] };
  if (user.role === "cliente") return { sql: `${alias}.client_id = $1`, params: [user.id] };
  if (user.role === "transportador") {
    return {
      sql: `exists (select 1 from transport_assignments ta where ta.pickup_request_id = ${alias}.id and ta.transporter_id = $1)`,
      params: [user.id],
    };
  }
  return {
    sql: `exists (select 1 from plants p where p.id = ${alias}.plant_id and p.owner_id = $1)`,
    params: [user.id],
  };
}

export async function getPickupStatus(pickupRequestId: string) {
  const result = await query<{ status: ServiceStatus }>("select status from pickup_requests where id = $1", [pickupRequestId]);
  return result.rows[0]?.status ?? null;
}

export function canTransition(role: UserRole, from: ServiceStatus, to: ServiceStatus) {
  if (role === "admin") return true;
  return transitions[role][from]?.includes(to) ?? false;
}

export async function canAccessPickup(user: CurrentUser, pickupRequestId: string) {
  if (user.role === "admin") return true;
  const result = await query<{ allowed: boolean }>(
    `select exists (
      select 1 from pickup_requests pr
      left join transport_assignments ta on ta.pickup_request_id = pr.id
      left join plants p on p.id = pr.plant_id
      where pr.id = $1 and (
        pr.client_id = $2 or ta.transporter_id = $2 or p.owner_id = $2
      )
    ) as allowed`,
    [pickupRequestId, user.id],
  );
  return result.rows[0]?.allowed ?? false;
}
