import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
import { storage, FileNode } from "@/lib/storage";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

// Simple in-memory cache to track file content hashes per project
const uploadedFilesCache = new Map<string, string>(); // Key: `${projectId}:${filePath}`, Value: contentHash

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

import { checkRate } from "@/lib/rate-limit";

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

      const sortedFiles = [...allFiles].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const projectHash = createHash("sha256")
        .update(JSON.stringify(sortedFiles.map(f => ({ path: f.path, content: f.content }))))
        .update(fileRelativePath)
        .digest("hex");

      // Find modified and deleted files compared to our cache
      const changedFiles: DifferentialFile[] = [];
      const currentProjectKeys = new Set<string>();

      let pendingCacheUpdates = new Map<string, string>();
      let pendingCacheDeletions = new Set<string>();

      for (const file of allFiles) {
        const cacheKey = `${projectId}:${file.path}`;
        currentProjectKeys.add(cacheKey);

        const contentHash = createHash("sha256").update(file.content).digest("hex");
        const cachedHash = uploadedFilesCache.get(cacheKey);

        if (cachedHash !== contentHash) {
          changedFiles.push(file);
          pendingCacheUpdates.set(cacheKey, contentHash);
        }
      }

      // Detect deleted files
      const deletedFiles: string[] = [];
      for (const cacheKey of uploadedFilesCache.keys()) {
        if (cacheKey.startsWith(`${projectId}:`) && !currentProjectKeys.has(cacheKey)) {
          const filePath = cacheKey.substring(projectId.length + 1);
          deletedFiles.push(filePath);
          pendingCacheDeletions.add(cacheKey);
        }
      }

      // Determine if we need full or differential sync
      // If cache was completely empty for this project, force a full sync
      const syncType = currentProjectKeys.size === changedFiles.length ? "full" : "differential";

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
          // Clear cache and retry with a full upload
          const projectCacheKeys = Array.from(uploadedFilesCache.keys()).filter(k => k.startsWith(`${projectId}:`));
          pendingCacheDeletions = new Set(projectCacheKeys);
          pendingCacheUpdates = new Map();
          allFiles.forEach(file => {
            const hash = createHash("sha256").update(file.content).digest("hex");
            pendingCacheUpdates.set(`${projectId}:${file.path}`, hash);
          });

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

      // Commit the pending updates and deletions to the global cache on success
      for (const key of pendingCacheDeletions) {
        uploadedFilesCache.delete(key);
      }
      for (const [cacheKey, contentHash] of pendingCacheUpdates.entries()) {
        if (uploadedFilesCache.size >= 1000 && !uploadedFilesCache.has(cacheKey)) {
          const oldestKey = uploadedFilesCache.keys().next().value;
          if (oldestKey !== undefined) {
            uploadedFilesCache.delete(oldestKey);
          }
        }
        uploadedFilesCache.set(cacheKey, contentHash);
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
