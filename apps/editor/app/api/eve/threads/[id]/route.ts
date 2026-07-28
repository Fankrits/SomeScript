import { requireProject, apiError } from "@/lib/authz";
import { webFetch } from "@/lib/web-api";

/**
 * Thin passthrough to the web app's chat-thread backup API, authenticated as
 * the caller — same pattern as ../../credits/route.ts. requireProject() here
 * is a fast local rejection for an obviously-wrong/unowned projectId; the web
 * route still re-checks ownership itself, since this call is easy to skip.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    await requireProject(body?.projectId);

    const res = await webFetch(`/api/workspace/threads/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return apiError(err);
  }
}
