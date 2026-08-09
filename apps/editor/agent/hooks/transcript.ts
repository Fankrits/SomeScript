import { defineHook } from "eve/hooks";

/**
 * Structured transcript of every chat turn, server side.
 *
 * This is the only record that survives a dead client — and a dead client is
 * exactly the failure mode we keep chasing. A stalled NDJSON stream, a closed
 * tab, a dropped socket: in every one of them the browser stops observing while
 * the durable turn keeps running, so `lib/eve-diagnostics.ts` (which only sees
 * what reaches the browser) is structurally blind to the second half. Hooks fire
 * after each event is durably recorded, wherever the client went.
 *
 * ## Debugging a chat session
 *
 * Everything below keys on the same `sessionId`.
 *
 * | Question                                    | Where                                                          |
 * | ------------------------------------------- | -------------------------------------------------------------- |
 * | What was the model fed, what did it return? | `bun x eve traces ls`, then `bun x eve traces <id> --verbose`   |
 * | What did the server do after the client quit? | `grep eve.transcript` this app's log (below), `\| jq -c`       |
 * | What did the browser see?                   | `eveDiagnostics()` in the console, or `grep '\[eve\]'`          |
 * | Which user, which document, what error?     | Sentry issue → breadcrumbs, `eve` context, Replay              |
 * | Cost / model / token trends                 | Vercel Observability → Agent Runs (`$eve.*` tags, automatic)   |
 *
 * Log location: `.next/dev/logs/next-development.log` in dev, Vercel Runtime
 * Logs in production. (`eve logs` does NOT apply here — `.eve/logs/` is written
 * by the interactive `eve dev` process, and this app runs `next dev` under
 * `withEve`.)
 *
 * ## Constraints
 *
 * `agent/**` compiles into eve's bundle, not Next's: relative imports only, no
 * `@/` alias, no `next/*`, nothing that reaches Clerk. That is why the clipping
 * below is duplicated here rather than imported from `lib/eve-diagnostics.ts`,
 * which is a `"use client"` module.
 */

/**
 * Longest string kept before it is replaced by a length.
 *
 * Sized against what actually flows through here: a `write-file` input carries
 * a whole LaTeX file and a `compile-project` result carries a whole Tectonic
 * log. Log platforms truncate long lines, and a truncated line is not valid
 * JSON — so an uncapped payload doesn't just bloat the record, it destroys it.
 */
const MAX_STRING = 4_000;

/** Data URLs are base64 blobs; a prefix is enough to identify one. */
const MAX_DATA_URL = 64;

/** Deepest object nesting kept before a placeholder. */
const MAX_DEPTH = 6;

/** Longest array kept before the tail is dropped. */
const MAX_ITEMS = 50;

/**
 * Whether to record message text, tool arguments and tool results.
 *
 * Deliberately eve's own EVE_TRACES_CONTENT rather than a second variable of
 * our own: it already gates content in the local trace spool
 * (`captureContent: process.env.EVE_TRACES_CONTENT !== "off"`), so one switch
 * turns off content capture across both surfaces. Ids, event types, token
 * usage and failure codes are recorded regardless — those are never sensitive
 * and they are what most incident triage actually needs.
 *
 * Note: with this on, users' unpublished LaTeX enters this app's log retention.
 * That is a deliberate choice and a privacy-policy disclosure item.
 */
const captureContent = process.env.EVE_TRACES_CONTENT !== "off";

/**
 * Shrink one event payload to something safe to put on a log line.
 *
 * `content` is a parameter rather than a direct read of `captureContent` so the
 * privacy gate is testable — it is the one branch here whose failure mode is
 * silent (prose leaking into logs that were meant to hold only shapes).
 * Exported for lib/eve-transcript.test.ts.
 */
export function clip(value: unknown, content: boolean, depth = 0): unknown {
  if (typeof value === "string") {
    // Checked before the content gate: a data URL is a base64 blob, so neither
    // its prose nor its length is interesting, and it is huge either way.
    if (value.startsWith("data:")) {
      return value.length > MAX_DATA_URL
        ? `${value.slice(0, MAX_DATA_URL)}… (${value.length})`
        : value;
    }
    if (!content) return `«${value.length} chars»`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length})` : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[${value.length} items]`;
    const kept = value.slice(0, MAX_ITEMS).map((item) => clip(item, content, depth + 1));
    return value.length > MAX_ITEMS ? [...kept, `… ${value.length - MAX_ITEMS} more`] : kept;
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) return "{…}";
    return Object.fromEntries(
      Object.entries(value).map(([k, v]: [string, unknown]) => [k, clip(v, content, depth + 1)]),
    );
  }
  return value;
}

/**
 * Events skipped entirely.
 *
 * All three re-send the *cumulative* payload on every chunk — an append carries
 * "the whole message so far", a partial carries the whole preliminary output —
 * so logging them costs O(n²) characters per turn and buries the events that
 * matter. Their finalized counterparts (`message.completed`,
 * `reasoning.completed`, `action.result`) carry the same content once.
 */
const SKIP = new Set(["message.appended", "reasoning.appended", "action.partial"]);

export default defineHook({
  events: {
    /**
     * Wildcard rather than a list of typed handlers, so an event eve adds later
     * is captured without a code change here. Everything except SKIP passes
     * through the same clip: `message.received` carries the user's text (still
     * bearing the `[mode: …]`/`[projectId: …]` markers the client injects, which
     * makes this a free audit of what was actually requested), `message.completed`
     * carries the reply, `actions.requested`/`action.result` carry the AI-edit
     * trail, `step.completed` carries usage, and the failure events carry the
     * `{ code, message, details }` where a relayed provider error such as
     * "Error in input stream" actually lives.
     */
    "*"(event, ctx) {
      // A thrown hook is not contained: eve surfaces it as `turn.failed`, and one
      // that throws on a failure-cascade event escalates to `session.failed`.
      // Logging that can break the chat it exists to diagnose is worse than no
      // logging, so nothing in here is allowed to propagate.
      try {
        if (SKIP.has(event.type)) return;
        console.info(
          JSON.stringify({
            tag: "eve.transcript",
            at: event.meta?.at,
            id: event.meta?.id,
            session: ctx.session.id,
            channel: ctx.channel.kind,
            type: event.type,
            data: clip("data" in event ? event.data : undefined, captureContent),
          }),
        );
      } catch {
        // Including a payload that won't serialize. Losing one line is fine;
        // losing the turn is not.
      }
    },
  },
});
