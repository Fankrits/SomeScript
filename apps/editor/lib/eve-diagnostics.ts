"use client";

import * as Sentry from "@sentry/nextjs";
import type { MessageStreamEvent } from "eve/client";

/**
 * Diagnostics for the Eve chat.
 *
 * Exists because the chat's two worst symptoms are both invisible by default.
 * eve's reducer handles `turn.failed` and `session.failed` with
 * `return state` — unchanged — and the client store only converts
 * `session.failed` into `agent.error`. A failed *turn* therefore produces no
 * error, no UI change, and an assistant message with zero parts that renders as
 * nothing: the reply simply never arrives and the composer re-enables. Anything
 * upstream relays (a provider's "Error in input stream", a gateway 5xx) lands
 * in `{ code, message, details }` on those events and is then dropped on the
 * floor.
 *
 * Console rather than a service: Next's dev server already captures browser
 * console output to `.next/dev/logs/next-development.log`, so a `[eve]` grep
 * there recovers a session after the fact. The ring buffer covers production
 * and the "it happened ten minutes ago" case, where scrollback is gone.
 *
 * Three destinations, deliberately carrying different amounts:
 *
 *   console + ring   full text, stays in the user's browser
 *   Sentry breadcrumb summarize()'d, so document prose doesn't ride into issues
 *   Sentry issue     error-level entries only, so a stall or a failed turn is
 *                    searchable rather than only visible to whoever had the tab
 *
 * The breadcrumb trail is what makes an unrelated crash readable too: any
 * Sentry event fired afterwards carries the preceding chat events with it, and
 * Replay lines them up against what the user was looking at.
 *
 * See agent/hooks/transcript.ts for the server-side half and the full
 * cross-surface debugging runbook. Both key on `sessionId`.
 */

const PREFIX = "[eve]";

/** Entries kept for post-hoc inspection. Bounded so a long session can't grow it. */
const MAX_ENTRIES = 300;

export type EveLogEntry = {
  at: string;
  level: "debug" | "info" | "warn" | "error";
  kind: string;
  data?: unknown;
};

const buffer: EveLogEntry[] = [];

declare global {
  interface Window {
    /** Recent chat diagnostics: `eveDiagnostics()` in the console. */
    eveDiagnostics?: () => EveLogEntry[];
  }
}

function record(level: EveLogEntry["level"], kind: string, data?: unknown) {
  const entry: EveLogEntry = { at: new Date().toISOString(), level, kind, data };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  if (typeof window !== "undefined" && !window.eveDiagnostics) {
    window.eveDiagnostics = () => [...buffer];
  }

  const line = `${PREFIX} ${kind}`;
  if (level === "error") console.error(line, data ?? "");
  else if (level === "warn") console.warn(line, data ?? "");
  else if (level === "info") console.info(line, data ?? "");
  else console.debug(line, data ?? "");

  // Every entry funnels through here, so this is the one place a transport
  // belongs. Breadcrumbs are cheap, capped by Sentry itself, and attach to
  // whatever error is reported next — including errors thrown somewhere else
  // entirely, which is usually when you most want to know what the chat was
  // doing. Sentry is already initialized in instrumentation-client.ts.
  Sentry.addBreadcrumb({
    category: "eve",
    // Sentry's SeverityLevel spells this one "warning"; the rest line up.
    level: level === "warn" ? "warning" : level,
    message: kind,
    data: breadcrumbData(data),
  });

  // Error level is exactly the terminal set: turn.failed, session.failed,
  // step.failed, plus every logEveError caller (stall:timeout, send:failed,
  // cancel:failed, …). Those should be searchable issues, not just a trail
  // behind someone else's crash.
  if (level === "error") {
    Sentry.captureMessage(`${PREFIX} ${kind}`, {
      level: "error",
      extra: { data: summarize(data) },
    });
  }
}

