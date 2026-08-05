import { expect, test, afterEach } from "bun:test";
import { cancelEveTurn } from "./eve-cancel";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("posts to the session's cancel route", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await cancelEveTurn("sess_123");

  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("/eve/v1/session/sess_123/cancel");
  expect(calls[0][1]?.method).toBe("POST");
});

test("escapes session ids so a reserved character can't reshape the path", async () => {
  let url = "";
  globalThis.fetch = (async (u: string) => {
    url = u;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await cancelEveTurn("a/b?c");

  expect(url).toBe("/eve/v1/session/a%2Fb%3Fc/cancel");
});

test("swallows a failed cancel — callers are on a recovery path", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  // Resolves rather than rejecting: an unhandled throw here would break the
  // Stop button and the stall banner, which is worse than a missed cancel.
  expect(await cancelEveTurn("sess_123").then(() => "resolved")).toBe("resolved");
});
