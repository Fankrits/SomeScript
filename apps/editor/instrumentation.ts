/**
 * Next's server instrumentation hook — the only thing that loads Sentry on the
 * server.
 *
 * This previously ran its own `Sentry.init({ tracesSampleRate: 0 })` gated on
 * `SENTRY_DSN`, and never imported the two config files next to it. Nothing in
 * `@sentry/nextjs` references `sentry.server.config` / `sentry.edge.config` by
 * name either — the SDK relies on this file importing them — so both were dead
 * code, and with `SENTRY_DSN` unset locally the server had no error capture at
 * all. Every exception in `/api/eve/*` and eve's own route handlers went
 * nowhere. The runtime-scoped imports below are the SDK's documented wiring.
 *
 * Not to be confused with `agent/instrumentation.ts`, which is eve's OTel
 * surface and unrelated to this file.
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
