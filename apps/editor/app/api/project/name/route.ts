import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    // Dynamically build the web API URL based on request hostname/environment
    const host = req.headers.get("host") || "localhost:3002";
    const hostname = host.split(":")[0];
    
    // In local dev, web is on port 3000, editor is on port 3002.
    // If not local dev, we default to the same origin host but port 3000, or production domain
    const webUrl = host.includes("localhost") || host.includes("127.0.0.1")
      ? `http://${hostname}:3000`
      : `https://${hostname}`;

    const res = await fetch(`${webUrl}/api/project-info?projectId=${projectId}`);
    if (!res.ok) {
      return Response.json({ error: "Failed to fetch project name from web service" }, { status: res.status });
    }
    const data = await res.json();
    return Response.json(data);
  } catch (error: any) {
    console.error("Error fetching project name from web service:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
