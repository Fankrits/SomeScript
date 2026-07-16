# Production-Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Critical/High/Medium finding from the 2026-07-12 production-readiness audit so SomeScript can safely serve multiple concurrent users in production.

**Architecture:** Three moves: (1) put Clerk auth in front of the entire editor app and its Eve agent endpoints; (2) delete the process-global "active project" temp file and make every editor API take an explicit, ownership-checked `projectId`; (3) lock the compiler behind a shared secret and harden its filesystem handling. Everything else (rate limits, zip/regex bounds, migrations, CI, health checks) layers on top.

**Tech Stack:** Next.js 16 (both apps), Clerk, Drizzle/Postgres, Bun, S3 (Railway Object Storage / RustFS), Tectonic via Bun compiler service.

## Global Constraints

- Next.js 16: middleware lives in `proxy.ts`, NOT `middleware.ts`. Clerk matcher must include `'/__clerk/(.*)'`. Read `node_modules/next/dist/docs/` before writing unfamiliar Next.js code.
- Never edit `apps/editor/my-new-project/` (LaTeX sandbox).
- After editing any editor/web page, component, or route: `cd apps/<app> && bun x tsc --noEmit` must pass.
- Tests run with `cd apps/<app> && bun test`. `*.test.ts` files are excluded from `tsc` (web already does this; Task 3 mirrors it for editor).
- Add dependencies with `bun add <pkg>` from inside the owning app directory. Only new deps allowed by this plan: `safe-regex2` (editor), `@sentry/nextjs` (Task 18, optional).
- Assumption: **there is no production database yet** (audit verdict was No-Go), so Drizzle migrations start from a clean baseline. The existing local dev DB may be recreated or receive one final `push`.
- Both apps must use the **same Clerk instance** (same publishable/secret key pair) so editor accepts web-issued session tokens.
- New env vars introduced by this plan: `COMPILER_SECRET` (editor + compiler), `ALLOW_LOCAL_COMPILE` (compiler), `EDITOR_URL` (web, server-side), Clerk satellite vars for editor in prod (`NEXT_PUBLIC_CLERK_IS_SATELLITE`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`).

## Audit finding → task map

| Finding | Task |
|---|---|
| C1 editor unauthenticated | 4 |
| C2 global project state | 6, 8, 9, 10, 12, 13 |
| C3 project IDOR (editor) | 10 |
| C4 compiler trust/path issues | 14 |
| H1 web action IDOR | 1 |
| H2 no rate limiting | 15 |
| H3 ReDoS in search | 9 |
| H4 zip import unbounded | 10 |
| H5 latching storage fallback | 3 |
| M1 project-info exposure | 10 (route deleted) |
| M2 verbose errors | 5 (helper), applied in 6–10 |
| M3 traversal prefix bug | 3 |
| M4 hardcoded DB default | 2 |
| M5 stateful caches | 14 (dead cache deleted) + 17 (single-instance constraint documented) |
| M6 drizzle push | 2 |
| M7 orphaned tectonic | 14 |
| O1 no CI | 16 |
| O2 no error tracking | 18 |
| O3 health/backup/rollback | 17 |
| O5 missing index | 2 |
| O6 unbounded lists | 1 (dashboard limit), 9 (search caps) |

**Explicitly out of scope (accepted for now):** O4 full-project rehash per upload compile (optimize when compile latency hurts); multi-instance scaling of in-memory caches (documented as single-instance constraint in Task 17); Eve channel-level auth (`none()` stays — the Clerk middleware in front of all editor HTTP routes is the gate); Tectonic `\input{../<other-uuid>}` cross-workspace reads inside the compiler container (mitigated by unguessable UUID dir names + container isolation; full fix is per-compile sandboxing).

---

## Phase A — Standalone hardening (each task shippable alone)

### Task 1: Ownership checks on web server actions (H1) + dashboard list bound (O6)

**Files:**
- Modify: `apps/web/app/dashboard/actions.ts:149-196` (`renameProject`, `deleteProject`)
- Modify: `apps/web/app/dashboard/page.tsx:25-28` (project query)

**Interfaces:**
- Produces: `renameProject(projectId, newName)` and `deleteProject(projectId)` now throw `"Project not found"` when the project is not in the caller's active workspace. Task 11 rewrites `deleteProject` again (delete-order + editor auth); this task only adds the ownership `where` clauses so it ships independently.

- [ ] **Step 1: Scope rename and delete to the caller's workspace**

In `apps/web/app/dashboard/actions.ts`, add `and` to the drizzle import:

```ts
import { eq, and } from "drizzle-orm";
```

Replace the body of `renameProject` after the name validation with:

```ts
  const workspaceId = (await auth()).orgId || userId;

  const updated = await db
    .update(projects)
    .set({ name: newName.trim(), updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning({ id: projects.id });

  if (updated.length === 0) {
    throw new Error("Project not found");
  }

  revalidatePath("/dashboard");
```

Note: `renameProject` currently destructures only `userId` from `auth()` — change its first line to `const { userId, orgId } = await auth();` and use `const workspaceId = orgId || userId;` (avoid calling `auth()` twice).

In `deleteProject`, same pattern — change the destructure to `const { userId, orgId } = await auth();` and replace the DB delete with:

```ts
  const workspaceId = orgId || userId;

  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning({ id: projects.id });

  if (deleted.length === 0) {
    throw new Error("Project not found");
  }
```

(Keep the existing editor-service file-deletion call and `revalidatePath` as they are — Task 11 restructures them.)

- [ ] **Step 2: Bound the dashboard project list**

In `apps/web/app/dashboard/page.tsx`, add `limit: 200` to the query:

```ts
  const workspaceProjects = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: [desc(projects.updatedAt)],
    limit: 200,
  });
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bun x tsc --noEmit` — Expected: exit 0.

- [ ] **Step 4: Manual verification**

With two Clerk users A and B (or one user + an org): as user B, call `deleteProject` with a project id belonging to A (easiest via the dashboard UI of B after copying A's project UUID into a devtools-invoked action, or simply assert the new code path by renaming a nonexistent UUID and observing the "Project not found" error). Expected: A's project untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/actions.ts apps/web/app/dashboard/page.tsx
git commit -m "fix(web): scope project rename/delete to caller's workspace, bound dashboard list"
```

---

### Task 2: DB fail-fast (M4), workspace index (O5), versioned migrations (M6)

**Files:**
- Modify: `apps/web/lib/db.ts:9-11`
- Modify: `apps/web/db/schema.ts:22-28`
- Modify: `apps/web/package.json` (scripts)
- Create: `apps/web/drizzle/` (generated migration SQL — via drizzle-kit, not hand-written)

**Interfaces:**
- Produces: `db` export unchanged in shape; app now refuses to boot without `DATABASE_URL`. Migration workflow: `bun run db:generate` → commit SQL → `bun run db:migrate` on deploy.

- [ ] **Step 1: Fail fast on missing DATABASE_URL**

In `apps/web/lib/db.ts`, replace lines 9-11:

```ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
```

- [ ] **Step 2: Add the workspace index to the schema**

In `apps/web/db/schema.ts`, add `index` to the pg-core import and give `projects` a third argument:

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
```

```ts
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("projects_workspace_id_idx").on(table.workspaceId)]
);
```

(If the installed drizzle-orm version rejects the array form, use the object form `(table) => ({ workspaceIdx: index("projects_workspace_id_idx").on(table.workspaceId) })` — check `node_modules/drizzle-orm` version and its docs.)

- [ ] **Step 3: Switch scripts from push to generate/migrate**

In `apps/web/package.json`, replace `"db:push": "drizzle-kit push"` with:

```json
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
```

- [ ] **Step 4: Generate the baseline migration**

Run: `cd apps/web && bun run db:generate`
Expected: a new folder `apps/web/drizzle/` containing `0000_*.sql` with `CREATE TABLE` statements for users/workspaces/projects/documents and `CREATE INDEX "projects_workspace_id_idx"`.

- [ ] **Step 5: Apply to the local dev DB**

The existing local dev DB was created via `push`, so the baseline `CREATE TABLE`s would collide. Recreate it (dev data is disposable):

```bash
docker compose up -d postgres
docker exec latex_editor_postgres psql -U postgres -c "DROP DATABASE IF EXISTS latex_editor; CREATE DATABASE latex_editor;"
cd apps/web && bun run db:migrate
```

Expected: migrate exits 0. Verify index: `docker exec latex_editor_postgres psql -U postgres -d latex_editor -c "\di projects*"` shows `projects_workspace_id_idx`.

- [ ] **Step 6: Type-check and commit**

Run: `cd apps/web && bun x tsc --noEmit` — Expected: exit 0.

```bash
git add apps/web/lib/db.ts apps/web/db/schema.ts apps/web/package.json apps/web/drizzle
git commit -m "feat(db): fail-fast on missing DATABASE_URL, index projects.workspace_id, adopt versioned migrations"
```

---

### Task 3: Storage traversal fix (M3) + delete latching fallback (H5)

**Files:**
- Modify: `apps/editor/lib/storage.ts:26-37` (export class + fix guard), `:374-445` (delete Hybrid, simplify singleton)
- Modify: `apps/editor/tsconfig.json` (exclude tests from tsc, mirroring `apps/web/tsconfig.json`)
- Test: `apps/editor/lib/storage.test.ts`

**Interfaces:**
- Produces: `storage` singleton unchanged in shape; `LocalStorageProvider` becomes an exported class (for tests). S3 errors now propagate to callers instead of silently switching to local disk.

- [ ] **Step 1: Write the failing test**

Create `apps/editor/lib/storage.test.ts`:

```ts
import { expect, test } from "bun:test";
import { LocalStorageProvider } from "./storage";

