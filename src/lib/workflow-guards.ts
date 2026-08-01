import "server-only";
import type { ServiceStatus, UserRole } from "@/lib/database.types";
import { query } from "@/lib/postgres";

export async function validateStateRequirements(input: {
  pickupRequestId: string;
  role: UserRole;
  from: ServiceStatus;
  to: ServiceStatus;
}) {
  if (input.to === "certificado generado") {
    const result = await query<{ ready: boolean }>(
      `select exists (
        select 1 from residue_passports
        where pickup_request_id = $1 and final_weight_kg is not null
      ) as ready`,
      [input.pickupRequestId],
    );
    if (!result.rows[0]?.ready) {
      return "Registra y aprueba el peso en bascula antes de generar el certificado.";
    }
  }

  if (input.to === "pesado") {
    const result = await query<{ ready: boolean }>(
      `select exists (
        select 1 from weight_tickets
        where pickup_request_id = $1 and approved_at is not null
      ) as ready`,
      [input.pickupRequestId],
    );
    if (!result.rows[0]?.ready) {
      return "El estado pesado requiere un ticket de bascula aprobado.";
    }
  }

  if (input.from === "en transito" && input.to === "certificado generado") {
    return "No se puede certificar una carga que sigue en transito.";
  }

  return null;
}
