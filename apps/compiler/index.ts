import { spawn } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import Redis from "ioredis";


const PORT = process.env.PORT || 3001;

// Official SyncTeX CLI (jlaurens/synctex). Built by scripts/build-synctex.sh into
// bin/synctex; falls back to a system-wide install (e.g. TeX Live) on PATH.
const SYNCTEX_BIN =
  process.env.SYNCTEX_BIN ||
  (existsSync(path.join(import.meta.dir, "bin", "synctex"))
    ? path.join(import.meta.dir, "bin", "synctex")
    : "synctex");

const COMPILER_SECRET = process.env.COMPILER_SECRET;
// Local mode reads arbitrary caller-supplied filesystem paths — dev only unless explicitly enabled.
const ALLOW_LOCAL = process.env.ALLOW_LOCAL_COMPILE === "true" || process.env.NODE_ENV !== "production";
if (!COMPILER_SECRET) {
  console.warn("[SECURITY] COMPILER_SECRET is not set — compiler accepts unauthenticated requests. Set it in production.");
}

// In-memory cache for compiled PDF output by project payload hash
interface CachedCompileResult {
  logs: string;
  pdf: string;
}
const outputCache = new Map<string, CachedCompileResult>();
const MAX_OUTPUT_CACHE_SIZE = 100;

const REDIS_URL = process.env.REDIS_URL;
let redisClient: Redis | null = null;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    redisClient.connect().catch((err) => console.warn("[COMPILER REDIS] Connect failed:", err.message));
  } catch (err: any) {
    console.warn("[COMPILER REDIS] Init error:", err.message);
  }
}

function evictOldestCacheIfNeeded() {
  if (outputCache.size >= MAX_OUTPUT_CACHE_SIZE) {
    const oldestKey = outputCache.keys().next().value;
    if (oldestKey !== undefined) outputCache.delete(oldestKey);
  }
}

