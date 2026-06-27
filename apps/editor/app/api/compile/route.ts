import { getProjectPath } from "@/lib/project";
import { spawn } from "child_process";
import { NextRequest } from "next/server";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { path: fileRelativePath } = await req.json();
    if (!fileRelativePath) {
      return Response.json({ error: "Path parameter is required" }, { status: 400 });
    }

    const projectPath = await getProjectPath();
    const resolvedTexPath = path.resolve(projectPath, fileRelativePath);

    // Security check: ensure path is within the project workspace
    if (!resolvedTexPath.startsWith(projectPath)) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }

    if (!resolvedTexPath.endsWith(".tex")) {
      return Response.json({ error: "Only .tex files can be compiled" }, { status: 400 });
    }

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    // Spawn Tectonic command to compile the LaTeX document
    // We run it with stdout and stderr output streamed line by line
    const child = spawn("tectonic", [resolvedTexPath], { cwd: projectPath });

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

    return new Response(responseStream.readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
