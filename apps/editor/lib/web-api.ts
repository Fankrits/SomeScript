const WEB_BASE = process.env.WEB_URL || process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

/**
 * Server-side fetch to the web app, authenticated as the current user. Mirrors
 * apps/web/lib/editor-api.ts in reverse. Lazy Clerk import: same reasoning as
 * lib/authz.ts — this module must stay safe to import from eve-bundled code.
 */
export async function webFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { getToken } = await auth();
  const token = await getToken();
  return fetch(`${WEB_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