const p = new LocalStorageProvider();

test("rejects sibling-directory prefix traversal", async () => {
  // baseDir is <cwd>/projects/abc; "../abc-evil/x" resolves to <cwd>/projects/abc-evil/x,
  // which passes a naive startsWith(baseDir) check but must be rejected.
  await expect(p.readFile("abc", "../abc-evil/secret.txt")).rejects.toThrow("Directory traversal");
});

test("rejects parent traversal", async () => {
  await expect(p.readFile("abc", "../../etc/passwd")).rejects.toThrow("Directory traversal");
});

test("normal relative paths are not flagged as traversal", async () => {
  // File won't exist — ENOENT is fine; it just must not be a traversal error.
  try {
    await p.readFile("zz-does-not-exist", "sections/intro.tex");
  } catch (e: any) {
    expect(e.message).not.toContain("Directory traversal");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/editor && bun test lib/storage.test.ts`
Expected: FAIL — first test fails because `LocalStorageProvider` is not exported (fix that first: `export class LocalStorageProvider`), then re-run and the sibling-prefix test fails (no error thrown / ENOENT instead of traversal error).

- [ ] **Step 3: Fix the guard**

In `apps/editor/lib/storage.ts`, export the class and fix `getLocalPath` (line 33):

```ts
export class LocalStorageProvider implements StorageProvider {
  private getLocalPath(projectId: string, fileRelativePath: string): string {
    const baseDir = projectId === "default" || !projectId
      ? path.join(process.cwd(), "my-new-project")
      : path.join(process.cwd(), "projects", projectId);
    const resolved = path.resolve(baseDir, fileRelativePath);
    if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
      throw new Error("Directory traversal attempt detected");
    }
    return resolved;
  }
```

- [ ] **Step 4: Delete `HybridStorageProvider`**

Delete the entire class (lines 374-437) and replace the singleton selection at the bottom of the file with:

```ts
// S3 errors now propagate to callers — a storage failure must fail the request,
// never silently write to ephemeral local disk.
export const storage: StorageProvider =
  process.env.STORAGE_PROVIDER === "s3"
    ? new S3StorageProvider()
    : new LocalStorageProvider();
```

- [ ] **Step 5: Exclude tests from editor tsc**

In `apps/editor/tsconfig.json`, add `"**/*.test.ts"` to the `exclude` array (create the array if absent, keeping existing entries like `node_modules`). Check `apps/web/tsconfig.json` for the exact pattern used there and mirror it.

- [ ] **Step 6: Run tests and type-check**

Run: `cd apps/editor && bun test lib/storage.test.ts` — Expected: 3 pass.
Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0 (no more references to HybridStorageProvider).

- [ ] **Step 7: Commit**

```bash
git add apps/editor/lib/storage.ts apps/editor/lib/storage.test.ts apps/editor/tsconfig.json
git commit -m "fix(storage): correct traversal guard, remove silent local-disk fallback"
```

---

## Phase B — Editor authentication foundation (C1)

### Task 4: Clerk middleware for the entire editor app

**Files:**
- Modify: `apps/editor/package.json` (add `@clerk/nextjs`)
- Create: `apps/editor/proxy.ts`
- Modify: `apps/editor/.env.local.example`, `apps/editor/.env.railway.example` (document satellite/sign-in vars)

**Interfaces:**
- Produces: every editor route (UI, `/api/*`, Eve agent endpoints, `/__clerk/*`) requires a Clerk session except `/api/health` (created in Task 17). `auth()` from `@clerk/nextjs/server` becomes usable in all editor route handlers. Web-issued session JWTs sent as `Authorization: Bearer <token>` are accepted (same Clerk instance).

- [ ] **Step 1: Install Clerk in the editor app**

Run: `cd apps/editor && bun add @clerk/nextjs`
Expected: `@clerk/nextjs` appears in `apps/editor/package.json` dependencies at the same major version as `apps/web` (^7.x).

- [ ] **Step 2: Create the middleware**

Create `apps/editor/proxy.ts` (Next 16: `proxy.ts`, not `middleware.ts`):

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === "/api/health") return;
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
};
```

- [ ] **Step 3: Document the env contract**

`apps/editor/.env.local.example` already lists `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`. Below them, add:

```bash
# Where unauthenticated users are sent (the web app's sign-in page)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=http://localhost:3000/sign-in
```

In `apps/editor/.env.railway.example`, under the Clerk section add:

```bash
# Editor runs on its own domain in prod → configure it as a Clerk satellite domain
# (Clerk Dashboard → Domains → add satellite). Primary domain is the web app.
NEXT_PUBLIC_CLERK_IS_SATELLITE=true
NEXT_PUBLIC_CLERK_DOMAIN=your-editor.up.railway.app
NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://your-web-app.example.com/sign-in
```

Also add both keys to your actual `apps/editor/.env.local` (same values as `apps/web/.env.local` — same Clerk instance).

- [ ] **Step 4: Type-check and verify the gate**

Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0.

Start dev (`bun dev` from repo root), then:

```bash
curl -i "http://localhost:3002/api/files?projectId=default"
```

Expected: **401** (or a redirect to sign-in), NOT a file listing. Then open `http://localhost:3002` in a browser while signed in to the web app on localhost:3000 — expected: editor loads (dev on localhost shares the Clerk dev instance cookie).

Also verify the Eve chat endpoint is gated: from the signed-out curl session, POST to the eve endpoint used by the chat (find it in the browser network tab while using the chat signed-in; it is served by the same Next server, so the matcher covers it). Expected: 401.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/package.json apps/editor/proxy.ts apps/editor/.env.local.example apps/editor/.env.railway.example bun.lock
git commit -m "feat(editor): require Clerk auth on all editor routes (C1)"
```

---

### Task 5: Editor authz library — `requireProject`, `apiError`, `projectDirFor` (foundation for C2/C3, M2)

**Files:**
- Create: `apps/editor/lib/authz.ts`
- Test: `apps/editor/lib/authz.test.ts`

**Interfaces:**
- Produces (used by Tasks 6, 8, 9, 10, 13):
  - `class ApiError extends Error { status: number }`
  - `requireProject(projectId: string | null): Promise<string>` — throws `ApiError(400/401/404)`; returns the validated projectId. `"default"` is allowed only outside production.
  - `apiError(err: unknown): Response` — maps `ApiError` to its status/message, everything else to a logged, generic 500.
  - `projectDirFor(projectId: string): string` — absolute local FS dir for local compile mode.
  - `getPool(): Pool` — lazy pg pool (editor already has `DATABASE_URL` and `pg` via the project/name route).

- [ ] **Step 1: Write the failing test**

Create `apps/editor/lib/authz.test.ts` (tests the pure parts; `requireProject`'s Clerk/DB path is exercised by integration verification in later tasks):

```ts
import { expect, test } from "bun:test";
import path from "path";
import { ApiError, apiError, projectDirFor, isUuid } from "./authz";

test("apiError maps ApiError to its status and message", async () => {
  const res = apiError(new ApiError(404, "Project not found"));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("Project not found");
});

test("apiError hides internal errors behind a generic 500", async () => {
  const res = apiError(new Error("ENOENT: /secret/host/path"));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toBe("Internal server error");
});

test("projectDirFor maps default to the sandbox and ids to projects/", () => {
  expect(projectDirFor("default")).toBe(path.join(process.cwd(), "my-new-project"));
  expect(projectDirFor("abc-123")).toBe(path.join(process.cwd(), "projects", "abc-123"));
});

test("isUuid accepts v4 uuids and rejects junk", () => {
  expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  expect(isUuid("../../../etc")).toBe(false);
  expect(isUuid("default")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/editor && bun test lib/authz.test.ts`
Expected: FAIL — module `./authz` does not exist.

- [ ] **Step 3: Implement**

Create `apps/editor/lib/authz.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { Pool } from "pg";
import path from "path";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

const globalForPool = globalThis as unknown as { authzPool?: Pool };
export function getPool(): Pool {
  if (!globalForPool.authzPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new ApiError(500, "Internal server error"); // DATABASE_URL missing — logged via apiError
    globalForPool.authzPool = new Pool({ connectionString: url, max: 5 });
  }
  return globalForPool.authzPool;
}

/**
 * Validates that the caller is signed in and owns projectId (via its workspace).
 * "default" (the local sandbox) is allowed only outside production.
 */
export async function requireProject(projectId: string | null | undefined): Promise<string> {
  if (!projectId) throw new ApiError(400, "Missing projectId");

  const { userId, orgId } = await auth();
  if (!userId) throw new ApiError(401, "Unauthorized");

  if (projectId === "default") {
    if (process.env.NODE_ENV !== "production") return projectId;
    throw new ApiError(404, "Project not found");
  }

  if (!isUuid(projectId)) throw new ApiError(404, "Project not found");

  const workspaceId = orgId || userId;
  const res = await getPool().query("SELECT workspace_id FROM projects WHERE id = $1", [projectId]);
  if (!res.rows[0] || res.rows[0].workspace_id !== workspaceId) {
    throw new ApiError(404, "Project not found");
  }
  return projectId;
}

/** Uniform error responder: known ApiErrors pass through, everything else is a logged generic 500. */
export function apiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api]", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** Local filesystem directory for a project (local/dev compile mode). */
export function projectDirFor(projectId: string): string {
  return projectId === "default"
    ? path.join(process.cwd(), "my-new-project")
    : path.join(process.cwd(), "projects", projectId);
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/editor && bun test lib/authz.test.ts` — Expected: 4 pass.
Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/lib/authz.ts apps/editor/lib/authz.test.ts
git commit -m "feat(editor): add requireProject ownership check and uniform API error helper"
```

---

## Phase C — Kill global project state, add per-request projectId (C2, C3)

> Ordering note: Tasks 6–10 change editor API contracts; Task 12 updates the editor frontend to match. Between Task 6 and Task 12 the editor UI is partially broken in dev — that is expected mid-phase. Land the whole phase before deploying anywhere.

### Task 6: `/api/files` takes explicit projectId; remove the project-switch endpoint

**Files:**
- Modify: `apps/editor/app/api/files/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `requireProject`, `apiError` from `apps/editor/lib/authz.ts` (Task 5).
- Produces: `GET /api/files?projectId=X[&path=Y]` (list tree / read file), `POST /api/files` with JSON body `{ projectId, action: "create"|"save"|"move"|"delete", ... }`. The `{path}` project-switch branch and the main.tex seeding branch are **deleted** (seeding moves to web `createProject`, Task 7). The GET list response becomes `{ tree }` (no more `projectPath`).

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `apps/editor/app/api/files/route.ts` with:

```ts
import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { NextRequest } from "next/server";

const IMAGE_MIME: Record<string, string> = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    const filePath = searchParams.get("path");

    if (filePath) {
      const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
      const imageMime = IMAGE_MIME[ext];

      if (filePath.endsWith(".pdf")) {
        const buffer = await storage.readBinaryFile(projectId, filePath);
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": buffer.length.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      }

      if (imageMime) {
        const buffer = await storage.readBinaryFile(projectId, filePath);
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": imageMime,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "no-store",
          },
        });
      }

      const content = await storage.readFile(projectId, filePath);
      return Response.json({ content });
    }

    const tree = await storage.listProjectFiles(projectId);
    return Response.json({ tree });
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.message?.includes("ENOENT") || error?.name === "NoSuchKey") {
      return apiError(new ApiError(404, "File not found"));
    }
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = await requireProject(body.projectId);

    if (body.action === "create") {
      if (body.isDir) {
        await storage.createDirectory(projectId, body.path);
      } else {
        await storage.writeFile(projectId, body.path, "");
      }
      return Response.json({ success: true });
    }

    if (body.action === "save") {
      if (typeof body.path !== "string" || typeof body.content !== "string") {
        throw new ApiError(400, "Missing path or content");
      }
      await storage.writeFile(projectId, body.path, body.content);
      return Response.json({ success: true });
    }

    if (body.action === "move") {
      await storage.move(projectId, body.oldPath, body.newPath);
      return Response.json({ success: true });
    }

    if (body.action === "delete") {
      await storage.delete(projectId, body.path);
      return Response.json({ success: true });
    }

    throw new ApiError(400, "Invalid action");
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0. (`lib/project.ts` still exists for the not-yet-migrated routes; it is deleted in Task 13.)

