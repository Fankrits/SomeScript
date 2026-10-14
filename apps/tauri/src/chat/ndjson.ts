import type { ChatEvent } from "./types";

/**
 * Reads a newline-delimited JSON stream. Chunks arrive split anywhere (mid-line, mid-character),
 * so bytes are decoded as a stream and only complete lines are parsed. A line that isn't JSON is
 * skipped rather than ending the whole reply.
 */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const parse = (line: string): ChatEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const event = JSON.parse(trimmed) as ChatEvent;
      return event && typeof event === "object" && typeof event.type === "string" ? event : null;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const event = parse(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        if (event) yield event;
        newline = buffered.indexOf("\n");
      }
    }
    buffered += decoder.decode();
    const last = parse(buffered);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
