import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
import { NextRequest } from "next/server";
import { checkRate } from "@/lib/rate-limit";
import { compileUpload, compilerHeaders, compilerMode, compilerUrl } from "@/lib/compile";

export async function POST(req: NextRequest) {
  try {
    await checkRate("compile", 10, 60_000);
    const { projectId: rawProjectId, path: fileRelativePath } = await req.json();
    if (!fileRelativePath) throw new ApiError(400, "Path parameter is required");
    if (!fileRelativePath.endsWith(".tex")) throw new ApiError(400, "Only .tex files can be compiled");

    const projectId = await requireProject(rawProjectId);

    if (compilerMode() === "local") {
      // Local mode stays here rather than moving into lib/compile.ts: it streams
      // Tectonic's output straight to the browser, and its localProjectPath comes
      // from process.cwd(), which is wrong inside eve's tool runtime. The agent's
      // compile-project tool is upload-only for both reasons.
      const response = await fetch(`${compilerUrl()}/compile`, {
        method: "POST",
        headers: compilerHeaders(),
        signal: req.signal,
        body: JSON.stringify({
          mode: "local",
          localProjectPath: projectDirFor(projectId),
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
    }

    // Upload mode. A failed compile answers 200 with the log in the body — the same
    // shape local mode has always used, where failure means "no [SUCCESS] in the
    // log" (see runCompile in app/page.tsx). Genuine request failures still come
    // back as JSON errors via apiError below.
    const result = await compileUpload({ projectId, path: fileRelativePath, signal: req.signal });
    return new Response(result.log, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
