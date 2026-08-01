import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { isProductionRuntime, requireServerEnv } from "@/lib/env";

let pool: Pool | null = null;

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.searchParams.get("sslmode") === "require" && !url.searchParams.has("uselibpqcompat")) {
      url.searchParams.set("uselibpqcompat", "true");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  const databaseUrl = requireServerEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_URL no configurado.");

  pool ??= new Pool({
    connectionString: normalizeConnectionString(databaseUrl),
    max: isProductionRuntime() ? 2 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ssl: isProductionRuntime() ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
