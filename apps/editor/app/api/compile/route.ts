import { getProjectPath } from "@/lib/project";
import { exec } from "child_process";
import fs from "fs/promises";
import { NextRequest } from "next/server";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

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

    // Run Tectonic command to compile the LaTeX document
    const command = `tectonic "${resolvedTexPath}"`;
    await execAsync(command);

    // Read the compiled PDF file
    const pdfPath = resolvedTexPath.replace(/\.tex$/, ".pdf");
    const pdfBuffer = await fs.readFile(pdfPath);

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(pdfPath)}"`,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
