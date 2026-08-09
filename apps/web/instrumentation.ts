/**
 * Next's server instrumentation hook — the only thing that loads Sentry on the
 * server.
 *
 * This previously ran its own `Sentry.init()` gated on `SENTRY_DSN`, and never
 * imported the two config files next to it. `SENTRY_DSN` is set nowhere (not
 * locally, not in Vercel), so `register()` and `onRequestError()` were both
 * permanent no-ops and the two config files — which carry the DSN inline — were
 * dead code. Server-side exceptions went nowhere: the `/api/workspace/threads`
 * 500s from the missing `chat_threads` table were recorded by Vercel but never
 * reached Sentry. The runtime-scoped imports below are the SDK's documented
 * wiring. Mirrors `apps/editor/instrumentation.ts`, which had the same bug.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export async function onRequestError(...args: unknown[]) {
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error — signature provided by Next at runtime
  return Sentry.captureRequestError(...args);
}
