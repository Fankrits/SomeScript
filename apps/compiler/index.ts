import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Bun } from "bun";
import crypto from "crypto";

const PORT = process.env.PORT || 3001;

// Compilation PDF Output Cache (In-Memory)
interface CacheEntry {
  pdf: string; // base64 string
  logs: string;
  createdAt: number;
}
const compilationCache = new Map<string, CacheEntry>();

// Cleanup compilation cache entries older than 1 hour (runs every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of compilationCache.entries()) {
    if (now - value.createdAt > 3600000) {
      compilationCache.delete(key);
    }
  }
}, 600000);

// Helper to safely write uploaded files to a directory
async function writeFiles(baseDir: string, files: { path: string; content: string }[]) {
  for (const file of files) {
    const filePath = path.join(baseDir, file.path);
    const resolvedPath = path.resolve(filePath);
    const relative = path.relative(baseDir, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Invalid file path: ${file.path}`);
    }
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    if (file.content.startsWith("data:") || file.path.endsWith(".pdf") || file.path.endsWith(".png") || file.path.endsWith(".jpg")) {
      const base64Data = file.content.split(";base64,").pop() || file.content;
      await fs.writeFile(resolvedPath, Buffer.from(base64Data, "base64"));
    } else {
      await fs.writeFile(resolvedPath, file.content, "utf-8");
    }
  }
}

// Cleanup workspaces stale for more than 24 hours
async function cleanupStaleWorkspaces() {
  const workspacesDir = path.resolve(process.cwd(), "workspaces");
  try {
    await fs.mkdir(workspacesDir, { recursive: true });
    const dirs = await fs.readdir(workspacesDir);
    const now = Date.now();
    for (const dirName of dirs) {
      const dirPath = path.join(workspacesDir, dirName);
      const stat = await fs.stat(dirPath);
      if (now - stat.mtimeMs > 86400000) { // 24 hours
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`[GC] Cleaned up stale workspace: ${dirName}`);
      }
    }
  } catch (e) {
    console.error("[GC] Error cleaning up workspaces", e);
  }
}
setInterval(cleanupStaleWorkspaces, 3600000); // run hourly

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        const bodyText = await req.text();
        const body = JSON.parse(bodyText);
        const { mode, localProjectPath, fileRelativePath, files, deletedFiles, projectId, syncType, draft, projectHash } = body;

        // 1. Output Cache Verification (For remote/upload compilation)
        let cacheKey = "";
        if (mode === "upload" && projectId) {
          cacheKey = projectHash || crypto.createHash("sha256").update(bodyText).digest("hex");
          const cached = compilationCache.get(cacheKey);
          if (cached) {
            console.log(`[Cache HIT] Serving cached PDF for project: ${projectId}`);
            return Response.json({
              success: true,
              logs: cached.logs + `\n[CACHE HIT] Loaded compiled PDF from memory\n`,
              pdf: cached.pdf,
            });
          }
        }

        if (mode === "local") {
          if (!localProjectPath || !fileRelativePath) {
            return Response.json({ error: "Missing localProjectPath or fileRelativePath for local mode" }, { status: 400 });
          }

          const resolvedTexPath = path.resolve(localProjectPath, fileRelativePath);
          const relative = path.relative(localProjectPath, resolvedTexPath);
          if (relative.startsWith("..") || path.isAbsolute(relative)) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }

          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();

          const runTectonic = (args: string[]) => {
            return new Promise<number>((resolve) => {
              const child = spawn("tectonic", args, { cwd: localProjectPath });

              child.stdout.on("data", (data) => {
                writer.write(encoder.encode(data.toString()));
              });

              child.stderr.on("data", (data) => {
                writer.write(encoder.encode(data.toString()));
              });

              child.on("close", (code) => {
                resolve(code ?? -1);
              });

              child.on("error", (err) => {
                writer.write(encoder.encode(`\n[ERROR] Failed to start Tectonic: ${err.message}\n`));
                resolve(-1);
              });
            });
          };

          (async () => {
            try {
              // Compile flags
              const flags = ["-C"];
              if (draft) {
                flags.push("-r", "0");
              }
              flags.push(resolvedTexPath);

              let code = await runTectonic(flags);
              if (code !== 0) {
                writer.write(encoder.encode(`\n[INFO] Cached compilation failed. Retrying with remote package fetching...\n`));
                const fallbackFlags = [];
                if (draft) {
                  fallbackFlags.push("-r", "0");
                }
                fallbackFlags.push(resolvedTexPath);
                code = await runTectonic(fallbackFlags);
              }

              if (code === 0) {
                const relativePdfPath = fileRelativePath.replace(/\.tex$/, ".pdf");
                writer.write(encoder.encode(`\n[SUCCESS] ${relativePdfPath}\n`));
              } else {
                writer.write(encoder.encode(`\n[ERROR] Tectonic exited with code ${code}\n`));
              }
            } catch (err: any) {
              writer.write(encoder.encode(`\n[ERROR] Compilation process error: ${err.message}\n`));
            } finally {
              writer.close();
            }
          })();

          return new Response(readable, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        } 
        
        if (mode === "upload") {
          if (!projectId || !fileRelativePath) {
            return Response.json({ error: "Missing projectId or fileRelativePath for upload mode" }, { status: 400 });
          }

          const workspacesDir = path.resolve(process.cwd(), "workspaces");
          const projectDir = path.join(workspacesDir, projectId);

          // Verify workspace directory exists if doing differential sync
          let isWorkspaceMissing = false;
          try {
            await fs.access(projectDir);
          } catch {
            isWorkspaceMissing = true;
          }

          if (syncType === "differential" && isWorkspaceMissing) {
            // Signal back that full sync is required
            return Response.json({ requireFullSync: true }, { status: 409 });
          }

          // Create workspace if missing
          await fs.mkdir(projectDir, { recursive: true });

          try {
            const now = new Date();
            await fs.utimes(projectDir, now, now);
          } catch {}

          // Apply deletions
          if (deletedFiles && Array.isArray(deletedFiles)) {
            for (const relPath of deletedFiles) {
              const target = path.resolve(projectDir, relPath);
              const relative = path.relative(projectDir, target);
              if (relative.startsWith("..") || path.isAbsolute(relative)) {
                throw new Error(`Invalid file path: ${relPath}`);
              }
              await fs.rm(target, { recursive: true, force: true });
            }
          }

          // Write modified files
          if (files && Array.isArray(files)) {
            await writeFiles(projectDir, files);
          }

          const resolvedTexPath = path.resolve(projectDir, fileRelativePath);
          let logs = "";

          const runTectonicUpload = (args: string[]) => {
            return new Promise<number>((resolve) => {
              const child = spawn("tectonic", args, { cwd: projectDir });

              child.stdout.on("data", (data) => {
                logs += data.toString();
              });

              child.stderr.on("data", (data) => {
                logs += data.toString();
              });

              child.on("close", (code) => {
                resolve(code ?? -1);
              });

              child.on("error", (err) => {
                logs += `\n[ERROR] Failed to start Tectonic: ${err.message}\n`;
                resolve(-1);
              });
            });
          };

          // Compile flags
          const flags = ["-C"];
          if (draft) {
            flags.push("-r", "0");
          }
          flags.push(resolvedTexPath);

          let code = await runTectonicUpload(flags);
          if (code !== 0) {
            logs += `\n[INFO] Cached compilation failed or package missing. Retrying with remote package fetching...\n`;
            const fallbackFlags = [];
            if (draft) {
              fallbackFlags.push("-r", "0");
            }
            fallbackFlags.push(resolvedTexPath);
            code = await runTectonicUpload(fallbackFlags);
          }

          if (code === 0) {
            const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
            const pdfAbsolutePath = path.resolve(projectDir, pdfRelativePath);
            const pdfBuffer = await fs.readFile(pdfAbsolutePath);
            const pdfBase64 = pdfBuffer.toString("base64");

            const responseObj = {
              success: true,
              logs: logs + `\n[SUCCESS] ${pdfRelativePath}\n`,
              pdf: pdfBase64,
            };

            // Cache the successful compilation
            if (cacheKey) {
              compilationCache.set(cacheKey, {
                pdf: pdfBase64,
                logs: logs,
                createdAt: Date.now(),
              });
            }

            return Response.json(responseObj);
          } else {
            return Response.json({
              success: false,
              logs: logs + `\n[ERROR] Tectonic exited with code ${code}\n`,
            }, { status: 422 });
          }
        }

        return Response.json({ error: "Invalid mode" }, { status: 400 });
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Compiler service running on http://localhost:${PORT}`);
