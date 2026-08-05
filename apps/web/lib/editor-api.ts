import { auth } from "@clerk/nextjs/server";

const EDITOR_BASE =
  process.env.EDITOR_URL || process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002";

/** Server-side fetch to the editor service, authenticated as the current user. */
export async function editorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${EDITOR_BASE}${path}`, { ...init, headers });
}
