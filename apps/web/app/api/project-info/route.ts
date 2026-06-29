import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (project) {
      return Response.json({ name: project.name });
    }
    return Response.json({ error: "Project not found" }, { status: 404 });
  } catch (error: any) {
    console.error("Error fetching project info:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
