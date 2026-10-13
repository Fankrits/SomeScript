import type { init } from "@sentry/nextjs";

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

const SENSITIVE_KEYS = ["forwarded", "-ip", "remote-", "via", "-user"];

/**
 * Restrictive baseline shared by every `Sentry.init` (server, edge, client).
 *
 * Sentry v11 replaced `sendDefaultPii` with `dataCollection` and made the
 * default permissive: leaving it unset (or `{}`) now sends cookies, user IP,
 * every HTTP request/response body, DB query data and AI inputs/outputs. Here
 * those carry users' LaTeX documents, prompts and Clerk session cookies, so this
 * pins the v10 default — the block from Sentry's v10 -> v11 migration guide
 * ("preserves the v10 default"). Loosen a category deliberately, never by
 * deleting the key.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: SENSITIVE_KEYS },
    response: { deny: SENSITIVE_KEYS },
  },
  httpBodies: [],
  urlQueryParams: { deny: SENSITIVE_KEYS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies DataCollection;
