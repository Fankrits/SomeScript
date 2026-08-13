/**
 * Event-log hygiene shared by both the server-side thread store
 * (lib/eve-threads-storage.ts) and the client runtime hook that produces the
 * events (hooks/use-eve-runtime.ts): shrinking eve's streaming event log
 * before it is persisted or transferred, and the version stamp that gates
 * whether a saved snapshot can still be replayed. Persistence itself lives in
 * lib/eve-threads-storage.ts (server) / lib/eve-threads-client.ts (browser
 * fetch wrappers) — this file has no I/O of its own.
 */

// Stamped into saved threads. Bump on any eve upgrade, or any change to what
// is persisted, so state the current client cannot replay is discarded.
// (Was left at "eve-0.26" across the 0.31 upgrade, which changed the session
// state type — those blobs were being replayed into the new reducer.)
export const HISTORY_VERSION = "eve-0.31";

const APPENDED_TYPES = new Set(["message.appended", "reasoning.appended"]);

/**
 * Collapses eve's streaming text runs down to their final event.
 *
 * eve streams text by resending the whole message: every `message.appended`
 * carries `messageSoFar`, the full text up to that point (see
 * `messageSoFar` in eve/dist/src/protocol/message.d.ts), and the client keeps
 * every event. So one reply of N chunks costs O(N²) characters to store — a
 * 20 KB answer serializes to ~6 MB, past the ~5 MB origin quota, and a model
 * stuck in a repetition loop reaches tens of MB. Stringifying that on the
 * autosave path froze the main thread, which is what made the chat look
 * "stuck" mid-reply.
 *
 * Only the newest `*.appended` per (turnId, stepIndex) is needed: the
 * reducer's `upsertRun` replaces the still-`streaming` part in place, and
 * `message.completed` overwrites it with the final text anyway. Keeping the
 * last one replays identically — including for a turn abandoned mid-stream,
 * which never gets a `completed` event and so still needs its partial text.
 *
 * Caveat: eve documents `initialEvents` as "an ordered prefix of the same
 * session's stream" (docs/guides/frontend/overview.mdx), and collapsing makes
 * it a subsequence instead. That is safe here only because resume rides on
 * `initialSession.streamIndex`, not on the saved log's length. If anyone
 * adopts the lower-level reconnect the same doc describes —
 * `session.stream({ startIndex: savedEvents.length })` — that length is no
 * longer the stream position and the collapse has to move behind it.
 */
export function collapseAppendedRuns<T>(events: readonly T[]): T[] {
  const newest = new Map<string, number>();
  events.forEach((event, i) => {
    const e = event as { type?: string; data?: { turnId?: string; stepIndex?: number } } | null;
    if (e?.type && APPENDED_TYPES.has(e.type)) {
      newest.set(`${e.type}:${e.data?.turnId}:${e.data?.stepIndex}`, i);
    }
  });
  if (newest.size === 0) return events as T[];
  const keep = new Set(newest.values());
  return events.filter((event, i) => {
    const type = (event as { type?: string } | null)?.type;
    return !type || !APPENDED_TYPES.has(type) || keep.has(i);
  });
}

/**
 * Longest string kept intact in a persisted event before it is truncated.
 *
 * Unlike the streaming duplication collapseAppendedRuns fixes, a tool result
 * is a single event with no cheaper form: write-file carries the whole new
 * file, read-file returns the whole document, compile-project returns the
 * full Tectonic log. Any one of those can be large enough to make transferring
 * and storing it wasteful even without a hard quota to blow. Generous enough
 * that a truncated tool result is still useful on reload; small enough that
 * no single event can single-handedly bloat a save.
 */
const MAX_PAYLOAD_STRING = 200_000;

function capStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_PAYLOAD_STRING
      ? `${value.slice(0, MAX_PAYLOAD_STRING)}… (${value.length} chars, truncated for storage)`
      : value;
  }
  if (Array.isArray(value)) return value.map(capStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, capStrings(v)]));
  }
  return value;
}

/**
 * Caps oversized string payloads anywhere in an event, structure otherwise
 * intact. Walks every event generically, the same way eve-diagnostics.ts's
 * `summarize` does, rather than special-casing `action.result`/
 * `actions.requested` field names — those are today's known offenders, but
 * eve's protocol adding a new large-payload event should not silently
 * reopen this hole.
 */
export function capOversizedPayloads<T>(events: readonly T[]): T[] {
  return events.map((event) => capStrings(event)) as T[];
}

export type ThreadSnapshot<E = unknown, S = unknown> = {
  version: string;
  events: E[];
  sessionState: S;
};