- [ ] **Step 3: Verify with curl (signed-in session required)**

Grab a session cookie from the browser devtools (any request to localhost:3002 while signed in) or test via the browser after Task 12. Minimum check now — unauthenticated is still blocked:

```bash
curl -i "http://localhost:3002/api/files?projectId=default"   # → 401
```

- [ ] **Step 4: Commit**

```bash
git add apps/editor/app/api/files/route.ts
git commit -m "feat(editor): files API takes explicit ownership-checked projectId (C2)"
```

---

### Task 7: Web `createProject` seeds main.tex through the editor API

**Files:**
- Create: `apps/web/lib/editor-api.ts`
- Modify: `apps/web/app/dashboard/actions.ts:61-82` (`createProject`)

**Interfaces:**
- Consumes: editor `POST /api/files {projectId, action:"save", path, content}` (Task 6); Clerk Bearer-token acceptance in editor middleware (Task 4).
- Produces: `editorFetch(path: string, init?: RequestInit): Promise<Response>` — server-side fetch to the editor with the caller's Clerk session token attached. Used again in Tasks 10 verification and 11.

- [ ] **Step 1: Create the authenticated editor fetch helper**

Create `apps/web/lib/editor-api.ts`:

```ts
import { auth } from "@clerk/nextjs/server";

const EDITOR_BASE =
  process.env.EDITOR_URL || process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002";

/** Server-side fetch to the editor service, authenticated as the current user. */
export async function editorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  return fetch(`${EDITOR_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
```

- [ ] **Step 2: Seed main.tex on project creation**

In `apps/web/app/dashboard/actions.ts`, add the import and a template constant at module scope:

```ts
import { editorFetch } from "@/lib/editor-api";

const DEFAULT_MAIN_TEX = `\\documentclass[11pt, a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{\\textbf{New LaTeX Project}}
\\author{Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to your new LaTeX project! Describe what you want the AI assistant to write or edit, and click compile to generate a preview.

\\end{document}
`;
```

Rewrite `createProject`'s insert to capture the row and seed it:

```ts
  const [project] = await db
    .insert(projects)
    .values({ name: name.trim(), workspaceId })
    .returning();

  if (!project) throw new Error("Failed to create project");

  const res = await editorFetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      action: "save",
      path: "main.tex",
      content: DEFAULT_MAIN_TEX,
    }),
  });

  if (!res.ok) {
    await db.delete(projects).where(eq(projects.id, project.id));
    throw new Error("Failed to initialize project files");
  }

  revalidatePath("/dashboard");
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bun x tsc --noEmit` — Expected: exit 0.

- [ ] **Step 4: Verify end-to-end**

With both apps running and signed in: create a project from the dashboard. Expected: it appears in the list, and the storage backend now contains `projects/<uuid>/main.tex` (local: `apps/editor/projects/<uuid>/main.tex`; S3: check the bucket console). This proves the web→editor Bearer-token path works through the new middleware.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/editor-api.ts apps/web/app/dashboard/actions.ts
git commit -m "feat(web): seed main.tex via authenticated editor API on project create"
```

