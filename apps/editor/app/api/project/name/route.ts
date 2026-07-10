import { NextRequest } from "next/server";
import { Pool } from "pg";

let pool: Pool | null = null;
function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  // 1. Try to query database directly
  const dbPool = getPool();
  if (dbPool) {
    try {
      const client = await dbPool.connect();
      try {
        const result = await client.query(
          "SELECT name FROM projects WHERE id = $1",
          [projectId]
        );
        if (result.rows.length > 0) {
          return Response.json({ name: result.rows[0].name });
        }
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error("Direct database query failed, falling back to fetch:", dbError);
    }
  }

  // 2. Fallback to HTTP fetch from web service
  try {
    const host = req.headers.get("host") || "localhost:3002";
    const hostname = host.split(":")[0];
    
    // In local dev, web is on port 3000, editor is on port 3002.
    // If not local dev, we default to the same origin host but port 3000, or production domain
    const webUrl = host.includes("localhost") || host.includes("127.0.0.1")
      ? `http://${hostname}:3000`
      : `https://${hostname}`;

    const res = await fetch(`${webUrl}/api/project-info?projectId=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.name) {
        return Response.json(data);
      }
    }
  } catch (error: any) {
    console.error("Error fetching project name from web service:", error);
  }

  return Response.json({ error: "Project not found" }, { status: 404 });
}

