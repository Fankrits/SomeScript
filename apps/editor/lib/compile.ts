import { createHash } from "crypto";
import { ApiError } from "./authz";
import { storage, FileNode } from "./storage";
import { redisHGetAll, redisHMSet, redisHDel, redisSet } from "./redis";

// This module is imported by BOTH the Next route (app/api/compile/route.ts) and
// the Eve agent tool (agent/tools/compile-project.ts). Eve bundles it into its own
// Node runtime, so three rules apply and are load-bearing:
//   1. relative imports only — the `@/` tsconfig alias does not resolve there
//   2. no `next/server` — callers pass a plain AbortSignal
//   3. no `lib/rate-limit` — it top-level-imports Clerk, which crashes eve's bundle
// (lib/authz.ts is safe: it imports Clerk lazily, inside the functions that need it.)

// In-memory fallback if Redis is unavailable. Only populated when a Redis
// write actually fails — not mirrored on every call — and capped like the
// other in-memory caches in this codebase (see MAX_BUCKETS in rate-limit.ts)
// so a prolonged outage can't grow it unboundedly.
const fallbackUploadedFilesCache = new Map<string, string>();
const MAX_FALLBACK_ENTRIES = 10_000;

/** Where the last compile's log is parked so the agent can read it back. */
export function compileLogKey(projectId: string): string {
  return `compile:log:${projectId}`;
}

export const COMPILE_LOG_TTL_SECONDS = 3600;

// ponytail: last 100KB only. A package-download storm produces multi-MB logs and
// this copy exists purely for read-compile-log; the errors live at the tail anyway.
const MAX_STORED_LOG_BYTES = 100_000;

export interface StoredCompileLog {
  at: number;
  path: string;
  ok: boolean;
  pdfPath: string | null;
  log: string;
}

export interface CompileResult {
  ok: boolean;
  /** Project-relative .tex that was compiled as the root document. */
  path: string;
  /** ".preview-cache/<stem>.pdf" on success, null on failure. */
  pdfPath: string | null;
  log: string;
}

export function compilerUrl(): string {
  return process.env.COMPILER_URL || "http://127.0.0.1:3001";
}

/** Explicit COMPILER_MODE wins; otherwise a localhost COMPILER_URL implies local. */
export function compilerMode(): "local" | "upload" {
  const configured = process.env.COMPILER_MODE;
  if (configured) return configured === "local" ? "local" : "upload";
  const url = compilerUrl();
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0")
    ? "local"
    : "upload";
}

export function compilerHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(process.env.COMPILER_SECRET
      ? { Authorization: `Bearer ${process.env.COMPILER_SECRET}` }
      : {}),
  };
}

async function getProjectFileHashes(projectId: string): Promise<Record<string, string>> {
  const redisHashes = await redisHGetAll(`project:${projectId}:hashes`);
  if (redisHashes) return redisHashes;

  const result: Record<string, string> = {};
  for (const [key, val] of fallbackUploadedFilesCache.entries()) {
    if (key.startsWith(`${projectId}:`)) {
      result[key.substring(projectId.length + 1)] = val;
    }
  }
  return result;
}

async function updateProjectFileHashesBatch(
  projectId: string,
  updates: { path: string; hash: string }[],
): Promise<void> {
  if (updates.length === 0) return;
  const record = Object.fromEntries(updates.map((u) => [u.path, u.hash]));

  const redisOk = await redisHMSet(`project:${projectId}:hashes`, record, 7 * 86400); // 7 day TTL
  if (!redisOk) {
    if (fallbackUploadedFilesCache.size > MAX_FALLBACK_ENTRIES) fallbackUploadedFilesCache.clear();
    for (const u of updates) {
      fallbackUploadedFilesCache.set(`${projectId}:${u.path}`, u.hash);
    }
  }
}

async function deleteProjectFileHashes(projectId: string, filePaths: string[]): Promise<void> {
  for (const p of filePaths) {
    fallbackUploadedFilesCache.delete(`${projectId}:${p}`);
  }
  if (filePaths.length > 0) {
    await redisHDel(`project:${projectId}:hashes`, filePaths);
  }
}

interface DifferentialFile {
  path: string;
  content: string;
}

// Recursively gather all project files via the unified storage provider. Every
// file is read as bytes and sent as base64 (see writeFiles in apps/compiler/index.ts,
// which always decodes it back) — a LaTeX project can \input or \includegraphics
// any extension (.bbx/.cbx biblatex styles, .mps figures, whatever comes next), so
// an allow-list of "known" extensions is always one project away from being wrong.
// Base64 round-trips text just as losslessly as binary, so there's no need for a
// separate text path.
async function getAllStorageFiles(
  projectId: string,
  nodes: FileNode[],
): Promise<{ path: string; content: string }[]> {
  const filePromises: Promise<{ path: string; content: string }>[] = [];

  function collectNodes(nodeList: FileNode[]) {
    for (const node of nodeList) {
      if (node.isDir && node.children) {
        collectNodes(node.children);
      } else if (!node.isDir) {
        filePromises.push(
          storage.readBinaryFile(projectId, node.path).then((buffer) => ({
            path: node.path,
            content: buffer.toString("base64"),
          })),
        );
      }
    }
  }

  collectNodes(nodes);
  return Promise.all(filePromises);
}

