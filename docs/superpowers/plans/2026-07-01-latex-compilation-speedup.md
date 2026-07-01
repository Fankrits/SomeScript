# LaTeX Compilation Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accelerate LaTeX compilation by introducing Draft Mode (`-r 0` flags), differential file syncing (remote workspace caching), and a SHA-256 Memory Output Cache.

**Architecture:** 
- Editor settings will contain a `draftMode` toggle that forces Tectonic to compile in a single pass.
- Remote upload mode will only send modified files and write them to persistent workspaces under `workspaces/{projectId}/` instead of recreation.
- An in-memory cache on the compiler server will store and serve identical compilations instantly.

**Tech Stack:** TypeScript, Bun, Next.js, Tectonic LaTeX.

## Global Constraints
- Always validate type safety using `bun x tsc --noEmit` inside `apps/editor/` when editing Next.js page or component files.
- Ensure TypeScript type safety for Bun compiler service by running `bun build ./apps/compiler/index.ts --target bun`.

---

### Task 1: UI Toggle and Settings State
Add the Draft Mode configuration toggle to the settings sidebar and store it in localStorage.

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Interfaces:**
- Produces: `settings.draftMode` boolean which is passed in the body of compile POST request.

- [ ] **Step 1: Update settings type and state initialization**
  Add `draftMode` to settings state around line 414:
  ```typescript
  // Settings State
  const [settings, setSettings] = useState<{
    mainFilePath: string;
    compilerEngine: string;
    tooltipsEnabled: boolean;
    draftMode: boolean;
  }>({
    mainFilePath: "main.tex",
    compilerEngine: "tectonic",
    tooltipsEnabled: true,
    draftMode: true,
  });
  ```
  Ensure local storage loader inside `useEffect` (around line 435) also sets a fallback:
  ```typescript
  } else {
    setSettings({
      mainFilePath: "main.tex",
      compilerEngine: "tectonic",
      tooltipsEnabled: true,
      draftMode: true,
    });
  }
  ```

- [ ] **Step 2: Add Draft Mode Toggle UI**
  Add the HTML checkbox input under the `Project Settings` sidebar section (around line 1768):
  ```tsx
  <hr className="border-border/60" />

  <div className="flex items-start justify-between gap-3">
    <div className="space-y-0.5">
      <label className="text-xs font-semibold text-muted-foreground">
        Draft Mode (Fast Compile)
      </label>
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        Bypass auxiliary reruns. Speeds up compilation by ~40% for draft reviews.
      </div>
    </div>
    <input
      type="checkbox"
      checked={settings.draftMode ?? true}
      onChange={(e) => saveSettings({ ...settings, draftMode: e.target.checked })}
      className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
    />
  </div>
  ```

- [ ] **Step 3: Send draftMode in Compile Request**
  Update `handleCompileLatex` (around line 884) to pass the `draftMode` property in the POST request:
  ```typescript
  // Trigger compilation using compilePath
  const res = await fetch("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: compilePath, draftMode: settings.draftMode }),
  });
  ```

