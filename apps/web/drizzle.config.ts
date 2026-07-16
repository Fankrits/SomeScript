import { readFileSync } from "fs";
import { join } from "path";
import { defineConfig } from "drizzle-kit";

// The drizzle-kit CLI doesn't inherit Bun's auto-loaded .env.local, so load
// DATABASE_URL from it here for local dev. In production (Railway) DATABASE_URL
// is a real env var and this file is absent. Fail fast rather than fall back to
// a hardcoded credential.
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split("\n")) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (match) {
        process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, "");
        break;
      }
    }
  } catch {
    // .env.local not present (e.g. production) — rely on the real env var below.
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
