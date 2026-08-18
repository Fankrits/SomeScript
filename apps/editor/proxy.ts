import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === "/api/health") return;

  // fetch() can't follow a cross-origin redirect to Clerk's sign-in page, so an
  // unauthenticated /api/* (or /eve/* — eve's own fetch-driven session routes)
  // call surfaces as an opaque CORS NetworkError (e.g. a failed autosave, or a
  // dropped Eve session continuation). Return a clean 401 instead; only pages redirect.
  if (req.nextUrl.pathname.startsWith("/api/") || req.nextUrl.pathname.startsWith("/eve/")) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return;
  }

  // `auth.protect()` with no signInUrl rewrites a signed-out page request to a
  // bare 404 (x-clerk-auth-reason: protect-rewrite) — which is what
  // https://editor.somescript.com/ served to logged-out visitors. Sign-in lives
  // on the web app, so point there explicitly and carry the return path.
  const signIn = new URL("/sign-in", process.env.NEXT_PUBLIC_WEB_URL ?? req.nextUrl.origin);
  signIn.searchParams.set("redirect_url", req.url);
  await auth.protect({ unauthenticatedUrl: signIn.toString() });

  const res = NextResponse.next();
  // Mirrors next.config.ts's CSP (both set this header — a browser enforces
  // multiple Content-Security-Policy headers as their intersection, so they
  // must stay consistent or the stricter one silently wins).
  //
  // Both dev-only additions exist because localhost is plain-text in dev and
  // matches none of 'self' (this origin only), https:, or wss::
  //   ws://localhost:*   — apps/collaboration's plaintext WebSocket.
  //   http://localhost:* — Clerk's satellite handshake. This app runs as a
  //     satellite (NEXT_PUBLIC_CLERK_IS_SATELLITE) whose primary sign-in is on
  //     http://localhost:3000, so blocking it leaves __clerk_synced=false, the
  //     session token silently stops refreshing, and every /eve/* request
  //     eventually 401s — which surfaces as the chat quietly not responding.
  // Production is same-origin over https:, already covered unconditionally.
  const isProd = process.env.NODE_ENV === "production";
  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' blob: data: https:; font-src 'self' data: https:; connect-src 'self' blob: data: https: wss:${isProd ? "" : " ws://localhost:* http://localhost:*"}; worker-src 'self' blob: data:;`,
  );
  return res;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files.
    //
    // `monitoring` is Sentry's tunnelRoute (next.config.ts). It has to be
    // excluded here or the auth.protect() above rewrites the browser's error
    // envelope POST to a 404 — verified in production — so client-side
    // reporting dies exactly when the Clerk session does, which is the one
    // moment the report matters. Sentry's own note in next.config.ts warns
    // that the tunnel route must not be matched by middleware.
    "/((?!_next|monitoring|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
