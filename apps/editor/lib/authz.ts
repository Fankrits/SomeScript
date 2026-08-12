// pg's own deps (pg-types, pg-pool, ...) are pinned as direct deps in package.json:
// Next's default serverExternalPackages list marks "pg" external, and Bun's isolated
// linker only exposes *direct* deps by bare name — without this, dev fails with
// "Cannot find package 'pg-types'" the moment this module loads. See apps/web/lib/db.ts.
import { Pool } from "pg";
import path from "path";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
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
    // Small on purpose: this pool is per serverless instance, which serves
    // ~one request at a time. A big pool here just multiplies idle connections
    // across warm instances and exhausts Postgres. See apps/web/lib/db.ts.
    globalForPool.authzPool = new Pool({ connectionString: url, max: 2 });
  }
  return globalForPool.authzPool;
}

/**
 * Validates that the caller is signed in and owns projectId (via its workspace).
 * "default" (the local sandbox) is allowed only outside production.
 */
export async function requireProject(projectId: string | null | undefined): Promise<string> {
  if (!projectId) throw new ApiError(400, "Missing projectId");

  // Loaded lazily: @clerk/nextjs ships ESM with extensionless imports that Node's
  // resolver rejects. Eve bundles this module into its Node runtime, so a top-level
  // clerk import would crash eve at load. Deferring to call time keeps the Next
  // request path working and lets resolveToolProject() catch the failure in eve's
  // context (where auth() can't run anyway) and fall back to format validation.
  const { auth } = await import("@clerk/nextjs/server");
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

/**
 * Project resolution for Eve agent tools. Eve executes tools in its own runtime,
 * outside the Next request context where Clerk `auth()` can read the session, so
 * the caller's identity arrives a different way: the eve channel verifies the
 * Clerk token on the way in and puts the workspace on the session
 * (agent/channels/eve.ts), and tools read it back with workspaceFrom(ctx).
 *
 * `projectId` is model-supplied text and is treated as a selector only —
 * ownership is decided by `workspaceId`, which the model cannot influence. A
 * missing workspace is a hard 401, never a pass: this used to fall back to
 * UUID-format validation whenever auth() could not run, which accepted any
 * well-formed id the model emitted.
 */
export async function resolveToolProject(
  projectId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<string> {
  if (!projectId) throw new ApiError(400, "Missing projectId");
  if (projectId === "default") {
    if (process.env.NODE_ENV !== "production") return projectId;
    throw new ApiError(404, "Project not found");
  }
  if (!isUuid(projectId)) throw new ApiError(404, "Project not found");
  if (!workspaceId) throw new ApiError(401, "Unauthorized");

  const res = await getPool().query("SELECT workspace_id FROM projects WHERE id = $1", [projectId]);
  if (!res.rows[0] || res.rows[0].workspace_id !== workspaceId) {
    throw new ApiError(404, "Project not found");
  }
  return projectId;
}

/**
 * Validates that the caller is signed in and returns their active workspace id
 * (org id, falling back to personal). Same lazy-import reasoning as requireProject.
 */
export async function requireWorkspace(): Promise<string> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId, orgId } = await auth();
  if (!userId) throw new ApiError(401, "Unauthorized");
  return orgId || userId;
}

/**
 * Bumps the dashboard's "Last Modified" timestamp for a project. Call this from
 * every path that changes user-visible project content (file save/create/move/
 * copy/delete, uploads, search-replace, Eve file edits) — but not from internal
 * writes like the compiled PDF cache or the task list, which shouldn't count as
 * a content change. No-ops for "default" (the local sandbox has no DB row).
 */
export async function touchProject(projectId: string): Promise<void> {
  if (projectId === "default") return;
  try {
    await getPool().query("UPDATE projects SET updated_at = now() WHERE id = $1", [projectId]);
  } catch (error) {
    console.error("[touchProject]", error);
  }
}

/** Uniform error responder: known ApiErrors pass through, everything else is a logged generic 500. */
export function apiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api]", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** Human-readable project name for display and download filenames. */
export async function getProjectName(projectId: string): Promise<string> {
  if (projectId === "default") return "Local Sandbox";
  const res = await getPool().query("SELECT name FROM projects WHERE id = $1", [projectId]);
  return res.rows[0]?.name ?? projectId;
}

/** Local filesystem directory for a project (local/dev compile mode). */
export function projectDirFor(projectId: string): string {
  return projectId === "default"
    ? path.join(process.cwd(), "my-new-project")
    : path.join(process.cwd(), "projects", projectId);
}
