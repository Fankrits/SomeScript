import { expect, test } from "bun:test";
import { readTasks, sanitizeTasks } from "./tasks";

test("missing or unreadable file reads back as no tasks", async () => {
  const s = { readFile: async () => { throw new Error("ENOENT"); } };
  expect(await readTasks("proj", s)).toEqual([]);
});

test("unparseable or non-array file contents read back as no tasks", async () => {
  expect(await readTasks("proj", { readFile: async () => "not json" })).toEqual([]);
  expect(await readTasks("proj", { readFile: async () => "{}" })).toEqual([]);
});

test("sanitizeTasks keeps a well-formed task intact", () => {
  const task = { id: "1", name: "Fix citation", description: "needs a page number", done: false, createdAt: 123, source: { path: "a.tex", line: 4 } };
  expect(sanitizeTasks([task])).toEqual([task]);
});

test("sanitizeTasks omits description when absent or empty", () => {
  const [a] = sanitizeTasks([{ id: "1", name: "x" }]);
  expect(a.description).toBeUndefined();
  const [b] = sanitizeTasks([{ id: "1", name: "x", description: "" }]);
  expect(b.description).toBeUndefined();
});

test("sanitizeTasks drops entries with no id or name", () => {
  expect(sanitizeTasks([{ name: "no id" }, { id: "2" }, "garbage", null])).toEqual([]);
});

test("sanitizeTasks coerces done and defaults createdAt", () => {
  const [task] = sanitizeTasks([{ id: "1", name: "x", done: "yes" }]);
  expect(task.done).toBe(true);
  expect(typeof task.createdAt).toBe("number");
});

test("sanitizeTasks truncates long name/description and caps the list length", () => {
  const [task] = sanitizeTasks([{ id: "1", name: "x".repeat(5000), description: "y".repeat(10000) }]);
  expect(task.name.length).toBe(200);
  expect(task.description?.length).toBe(5000);

  const many = Array.from({ length: 600 }, (_, i) => ({ id: String(i), name: "t" }));
  expect(sanitizeTasks(many).length).toBe(500);
});

test("sanitizeTasks keeps only known source fields", () => {
  const [task] = sanitizeTasks([
    { id: "1", name: "x", source: { path: "a.tex", line: 1, endLine: 2, page: 3, evil: 1 } },
  ]);
  expect(task.source).toEqual({ path: "a.tex", line: 1, endLine: 2, page: 3 });
});
