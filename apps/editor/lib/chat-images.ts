/**
 * Keeps the pixels of an image the user attached to a chat message.
 *
 * Eve accepts an image as a `file` part and the model does receive it, but the
 * bytes never come back: both sides of the round trip flatten the part to a
 * "[file: …]" placeholder (see attachment-blocks.ts). So `agent.data.messages`
 * can never render the image, and it is kept here and re-attached on display,
 * keyed by the id {@link imageMarkerFor} writes into the message text.
 *
 * Deliberately memory-only. A data URL for one photo runs to several MB, which
 * is most of the ~5MB localStorage origin quota — parking it there starved the
 * `eve-thread-<id>` session write, whose QuotaExceededError threw out of a
 * useEffect and unmounted the whole thread a moment after the message rendered.
 * The conversation has to survive; a thumbnail from a previous session does
 * not. Images therefore last as long as the tab does, and a reload renders the
 * message without its tile.
 */
export interface ChatImage {
  url: string;
  name: string;
}

// ponytail: unbounded would pin every photo of the session in memory; a flat
// cap is enough, swap for per-thread eviction only if threads get long.
const LIMIT = 24;

const images = new Map<string, ChatImage[]>();

// NUL can't appear in a crypto.randomUUID() id, so it can't collide.
const entryKey = (threadId: string, id: string) => `${threadId}\0${id}`;

/**
 * `crypto.randomUUID` only exists in a secure context, so it is missing when
 * the dev server is reached over a LAN address rather than localhost. Falling
 * back keeps sending an image from throwing there.
 */
export const newImageId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Remember the images a message was sent with. */
export function saveChatImages(threadId: string, id: string, list: ChatImage[]): void {
  images.set(entryKey(threadId, id), list);
  for (const key of images.keys()) {
    if (images.size <= LIMIT) break;
    images.delete(key); // Map iterates oldest-first.
  }
}

/** The images a message was sent with, or none if they are no longer known. */
export function chatImages(threadId: string, id: string): ChatImage[] {
  return images.get(entryKey(threadId, id)) ?? [];
}
