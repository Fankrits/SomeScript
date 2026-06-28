import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

// Use the local connection if not specified
const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/latex_editor";

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString,
    // Add connection pool config suitable for serverless
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = pool;
}

export const db = drizzle(pool, { schema });
