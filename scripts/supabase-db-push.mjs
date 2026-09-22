import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
dotenv.config({
  path: path.join(repositoryRoot, "apps", "express-api", ".env"),
  quiet: true
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const connectionUrl = new URL(databaseUrl);
if (!connectionUrl.searchParams.has("sslmode")) {
  connectionUrl.searchParams.set("sslmode", "require");
}

const cliPath = path.join(
  repositoryRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js"
);
const cliArgs = [
  cliPath,
  "db",
  "push",
  "--db-url",
  connectionUrl.toString(),
  "--include-all",
  "--skip-vault",
  "--yes"
];

if (process.argv.includes("--dry-run")) cliArgs.push("--dry-run");

const result = spawnSync(process.execPath, cliArgs, {
  cwd: repositoryRoot,
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
