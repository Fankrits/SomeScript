/**
 * Keeps the pixels of an image the user attached to a chat message.
 *
 * Eve accepts an image as a `file` part and the model does receive it, but the
 * bytes never come back: both sides of the round trip flatten the part to a
 * "[file: …]" placeholder (see attachment-blocks.ts). So `agent.data.messages`
 * can never render the image, and it is kept here and re-attached on display,
 * keyed by the id {@link imageMarkerFor} writes into the message text.
 *
 * The in-memory map is the source of truth. It cannot fail, and it needs no
 * JSON parsing — which matters because the display path re-runs on every
 * streamed token. localStorage is only a best-effort mirror so images survive a
 * reload: one full-resolution photo can exceed the ~5MB origin quota on its
 * own, and when it does the session keeps working instead of the failed write
 * taking the thread's other images down with it.
 */
export interface ChatImage {
  url: string;
  name: string;
}

/** How many messages' images to mirror to localStorage per thread. */
const KEEP = 8;

const memory = new Map<string, ChatImage[]>();
const hydrated = new Set<string>();

const storageKey = (threadId: string) => `eve-thread-images-${threadId}`;
// NUL can't appear in a crypto.randomUUID() id, so it can't collide.
const entryKey = (threadId: string, id: string) => `${threadId}\0${id}`;

const hasStorage = () => typeof localStorage !== "undefined";

const readStored = (threadId: string): Record<string, ChatImage[]> => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(threadId)) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, ChatImage[]>)
      : {};
  } catch {
    return {};
  }
};

/** Pull a thread's persisted images into memory once, on first use. */
const hydrate = (threadId: string) => {
  if (hydrated.has(threadId) || !hasStorage()) return;
  hydrated.add(threadId);
  for (const [id, images] of Object.entries(readStored(threadId))) {
    const key = entryKey(threadId, id);
    if (!memory.has(key)) memory.set(key, images);
  }
};

/**
 * `crypto.randomUUID` only exists in a secure context, so it is missing when
 * the dev server is reached over a LAN address rather than localhost. Falling
 * back keeps sending an image from throwing there.
 */
export const newImageId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Remember the images a message was sent with. */
export function saveChatImages(threadId: string, id: string, images: ChatImage[]): void {
  memory.set(entryKey(threadId, id), images);
  if (!hasStorage()) return;
  const kept = Object.entries({ ...readStored(threadId), [id]: images }).slice(-KEEP);
  try {
    localStorage.setItem(storageKey(threadId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Over quota. The map above still serves this session; whatever is already
    // stored stays readable for the next one.
  }
}

/** The images a message was sent with, or none if they are no longer known. */
export function chatImages(threadId: string, id: string): ChatImage[] {
  hydrate(threadId);
  return memory.get(entryKey(threadId, id)) ?? [];
}
