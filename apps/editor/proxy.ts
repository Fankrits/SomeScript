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

  await auth.protect();

  const res = NextResponse.next();
  // Mirrors next.config.ts's CSP (both set this header — a browser enforces
  // multiple Content-Security-Policy headers as their intersection, so they
  // must stay consistent or the stricter one silently wins). ws://localhost:*
  // is dev-only, for apps/collaboration's plaintext WebSocket; production
  // connects over wss:, already covered by the unconditional `wss:` below.
  const isProd = process.env.NODE_ENV === "production";
  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' blob: data: https:; font-src 'self' data: https:; connect-src 'self' blob: data: https: wss:${isProd ? "" : " ws://localhost:*"}; worker-src 'self' blob: data:;`,
  );
  return res;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
