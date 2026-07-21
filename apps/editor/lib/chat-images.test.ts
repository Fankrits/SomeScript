import { expect, test, beforeEach } from "bun:test";
import { chatImages, newImageId, saveChatImages } from "./chat-images";

// A localStorage that enforces a browser-sized quota, so the large-photo paths
// are exercised rather than assumed.
const QUOTA = 5 * 1024 * 1024;
let store = new Map<string, string>();

const used = () => [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);

globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
  setItem(k: string, v: string) {
    if (used() - (store.get(k)?.length ?? 0) + v.length > QUOTA) {
      throw new Error("QuotaExceededError");
    }
    store.set(k, v);
  },
} as Storage;

const image = (bytes: number, name = "photo.jpg") => ({
  url: "data:image/jpeg;base64," + "A".repeat(Math.ceil((bytes * 4) / 3)),
  name,
});

// Fresh thread id per test: the session map is module-level by design.
let thread = 0;
const nextThread = () => `t${++thread}`;

beforeEach(() => {
  store = new Map();
});

test("an image round-trips for the message that sent it", () => {
  const t = nextThread();
  const id = newImageId();
  saveChatImages(t, id, [image(1024)]);
  expect(chatImages(t, id).map((i) => i.name)).toEqual(["photo.jpg"]);
});

test("an unknown id renders no tile rather than throwing", () => {
  expect(chatImages(nextThread(), "never-saved")).toEqual([]);
});

test("images are scoped to their thread", () => {
  const [a, b] = [nextThread(), nextThread()];
  const id = newImageId();
  saveChatImages(a, id, [image(1024, "a.png")]);
  expect(chatImages(b, id)).toEqual([]);
});

// The bug this store replaced: a photo too big to persist made the write fail,
// which wiped every other image already shown in the thread.
test("a photo too large to persist still shows, and spares the others", () => {
  const t = nextThread();
  const small = newImageId();
  saveChatImages(t, small, [image(50 * 1024, "small.png")]);

  const huge = newImageId();
  saveChatImages(t, huge, [image(8 * 1024 * 1024, "huge.jpg")]);

  expect(chatImages(t, huge).map((i) => i.name)).toEqual(["huge.jpg"]);
  expect(chatImages(t, small).map((i) => i.name)).toEqual(["small.png"]);
});

test("images survive a reload when they fit in storage", () => {
  const t = nextThread();
  const id = newImageId();
  saveChatImages(t, id, [image(20 * 1024, "kept.png")]);

  // Same origin, fresh page: only what localStorage holds is available.
  const persisted = JSON.parse(store.get(`eve-thread-images-${t}`)!);
  expect(persisted[id][0].name).toBe("kept.png");
});

test("corrupt stored JSON degrades to no tile", () => {
  const t = nextThread();
  store.set(`eve-thread-images-${t}`, "{not json");
  expect(chatImages(t, "anything")).toEqual([]);
});

test("id generation works without a secure context", () => {
  const real = globalThis.crypto;
  // @ts-expect-error -- simulating a non-secure origin, where randomUUID is absent
  globalThis.crypto = {};
  try {
    expect(newImageId()).toMatch(/^img-/);
  } finally {
    globalThis.crypto = real;
  }
});