---

### Task 8: `/api/compile` and `/api/synctex` take projectId; attach compiler secret

**Files:**
- Modify: `apps/editor/app/api/compile/route.ts:50-97` (request parsing + local branch), `:155-190` (compiler fetches)
- Modify: `apps/editor/app/api/synctex/route.ts` (full rewrite)
- Modify: `apps/editor/.env.local.example`, `apps/editor/.env.railway.example` (add `COMPILER_SECRET`)

**Interfaces:**
- Consumes: `requireProject`, `apiError`, `projectDirFor` (Task 5).
- Produces: `POST /api/compile {projectId, path, draftMode}` and `POST /api/synctex {projectId, path}`. All fetches to the compiler carry `Authorization: Bearer ${process.env.COMPILER_SECRET}` (enforced compiler-side in Task 14). The differential-sync logic in compile is unchanged.

- [ ] **Step 1: Rewrite compile request handling**

In `apps/editor/app/api/compile/route.ts`, replace the imports of `getProjectPath, getProjectIdFromPath` with:

```ts
import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
```

Replace the top of the `POST` handler (lines 51-63) with:

```ts
    const { projectId: rawProjectId, path: fileRelativePath, draftMode } = await req.json();
    const isDraft = draftMode ?? true;
    if (!fileRelativePath) throw new ApiError(400, "Path parameter is required");
    if (!fileRelativePath.endsWith(".tex")) throw new ApiError(400, "Only .tex files can be compiled");

    const projectId = await requireProject(rawProjectId);
    const projectPath = projectDirFor(projectId);
```

Add a shared header constant right after the `compilerUrl` declaration:

```ts
    const compilerHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(process.env.COMPILER_SECRET
        ? { Authorization: `Bearer ${process.env.COMPILER_SECRET}` }
        : {}),
    };
```

Replace `headers: { "Content-Type": "application/json" }` with `headers: compilerHeaders` in **all three** compiler fetches (local-mode fetch ~line 75, upload fetch ~line 155, full-sync retry fetch ~line 175). In the local-mode fetch also add `signal: req.signal` so client disconnects propagate (pairs with the compiler-side kill in Task 14):

```ts
      const response = await fetch(`${compilerUrl}/compile`, {
        method: "POST",
        headers: compilerHeaders,
        signal: req.signal,
        body: JSON.stringify({
          mode: "local",
          localProjectPath: projectPath,
          fileRelativePath,
          draft: isDraft,
        }),
      });
```

Finally, change the catch block at the bottom of the handler to `return apiError(error);`.

- [ ] **Step 2: Rewrite synctex route**

Replace the entire contents of `apps/editor/app/api/synctex/route.ts` with:

```ts
import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { projectId: rawProjectId, path: fileRelativePath } = await req.json();
    if (!fileRelativePath) throw new ApiError(400, "Path parameter is required");

    const projectId = await requireProject(rawProjectId);
    const projectPath = projectDirFor(projectId);

    const compilerUrl = process.env.COMPILER_URL || "http://127.0.0.1:3001";
    const defaultMode =
      compilerUrl.includes("localhost") ||
      compilerUrl.includes("127.0.0.1") ||
      compilerUrl.includes("0.0.0.0")
        ? "local"
        : "upload";
    const compilerMode = process.env.COMPILER_MODE || defaultMode;

    const response = await fetch(`${compilerUrl}/synctex`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.COMPILER_SECRET
          ? { Authorization: `Bearer ${process.env.COMPILER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        mode: compilerMode,
        localProjectPath: projectPath,
        projectId,
        fileRelativePath,
      }),
    });

    if (!response.ok) {
      throw new ApiError(response.status, "Failed to parse SyncTeX from compiler");
    }

    return Response.json(await response.json());
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 3: Document COMPILER_SECRET**

Add to both `apps/editor/.env.local.example` and `apps/editor/.env.railway.example` (compiler section):

```bash
# Shared secret between editor and compiler service (compiler rejects requests without it)
COMPILER_SECRET=generate-a-long-random-string
```

- [ ] **Step 4: Type-check and commit**

Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0.

```bash
git add apps/editor/app/api/compile/route.ts apps/editor/app/api/synctex/route.ts apps/editor/.env.local.example apps/editor/.env.railway.example
git commit -m "feat(editor): compile/synctex take ownership-checked projectId, sign compiler requests"
```

---

### Task 9: `/api/search` takes projectId + ReDoS hardening (H3)

**Files:**
- Create: `apps/editor/lib/search-pattern.ts`
- Test: `apps/editor/lib/search-pattern.test.ts`
- Modify: `apps/editor/app/api/search/route.ts`
- Modify: `apps/editor/package.json` (add `safe-regex2`)

**Interfaces:**
- Consumes: `requireProject`, `apiError` (Task 5).
- Produces: `buildSearchPattern(query: string, opts: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean }): RegExp` — throws `ApiError(400)` on over-long or unsafe patterns. `GET /api/search?projectId=X&...` and `POST /api/search {projectId, ...}`. Results capped at 2000 matches.

- [ ] **Step 1: Install safe-regex2**

Run: `cd apps/editor && bun add safe-regex2`

- [ ] **Step 2: Write the failing test**

Create `apps/editor/lib/search-pattern.test.ts`:

```ts
import { expect, test } from "bun:test";
import { buildSearchPattern } from "./search-pattern";
import { ApiError } from "./authz";

const opts = { matchCase: false, matchWholeWord: false, useRegex: false };

test("literal queries are escaped", () => {
  const re = buildSearchPattern("a.b(c)", opts);
  expect(re.test("a.b(c)")).toBe(true);
  expect(re.test("axb(c)")).toBe(false);
});

test("whole-word wraps with boundaries", () => {
  const re = buildSearchPattern("cat", { ...opts, matchWholeWord: true });
  expect(re.test("the cat sat")).toBe(true);
  expect(re.test("concatenate")).toBe(false);
});

test("rejects catastrophic-backtracking regex", () => {
  expect(() => buildSearchPattern("(a+)+$", { ...opts, useRegex: true })).toThrow(ApiError);
});

test("rejects over-long queries", () => {
  expect(() => buildSearchPattern("a".repeat(600), opts)).toThrow(ApiError);
});

test("rejects invalid regex with a 400, not a crash", () => {
  expect(() => buildSearchPattern("([", { ...opts, useRegex: true })).toThrow(ApiError);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/editor && bun test lib/search-pattern.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

Create `apps/editor/lib/search-pattern.ts`:

```ts
import safeRegex from "safe-regex2";
import { ApiError } from "./authz";

const MAX_QUERY_LENGTH = 512;

/**
 * Builds the search RegExp shared by search GET and replace POST.
 * ponytail: safe-regex2 is a heuristic (star-height) ReDoS screen; swap for RE2 if it ever misses in practice.
 */
