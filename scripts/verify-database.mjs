import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
dotenv.config({
  path: path.join(repositoryRoot, "apps", "express-api", ".env"),
  quiet: true
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

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

  const expectedTables = ["ballots", "candidates", "students", "vote_hashes", "voter_logs"];
  const { rows: tables } = await client.query(
    `select table_schema, table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
        and table_type = 'BASE TABLE'
      order by table_schema, table_name`,
    [expectedTables]
  );

  const { rows: rlsRows } = await client.query(
    `select count(*)::int as enabled_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any($1::text[])
        and c.relkind = 'r'
        and c.relrowsecurity`,
    [expectedTables]
  );

  const { rows: identityLeaks } = await client.query(
    `select table_schema, table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'vote_hashes'
        and column_name in ('student_id', 'account_id', 'voter_id', 'voter_log_id')`
  );

  const { rows: functions } = await client.query(
    `select n.nspname as function_schema, p.proname as function_name
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'cast_anonymous_vote'
      order by n.nspname, p.proname`
  );

  const { rows: forbiddenLinks } = await client.query(
    `select 1
       from pg_constraint c
       join pg_class source_table on source_table.oid = c.conrelid
       join pg_class target_table on target_table.oid = c.confrelid
       join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
       join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
      where c.contype = 'f'
        and source_schema.nspname = 'public'
        and target_schema.nspname = 'public'
        and (
          (source_table.relname = 'voter_logs' and target_table.relname = 'vote_hashes')
          or (source_table.relname = 'vote_hashes' and target_table.relname = 'voter_logs')
        )`
  );

  const tableCount = tables.length;
  const rlsCount = rlsRows[0]?.enabled_count ?? 0;
  if (tableCount !== 5) throw new Error(`Expected 5 approved ERD tables, found ${tableCount}`);
  if (rlsCount !== 5) throw new Error(`Expected RLS on 5 tables, found ${rlsCount}`);
  if (identityLeaks.length > 0) throw new Error("Identity-linked columns exist in vote_hashes");
  if (forbiddenLinks.length > 0) throw new Error("voter_logs and vote_hashes are linked");
  if (functions.length !== 1) throw new Error(`Expected atomic vote function, found ${functions.length}`);

  console.log(`Verified approved ERD tables: ${expectedTables.join(", ")}`);
  console.log(`Verified ${tableCount} tables with RLS enabled on all ${rlsCount}.`);
  console.log("Verified vote_hashes contains no identity-linking columns or voter_logs relationship.");
  console.log("Verified atomic anonymous vote-casting function.");
} finally {
  await client.end();
}
