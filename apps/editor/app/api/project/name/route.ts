import { NextRequest } from "next/server";
import { requireProject, apiError, getPool } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));

    if (projectId === "default") {
      return Response.json({ name: "Local Sandbox" });
    }

    const result = await getPool().query("SELECT name FROM projects WHERE id = $1", [projectId]);
    if (result.rows.length === 0) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    return Response.json({ name: result.rows[0].name });
  } catch (error) {
    return apiError(error);
  }
}
