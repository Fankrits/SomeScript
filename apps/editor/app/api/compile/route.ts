import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
import { storage, FileNode } from "@/lib/storage";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { checkRate } from "@/lib/rate-limit";
import { redisHGetAll, redisHSet, redisHMSet, redisHDel } from "@/lib/redis";

// In-memory fallback if Redis is unavailable. Only populated when a Redis
// write actually fails — not mirrored on every call — and capped like the
// other in-memory caches in this codebase (see MAX_BUCKETS in rate-limit.ts)
// so a prolonged outage can't grow it unboundedly.
const fallbackUploadedFilesCache = new Map<string, string>();
const MAX_FALLBACK_ENTRIES = 10_000;

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

async function updateProjectFileHashesBatch(projectId: string, updates: { path: string; hash: string }[]): Promise<void> {
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
async function getAllStorageFiles(projectId: string, nodes: FileNode[]): Promise<{ path: string; content: string }[]> {
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
          }))
        );
      }
    }
  }

  collectNodes(nodes);
  return Promise.all(filePromises);
}

export async function POST(req: NextRequest) {
  try {
    await checkRate("compile", 10, 60_000);
    const { projectId: rawProjectId, path: fileRelativePath } = await req.json();
    if (!fileRelativePath) throw new ApiError(400, "Path parameter is required");
    if (!fileRelativePath.endsWith(".tex")) throw new ApiError(400, "Only .tex files can be compiled");

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

    const compilerHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(process.env.COMPILER_SECRET
        ? { Authorization: `Bearer ${process.env.COMPILER_SECRET}` }
        : {}),
    };

    if (compilerMode === "local") {
      const response = await fetch(`${compilerUrl}/compile`, {
        method: "POST",
        headers: compilerHeaders,
        signal: req.signal,
        body: JSON.stringify({
          mode: "local",
          localProjectPath: projectPath,
          fileRelativePath,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return Response.json({ error: errText || "Compiler service error" }, { status: response.status });
      }

      return new Response(response.body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } else {
      // Differential Sync for Remote/Upload Mode
      const projectTree = await storage.listProjectFiles(projectId);
      const allFiles = await getAllStorageFiles(projectId, projectTree);

      // Hash each file's content once and reuse it for both the diff check
      // below and projectHash, instead of re-hashing full file content a
      // second (and, on a 409 retry, third) time just to fingerprint the
      // project state.
      const fileHashes = new Map(
        allFiles.map((f) => [f.path, createHash("sha256").update(f.content).digest("hex")] as const)
      );

      const sortedPaths = [...fileHashes.keys()].sort();
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

      const compilePayload = {
        mode: "upload",
        projectId,
        fileRelativePath,
        syncType,
        files: syncType === "full" ? allFiles : changedFiles,
        deletedFiles,
        projectHash,
      };

      let response = await fetch(`${compilerUrl}/compile`, {
        method: "POST",
        headers: compilerHeaders,
        body: JSON.stringify(compilePayload),
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

          response = await fetch(`${compilerUrl}/compile`, {
            method: "POST",
            headers: compilerHeaders,
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
        return Response.json({ error: errData.logs || "Compiler service error" }, { status: response.status });
      }

      if (response.ok) {
        await updateProjectFileHashesBatch(projectId, pendingUpdates);
        if (deletedFiles.length > 0) {
          await deleteProjectFileHashes(projectId, deletedFiles);
        }
      }


      const result = await response.json();

      if (result.success && result.pdf) {
        const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
        await storage.writeFile(projectId, `.preview-cache/${pdfRelativePath}`, Buffer.from(result.pdf, "base64"));
      }

      return new Response(result.logs || "", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  } catch (error) {
    return apiError(error);
  }
}
