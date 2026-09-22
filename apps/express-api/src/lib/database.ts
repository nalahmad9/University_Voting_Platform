import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

let pool: pg.Pool | undefined;

function databaseConnectionString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  // Supabase pooler connections require TLS. `pg` maps sslmode=require to an
  // encrypted connection without requiring the Supabase CA in local Node.
  if (!isLocal && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  if (!isLocal && url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("uselibpqcompat", "true");
  }

  return url.toString();
}

export function getDatabasePool(): pg.Pool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool ??= new Pool({
    connectionString: databaseConnectionString(env.DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "quorum-express-api"
  });

  return pool;
}

export async function checkDatabaseConnection(): Promise<void> {
  await getDatabasePool().query("select 1 as healthy");
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
