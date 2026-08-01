import "server-only";
import { headers } from "next/headers";
import { errorJson } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/security-log";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  type: string;
  userId?: string | null;
};

const buckets = new Map<string, Bucket>();

function now() {
  return Date.now();
}

function cleanup() {
  const current = now();
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= current) buckets.delete(key);
  }
}

export function clientIpFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function clientIpFromHeaders() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerStore.get("x-real-ip") || "unknown";
}

export async function enforceRateLimit(options: RateLimitOptions) {
  cleanup();
  const current = now();
  const bucket = buckets.get(options.key);
  if (!bucket || bucket.resetAt <= current) {
    buckets.set(options.key, { count: 1, resetAt: current + options.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.limit) return null;

  await logSecurityEvent({
    type: "rate_limit_exceeded",
    severity: "warning",
    userId: options.userId,
    ip: options.key.split(":").at(-1),
    metadata: { limiter: options.type, limit: options.limit, windowMs: options.windowMs },
  });

  return errorJson("Demasiadas solicitudes. Intenta de nuevo mas tarde.", 429, {
    retry_after_seconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
  });
}

export function rateLimitKey(type: string, identity: string) {
  return `${type}:${identity}`;
}
