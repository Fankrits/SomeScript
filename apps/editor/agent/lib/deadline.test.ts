import { expect, test } from "bun:test";
import { isAbortLike, withDeadline } from "./deadline";

// The whole point of the helper is that it fires on its own, so the deadline
// has to be observed, not just constructed. 20ms keeps the suite fast.
test("aborts on its own deadline, and reports a TimeoutError", async () => {
  const signal = withDeadline(undefined, 20);
  expect(signal.aborted).toBe(false);

  await new Promise((r) => setTimeout(r, 40));

  expect(signal.aborted).toBe(true);
  expect(isAbortLike(signal.reason)).toBe(true);
});

// Turn cancellation must still win instantly — a deadline that swallowed an
// already-aborted signal would leave a cancelled turn's fetch running.
test("an already-aborted caller signal wins immediately", () => {
  const signal = withDeadline(AbortSignal.abort(), 60_000);
  expect(signal.aborted).toBe(true);
  expect(isAbortLike(signal.reason)).toBe(true);
});

// A live caller signal must not be pre-aborted by composing it.
test("stays open while both inputs are open", () => {
  expect(withDeadline(new AbortController().signal, 60_000).aborted).toBe(false);
});

// This is the branch each tool's catch keys on to pick its message, so a
// genuine service failure must not be mistaken for a timeout.
test("isAbortLike ignores ordinary errors", () => {
  expect(isAbortLike(new Error("HTTP 500"))).toBe(false);
  expect(isAbortLike(undefined)).toBe(false);
  expect(isAbortLike(null)).toBe(false);
});
