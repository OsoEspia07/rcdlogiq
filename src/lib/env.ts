export function getDatabaseEnv() {
  return {
    url: process.env.DATABASE_URL,
    isConfigured: Boolean(process.env.DATABASE_URL),
  };
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function requireServerEnv(name: "DATABASE_URL" | "SESSION_SECRET") {
  const value = process.env[name];
  if (!value && (name === "DATABASE_URL" || isProductionRuntime())) {
    throw new Error(`${name} no configurado.`);
  }
  return value;
}

export function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
