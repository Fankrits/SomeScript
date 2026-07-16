# Task 1 Report: Ownership checks on web server actions (H1) + dashboard list bound (O6)

## Changes

**`apps/web/app/dashboard/actions.ts`**
- Added `and` to the `drizzle-orm` import.
- `renameProject`: now destructures `{ userId, orgId }` from `auth()`, computes `workspaceId = orgId || userId`, and scopes the `update` with `.where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))`. Uses `.returning({ id: projects.id })` and throws `"Project not found"` if zero rows matched.
- `deleteProject`: same pattern — `{ userId, orgId }` destructure, `workspaceId` computed once, DB `delete` scoped with the same `and(...)` where clause, `.returning()` + zero-rows check throwing `"Project not found"`. Left the editor-service `fetch` call and `revalidatePath` untouched, per the brief (Task 11 will restructure that later).

**`apps/web/app/dashboard/page.tsx`**
- Added `limit: 200` to the `db.query.projects.findMany` call that feeds the dashboard project list.

Diff matches the brief's Step 1/2 code verbatim.

## Type-check

`cd apps/web && bun x tsc --noEmit` → exit 0.

Note: the first run failed with 3 errors in `.next/dev/types/validator.ts` referencing `app/about/page.js`, `app/contact/page.js`, `app/legal/page.js` — these directories don't exist on disk (`ls` confirms). Verified via `git stash` that this failure is pre-existing and unrelated to this task's edits (reproduces identically on the base commit before this task's changes). It's a stale Next.js dev-mode generated type-checking manifest (build cache artifact, not source), not something in this task's scope. Deleted `.next/dev/types` (regenerates automatically on next `bun dev`/`bun build`) and reran — clean exit 0 with no source changes needed for that unrelated issue.

## Self-review

- Both `renameProject` and `deleteProject` filter by `and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId))` — confirmed by reading the diff.
- Both throw `"Project not found"` when the `.returning()` result is empty (0 rows affected), which happens both when the project doesn't exist and when it belongs to a different workspace — correct IDOR closure, doesn't leak existence info beyond a generic message.
- `auth()` called once per action (not twice), avoiding a redundant Clerk round-trip, per the brief's explicit instruction.
- `deleteProject`'s existing editor-service `fetch` call and `revalidatePath` were left untouched, as instructed (Task 11 scope).
- Dashboard list now bounded to 200 rows, ordered by `updatedAt desc` (unchanged ordering), preventing unbounded query growth (O6).
- No changes made outside the two named files; no extra abstractions added (YAGNI honored — no shared helper, no new dependency, no restructuring beyond what's specified).

## Deferred to QA

Step 4 (manual 2-user verification) requires a running app with live Clerk sessions for two distinct users/orgs, which isn't feasible in this offline subagent context. The static analysis above confirms the code path returns `"Project not found"` and touches zero rows whenever workspace ownership doesn't match, which is the mechanism the manual test would exercise. Recommend QA performs the live 2-user check before this ships to production, per the brief's Step 4 instructions.

## Concerns

None outside the pre-existing unrelated `.next` stale-cache tsc noise (resolved by clearing cache, not a code issue).
