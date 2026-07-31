import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { editorFetch } from "@/lib/editor-api";

/**
 * POST /api/template/preview
 *
 * Proxies the zip file to the editor's preview endpoint,
 * which extracts + compiles it in a temporary staging bucket.
 * Returns { ok, tempId } on success or { ok, log } on compile failure.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  try {
    const formData = await req.formData();
    const res = await editorFetch("/api/template/preview", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (error: any) {
    return Response.json({ ok: false, log: error.message || "Preview failed" }, { status: 500 });
  }
}