export function buildSearchPattern(
  query: string,
  opts: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean }
): RegExp {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ApiError(400, `Query too long (max ${MAX_QUERY_LENGTH} characters)`);
  }

  let flags = "g";
  if (!opts.matchCase) flags += "i";

  if (opts.useRegex) {
    if (!safeRegex(query)) {
      throw new ApiError(400, "Pattern too complex");
    }
    try {
      return new RegExp(query, flags);
    } catch {
      throw new ApiError(400, "Invalid regular expression");
    }
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(opts.matchWholeWord ? `\\b${escaped}\\b` : escaped, flags);
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/editor && bun test lib/search-pattern.test.ts` — Expected: 5 pass.

- [ ] **Step 6: Rewire the search route**

In `apps/editor/app/api/search/route.ts`:

Replace the `getProjectPath`/`getProjectIdFromPath` import with:

```ts
import { requireProject, apiError } from "@/lib/authz";
import { buildSearchPattern } from "@/lib/search-pattern";
```

In `GET`: replace the two project lines with

```ts
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
```

(keep the rest of the param parsing), then **hoist the pattern out of the per-line loop**. Before `const files = await storage.listProjectFiles(projectId);` add:

```ts
    const pattern = buildSearchPattern(query, { matchCase, matchWholeWord, useRegex });
    const MAX_RESULTS = 2000;
```

Replace the entire `if (useRegex) { ... } else { ... }` per-line block inside `lines.forEach` with a single implementation using the prebuilt pattern:

```ts
              pattern.lastIndex = 0;
              let match = pattern.exec(lineText);
              while (match !== null && results.length < MAX_RESULTS) {
                results.push({
                  fileId: node.path,
                  fileName: node.name,
                  line: lineNum,
                  text: lineText,
                  matchIndex: match.index,
                });
                if (match[0].length === 0) pattern.lastIndex++;
                match = pattern.exec(lineText);
              }
```

And short-circuit the traversal when full — at the top of the `traverse` file branch add `if (results.length >= MAX_RESULTS) return;`.

In `POST`: replace the project lines with `const projectId = await requireProject(body.projectId);`, delete the inline pattern-building block (lines 162-175), and use:

```ts
    const pattern = buildSearchPattern(query, { matchCase, matchWholeWord, useRegex });
```

Change both catch blocks to `return apiError(error);`.

- [ ] **Step 7: Run all editor tests + type-check**

Run: `cd apps/editor && bun test && bun x tsc --noEmit` — Expected: all pass, exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/editor/lib/search-pattern.ts apps/editor/lib/search-pattern.test.ts apps/editor/app/api/search/route.ts apps/editor/package.json bun.lock
git commit -m "feat(editor): search takes projectId; bound query length, screen ReDoS patterns, cap results"
```

---

### Task 10: Project routes — ownership (C3), zip limits (H4), delete web project-info (M1)

**Files:**
- Create: `apps/editor/lib/zip.ts`
- Test: `apps/editor/lib/zip.test.ts`
- Modify: `apps/editor/app/api/project/import/route.ts`, `.../export/route.ts`, `.../delete/route.ts`, `.../name/route.ts`
- Delete: `apps/web/app/api/project-info/route.ts`

**Interfaces:**
- Consumes: `requireProject`, `apiError`, `ApiError`, `getPool` (Task 5). Import/delete are called by web server actions with a Bearer token (Tasks 7/11), so `auth()` resolves the acting user there too.
- Produces: `safeZipPath(name: string): string | null` in `lib/zip.ts` plus exported limit constants. All four project routes require ownership. `GET /api/project/name?projectId=X` now answers from the DB directly (web fallback deleted).

- [ ] **Step 1: Write the failing zip test**

Create `apps/editor/lib/zip.test.ts`:

```ts
import { expect, test } from "bun:test";
import { safeZipPath } from "./zip";

test("normalizes and accepts plain relative paths", () => {
  expect(safeZipPath("sections/intro.tex")).toBe("sections/intro.tex");
  expect(safeZipPath("./figure.png")).toBe("figure.png");
});

test("rejects traversal, absolute, and backslash paths", () => {
  expect(safeZipPath("a/../../b.tex")).toBe(null);
  expect(safeZipPath("../evil.tex")).toBe(null);
  expect(safeZipPath("/etc/passwd")).toBe(null);
  expect(safeZipPath("a\\b.tex")).toBe(null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/editor && bun test lib/zip.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement lib/zip.ts**

```ts
import path from "path";

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_FILE_BYTES = 50 * 1024 * 1024;   // 50 MB per entry, decompressed
export const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB total, decompressed
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;    // 100 MB compressed upload

/** Returns the normalized safe relative path, or null if the entry must be rejected. */
export function safeZipPath(name: string): string | null {
  if (name.includes("\\")) return null;
  const norm = path.posix.normalize(name);
  if (norm.startsWith("..") || path.posix.isAbsolute(norm) || norm === "." || norm === "") return null;
  return norm;
}
```

Run: `cd apps/editor && bun test lib/zip.test.ts` — Expected: 2 pass.

- [ ] **Step 4: Rewrite import route**

Replace the contents of `apps/editor/app/api/project/import/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { safeZipPath, MAX_ZIP_ENTRIES, MAX_ZIP_FILE_BYTES, MAX_ZIP_TOTAL_BYTES, MAX_UPLOAD_BYTES } from "@/lib/zip";
import JSZip from "jszip";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = await requireProject(formData.get("projectId") as string | null);
    const file = formData.get("file") as File | null;

    if (!file) throw new ApiError(400, "Missing zip file");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Upload too large");

    const loadedZip = await new JSZip().loadAsync(Buffer.from(await file.arrayBuffer()));

    const entries = Object.entries(loadedZip.files);
    if (entries.length > MAX_ZIP_ENTRIES) throw new ApiError(413, "Archive has too many entries");

    let totalBytes = 0;
    for (const [relativePath, zipEntry] of entries) {
      if (relativePath.startsWith("__MACOSX") || relativePath.includes(".DS_Store")) continue;
      const safePath = safeZipPath(relativePath);
      if (!safePath) continue;

      if (zipEntry.dir) {
        await storage.createDirectory(projectId, safePath);
        continue;
      }

      const fileContent = await zipEntry.async("nodebuffer");
      if (fileContent.length > MAX_ZIP_FILE_BYTES) throw new ApiError(413, "Archive entry too large");
      totalBytes += fileContent.length;
      if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new ApiError(413, "Archive too large when decompressed");

      await storage.writeFile(projectId, safePath, fileContent);
    }

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 5: Add ownership to export and delete routes**

`apps/editor/app/api/project/export/route.ts` — replace the top of `GET`:

```ts
import { requireProject, apiError, ApiError } from "@/lib/authz";
```

```ts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    const type = searchParams.get("type"); // "pdf" | "zip"
```

Wrap the existing pdf/zip logic in this try, change the final `return Response.json({ error: "Invalid type parameter" }, ...)` to `throw new ApiError(400, "Invalid type parameter")`, and change the catch to `return apiError(error);`. Keep the inner pdf-not-found 404 as is (it already returns a clean message).

`apps/editor/app/api/project/delete/route.ts` — replace contents with:

```ts
import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    const { projectId: rawProjectId } = await req.json();
    const projectId = await requireProject(rawProjectId);
    await storage.delete(projectId, "");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 6: Rewrite name route (drop the web fallback), delete project-info**

Replace `apps/editor/app/api/project/name/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { requireProject, apiError, getPool } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));

    if (projectId === "default") {
      return Response.json({ name: "Local Sandbox" });
    }

    const result = await getPool().query("SELECT name FROM projects WHERE id = $1", [projectId]);
    if (result.rows.length === 0) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    return Response.json({ name: result.rows[0].name });
  } catch (error) {
    return apiError(error);
  }
}
```

Delete the now-unreferenced web route:

```bash
git rm apps/web/app/api/project-info/route.ts
```

- [ ] **Step 7: Tests, type-check, commit**

Run: `cd apps/editor && bun test && bun x tsc --noEmit` — Expected: pass.
Run: `cd apps/web && bun x tsc --noEmit` — Expected: exit 0 (nothing imported project-info).

```bash
git add apps/editor/lib/zip.ts apps/editor/lib/zip.test.ts apps/editor/app/api/project
git commit -m "feat(editor): ownership checks on project routes, zip import limits, remove public project-info (C3, H4, M1)"
```

---

### Task 11: Web actions — Bearer auth to editor, safe delete order, export proxy

**Files:**
- Modify: `apps/web/app/dashboard/actions.ts` (`importProject`, `deleteProject`)
- Create: `apps/web/app/api/project/export/route.ts`
- Modify: `apps/web/components/tables-01.tsx:109`

**Interfaces:**
- Consumes: `editorFetch` (Task 7); editor project routes (Task 10).
- Produces: `GET /api/project/export?projectId=X&type=pdf|zip` on the **web** app — ownership-checked, streams from the editor. Dashboard download buttons use this same-origin URL (fixes cross-origin cookie loss against the locked-down editor).

- [ ] **Step 1: importProject uses editorFetch**

In `importProject`, replace the raw `fetch(`${editorUrl}/api/project/import`, ...)` block with:

```ts
    const editorFormData = new FormData();
    editorFormData.append("projectId", project.id);
    editorFormData.append("file", file);

    const res = await editorFetch("/api/project/import", {
      method: "POST",
      body: editorFormData,
    });
