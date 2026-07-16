export async function register() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }
}

export async function onRequestError(...args: unknown[]) {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    // @ts-expect-error — signature provided by Next at runtime
    return Sentry.captureRequestError(...args);
  }
}
