import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const PORT = process.env.PORT || 3001;

const COMPILER_SECRET = process.env.COMPILER_SECRET;
// Local mode reads arbitrary caller-supplied filesystem paths — dev only unless explicitly enabled.
const ALLOW_LOCAL = process.env.ALLOW_LOCAL_COMPILE === "true" || process.env.NODE_ENV !== "production";
if (!COMPILER_SECRET) {
  console.warn("[SECURITY] COMPILER_SECRET is not set — compiler accepts unauthenticated requests. Set it in production.");
}

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
      try {
        const dirPath = path.join(workspacesDir, dirName);
        const stat = await fs.stat(dirPath);
        if (now - stat.mtimeMs > 86400000) { // 24 hours
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`[GC] Cleaned up stale workspace: ${dirName}`);
        }
      } catch (errDir) {
        console.error(`[GC] Failed to process workspace folder ${dirName}:`, errDir);
      }
    }
  } catch (e) {
    console.error("[GC] Error cleaning up workspaces", e);
  }
}
setInterval(cleanupStaleWorkspaces, 3600000); // run hourly
cleanupStaleWorkspaces();

interface SyncTexData {
  files: Record<string, string>;
  records: Array<{
    fileId: number;
    line: number;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

function parseSyncTex(rawText: string): SyncTexData {
  const files: Record<string, string> = {};
  const records: SyncTexData["records"] = [];
  let currentPage = 1;

  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("Input:")) {
      const parts = line.split(":");
      if (parts.length >= 3) {
        files[parts[1]] = parts.slice(2).join(":");
      }
    } else if (line.startsWith("{")) {
      currentPage = parseInt(line.substring(1), 10);
    } else if (line.startsWith("h") || line.startsWith("v") || line.startsWith("[") || line.startsWith("(")) {
      const content = line.substring(1);
      const parts = content.replace(/:/g, ",").split(",");
      if (parts.length >= 6) {
        const fileId = parseInt(parts[0], 10);
        const lineNum = parseInt(parts[1], 10);
        const x = parseFloat(parts[2]);
        const y = parseFloat(parts[3]);
        const w = parseFloat(parts[4]);
        const h = parseFloat(parts[5]);
        
        if (!isNaN(fileId) && !isNaN(lineNum)) {
          records.push({ fileId, line: lineNum, page: currentPage, x, y, w, h });
        }
      }
    }
  }

  // ponytail: Deduplicate line records to keep payload small
  const seen = new Set<string>();
  const uniqueRecords = records.filter(r => {
    const key = `${r.fileId}:${r.line}:${r.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { files, records: uniqueRecords };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (COMPILER_SECRET && req.headers.get("authorization") !== `Bearer ${COMPILER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/synctex" && req.method === "POST") {
      try {
        const body = await req.json();
        const { mode, localProjectPath, projectId, fileRelativePath } = body;
        
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

        const fileBuffer = await fs.readFile(synctexPath);
        const decompressed = Bun.gunzipSync(fileBuffer);
        const text = new TextDecoder().decode(decompressed);
        const parsedData = parseSyncTex(text);

        return Response.json(parsedData);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        const bodyText = await req.text();
        const body = JSON.parse(bodyText);
        const { mode, localProjectPath, fileRelativePath, files, deletedFiles, projectId, syncType, draft, projectHash } = body;

        if (mode === "local") {
          if (!ALLOW_LOCAL) {
            return Response.json({ error: "local mode disabled" }, { status: 403 });
          }

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
              const child = spawn("tectonic", args, {
                cwd: localProjectPath,
                env: { ...process.env, TECTONIC_UNTRUSTED_MODE: "1" },
              });
              const onAbort = () => child.kill();
              req.signal.addEventListener("abort", onAbort);

              child.stdout.on("data", (data) => {
                writer.write(encoder.encode(data.toString()));
              });

              child.stderr.on("data", (data) => {
                writer.write(encoder.encode(data.toString()));
              });

              child.on("close", (code) => {
                req.signal.removeEventListener("abort", onAbort);
                resolve(code ?? -1);
              });

              child.on("error", (err) => {
                req.signal.removeEventListener("abort", onAbort);
                writer.write(encoder.encode(`\n[ERROR] Failed to start Tectonic: ${err.message}\n`));
                resolve(-1);
              });
            });
          };

          (async () => {
            try {
              // Compile flags
              const flags = ["-C", "--synctex"];
              if (draft) {
                flags.push("-r", "0");
              }
              flags.push(resolvedTexPath);

              let code = await runTectonic(flags);
              if (code !== 0) {
                writer.write(encoder.encode(`\n[INFO] Cached compilation failed. Retrying with remote package fetching...\n`));
                const fallbackFlags = ["--synctex"];
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

          const relativeDir = path.relative(workspacesDir, projectDir);
          if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir) || !relativeDir) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }

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
          if (syncType === "full") {
            await fs.rm(projectDir, { recursive: true, force: true });
          }
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
              if (relative.startsWith("..") || path.isAbsolute(relative) || !relative || relative === ".") {
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
          const relativePathCheck = path.relative(projectDir, resolvedTexPath);
          if (relativePathCheck.startsWith("..") || path.isAbsolute(relativePathCheck)) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }
          let logs = "";
 
          const runTectonicUpload = (args: string[]) => {
            return new Promise<number>((resolve) => {
              const child = spawn("tectonic", args, {
                cwd: projectDir,
                env: { ...process.env, TECTONIC_UNTRUSTED_MODE: "1" },
              });
              const onAbort = () => child.kill();
              req.signal.addEventListener("abort", onAbort);

              child.stdout.on("data", (data) => {
                logs += data.toString();
              });

              child.stderr.on("data", (data) => {
                logs += data.toString();
              });

              child.on("close", (code) => {
                req.signal.removeEventListener("abort", onAbort);
                resolve(code ?? -1);
              });

              child.on("error", (err) => {
                req.signal.removeEventListener("abort", onAbort);
                logs += `\n[ERROR] Failed to start Tectonic: ${err.message}\n`;
                resolve(-1);
              });
            });
          };
 
          // Compile flags
          const flags = ["-C", "--synctex"];
          if (draft) {
            flags.push("-r", "0");
          }
          flags.push(resolvedTexPath);
 
          let code = await runTectonicUpload(flags);
          if (code !== 0) {
            logs += `\n[INFO] Cached compilation failed or package missing. Retrying with remote package fetching...\n`;
            const fallbackFlags = ["--synctex"];
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