```

(keep the existing ok-check/cleanup logic; delete the now-unused `editorUrl` const).

- [ ] **Step 2: deleteProject — files first (while the DB row still exists for the ownership check), then DB row**

Replace the body of `deleteProject` after the auth check with:

```ts
  const workspaceId = orgId || userId;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new Error("Project not found");

  // Delete files first: the editor's ownership check needs the DB row to still exist.
  // If the editor is unreachable we still remove the row; orphaned storage is
  // reclaimed manually (see docs/ops-checklist.md).
  try {
    const res = await editorFetch("/api/project/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      console.error("Editor file deletion failed:", await res.text());
    }
  } catch (error) {
    console.error("Error calling editor service to delete project files:", error);
  }

  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));

  revalidatePath("/dashboard");
```

- [ ] **Step 3: Export proxy route on web**

Create `apps/web/app/api/project/export/route.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { editorFetch } from "@/lib/editor-api";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type");
  if (!projectId || (type !== "pdf" && type !== "zip")) {
    return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const workspaceId = orgId || userId;
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const upstream = await editorFetch(
    `/api/project/export?projectId=${encodeURIComponent(projectId)}&type=${type}`
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        upstream.headers.get("Content-Disposition") ?? `attachment; filename="project.${type}"`,
    },
  });
}
```

- [ ] **Step 4: Point the dashboard download at the proxy**

In `apps/web/components/tables-01.tsx:109`, change:

```ts
      const url = `/api/project/export?projectId=${projectId}&type=${type}`;
```

(The "Open in editor" link at line 213 stays pointed at the editor origin — interactive navigation authenticates via the Clerk satellite-domain flow.)

- [ ] **Step 5: Type-check + verify**

Run: `cd apps/web && bun x tsc --noEmit` — Expected: exit 0.

Signed in, from the dashboard: import a small zip, download it back as zip, delete the project. All three must succeed; a second user must get "Project not found" for the same ids.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/actions.ts apps/web/app/api/project/export/route.ts apps/web/components/tables-01.tsx
git commit -m "feat(web): authenticated editor calls, ownership-safe delete order, same-origin export proxy"
```

---

### Task 12: Editor frontend — thread projectId through every API call

**Files:**
- Modify: `apps/editor/app/page.tsx` (all `/api/*` call sites; remove path-switch UI)
- Modify: `apps/editor/components/editor/search-panel.tsx:99`
- Modify: `apps/editor/components/editor/image-viewer.tsx:14`

**Interfaces:**
- Consumes: the new API contracts from Tasks 6, 8, 9, 10.
- Produces: the whole editor UI operates on `?projectId=<uuid>` from the URL (falling back to `"default"` for the local sandbox). No API call relies on server-side project state.

- [ ] **Step 1: Establish projectId + URL helper in page.tsx**

Near the top of the main component in `apps/editor/app/page.tsx` (it is a client component), add:

```ts
  // Single source of truth for the active project — from the URL, set by the dashboard link.
  const [projectId] = useState<string>(() => {
    if (typeof window === "undefined") return "default";
    return new URLSearchParams(window.location.search).get("projectId") ?? "default";
  });

  const withProject = useCallback(
    (url: string) => `${url}${url.includes("?") ? "&" : "?"}projectId=${encodeURIComponent(projectId)}`,
    [projectId]
  );
```

- [ ] **Step 2: Convert every GET/url call site**

Wrap each GET URL with `withProject(...)`. Exact sites (line numbers from the pre-change file):

- `page.tsx:863` file fetch URL → `withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`)`
- `page.tsx:877` preview existence check → `withProject(...)`
- `page.tsx:880` and `:1172` `setPdfUrl(...)` → `withProject(...)`
- `page.tsx:891`, `:1193` file reads → `withProject(...)`
- `page.tsx:907` tree load `fetch("/api/files")` → `fetch(withProject("/api/files"))`
- `page.tsx:1338` name fetch → `fetch(withProject("/api/project/name"))` (drop the manual `?projectId=` it builds today)

- [ ] **Step 3: Convert every POST body**

Add `projectId` to the JSON body of each POST. Exact sites: `page.tsx:611` (`/api/synctex`), `:838`, `:962`, `:1005`, `:1022`, `:1042`, `:1072`, `:1116`, `:1213`, `:1249` (`/api/files` actions), `:927` (`/api/search` replace), `:1125` (`/api/compile`). Pattern:

```ts
      body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: value }),
```

- [ ] **Step 4: Remove the project-switch flow**

Delete the `projectPathInput` state (line 423), the effect/handler that POSTs `{ path: projectPathInput }` (lines ~962-977), the `?projectId → targetPath` mount logic (lines ~1206-1213 — replace with a plain `refreshWorkspace()` on mount), the `data.projectPath` handling (lines ~912-913), and any input UI bound to `projectPathInput`. The project-name effect (lines ~1336-1354) simplifies to the single `withProject("/api/project/name")` fetch with its existing fallback to showing `projectId`.

- [ ] **Step 5: search-panel and image-viewer read projectId from the URL**

Both are client components rendered inside the same page, so the URL param is available directly.

`apps/editor/components/editor/search-panel.tsx` — above the fetch at line 99:

```ts
    const projectId =
      new URLSearchParams(window.location.search).get("projectId") ?? "default";
    params.set("projectId", projectId);
```

`apps/editor/components/editor/image-viewer.tsx:14`:

```ts
  const projectId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("projectId") ?? "default"
      : "default";
  const src = `/api/files?path=${encodeURIComponent(path)}&projectId=${encodeURIComponent(projectId)}&t=${Date.now()}`;
```

- [ ] **Step 6: Type-check and full manual pass**

Run: `cd apps/editor && bun x tsc --noEmit` — Expected: exit 0.

Signed in, from the dashboard, open a project. Verify each flow end-to-end: file tree loads, open/edit/save a file, create a file and a folder, rename (move), delete a file, compile and see the PDF, click the PDF for synctex jump, search and replace-all, project name shows in the toolbar. Then open `http://localhost:3002/` with no `projectId` — the local sandbox (`my-new-project`) loads in dev.

- [ ] **Step 7: Commit**

```bash
git add apps/editor/app/page.tsx apps/editor/components/editor/search-panel.tsx apps/editor/components/editor/image-viewer.tsx
git commit -m "feat(editor): thread explicit projectId through all frontend API calls (C2)"
```

---

### Task 13: Eve agent tools — per-request projectId + ownership; delete lib/project.ts

**Files:**
- Modify: `apps/editor/agent/tools/read-file.ts`, `write-file.ts`, `list-files.ts`
- Modify: `apps/editor/hooks/use-eve-runtime.ts` (+ its call site in `apps/editor/components/chat/eve-thread.tsx` / `page.tsx` to pass `projectId` down)
- Delete: `apps/editor/lib/project.ts`

**Interfaces:**
- Consumes: `requireProject` (Task 5). The Clerk middleware (Task 4) already gates the Eve HTTP endpoints; the tool-level check is the per-project boundary.
- Produces: all three tools take `projectId` in their input schema and validate ownership server-side before touching storage. The model learns the projectId from a context marker prepended to outgoing user messages.

- [ ] **Step 1: Rewrite the tools**

`apps/editor/agent/tools/read-file.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireProject } from "../../lib/authz";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Reads the content of any file in the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ projectId, path: filePath }) {
    try {
      const pid = await requireProject(projectId);
      return await storage.readFile(pid, filePath);
    } catch (e: any) {
      return `Error reading file at ${filePath}: ${e.message}`;
    }
  },
});
```

`write-file.ts` — same shape (keep `approval: always()`):

```ts
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { requireProject } from "../../lib/authz";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Writes or updates the content of a file in the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
    content: z.string().describe("The complete file content to write"),
  }),
  approval: always(),
  async execute({ projectId, path: filePath, content }) {
    try {
      const pid = await requireProject(projectId);
      await storage.writeFile(pid, filePath, content);
      return `Successfully updated file: ${filePath}`;
    } catch (e: any) {
      return `Error writing file at ${filePath}: ${e.message}`;
    }
  },
});
```

`list-files.ts` — replace the `getProjectPath()/getProjectIdFromPath()` pair with `projectId` input + `const pid = await requireProject(projectId);` and `storage.listProjectFiles(pid)`; add the same `projectId` field to its (currently empty) input schema. Keep the flatten/format logic unchanged.

- [ ] **Step 2: Prepend the context marker to outgoing chat messages**

