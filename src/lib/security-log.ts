import "server-only";
import { query } from "@/lib/postgres";
import type { UserRole } from "@/lib/database.types";

type SecuritySeverity = "info" | "warning" | "critical";

export async function logSecurityEvent(input: {
  type: string;
  severity?: SecuritySeverity;
  userId?: string | null;
  userRole?: UserRole | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await query(
      `insert into security_logs (type, severity, user_id, user_role, ip, metadata)
       values ($1, $2, $3, $4, $5, $6)`,
      [input.type, input.severity ?? "info", input.userId ?? null, input.userRole ?? null, input.ip ?? null, input.metadata ?? {}],
    );
  } catch {
    // Logging must never break the user-facing operation.
  }
}