/**
 * Parks the log where read-compile-log can find it, so the agent can inspect the
 * errors from a compile the *user* ran without recompiling. Best-effort: redisSet
 * already no-ops when REDIS_URL is unset, which degrades to "no log history"
 * rather than failing the compile.
 */
async function storeCompileLog(projectId: string, result: CompileResult): Promise<void> {
  const record: StoredCompileLog = {
    at: Date.now(),
    path: result.path,
    ok: result.ok,
    pdfPath: result.pdfPath,
    log: result.log.slice(-MAX_STORED_LOG_BYTES),
  };
  await redisSet(compileLogKey(projectId), JSON.stringify(record), COMPILE_LOG_TTL_SECONDS);
}

/**
 * Upload-mode compile: bundles the project, differentially syncs it to the
 * compiler service, and writes the resulting PDF to `.preview-cache/`.
 *
 * The caller owns authorization and rate limiting — the Next route does
 * requireProject + checkRate, the agent tool does resolveToolProject + its own
 * throttle. A failed *compile* comes back as `{ ok: false }` with the log; only a
 * failed *request* (compiler unreachable, 403, 5xx) throws ApiError.
 */
export async function compileUpload(opts: {
  projectId: string;
  path: string;
  signal?: AbortSignal;
}): Promise<CompileResult> {
  const { projectId, path: fileRelativePath, signal } = opts;
  const url = compilerUrl();
  const headers = compilerHeaders();

  const projectTree = await storage.listProjectFiles(projectId);
  const allFiles = await getAllStorageFiles(projectId, projectTree);

  // Hash each file's content once and reuse it for both the diff check
  // below and projectHash, instead of re-hashing full file content a
  // second (and, on a 409 retry, third) time just to fingerprint the
  // project state.
  const fileHashes = new Map(
    allFiles.map((f) => [f.path, createHash("sha256").update(f.content).digest("hex")] as const),
  );

  const sortedPaths = [...fileHashes.keys()].toSorted();
  const projectHash = createHash("sha256")
    .update(JSON.stringify(sortedPaths.map((path) => ({ path, hash: fileHashes.get(path) }))))
    .update(fileRelativePath)
    .digest("hex");

  const cachedHashes = await getProjectFileHashes(projectId);

  const changedFiles: DifferentialFile[] = [];
  const currentPaths = new Set<string>();
  const pendingUpdates: { path: string; hash: string }[] = [];

  for (const file of allFiles) {
    currentPaths.add(file.path);
    const contentHash = fileHashes.get(file.path)!;
    const cachedHash = cachedHashes[file.path];

    if (cachedHash !== contentHash) {
      changedFiles.push(file);
      pendingUpdates.push({ path: file.path, hash: contentHash });
    }
  }

  const deletedFiles: string[] = [];
  for (const existingPath of Object.keys(cachedHashes)) {
    if (!currentPaths.has(existingPath)) {
      deletedFiles.push(existingPath);
    }
  }

  const syncType =
    Object.keys(cachedHashes).length === 0 || changedFiles.length === allFiles.length
      ? "full"
      : "differential";

  let response = await fetch(`${url}/compile`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      mode: "upload",
      projectId,
      fileRelativePath,
      syncType,
      files: syncType === "full" ? allFiles : changedFiles,
      deletedFiles,
      projectHash,
    }),
  });

  // Handle full sync retry if compiler says workspace was missing/cleared
  if (response.status === 409) {
    const responseClone = response.clone();
    const errData = await responseClone.json().catch(() => ({}));
    if (errData.requireFullSync) {
      pendingUpdates.length = 0;
      for (const file of allFiles) {
        pendingUpdates.push({ path: file.path, hash: fileHashes.get(file.path)! });
      }

      response = await fetch(`${url}/compile`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          mode: "upload",
          projectId,
          fileRelativePath,
          syncType: "full",
          files: allFiles,
          deletedFiles: [],
          projectHash,
        }),
      });
    }
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ logs: "Failed to parse error response" }));
    // 422 is "Tectonic ran and the document didn't build" — a normal outcome the
    // caller reports as a failed compile, not a broken request. Deliberately does
    // not update the file hashes, matching the pre-extraction behaviour.
    if (response.status === 422) {
      const result: CompileResult = {
        ok: false,
        path: fileRelativePath,
        pdfPath: null,
        log: errData.logs || "",
      };
      await storeCompileLog(projectId, result);
      return result;
    }
    throw new ApiError(response.status, errData.logs || errData.error || "Compiler service error");
  }

  await updateProjectFileHashesBatch(projectId, pendingUpdates);
  if (deletedFiles.length > 0) {
    await deleteProjectFileHashes(projectId, deletedFiles);
  }

  const compilerResult = await response.json();

  let pdfPath: string | null = null;
  if (compilerResult.success && compilerResult.pdf) {
    pdfPath = `.preview-cache/${fileRelativePath.replace(/\.tex$/, ".pdf")}`;
    await storage.writeFile(projectId, pdfPath, Buffer.from(compilerResult.pdf, "base64"));
  }

  const result: CompileResult = {
    ok: Boolean(compilerResult.success && pdfPath),
    path: fileRelativePath,
    pdfPath,
    log: compilerResult.logs || "",
  };
  await storeCompileLog(projectId, result);
  return result;
}