In `apps/editor/hooks/use-eve-runtime.ts`, change the signature to `useEveRuntime(threadId: string, projectId: string)`. Locate the append/onNew handler where the user's text is sent to the agent (the `AppendMessage` → `agent.sendMessage(...)` path). Prepend the marker to the outgoing text:

```ts
      const outgoing = `[projectId: ${projectId}]\n${text}`;
```

Update the call site (`eve-thread.tsx`, and `page.tsx` where `EveThread` is rendered) to pass `projectId` down as a prop from the page's `projectId` state (Task 12 Step 1).

If a system-prompt string exists in the runtime (search `apps/editor` for where the Eve system prompt is defined, per CLAUDE.md "Update Eve system prompt in the runtime"), append one line: `Always pass the projectId from the [projectId: ...] context marker to every tool call.`

- [ ] **Step 3: Delete lib/project.ts**

```bash
grep -rn "lib/project" apps/editor --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v .eve
```

Expected: no remaining imports (Tasks 6-12 removed them all). Then:

```bash
git rm apps/editor/lib/project.ts
```

- [ ] **Step 4: Type-check and verify**

Run: `cd apps/editor && bun test && bun x tsc --noEmit` — Expected: pass.

In the running app (signed in, project open): ask Eve "list the files in this project". Expected: the tool call includes the correct projectId and returns the file list. Then sign out, hit the Eve endpoint with curl — expected 401 (middleware).