/** Breadcrumb `data` must be an object; scalars get wrapped, prose gets cut. */
function breadcrumbData(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data !== "object") return { value: summarize(data) };
  return Object.fromEntries(
    Object.entries(data).map(([k, v]: [string, unknown]) => [k, summarize(v)]),
  );
}

/**
 * App-side moments the event stream can't show: a send starting, the stall
 * watchdog firing, a cancel being issued. Pairing these with the stream events
 * is what makes an "it just stopped" report readable afterwards.
 */
export function logEveAction(kind: string, data?: unknown) {
  record("info", kind, data);
}

/**
 * Something recovered on its own, but is worth a trail.
 *
 * The level is the whole point: `record` only opens a Sentry issue for
 * `error`, so a warn keeps the console line, the ring buffer entry and the
 * breadcrumb — everything you need when reading back a session — without
 * paging anyone for a failure eve already absorbed. `step:retried` is the
 * motivating case: eve re-runs the step and the turn carries on, so it is
 * evidence, not an incident.
 */
export function logEveWarn(kind: string, data?: unknown) {
  record("warn", kind, data);
}

export function logEveError(kind: string, data?: unknown) {
  record("error", kind, data);
}

/** Failure events all share `{ code, message, details? }`. */
type FailureData = { code?: string; message?: string; details?: unknown };

/** Longest string kept verbatim before it is replaced by a length. */
const MAX_STRING = 120;

/**
 * Cap for text that *is* the record rather than incidental payload — the
 * message the user sent, the reply that rendered. Far larger than MAX_STRING
 * because "what did it actually say?" is the question these entries exist to
 * answer, and it never leaves the browser: only the summarize()'d form goes to
 * Sentry. Long enough for any real chat message, short enough that a model
 * that runs away repeating itself can't wedge the ring buffer.
 */
const MAX_TEXT = 4_000;

/** Clip a message body for the console/ring, keeping its true length visible. */
export function clipText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}… (${text.length} chars)` : text;
}

/**
 * Shrinks a value to something safe to log.
 *
 * Tool payloads are not incidental data here: `write-file` carries the entire
 * new file contents, `read-file` returns whole documents, and `compile-project`
 * returns full Tectonic logs. Dumping them would bury the console and copy the
 * user's document into logs — so long strings become a length, and nesting is
 * capped. Enough to see which file and roughly how much, never the prose.
 */
function summarize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)`
      : value;
  }
  if (Array.isArray(value)) {
    if (depth > 1) return `[${value.length} items]`;
    return value.slice(0, 10).map((v) => summarize(v, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth > 2) return "{…}";
    return Object.fromEntries(
      Object.entries(value).map(([k, v]: [string, unknown]) => [k, summarize(v, depth + 1)]),
    );
  }
  return value;
}

/**
 * callId → toolName, so `action.result` can name the tool it belongs to.
 * eve puts the name on the *request* and only the callId on the result, and
 * "which tool just failed" is the first question every time. Bounded because a
 * long session accumulates calls.
 */
const toolNames = new Map<string, string>();

function rememberTool(callId: string, toolName: string) {
  if (toolNames.size > MAX_ENTRIES) toolNames.clear();
  toolNames.set(callId, toolName);
}

/**
 * Structured summary of one stream event, or null for the high-frequency ones.
 *
 * Token deltas are skipped deliberately: `message.appended` fires per chunk and
 * carries the whole message so far, so logging it would both flood the console
 * and defeat the point of collapsing those events everywhere else.
 */