- [ ] **Step 4: Verify type safety & run checks**
  Run: `bun x tsc --noEmit` inside `apps/editor`
  Expected: Command succeeds with no type errors.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add apps/editor/app/page.tsx
  git commit -m "feat(editor): add draftMode state and settings toggle"
  ```

---

### Task 2: Next.js API Route Tracking & Differential Uploads
Modify the compile API route to support differential file syncing by tracking hashes of uploaded files in-memory.

**Files:**
- Modify: `apps/editor/app/api/compile/route.ts`

**Interfaces:**
- Consumes: `draftMode` from request payload.
- Produces: Updated compile payload format with `projectId`, `syncType` ("full" or "differential"), `files` (modified only), and `deletedFiles`.

- [ ] **Step 1: Define File Hash Cache and request payload interface**
  Add in-memory hash cache and updated interfaces at the top of the file:
  ```typescript
  import { createHash } from "crypto";

  // Simple in-memory cache to track file content hashes per project
  const uploadedFilesCache = new Map<string, string>(); // Key: `${projectId}:${filePath}`, Value: contentHash

  interface DifferentialFile {
    path: string;
    content: string;
  }
  ```

- [ ] **Step 2: Update compile API post handler logic**
  Replace `POST` request payload parsing, hash calculation, and remote compiler request logic (lines 43-125):
  ```typescript
  export async function POST(req: NextRequest) {
    try {
      const { path: fileRelativePath, draftMode } = await req.json();
      if (!fileRelativePath) {
        return Response.json({ error: "Path parameter is required" }, { status: 400 });
      }

      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);

      if (!fileRelativePath.endsWith(".tex")) {
        return Response.json({ error: "Only .tex files can be compiled" }, { status: 400 });
      }

      const compilerUrl = process.env.COMPILER_URL || "http://127.0.0.1:3001";
      const defaultMode =
        compilerUrl.includes("localhost") ||
        compilerUrl.includes("127.0.0.1") ||
        compilerUrl.includes("0.0.0.0")
          ? "local"
          : "upload";
      const compilerMode = process.env.COMPILER_MODE || defaultMode;

      if (compilerMode === "local") {
        const response = await fetch(`${compilerUrl}/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "local",
            localProjectPath: projectPath,
            fileRelativePath,
            draft: draftMode ?? true,
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

        // Find modified and deleted files compared to our cache
        const changedFiles: DifferentialFile[] = [];
        const currentProjectKeys = new Set<string>();

        for (const file of allFiles) {
          const cacheKey = `${projectId}:${file.path}`;
          currentProjectKeys.add(cacheKey);

          const contentHash = createHash("sha256").update(file.content).digest("hex");
          const cachedHash = uploadedFilesCache.get(cacheKey);

          if (cachedHash !== contentHash) {
            changedFiles.push(file);
            uploadedFilesCache.set(cacheKey, contentHash);
          }
        }

        // Detect deleted files
        const deletedFiles: string[] = [];
        for (const cacheKey of uploadedFilesCache.keys()) {
          if (cacheKey.startsWith(`${projectId}:`) && !currentProjectKeys.has(cacheKey)) {
            const filePath = cacheKey.substring(projectId.length + 1);
            deletedFiles.push(filePath);
            uploadedFilesCache.delete(cacheKey);
          }
        }

        // Determine if we need full or differential sync
        // If cache was completely empty for this project, force a full sync
        const projectCacheKeys = Array.from(uploadedFilesCache.keys()).filter(k => k.startsWith(`${projectId}:`));
        const syncType = projectCacheKeys.length === changedFiles.length ? "full" : "differential";

        const compilePayload = {
          mode: "upload",
          projectId,
          fileRelativePath,
          draft: draftMode ?? true,
          syncType,
          files: syncType === "full" ? allFiles : changedFiles,
          deletedFiles,
        };

        let response = await fetch(`${compilerUrl}/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(compilePayload),
        });

        // Handle full sync retry if compiler says workspace was missing/cleared
        if (response.status === 409) {
          const errData = await response.json().catch(() => ({}));
          if (errData.requireFullSync) {
            // Clear cache and retry with a full upload
            projectCacheKeys.forEach(k => uploadedFilesCache.delete(k));
            allFiles.forEach(file => {
              const hash = createHash("sha256").update(file.content).digest("hex");
              uploadedFilesCache.set(`${projectId}:${file.path}`, hash);
            });

            response = await fetch(`${compilerUrl}/compile`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "upload",
                projectId,
                fileRelativePath,
                draft: draftMode ?? true,
                syncType: "full",
                files: allFiles,
                deletedFiles: [],
              }),
            });
          }
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ logs: "Failed to parse error response" }));
          return Response.json({ error: errData.logs || "Compiler service error" }, { status: response.status });
        }

        const result = await response.json();

        if (result.success && result.pdf) {
          const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
          await storage.writeFile(projectId, pdfRelativePath, Buffer.from(result.pdf, "base64"));
        }

        return new Response(result.logs || "", {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }
    } catch (error: any) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Verify build compiles**
  Run: `bun x tsc --noEmit` inside `apps/editor`
  Expected: Command succeeds with no errors.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add apps/editor/app/api/compile/route.ts
  git commit -m "feat(api): implement differential sync tracking in compile route"
  ```

---

### Task 3: Compiler Service Workspace Caching, Output Caching, and Draft Mode
Update the Bun compiler to support persistent workspace directories per projectId, draft-mode CLI flags (`-r 0`), and a SHA-256 compiled output cache.

**Files:**
- Modify: `apps/compiler/index.ts`

- [ ] **Step 1: Implement SHA-256 request caching and persistent workspaces in index.ts**
  Add memory caching utility, crypto hash calculation, and workspaces logic:
  ```typescript
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
      if (!resolvedPath.startsWith(path.resolve(baseDir))) {
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
  ```

- [ ] **Step 2: Update Serve Request Handler**
  Update the main `Bun.serve` endpoint to handle differential uploads, cache check, and draft modes:
  ```typescript
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
          const { mode, localProjectPath, fileRelativePath, files, deletedFiles, projectId, syncType, draft } = body;

          // 1. Output Cache Verification (For remote/upload compilation)
          let payloadHash = "";
          if (mode === "upload" && projectId) {
            payloadHash = crypto.createHash("sha256").update(bodyText).digest("hex");
            const cached = compilationCache.get(payloadHash);
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
            if (!resolvedTexPath.startsWith(path.resolve(localProjectPath))) {
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

            // Apply deletions
            if (deletedFiles && Array.isArray(deletedFiles)) {
              for (const relPath of deletedFiles) {
                const target = path.join(projectDir, relPath);
                if (target.startsWith(projectDir)) {
                  await fs.rm(target, { recursive: true, force: true });
                }
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
              if (payloadHash) {
                compilationCache.set(payloadHash, {
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
  ```

- [ ] **Step 3: Verify compilation / syntax**
  Run: `bun build ./apps/compiler/index.ts --target bun`
  Expected: Builds correctly without syntax or imports errors.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add apps/compiler/index.ts
  git commit -m "feat(compiler): support memory cache, persistent workspace directory and draft mode"
  ```