**Decision point:** if `requireProject` throws `auth() was called outside a request context` inside tool execution (i.e., the Eve runtime executes tools outside Next's request scope), keep the tools' projectId validation as a pure UUID/format check and rely on the middleware gate for identity; record this in the ops checklist as "Eve per-project authz pending eve request-context support" and surface it in the task report.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/agent/tools apps/editor/hooks/use-eve-runtime.ts apps/editor/components/chat/eve-thread.tsx apps/editor/app/page.tsx
git rm apps/editor/lib/project.ts
git commit -m "feat(eve): project-scoped, ownership-checked agent tools; remove global project state (C2)"
```

---

## Phase D — Compiler hardening (C4)

### Task 14: Compiler auth, local-mode gate, synctex guards, untrusted Tectonic, abort handling

**Files:**
- Modify: `apps/compiler/index.ts`
- Modify: `apps/editor/.env.railway.example` (compiler service section note)

**Interfaces:**
- Consumes: editor sends `Authorization: Bearer $COMPILER_SECRET` (Task 8).
- Produces: `/compile` and `/synctex` return 401 without the secret (when set), 403 for `mode:"local"` unless explicitly allowed; tectonic runs with `TECTONIC_UNTRUSTED_MODE=1`; children are killed on client abort; dead `compilationCache` code is deleted.

- [ ] **Step 1: Add the auth + mode gates**

In `apps/compiler/index.ts`, add near the top (after `const PORT`):

```ts
const COMPILER_SECRET = process.env.COMPILER_SECRET;
// Local mode reads arbitrary caller-supplied filesystem paths — dev only unless explicitly enabled.
const ALLOW_LOCAL = process.env.ALLOW_LOCAL_COMPILE === "true" || process.env.NODE_ENV !== "production";
if (!COMPILER_SECRET) {
  console.warn("[SECURITY] COMPILER_SECRET is not set — compiler accepts unauthenticated requests. Set it in production.");
}
```

At the top of the `fetch(req)` handler, right after the `/health` check:

```ts
    if (COMPILER_SECRET && req.headers.get("authorization") !== `Bearer ${COMPILER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
```

- [ ] **Step 2: Guard the synctex route (both modes)**

Replace the synctex path resolution (lines 142-148) with:

```ts
        let synctexPath = "";
        if (mode === "local") {
          if (!ALLOW_LOCAL) return Response.json({ error: "local mode disabled" }, { status: 403 });
          const base = path.resolve(localProjectPath);
          synctexPath = path.resolve(base, fileRelativePath.replace(/\.tex$/, ".synctex.gz"));
          const rel = path.relative(base, synctexPath);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }
        } else {
          const workspacesDir = path.resolve(process.cwd(), "workspaces");
          synctexPath = path.resolve(workspacesDir, projectId, fileRelativePath.replace(/\.tex$/, ".synctex.gz"));
          const rel = path.relative(workspacesDir, synctexPath);
          if (rel.startsWith("..") || path.isAbsolute(rel) || !rel.includes(path.sep)) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }
        }
```

- [ ] **Step 3: Gate compile local mode + kill children on abort + untrusted tectonic**

In the `/compile` handler, at the start of the `mode === "local"` branch add:

```ts
          if (!ALLOW_LOCAL) {
            return Response.json({ error: "local mode disabled" }, { status: 403 });
          }
```

In **both** `runTectonic` and `runTectonicUpload`, change the spawn to run untrusted and track the child for abort:

```ts
              const child = spawn("tectonic", args, {
                cwd: localProjectPath, // (projectDir in runTectonicUpload)
                env: { ...process.env, TECTONIC_UNTRUSTED_MODE: "1" },
              });
              const onAbort = () => child.kill();
              req.signal.addEventListener("abort", onAbort);
              child.on("close", (code) => {
                req.signal.removeEventListener("abort", onAbort);
                resolve(code ?? -1);
              });
```

(merge with the existing `close` handler — keep the single `resolve(code ?? -1)`).

- [ ] **Step 4: Delete the dead compilation cache**

`cacheKey` is hardcoded to `""` (line 302), so the cache never hits. Delete: the `CacheEntry` interface, `compilationCache` map, its cleanup `setInterval` (lines 8-24), the `let cacheKey = ""` line, and the `if (cacheKey) { ... }` block after a successful compile (lines 364-377). Also remove the now-unused `crypto` import if nothing else uses it.

- [ ] **Step 5: Verify**

Restart the compiler with a secret: `cd apps/compiler && COMPILER_SECRET=testsecret bun index.ts`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health                      # 200 (health stays open)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/compile -d '{}'     # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/compile \
  -H "Authorization: Bearer testsecret" -H "Content-Type: application/json" \
  -d '{"mode":"local","localProjectPath":"/","fileRelativePath":"etc/passwd"}'
# With NODE_ENV=production set: 403 (local mode disabled)
```

Then set `COMPILER_SECRET=testsecret` in `apps/editor/.env.local`, restart the editor, and compile a project through the UI — expected: still works.

- [ ] **Step 6: Commit**

```bash
git add apps/compiler/index.ts apps/editor/.env.railway.example
git commit -m "feat(compiler): shared-secret auth, local-mode gate, synctex traversal guards, untrusted tectonic, abort cleanup (C4)"
```

---

## Phase E — Rate limiting and ops

### Task 15: In-memory rate limiter on compile/search/import (H2)

**Files:**
- Create: `apps/editor/lib/rate-limit.ts`
- Test: `apps/editor/lib/rate-limit.test.ts`
- Modify: `apps/editor/app/api/compile/route.ts`, `apps/editor/app/api/search/route.ts`, `apps/editor/app/api/project/import/route.ts` (one guard line each)

**Interfaces:**
- Produces: `rateLimit(key: string, limit: number, windowMs: number): boolean` — token bucket, true = allowed. `checkRate(bucket: string, limit: number, windowMs: number): Promise<void>` — resolves userId via Clerk and throws `ApiError(429)` when exhausted.

- [ ] **Step 1: Write the failing test**

Create `apps/editor/lib/rate-limit.test.ts`:

```ts
import { expect, test } from "bun:test";
import { rateLimit } from "./rate-limit";

test("allows up to the limit then blocks", () => {
  for (let i = 0; i < 5; i++) expect(rateLimit("t1", 5, 60_000)).toBe(true);
  expect(rateLimit("t1", 5, 60_000)).toBe(false);
});

test("keys are independent", () => {
  expect(rateLimit("t2-a", 1, 60_000)).toBe(true);
  expect(rateLimit("t2-b", 1, 60_000)).toBe(true);
  expect(rateLimit("t2-a", 1, 60_000)).toBe(false);
});

test("refills over time", () => {
  expect(rateLimit("t3", 1, 100)).toBe(true);
  expect(rateLimit("t3", 1, 100)).toBe(false);
  Bun.sleepSync(150);
  expect(rateLimit("t3", 1, 100)).toBe(true);
});
```

Run: `cd apps/editor && bun test lib/rate-limit.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement**

Create `apps/editor/lib/rate-limit.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { ApiError } from "./authz";

// ponytail: in-memory, per-instance token bucket — move to Redis if the editor ever runs >1 instance
const buckets = new Map<string, { tokens: number; last: number }>();
const MAX_BUCKETS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  b.tokens = Math.min(limit, b.tokens + ((now - b.last) / windowMs) * limit);
  b.last = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  return allowed;
}

/** Per-user limiter for route handlers. Throws ApiError(429) when exhausted. */
export async function checkRate(bucket: string, limit: number, windowMs: number): Promise<void> {
  const { userId } = await auth();
  if (!rateLimit(`${bucket}:${userId ?? "anon"}`, limit, windowMs)) {
    throw new ApiError(429, "Too many requests — slow down");
  }
}
```

Run: `cd apps/editor && bun test lib/rate-limit.test.ts` — Expected: 3 pass.

- [ ] **Step 3: Apply to the three expensive routes**

Add `import { checkRate } from "@/lib/rate-limit";` and one line at the top of each try block:

- `apps/editor/app/api/compile/route.ts` (POST): `await checkRate("compile", 10, 60_000);` — 10 compiles/min/user
- `apps/editor/app/api/search/route.ts` (GET **and** POST): `await checkRate("search", 30, 60_000);`
- `apps/editor/app/api/project/import/route.ts` (POST): `await checkRate("import", 5, 60_000);`

(Each route already funnels errors through `apiError`, which maps the 429.)

- [ ] **Step 4: Type-check, verify, commit**

Run: `cd apps/editor && bun test && bun x tsc --noEmit` — Expected: pass.

Signed in, trigger 11 compiles inside a minute (hold the compile hotkey) — the 11th returns "Too many requests".

```bash
git add apps/editor/lib/rate-limit.ts apps/editor/lib/rate-limit.test.ts apps/editor/app/api/compile/route.ts apps/editor/app/api/search/route.ts apps/editor/app/api/project/import/route.ts
git commit -m "feat(editor): per-user rate limits on compile, search, and import (H2)"
```

---

### Task 16: CI gating merges (O1)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile
      - name: Lint
        run: bun run lint
      - name: Type-check editor
        run: cd apps/editor && bun x tsc --noEmit
      - name: Type-check web
        run: cd apps/web && bun x tsc --noEmit
      - name: Test web
        run: cd apps/web && bun test
      - name: Test editor
        run: cd apps/editor && bun test
```

- [ ] **Step 2: Verify locally (same commands CI runs)**

```bash
bun run lint && (cd apps/editor && bun x tsc --noEmit && bun test) && (cd apps/web && bun x tsc --noEmit && bun test)
```

Expected: all pass.

- [ ] **Step 3: Commit, push, confirm the check runs**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, type-check, and test on every PR"
```

After pushing the branch, confirm the workflow appears and passes in the GitHub Actions tab, then enable "Require status checks" on `main` in repo settings (manual step — note it in the PR description).

---

### Task 17: Health endpoints + ops checklist (O3, M5 documentation)

**Files:**
- Create: `apps/web/app/api/health/route.ts`
- Create: `apps/editor/app/api/health/route.ts`
- Create: `docs/ops-checklist.md`

**Interfaces:**
- Produces: `GET /api/health` on web (checks DB) and editor (process liveness) — both public. Compiler already has `/health`. The editor middleware exception was added in Task 4.

- [ ] **Step 1: Web health route**

Create `apps/web/app/api/health/route.ts`:

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
```

Note: web's `proxy.ts` only protects `/dashboard`, so this route is already public.

- [ ] **Step 2: Editor health route**

Create `apps/editor/app/api/health/route.ts` (kept dependency-free — it must answer even when DB/S3 are down, that's what alerting is for):

```ts
export async function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Ops checklist**

Create `docs/ops-checklist.md`:

```markdown
# Production Operations Checklist

## Before first deploy
- [ ] Set `COMPILER_SECRET` (long random string) on BOTH the editor and compiler services.
- [ ] Editor service: full env per `apps/editor/.env.railway.example`, including Clerk satellite vars.
- [ ] Compiler service: do NOT set `ALLOW_LOCAL_COMPILE`; ensure `NODE_ENV=production`.
- [ ] Clerk dashboard: add the editor domain as a satellite domain of the web app's domain.
- [ ] Run `bun run db:migrate` (apps/web) against the production database as a deploy step — never `push`.
- [ ] GitHub: require the CI check to pass before merging to main.

## Scaling constraints (revisit before adding instances)
- Editor and compiler are **single-instance** services: the editor's differential-upload
  cache and rate-limit buckets are in-memory (compiler self-heals via 409 full-sync,
  rate limits become per-instance), and compiler workspaces live on its local disk.
  Before scaling out: move rate limiting to Redis and pin compiles per project.

## Backups & recovery
- [ ] Railway Postgres: enable scheduled backups; test a restore once.
- [ ] Object storage: enable versioning if available; otherwise schedule a periodic
      bucket sync to a second bucket. Project files are the user data — the DB only
      holds names/ownership.
- Orphaned storage (rows deleted while editor was unreachable): list bucket prefixes
  under projects/ and compare against `SELECT id FROM projects`; delete unmatched.

## Monitoring
- [ ] Uptime checks: web `/api/health`, editor `/api/health`, compiler `/health`.
- [ ] Log-based alert on `[api]` errors (the generic-500 log line) and `[SECURITY]` warnings.
- [ ] Error tracking DSN set if using Sentry (see Task 18).

## Rollback
- Vercel (web): instant rollback to the previous deployment in the dashboard.
- Railway (editor/compiler): redeploy the previous build from the service's deploy list.
- DB: migrations are additive-only so far; for a destructive migration, take a manual
  backup immediately before deploying it.
```

- [ ] **Step 4: Verify, type-check, commit**

```bash
curl -s http://localhost:3000/api/health   # {"ok":true}
curl -s http://localhost:3002/api/health   # {"ok":true} — no auth required
cd apps/web && bun x tsc --noEmit && cd ../editor && bun x tsc --noEmit
```

```bash
git add apps/web/app/api/health/route.ts apps/editor/app/api/health/route.ts docs/ops-checklist.md
git commit -m "feat(ops): health endpoints and production operations checklist"
```

---

### Task 18 (optional, recommended): Error tracking via Sentry (O2)

Skip this task if there is no Sentry account yet; everything is DSN-gated so it is safe to land dark.

**Files:**
- Modify: `apps/web/package.json`, `apps/editor/package.json` (add `@sentry/nextjs`)
- Create: `apps/web/instrumentation.ts`, `apps/editor/instrumentation.ts`

- [ ] **Step 1: Install**

```bash
cd apps/web && bun add @sentry/nextjs
cd ../editor && bun add @sentry/nextjs
```

- [ ] **Step 2: Instrumentation (identical file in both apps)**

Create `apps/web/instrumentation.ts` and `apps/editor/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }
}

export async function onRequestError(...args: unknown[]) {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    // @ts-expect-error — signature provided by Next at runtime
    return Sentry.captureRequestError(...args);
  }
}
```

Check `node_modules/next/dist/docs/` for the Next 16 `onRequestError` signature and adjust the passthrough if it differs.

- [ ] **Step 3: Type-check, commit**

```bash
cd apps/web && bun x tsc --noEmit && cd ../editor && bun x tsc --noEmit
git add apps/web/instrumentation.ts apps/editor/instrumentation.ts apps/web/package.json apps/editor/package.json bun.lock
git commit -m "feat(ops): DSN-gated Sentry error tracking for web and editor"
```

---

## Definition of done

- [ ] All tasks committed; `bun run lint`, both `tsc --noEmit`, and both `bun test` suites pass (CI green).
- [ ] Signed-out curl against every editor API route returns 401.
- [ ] User B cannot read, modify, export, or delete User A's project via any route (spot-check files, export, delete, rename with B's session and A's UUID).
- [ ] Two browsers, two users, two projects, simultaneously editing and compiling — no cross-project writes (the C2 regression test).
- [ ] Compiler rejects unauthenticated requests and `mode:"local"` in production config.
- [ ] `docs/ops-checklist.md` "Before first deploy" section fully checked before the first production deploy.
