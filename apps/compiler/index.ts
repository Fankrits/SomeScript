import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

const PORT = process.env.PORT || 3001;

// Helper to safely write uploaded files to a directory
async function writeFiles(baseDir: string, files: { path: string; content: string }[]) {
  for (const file of files) {
    const filePath = path.join(baseDir, file.path);
    // Security check: ensure path is within the baseDir
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(baseDir))) {
      throw new Error(`Invalid file path: ${file.path}`);
    }
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    // Check if content is base64 or plain text
    if (file.content.startsWith("data:") || file.path.endsWith(".pdf") || file.path.endsWith(".png") || file.path.endsWith(".jpg")) {
      const base64Data = file.content.split(";base64,").pop() || file.content;
      await fs.writeFile(resolvedPath, Buffer.from(base64Data, "base64"));
    } else {
      await fs.writeFile(resolvedPath, file.content, "utf-8");
    }
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Compile endpoint
    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        const body = await req.json();
        const { mode, localProjectPath, fileRelativePath, files } = body;

        if (mode === "local") {
          if (!localProjectPath || !fileRelativePath) {
            return Response.json({ error: "Missing localProjectPath or fileRelativePath for local mode" }, { status: 400 });
          }

          const resolvedTexPath = path.resolve(localProjectPath, fileRelativePath);
          if (!resolvedTexPath.startsWith(path.resolve(localProjectPath))) {
            return Response.json({ error: "Access denied" }, { status: 403 });
          }

          // Create standard text encoder/decoder stream
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();

          const child = spawn("tectonic", [resolvedTexPath], { cwd: localProjectPath });

          child.stdout.on("data", (data) => {
            writer.write(encoder.encode(data.toString()));
          });

          child.stderr.on("data", (data) => {
            writer.write(encoder.encode(data.toString()));
          });

          child.on("close", (code) => {
            if (code === 0) {
              const relativePdfPath = fileRelativePath.replace(/\.tex$/, ".pdf");
              writer.write(encoder.encode(`\n[SUCCESS] ${relativePdfPath}\n`));
            } else {
              writer.write(encoder.encode(`\n[ERROR] Tectonic exited with code ${code}\n`));
            }
            writer.close();
          });

          child.on("error", (err) => {
            writer.write(encoder.encode(`\n[ERROR] Failed to start Tectonic: ${err.message}\n`));
            writer.close();
          });

          return new Response(readable, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        } 
        
        if (mode === "upload") {
          if (!files || !Array.isArray(files) || !fileRelativePath) {
            return Response.json({ error: "Missing files array or fileRelativePath for upload mode" }, { status: 400 });
          }

          // Create a temp directory for compilation
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tectonic-compile-"));
          
          try {
            await writeFiles(tempDir, files);
            const resolvedTexPath = path.resolve(tempDir, fileRelativePath);

            let logs = "";
            const child = spawn("tectonic", [resolvedTexPath], { cwd: tempDir });

            child.stdout.on("data", (data) => {
              logs += data.toString();
            });

            child.stderr.on("data", (data) => {
              logs += data.toString();
            });

            const code = await new Promise<number | null>((resolve) => {
              child.on("close", resolve);
              child.on("error", () => resolve(-1));
            });

            if (code === 0) {
              const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
              const pdfAbsolutePath = path.resolve(tempDir, pdfRelativePath);
              const pdfBuffer = await fs.readFile(pdfAbsolutePath);
              const pdfBase64 = pdfBuffer.toString("base64");

              return Response.json({
                success: true,
                logs: logs + `\n[SUCCESS] ${pdfRelativePath}\n`,
                pdf: pdfBase64,
              });
            } else {
              return Response.json({
                success: false,
                logs: logs + `\n[ERROR] Tectonic exited with code ${code}\n`,
              }, { status: 422 });
            }
          } finally {
            // Clean up temp directory after response is constructed/sent
            setTimeout(async () => {
              try {
                await fs.rm(tempDir, { recursive: true, force: true });
              } catch (err) {
                console.error("Failed to clean up temp dir:", tempDir, err);
              }
            }, 5000);
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
