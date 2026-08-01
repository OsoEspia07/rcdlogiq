import type { ResidueType, ServiceStatus, UserRole, VolumeSize } from "@/lib/database.types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const residueTypes = ["concreto", "ladrillo", "mixto", "madera", "drywall", "metal", "otros"] as const satisfies readonly ResidueType[];
export const volumeSizes = ["pequeno", "mediano", "grande"] as const satisfies readonly VolumeSize[];
export const userRoles = ["cliente", "transportador", "planta", "admin"] as const satisfies readonly UserRole[];
export const serviceStatuses = [
  "pendiente",
  "asignado",
  "aceptado",
  "en camino",
  "cargando",
  "cargado",
  "en transito",
  "planta",
  "retrasado",
  "recibido",
  "recibido en planta",
  "pesado",
  "procesado",
  "certificado",
  "certificado generado",
  "finalizado",
] as const satisfies readonly ServiceStatus[];

export const databaseServiceStatuses = [
  "pendiente",
  "asignado",
  "aceptado",
  "en camino",
  "cargando",
  "cargado",
  "en transito",
  "planta",
  "retrasado",
  "recibido en planta",
  "pesado",
  "procesado",
  "certificado generado",
  "finalizado",
] as const satisfies readonly ServiceStatus[];

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function optionalUuid(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return isUuid(value) ? value : null;
}

export function requiredUuid(value: unknown) {
  return isUuid(value) ? value : null;
}

export function cleanString(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function requiredString(value: unknown, maxLength = 500) {
  const text = cleanString(value, maxLength);
  return text.length > 0 ? text : null;
}

export function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export function finiteNumber(value: unknown, options: { min?: number; max?: number } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (options.min !== undefined && number < options.min) return null;
  if (options.max !== undefined && number > options.max) return null;
  return number;
}

export function isoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
