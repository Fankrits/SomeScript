import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { editorFetch } from "@/lib/editor-api";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type");
  if (!projectId || (type !== "pdf" && type !== "zip")) {
    return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const workspaceId = orgId || userId;
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const upstream = await editorFetch(
    `/api/project/export?projectId=${encodeURIComponent(projectId)}&type=${type}`,
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        upstream.headers.get("Content-Disposition") ?? `attachment; filename="project.${type}"`,
    },
  });
}
