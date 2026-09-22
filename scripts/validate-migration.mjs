import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
dotenv.config({ path: path.join(repositoryRoot, "apps", "express-api", ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const requestedMigration = process.argv[2];
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file))
  .sort();
const migrationFile = requestedMigration ?? migrationFiles.at(-1);
if (!migrationFile || !migrationFiles.includes(migrationFile)) {
  throw new Error(`Migration not found: ${migrationFile ?? "<none>"}`);
}
const migrationPath = path.join(migrationsDirectory, migrationFile);
const sql = await readFile(migrationPath, "utf8");
const connectionUrl = new URL(databaseUrl);
const isLocal = connectionUrl.hostname === "localhost" || connectionUrl.hostname === "127.0.0.1";
if (!isLocal && !connectionUrl.searchParams.has("sslmode")) {
  connectionUrl.searchParams.set("sslmode", "require");
}
if (!isLocal && connectionUrl.searchParams.get("sslmode") === "require") {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
}

const client = new pg.Client({ connectionString: connectionUrl.toString() });

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("rollback");
  console.log(`${migrationFile} validated successfully and was rolled back.`);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // The original database error is more useful than a rollback failure.
  }
  throw error;
} finally {
  await client.end();
}
