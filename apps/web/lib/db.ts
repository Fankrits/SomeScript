import { drizzle } from "drizzle-orm/node-postgres";
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
