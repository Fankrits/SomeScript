import { expect, test, beforeEach } from "bun:test";
import { chatImages, newImageId, saveChatImages } from "./chat-images";

// A localStorage that enforces a browser-sized quota, so a store that reached
// for it would be caught here rather than in the browser.
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

// The regression that made a sent message flash and vanish: a photo parked in
// localStorage ate the ~5MB origin quota, so the `eve-thread-<id>` session
// write threw QuotaExceededError out of a useEffect and unmounted the thread.
test("images never consume localStorage, leaving the quota for chat history", () => {
  const t = nextThread();
  saveChatImages(t, newImageId(), [image(3 * 1024 * 1024)]);
  expect(store.size).toBe(0);

  // A full turn's history still fits afterwards.
  expect(() =>
    localStorage.setItem(`eve-thread-${t}`, JSON.stringify({ events: "x".repeat(2_000_000) })),
  ).not.toThrow();
});

test("a photo far larger than any storage quota still shows", () => {
  const t = nextThread();
  const id = newImageId();
  saveChatImages(t, id, [image(20 * 1024 * 1024, "huge.jpg")]);
  expect(chatImages(t, id).map((i) => i.name)).toEqual(["huge.jpg"]);
});

test("images do not accumulate without bound", () => {
  const t = nextThread();
  const ids = Array.from({ length: 40 }, () => newImageId());
  for (const id of ids) saveChatImages(t, id, [image(1024)]);

  const alive = ids.filter((id) => chatImages(t, id).length > 0);
  expect(alive.length).toBeLessThanOrEqual(24);
  // The most recent sends are the ones still on screen, so they must survive.
  expect(chatImages(t, ids.at(-1)!)).toHaveLength(1);
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
