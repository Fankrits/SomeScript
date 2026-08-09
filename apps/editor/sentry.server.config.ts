// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c058d90c98435283fafbbb76a0c83d90@o4511827346849792.ingest.de.sentry.io/4511827455443024",

  // Scaffold default was 1. This file had never actually been loaded (see
  // instrumentation.ts), so switching it on is a change in real traffic, not a
  // no-op — 10% first, raise it once the volume is known. Errors are always
  // captured regardless of this rate; it only samples performance traces.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
