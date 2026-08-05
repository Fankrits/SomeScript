import { NextRequest } from "next/server";
import { requireWorkspace, apiError } from "@/lib/authz";
import { webFetch } from "@/lib/web-api";

/** Thin passthrough to the web app's credit balance/usage API, authenticated as the caller. */
export async function GET() {
  try {
    await requireWorkspace();
    const res = await webFetch("/api/workspace/credits");
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireWorkspace();
    const body = await req.text();
    const res = await webFetch("/api/workspace/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return apiError(err);
  }
}
