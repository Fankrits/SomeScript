import { expect, test } from "bun:test";
import { sentryDataCollection } from "./sentry-data-collection";

// Sentry v11 collects cookies, bodies, user info and AI content when a category
// is left unset, so every category must stay explicitly restrictive.
test("sentry data collection stays restrictive", () => {
  expect(sentryDataCollection.userInfo).toBe(false);
  expect(sentryDataCollection.cookies).toBe(false);
  expect(sentryDataCollection.httpBodies).toEqual([]);
  expect(sentryDataCollection.genAI).toEqual({ inputs: false, outputs: false });
  expect(sentryDataCollection.databaseQueryData).toBe(false);
  expect(sentryDataCollection.queues).toBe(false);
  expect(sentryDataCollection.graphQL).toEqual({ document: false, variables: false });
});
