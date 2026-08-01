"use server";

import { redirect } from "next/navigation";
import { clientIpFromHeaders, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { query } from "@/lib/postgres";
import { logSecurityEvent } from "@/lib/security-log";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/session";
import { cleanString } from "@/lib/validation";
import type { UserRole } from "@/lib/database.types";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return cleanString(raw, 200);
}

export async function signInAction(formData: FormData) {
  const ip = await clientIpFromHeaders();
  const limited = await enforceRateLimit({ key: rateLimitKey("login", ip), limit: 5, windowMs: 60_000, type: "login" });
  if (limited) redirect("/auth/login?error=Demasiados intentos. Espera un minuto.");

  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!email || !password || password.length > 200) {
    await logSecurityEvent({ type: "login_invalid_input", severity: "warning", ip, metadata: { email } });
    redirect("/auth/login?error=Credenciales invalidas");
  }

  const result = await query<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1 limit 1", [email]);
  const user = result.rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    await logSecurityEvent({ type: "login_failed", severity: "warning", ip, userId: user?.id ?? null, metadata: { email } });
    redirect("/auth/login?error=Credenciales invalidas");
  }

  await createSession(user.id);
  redirect("/");
}

export async function signUpAction(formData: FormData) {
  const ip = await clientIpFromHeaders();
  const limited = await enforceRateLimit({ key: rateLimitKey("signup", ip), limit: 3, windowMs: 60 * 60_000, type: "signup" });
  if (limited) redirect("/auth/signup?error=Demasiados registros desde esta red. Intenta mas tarde.");

  const requestedRole = (value(formData, "role") || "cliente") as UserRole;
  const role = requestedRole === "admin" ? "cliente" : requestedRole;
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const fullName = value(formData, "full_name");
  if (!email.includes("@") || password.length < 8 || password.length > 200 || !fullName) {
    await logSecurityEvent({ type: "signup_invalid_input", severity: "warning", ip, metadata: { email, requestedRole } });
    redirect("/auth/signup?error=Datos invalidos");
  }

  const result = await query<{ id: string }>(
    `insert into users (email, password_hash, role, full_name, phone, company_name, document_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      email,
      hashPassword(password),
      role,
      fullName,
      value(formData, "phone") || null,
      value(formData, "company_name") || null,
      value(formData, "document_id") || null,
    ],
  );
  await query("insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing", [result.rows[0].id, role]);

  await createSession(result.rows[0].id);
  redirect("/");
}

export async function signOutAction() {
  await destroySession();
  redirect("/auth/login");
}