export function logEveEvent(event: MessageStreamEvent) {
  switch (event.type) {
    // The three that currently vanish. `details` is where a relayed provider
    // error actually lives, so it is logged whole rather than summarized.
    case "session.failed":
    case "turn.failed":
    case "step.failed": {
      const data = event.data as FailureData;
      record("error", event.type, {
        code: data.code,
        message: data.message,
        details: data.details,
      });
      return;
    }

    // `info`, not `debug`: Firefox hides console.debug unless the Debug level is
    // switched on, and a turn skeleton nobody can see defeats the point. These
    // are 1–2 per turn, so they cost nothing. The genuinely chatty records
    // (per-tool results, reasoning) stay on debug and are still recoverable
    // from eveDiagnostics(), which keeps every level regardless.
    case "turn.started":
    case "turn.completed":
    case "turn.cancelled":
    case "session.waiting":
    case "session.completed":
      // session.completed carries no `data` at all, unlike its siblings.
      record("info", event.type, "data" in event ? event.data : undefined);
      return;

    // Answers "why did it forget?" — and, with the composer meter, whether the
    // configured context window is being respected.
    case "compaction.requested":
    case "compaction.completed":
      record("info", event.type, event.data);
      return;

    // Also info: `finishReason` is the tell for the runaway-repetition case
    // ("length"), and usage is what the context meter charts.
    case "step.completed": {
      const data = event.data as { usage?: unknown; finishReason?: unknown; stepIndex?: number };
      record("info", "step.completed", {
        stepIndex: data.stepIndex,
        finishReason: data.finishReason,
        usage: data.usage,
      });
      return;
    }

    // Which model actually served the session — the one place it is reported.
    case "session.started":
      record("info", "session.started", summarize(event.data));
      return;

    // What the model decided to do. This is the "AI edit" record: write-file,
    // delete-file and move all arrive here with their target path.
    case "actions.requested": {
      const { actions, stepIndex, turnId } = event.data;
      for (const action of actions) {
        const toolName = "toolName" in action ? action.toolName : action.kind;
        rememberTool(action.callId, toolName);
        record("info", "tool:requested", {
          tool: toolName,
          kind: action.kind,
          callId: action.callId,
          stepIndex,
          turnId,
          input: summarize("input" in action ? action.input : undefined),
        });
      }
      return;
    }

    // Every result, not just failures: a turn that ends in silence is usually a
    // tool that returned something the model choked on, and you cannot see that
    // from the failures alone.
    case "action.result": {
      const data = event.data as {
        status?: string;
        error?: unknown;
        result?: { callId?: string; output?: unknown };
      };
      const callId = data.result?.callId ?? "";
      const tool = toolNames.get(callId) ?? "unknown";
      const failed = data.status === "failed";
      record(failed ? "warn" : "debug", failed ? "tool:failed" : "tool:result", {
        tool,
        callId,
        status: data.status,
        ...(failed ? { error: summarize(data.error) } : { output: summarize(data.result?.output) }),
      });
      return;
    }

    // Did a reply actually land, what did it say, and how did the model stop?
    // A `finishReason` of "length" is the signature of the runaway-repetition
    // case. `text` is the assistant side of "what was actually in the chat" —
    // its counterpart is the `send` entry logged from use-eve-runtime.
    case "message.completed": {
      const { finishReason, message, stepIndex, turnId } = event.data;
      record("info", "message.completed", {
        stepIndex,
        turnId,
        finishReason,
        chars: message?.length ?? 0,
        text: clipText(message),
      });
      return;
    }

    case "reasoning.completed":
      record("debug", "reasoning.completed", {
        stepIndex: event.data.stepIndex,
        chars: event.data.reasoning?.length ?? 0,
      });
      return;

    case "message.received":
      record("debug", "message.received", {
        turnId: event.data.turnId,
        parts: event.data.parts?.length ?? 0,
      });
      return;

    // The turn is parked on the user, not broken — the difference between
    // "waiting for you" and "hung" in a report.
    case "input.requested":
      record("info", "input.requested", summarize(event.data.requests));
      return;

    case "subagent.started":
    case "subagent.completed":
      record("info", event.type, summarize(event.data));
      return;

    case "authorization.required":
    case "authorization.completed":
    case "context.cleared":
    case "result.completed":
      record("info", event.type, summarize(event.data));
      return;

    default:
      return;
  }
}
