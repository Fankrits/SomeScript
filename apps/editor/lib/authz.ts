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

/**
 * Project resolution for Eve agent tools. Eve executes tools in its own runtime,
 * which may be outside the Next request context where Clerk `auth()` can read the
 * session. This keeps the full ownership check when auth() is available — a
 * signed-out caller (401) or a non-owner (404) is still denied — and falls back to
 * format validation only when auth() cannot run at all (raw, non-ApiError throw).
 * The agent HTTP endpoint itself is gated by the Next middleware (proxy.ts).
 * ponytail: best-effort ownership in the no-context case; make it a hard check once
 * eve exposes request identity (workspaceId) to tool execution.
 */
export async function resolveToolProject(projectId: string | null | undefined): Promise<string> {
  if (!projectId) throw new ApiError(400, "Missing projectId");
  if (projectId === "default") {
    if (process.env.NODE_ENV !== "production") return projectId;
    throw new ApiError(404, "Project not found");
  }
  if (!isUuid(projectId)) throw new ApiError(404, "Project not found");

  try {
    return await requireProject(projectId);
  } catch (e) {
    // ApiError (401 signed-out, 404 not-owned) is a genuine denial — propagate it.
    if (e instanceof ApiError) throw e;
    // Non-ApiError means auth() could not run in this execution context; fall back
    // to the already format-validated id. Endpoint identity is enforced upstream.
    return projectId;
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

/** Local filesystem directory for a project (local/dev compile mode). */
export function projectDirFor(projectId: string): string {
  return projectId === "default"
    ? path.join(process.cwd(), "my-new-project")
    : path.join(process.cwd(), "projects", projectId);
}
