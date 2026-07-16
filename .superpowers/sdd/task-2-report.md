# Task 2 Report: DB fail-fast (M4), workspace index (O5), versioned migrations (M6)

## Status: DONE_WITH_CONCERNS

## What was done

**Step 1 — Fail fast on missing `DATABASE_URL`** (`apps/web/lib/db.ts:9-11`)
Replaced the hardcoded fallback connection string with a throw, verbatim per brief:
```ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
```

**Step 2 — Workspace index** (`apps/web/db/schema.ts`)
Added `index` to the `drizzle-orm/pg-core` import and converted `projects` to the 3-arg `pgTable` form with the array-style index definition from the brief:
```ts
(table) => [index("projects_workspace_id_idx").on(table.workspaceId)]
```
The installed `drizzle-orm` is `0.45.2`, which accepts the array form — no need for the object-form fallback.

**Step 3 — Scripts** (`apps/web/package.json`)
Replaced `db:push` with `db:generate` (`drizzle-kit generate`) and `db:migrate` (`drizzle-kit migrate`), left `db:studio` untouched, exactly as specified.

**Step 4 — Baseline migration**
Ran `cd apps/web && bun run db:generate`. **It worked fully offline** — `drizzle-kit generate` only introspects `schema.ts`, it never opens a DB connection, so the lack of a running Postgres in this environment was not an issue. Output:
```
4 tables
documents 6 columns 0 indexes 1 fks
projects 5 columns 1 indexes 1 fks
users 6 columns 0 indexes 0 fks
workspaces 7 columns 0 indexes 1 fks
[✓] Your SQL migration file ➜ drizzle/0000_easy_viper.sql
```
Generated `apps/web/drizzle/0000_easy_viper.sql` (plus `meta/0000_snapshot.json` and `meta/_journal.json`). The SQL contains `CREATE TABLE` for all four tables, the three FKs, and — matching the brief's expected outcome exactly — `CREATE INDEX "projects_workspace_id_idx" ON "projects" USING btree ("workspace_id")`. No hand-written SQL was needed.

**Step 5 — Apply to local dev DB — SKIPPED (deferred)**
Docker/Postgres is not available in this environment. Dropping/recreating `latex_editor` and running `bun run db:migrate` against it, plus the `\di projects*` index verification, is **deferred to the deploy/ops step**. This also means the production/staging DB has not yet had the baseline migration applied — that must happen before the new `db:migrate`-based deploy flow can be relied on there, and before this migration folder becomes the source of truth (the live DB was previously built via `drizzle-kit push`, so its actual state needs to be reconciled with this baseline — e.g. via `drizzle-kit migrate` after confirming the existing tables already match this snapshot, or a manual baseline mark).

**Step 6 — Type-check**
`cd apps/web && bun x tsc --noEmit` → exit 0.

## Deviation from the brief (flagging explicitly)

The brief's file list only names `db.ts`, `schema.ts`, `package.json`, and the generated `apps/web/drizzle/` folder. However, the existing `apps/web/drizzle.config.ts` had `out: "./db/migrations"`, not `"./drizzle"`. Left as-is, `bun run db:generate` would have written the baseline migration to `apps/web/db/migrations/`, contradicting the brief's Step 4 expectation (`apps/web/drizzle/`) and Step 6's `git add ... apps/web/drizzle`. I changed `out` to `"./drizzle"` in `drizzle.config.ts` and included that file in the commit — without it, `db:migrate` (which reads the same config) would look in the wrong directory and the committed `drizzle/` folder would be orphaned/unused. This is a one-line necessary consequence of the brief's own stated target path, not scope creep, but it's outside the brief's literal "Files" list so I'm calling it out.

Not touched (out of scope per brief / YAGNI): `drizzle.config.ts`'s `dbCredentials.url` still has the same hardcoded-fallback pattern the brief flagged in `db.ts` (M4). The brief only targets the app's runtime `db.ts`, not the drizzle-kit CLI config, which is dev-tooling-only and not a production boot path — left alone.

## Verification

- `cd apps/web && bun x tsc --noEmit` → exit 0.
- `bun run db:generate` succeeded offline, produced SQL matching the brief's expected `CREATE TABLE`/`CREATE INDEX` statements verbatim.
- Did not verify `db:migrate` against a live DB (no Postgres available) — see Step 5 above.

## Files changed / committed

- `apps/web/lib/db.ts`
- `apps/web/db/schema.ts`
- `apps/web/package.json`
- `apps/web/drizzle.config.ts` (deviation, explained above)
- `apps/web/drizzle/0000_easy_viper.sql`
- `apps/web/drizzle/meta/0000_snapshot.json`
- `apps/web/drizzle/meta/_journal.json`

Commit: `47d184e` — "feat(db): fail-fast on missing DATABASE_URL, index projects.workspace_id, adopt versioned migrations" (on branch `production-hardening`).
