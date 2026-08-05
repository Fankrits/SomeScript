import { NextRequest } from "next/server";
import { editorFetch } from "@/lib/editor-api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await editorFetch(`/api/template/pdf?templateId=${id}`);

    if (!res.ok) {
      return new Response(await res.text(), { status: res.status });
    }

    const blob = await res.arrayBuffer();
    return new Response(blob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": blob.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    return new Response(error.message || "Failed to fetch PDF", { status: 500 });
  }
}
