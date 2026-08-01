import "server-only";
import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { isProductionRuntime, requireServerEnv } from "@/lib/env";
import { query } from "@/lib/postgres";
import type { UserRole } from "@/lib/database.types";

const SESSION_COOKIE = "rcd_session";

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  company_name: string | null;
};

function hashToken(token: string) {
  return createHmac("sha256", requireServerEnv("SESSION_SECRET") ?? "dev-session-secret").update(token).digest("hex");
}

function legacyHashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, "hex");
  return saved.length === candidate.length && timingSafeEqual(saved, candidate);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await query("insert into app_sessions (user_id, token_hash, expires_at) values ($1, $2, $3)", [userId, tokenHash, expiresAt.toISOString()]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionRuntime(),
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("delete from app_sessions where token_hash = any($1::text[])", [[hashToken(token), legacyHashToken(token)]]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await query<CurrentUser>(
    `select u.id, u.email, u.role, u.full_name, u.company_name
     from app_sessions s
     join users u on u.id = s.user_id
     where s.token_hash = any($1::text[]) and s.expires_at > now()
     limit 1`,
    [[hashToken(token), legacyHashToken(token)]],
  );

  return result.rows[0] ?? null;
}