async function getCachedCompile(hash: string): Promise<CachedCompileResult | null> {
  if (outputCache.has(hash)) {
    // Map iteration order is insertion order, so bump this key to the end on
    // every hit — otherwise eviction is oldest-inserted (FIFO), not actually
    // least-recently-used.
    const value = outputCache.get(hash)!;
    outputCache.delete(hash);
    outputCache.set(hash, value);
    return value;
  }
  if (redisClient && redisClient.status === "ready") {
    try {
      const raw = await redisClient.get(`compile:cache:${hash}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        evictOldestCacheIfNeeded();
        outputCache.set(hash, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

async function setCachedCompile(hash: string, result: CachedCompileResult): Promise<void> {
  evictOldestCacheIfNeeded();
  outputCache.set(hash, result);

  if (redisClient && redisClient.status === "ready") {
    try {
      await redisClient.set(`compile:cache:${hash}`, JSON.stringify(result), "EX", 86400); // 24 hour TTL
    } catch {}
  }
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
    // Every upload is base64 now (see getAllStorageFiles in apps/editor/app/api/compile/route.ts),
    // whether the source was text or binary — extension-sniffing here would just
    // be a second copy of the same allow-list problem.
    const base64Data = file.content.startsWith("data:") ? file.content.split(";base64,").pop()! : file.content;
    await fs.writeFile(resolvedPath, Buffer.from(base64Data, "base64"));
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

// Parse the `synctex view`/`synctex edit` CLI output: blocks of `Key:value` lines,
// one block per result, each starting with an `Output:` line. Coordinates are in
// PDF points (72 dpi) measured from the top-left of the page.
function parseSynctexCliOutput(text: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep);
    if (key === "Output") {
      current = {};
      blocks.push(current);
    } else if (current) {
      current[key] = line.slice(sep + 1);
    }
  }
  return blocks;
}

function runSynctex(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(SYNCTEX_BIN, args, { cwd });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.resume();
    child.on("error", reject);
    // Non-zero exit just means "no match" — resolve with whatever was printed.
    child.on("close", () => resolve(stdout));
  });
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
        const { mode, localProjectPath, projectId, fileRelativePath, type, texRelativePath, line, page, x, y } = body;

        let base = "";
        if (mode === "local") {
          if (!ALLOW_LOCAL) return Response.json({ error: "local mode disabled" }, { status: 403 });
          base = path.resolve(localProjectPath);
        } else {
          const workspacesDir = path.resolve(process.cwd(), "workspaces");
          base = path.resolve(workspacesDir, projectId);
          const rel = path.relative(workspacesDir, base);
          if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }
        }
        const inBase = (p: string) => {
          const rel = path.relative(base, p);
          return !rel.startsWith("..") && !path.isAbsolute(rel);
        };

        // The PDF the compile produced; the CLI finds its .synctex.gz next to it.
        const pdfPath = path.resolve(base, fileRelativePath.replace(/\.tex$/, ".pdf"));
        if (!inBase(pdfPath)) return Response.json({ error: "Access denied" }, { status: 403 });

        if (type === "edit") {
          // Reverse sync: PDF (page, x, y in pt from top-left) -> source file:line.
          const output = await runSynctex(["edit", "-o", `${page}:${x}:${y}:${pdfPath}`], base);
          const block = parseSynctexCliOutput(output)[0];
          if (!block?.Input || !block.Line) {
            return Response.json({ error: "No SyncTeX match" }, { status: 404 });
          }
          const input = path.isAbsolute(block.Input) ? path.relative(base, block.Input) : block.Input;
          return Response.json({ input, line: parseInt(block.Line, 10), column: parseInt(block.Column ?? "-1", 10) });
        }

        // Forward sync: source file:line -> typeset boxes on a PDF page.
        const texPath = path.resolve(base, texRelativePath || fileRelativePath);
        if (!inBase(texPath)) return Response.json({ error: "Access denied" }, { status: 403 });
        const output = await runSynctex(["view", "-i", `${line}:0:${texPath}`, "-o", pdfPath], base);
        const records = parseSynctexCliOutput(output)
          .filter((b) => b.Page)
          .map((b) => ({
            page: parseInt(b.Page, 10),
            x: parseFloat(b.x),
            y: parseFloat(b.y),
            h: parseFloat(b.h),
            v: parseFloat(b.v),
            W: parseFloat(b.W),
            H: parseFloat(b.H),
          }));
        return Response.json({ records });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        const bodyText = await req.text();
        const body = JSON.parse(bodyText);
        const { mode, localProjectPath, fileRelativePath, files, deletedFiles, projectId, syncType, projectHash } = body;

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
              const flags = ["-C", "--synctex", resolvedTexPath];

              let code = await runTectonic(flags);
              if (code !== 0) {
                writer.write(encoder.encode(`\n[INFO] Cached compilation failed. Retrying with remote package fetching...\n`));
                code = await runTectonic(["--synctex", resolvedTexPath]);
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

          // Return instantly if identical payload hash was compiled before
          if (projectHash) {
            const cached = await getCachedCompile(projectHash);
            if (cached) {
              return Response.json({
                success: true,
                logs: cached.logs + "\n[INFO] Returned from output cache (0ms)\n",
                pdf: cached.pdf,
              });
            }
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
          // Surface a clear error before handing a missing file to Tectonic,
          // rather than whatever cryptic failure it produces for that itself.
          try {
            await fs.access(resolvedTexPath);
          } catch {
            return Response.json(
              { logs: `[ERROR] Root file not found in workspace: ${fileRelativePath}` },
              { status: 404 }
            );
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

          const flags = ["-C", "--synctex", resolvedTexPath];

          let code = await runTectonicUpload(flags);
          if (code !== 0) {
            logs += `\n[INFO] Cached compilation failed or package missing. Retrying with remote package fetching...\n`;
            code = await runTectonicUpload(["--synctex", resolvedTexPath]);
          }

          if (code === 0) {
            const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
            const pdfAbsolutePath = path.resolve(projectDir, pdfRelativePath);
            const pdfBuffer = await fs.readFile(pdfAbsolutePath);
            const pdfBase64 = pdfBuffer.toString("base64");

            const finalLogs = logs + `\n[SUCCESS] ${pdfRelativePath}\n`;

            if (projectHash) {
              await setCachedCompile(projectHash, {
                logs: finalLogs,
                pdf: pdfBase64,
              });
            }

            const responseObj = {
              success: true,
              logs: finalLogs,
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
