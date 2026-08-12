import { drizzle } from "drizzle-orm/node-postgres";
// pg's own deps (pg-types, pg-pool, ...) are pinned as direct deps in package.json:
// Next's default serverExternalPackages list marks "pg" external, and Bun's isolated
// linker only exposes *direct* deps by bare name — without this, dev fails with
// "Cannot find package 'pg-types'" the moment this module loads.
import { Pool } from "pg";
import * as schema from "../db/schema";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString,
    // A serverless instance serves ~one request at a time, so a large pool is
    // mostly idle reservations — and each warm instance claims its own, so a
    // handful of instances at max:10 exhausts a default Postgres. Keep it small
    // and scale by adding a pooler (PgBouncer) if this ever isn't enough.
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = pool;
}

export const db = drizzle(pool, { schema });
