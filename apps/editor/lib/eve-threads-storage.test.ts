import { expect, test } from "bun:test";
import {
  HISTORY_VERSION,
  readIndex,
  readThreadSnapshot,
  sanitizeIndex,
  sanitizeThreadSnapshot,
} from "./eve-threads-storage";

// --- readIndex --------------------------------------------------------------

test("missing or unreadable index reads back as empty", async () => {
  const s = {
    readFile: async () => {
      throw new Error("ENOENT");
    },
  };
  expect(await readIndex("u1", "p1", s)).toEqual({ threads: [], activeThreadId: "" });
});

test("unparseable or malformed index reads back as empty", async () => {
  expect(await readIndex("u1", "p1", { readFile: async () => "not json" })).toEqual({
    threads: [],
    activeThreadId: "",
  });
  expect(await readIndex("u1", "p1", { readFile: async () => "[]" })).toEqual({
    threads: [],
    activeThreadId: "",
  });
});

test("readIndex round-trips a well-formed index", async () => {
  const stored = JSON.stringify({
    threads: [{ id: "t1", title: "Hello", createdAt: 123 }],
    activeThreadId: "t1",
  });
  expect(await readIndex("u1", "p1", { readFile: async () => stored })).toEqual({
    threads: [{ id: "t1", title: "Hello", createdAt: 123 }],
    activeThreadId: "t1",
  });
});

// --- sanitizeIndex ------------------------------------------------------------

test("sanitizeIndex drops entries with no id or title", () => {
  expect(
    sanitizeIndex({ threads: [{ title: "no id" }, { id: "2" }, "garbage", null], activeThreadId: "" }),
  ).toEqual({ threads: [], activeThreadId: "" });
});

test("sanitizeIndex truncates long titles and caps the list length", () => {
  const index = sanitizeIndex({
    threads: [{ id: "1", title: "x".repeat(5000), createdAt: 1 }],
    activeThreadId: "",
  });
  expect(index.threads[0].title.length).toBe(200);

  const many = Array.from({ length: 300 }, (_, i) => ({ id: String(i), title: "t", createdAt: 1 }));
  expect(sanitizeIndex({ threads: many, activeThreadId: "" }).threads.length).toBe(200);
});

test("sanitizeIndex drops an activeThreadId that doesn't point at a listed thread", () => {
  const index = sanitizeIndex({
    threads: [{ id: "1", title: "x", createdAt: 1 }],
    activeThreadId: "not-listed",
  });
  expect(index.activeThreadId).toBe("");
});

test("sanitizeIndex defaults createdAt when missing or non-finite", () => {
  const index = sanitizeIndex({ threads: [{ id: "1", title: "x" }], activeThreadId: "" });
  expect(typeof index.threads[0].createdAt).toBe("number");
});

// --- sanitizeThreadSnapshot / readThreadSnapshot ------------------------------

test("sanitizeThreadSnapshot accepts a well-formed snapshot", () => {
  const snapshot = { version: HISTORY_VERSION, events: [{ type: "turn.completed" }], sessionState: {} };
  expect(sanitizeThreadSnapshot(snapshot)).toEqual(snapshot);
});

test("sanitizeThreadSnapshot drops a snapshot written by an incompatible version", () => {
  expect(sanitizeThreadSnapshot({ version: "eve-0.1", events: [] })).toBeNull();
});

test("sanitizeThreadSnapshot drops malformed input", () => {
  expect(sanitizeThreadSnapshot(null)).toBeNull();
  expect(sanitizeThreadSnapshot("not an object")).toBeNull();
  expect(sanitizeThreadSnapshot({ version: HISTORY_VERSION, events: "not an array" })).toBeNull();
});

test("readThreadSnapshot drops a snapshot this client cannot replay", async () => {
  const stored = JSON.stringify({ version: "eve-0.1", events: [] });
  expect(await readThreadSnapshot("u1", "p1", "t1", { readFile: async () => stored })).toBeNull();
});

test("readThreadSnapshot returns null for a missing file", async () => {
  const s = {
    readFile: async () => {
      throw new Error("ENOENT");
    },
  };
  expect(await readThreadSnapshot("u1", "p1", "t1", s)).toBeNull();
});

test("readThreadSnapshot round-trips a well-formed snapshot", async () => {
  const snapshot = { version: HISTORY_VERSION, events: [{ i: 1 }], sessionState: { sessionId: "s" } };
  const s = { readFile: async () => JSON.stringify(snapshot) };
  expect(await readThreadSnapshot("u1", "p1", "t1", s)).toEqual(snapshot);
});
