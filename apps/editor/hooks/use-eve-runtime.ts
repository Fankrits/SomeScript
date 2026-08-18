"use client";

import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  generateId,
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useEveAgent } from "eve/react";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { EveMessage, EveMessagePart } from "eve/react";
import {
  attachmentsToParts,
  extractAttachmentBlocks,
  stripEventFileData,
  stripPartPlaceholders,
  type OutgoingPart,
} from "@/lib/attachment-blocks";
import type { EveMode } from "@/lib/eve-modes";
import { filterOrphanedMessages } from "@/lib/eve-messages";
import type { MessageStreamEvent, ClientSessionState } from "eve/client";
import { collapseAppendedRuns, capOversizedPayloads } from "@/lib/thread-history";
import { saveThreadSnapshot, type ThreadSnapshot } from "@/lib/eve-threads-client";
import { notifyCreditsUpdated } from "@/hooks/use-credit-status";
import {
  clipText,
  logEveAction,
  logEveError,
  logEveEvent,
  logEveWarn,
} from "@/lib/eve-diagnostics";
import * as Sentry from "@sentry/nextjs";

// Context markers prefixed to the outgoing user message in onNew. The model (and
// the dynamic model resolver in agent/agent.ts) read them; the UI must strip them
// back off before rendering text or thread titles. The strip regex is derived from
// the same key list buildContextMarker writes, so a marker can't be added to one
// half and leak into the chat bubble because the other half didn't know about it.
const MARKER_KEYS = ["mode", "projectId", "openFile"] as const;

const MARKER_PREFIX = new RegExp(`^(?:\\[(?:${MARKER_KEYS.join("|")}): [^\\]]*\\]\\n?)+`);

function buildContextMarker(
  values: Partial<Record<(typeof MARKER_KEYS)[number], string | null | undefined>>,
): string {
  return MARKER_KEYS.filter((key) => values[key])
    .map((key) => `[${key}: ${values[key]}]`)
    .join("\n");
}

// eve's NDJSON turn stream can go silent forever without erroring — no error,
// no close, so agent.status never leaves "submitted"/"streaming" and the
// composer spins forever. The cause is client-side and environment-independent:
// readNdjsonStream (packages/eve/src/client/ndjson.ts) awaits reader.read()
// with no timeout, and followStreamIterable's reconnect policy only re-fires
// once the body *throws* or closes, so an open-but-silent connection blocks the
// `for await` indefinitely. Open upstream: https://github.com/vercel/eve/issues/1159.
//
// That issue blames Vercel brotli-buffering the stream, but that doesn't apply
// here — eve sends `application/x-ndjson`, which is not on Vercel's compression
// allowlist — and the stall reproduces on a plain local `bun dev` run with no CDN
// in the path. So this backstop is needed in every environment.
//
// ponytail: app-level idle timer, delete once eve ships the real fix.
// https://github.com/vercel/eve/pull/1186 (merged 2026-07-29) landed a
// streamReconnectPolicy/backoff framework, not the idle-read timeout its own
// description promised — it only re-opens the connection once openStreamBody's
// fetch throws or the body closes, so it still doesn't cover a connection that
// stays open and silent. Re-confirmed by reading ndjson.ts/open-stream.ts
// directly at eve 0.38.3 (this bump): reader.read() is still a bare, unbounded
// await. #1159 itself is still open, with a second independent repro filed
// against this exact codepath and an unmerged offer to add an opt-in
// `streamReadIdleTimeoutMs`. Don't delete this watchdog on the version number
// alone — reread those two files first. Once it's actually fixed, delete this
// and delete filterOrphanedMessages with it: a resumed turn is never abandoned,
// so it leaves no orphans to filter.
//
// 60s, not the 15s that issue's reporter used: their case was short
// conversational replies, ours runs tectonic compiles and web searches through
// tools. See isAwaitingTool below for why a flat timer isn't enough on its own.
const STALL_TIMEOUT_MS = 60_000;

/**
 * Everything that shrinks the event log before it is written anywhere.
 * Collapse first: it drops most of the log, so the file-data strip and
 * payload cap that follow walk a fraction of the events. All three run only
 * from eve's `onFinish` callback — once per settled turn, never per stream
 * event, which is what made this quadratic.
 *
 * capOversizedPayloads runs last: it is the backstop for a single event too
 * big to shrink any other way (a full compile log, a large file read) — cloud
 * storage has no ~5MB origin quota to blow, but an unbounded blob is still
 * wasteful to transfer and store.
 *
 * ponytail: this bounds what is *persisted*, not what eve holds in memory.
 * EveAgentStore keeps every raw `message.appended`, each carrying the whole
 * message so far, so a single long reply still costs O(n²) characters of RAM
 * for the duration of the session. Not fixable from here — it needs a
 * collapsing reducer inside eve. A reload starts small again, since the fetched
 * snapshot replays the collapsed log.
 */
const compactEvents = (events: readonly MessageStreamEvent[]) =>
  capOversizedPayloads(stripEventFileData(collapseAppendedRuns(events)));

// assistant-ui only ships Simple adapters for images and text. PDFs get the
// same treatment: read as a data URL, forward as a generic `file` content
// part — attachmentsToParts (lib/attachment-blocks.ts) already knows how to
// route that to Eve's wire format, same as it does for images.
class SimplePdfAttachmentAdapter implements AttachmentAdapter {
  public accept = "application/pdf";

  public async add(state: { file: File }): Promise<PendingAttachment> {
    return {
      id: generateId(),
      type: "document",
      name: state.file.name,
      contentType: state.file.type,
      file: state.file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  public async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      // FileReader uses callback-based API, wrapping in Promise is necessary
      // oxlint-disable-next-line unicorn/prefer-add-event-listener
      reader.onload = () => resolve(reader.result as string);
      // oxlint-disable-next-line unicorn/prefer-add-event-listener
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(attachment.file);
    });
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data,
          mimeType: attachment.file.type || "application/pdf",
          filename: attachment.name,
        },
      ],
    };
  }

  public async remove() {
    // noop
  }
}

/**
 * Bills one completed model call against the workspace's AI credit balance.
 *
 * `step.completed` is the only place real output-token usage is reported at
 * all (eve has no server-side post-turn hook — see agent/agent.ts), so this is
 * the authoritative deduction, not the pre-flight check in onNew.
 *
 * `costUsd` is what the AI Gateway actually charged for the call, and it is what
 * the server prices the turn from — input, cached and output tokens all included,
 * at the model's real rate. `outputTokens` rides along only as the fallback the
 * server bills on if cost is ever missing.
 *
 * ponytail: client-reported, so a dropped tab or network between a step
 * completing and this POST leaves that step unbilled, and a modified client can
 * under-report. Bounded to one step, not systematically exploitable. Upgrade path:
 * an `agent/hooks/billing.ts` subscribing to `step.completed` via defineHook —
 * hooks fire server-side after durable event acceptance, carry the same usage
 * object, and reach Postgres through getPool() in lib/authz.ts. That deletes this
 * function entirely; it does NOT need an OTel exporter (see agent/instrumentation.ts
 * for why adding a `setup` there would be a mistake).
 */
function recordStepUsage(mode: EveMode, usage: { costUsd?: number; outputTokens: number }) {
  fetch("/api/eve/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...usage }),
  })
    .then((res) => {
      logEveAction("credits:recorded", { mode, ...usage, ok: res.ok, status: res.status });
      if (res.ok) notifyCreditsUpdated();
    })
    .catch((e) =>
      logEveError("credits:failed", {
        mode,
        ...usage,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
}

/** Filename of agent/tools/compile-project.ts, which is its model-facing name. */
const COMPILE_TOOL_NAME = "compile-project";

/** Structured output of the compile-project tool as it reaches the client. */
type CompileToolOutput = {
  ok?: boolean;
  path?: string;
  pdfPath?: string | null;
  log?: string;
  error?: string;
};

/** Detail of the `somescript:compiled` event; see the listener in app/page.tsx. */
export type CompiledEventDetail = {
  ok: boolean;
  path: string;
  pdfPath: string | null;
  /** null when the compile never ran — the listener only stops the spinner. */
  log: string | null;
};

export function useEveRuntime(
  threadId: string,
  projectId: string,
  mode: EveMode,
  openFile: string | null | undefined,
  initialData: ThreadSnapshot<MessageStreamEvent, ClientSessionState> | null,
  onTitleChange: (title: string) => void,
) {
  const completedToolCalls = useRef<Set<string>>(new Set());
  // Separate from completedToolCalls: compile-project is mirrored into the editor
  // on both edges, so each edge needs its own once-only guard.
  const compileStartedCalls = useRef<Set<string>>(new Set());
  const compileSettledCalls = useRef<Set<string>>(new Set());
  // `turnId:stepIndex` keys seen on step.completed. A repeat is eve silently
  // re-running the step, which is both the thing to log and the thing not to
  // bill — one Set answers both, because "already seen" and "is a retry" are
  // the same question once billing runs from onEvent.
  const seenSteps = useRef<Set<string>>(new Set());
  // Where the replayed history ends.
  //
  // EveAgentStore's constructor seeds `data.messages` from `initialEvents`
  // before the first render, so an effect that means "react to what just
  // happened" reacts to the entire saved thread on mount instead. That is not
  // a rare path: this component remounts on a reload, on a thread switch, and
  // on a mode switch (<EveThreadInner> is keyed by mode), and the once-only
  // Sets above are freshly empty each time.
  //
  // Only the message-driven mirror below needs this. Everything keyed off
  // `onEvent` is already safe: eve admits the replayed log in its constructor,
  // before callbacks are even attached, so onEvent fires for genuinely new
  // events only ("onEvent only fires for events your UI has not seen" —
  // docs/guides/frontend/overview.mdx). See lib/eve-replay.test.ts.
  const toolsHydrated = useRef(false);
  // Set between `compaction.requested` and `compaction.completed`, which
  // bracket a summarization model call that emits nothing in between. Also
  // cleared on the turn boundary, so a compaction that never reports back
  // can't disarm the stall watchdog for the rest of the session.
  const compactingRef = useRef(false);
  // Id of the turn currently streaming, tracked from `turn.started` and cleared
  // on its boundary event. abandonTurn passes it to cancel() so a click (or a
  // watchdog firing) that lands after the turn already ended is a no-op instead
  // of cancelling whatever turn started since.
  const turnIdRef = useRef<string | null>(null);
  // True once a terminal failure has arrived as a stream *event* for the current
  // turn. eve's store calls onError for those too, right after onEvent (see
  // `#S` in client/eve-agent-store.js), and the event branch has the upstream
  // code and message that onError's generic Error does not — so this keeps the
  // vaguer transport message from overwriting the specific one. Cleared by both
  // send paths, since a fresh turn starts with no failure attributed to it.
  const failureFromEventRef = useRef(false);
  // Session id whose cursor has already been pinned to cloud storage; see the
  // effect below. Keyed by id rather than a boolean so a reset that mints a new
  // session pins the new cursor too.
  const cursorPinnedRef = useRef<string | null>(null);
  // The thread title is derived from the *first* user message, so it only has
  // to be written once. Without this latch the effect below would re-derive it
  // on every single stream event.
  const titleWrittenRef = useRef(false);
  // Read inside onNew, which assistant-ui may hold across renders — a ref keeps
  // the marker in sync with the live selection without rebuilding the runtime.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  // Same reason as modeRef: the user can switch files between renders, and the
  // marker has to name whichever one is open at send time. This is how "compile
  // this file" resolves to a path.
  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  }, [openFile]);
  // Separate from modeRef: the composer is disabled while a turn streams, but the
  // mode picker isn't, so modeRef can change mid-turn. Credit deduction needs the
  // mode that was actually sent for the in-flight turn, captured at send time.
  const sentModeRef = useRef(mode);

  // Lite is not a vision model, so its composer offers no image/PDF adapter:
  // the file picker's `accept` (read live from the active adapter) drops them
  // and drag/paste `add` rejects them. Pro/Expert keep image + PDF + text.
  const attachmentAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter(
        mode === "lite"
          ? [new SimpleTextAttachmentAdapter()]
          : [
              new SimpleImageAttachmentAdapter(),
              new SimplePdfAttachmentAdapter(),
              new SimpleTextAttachmentAdapter(),
            ],
      ),
    [mode],
  );
  // A send that throws leaves no message behind — the composer has already
  // cleared — so the failure has to be surfaced or it looks like nothing
  // happened at all.
  const [sendError, setSendError] = useState<string | null>(null);
  // True once the silent auto-retry below has also stalled: surfaces a
  // "Continue" action instead of a dead-end error banner.
  const [canContinue, setCanContinue] = useState(false);
  // onNew does real async work (credit pre-flight, force-save) *before* it ever
  // reaches agent.send(), and agent.status stays "ready" that whole time. Since
  // assistant-ui clears the composer the moment it hands off to onNew, relying
  // on agent.status alone leaves a window where the typed message has vanished
  // and nothing indicates the app is working — which reads exactly like a stuck
  // send. This covers that gap; see isPending below.
  const [isSending, setIsSending] = useState(false);

  // Live context usage for the composer meter. `inputTokens` on the most recent
  // completed step *is* the context size: it counts everything sent to the model
  // for that call. Captured from the event stream rather than recomputed from
  // agent.events, so it stays O(1) per event.
  //
  // costUsd is eve's own gateway-reported figure, accumulated across the
  // session. Deliberately not tokenlens's getUsage (which the ai-elements
  // Context footer would use): tokenlens has no entry for any of the gateway
  // model ids configured here and returns an empty costUSD, so those components
  // would render a confident $0.00. A real number or nothing.
  const [contextUsage, setContextUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null>(null);

  // initialData is fetched by the caller (EveThread) before this hook mounts —
  // useEveAgent only reads initialEvents/initialSession once, at first render,
  // so the fetch cannot happen inside this hook (see EveThread's loading gate).
  // The server already dropped any blob written by an incompatible eve version
  // (see readThreadSnapshot's HISTORY_VERSION gate), so this is never stale.

  // The agent's tenancy check runs on this token, not on the [projectId: …]
  // marker: agent/channels/eve.ts verifies it and puts the caller's workspace on
  // the session, and the file tools check project ownership against that. Passed
  // as a function so the client resolves a fresh, unexpired token before every
  // request rather than pinning the one that existed at mount. An empty string
  // (Clerk still booting, or signed out) fails the auth walk with a 401 instead
  // of silently running unauthenticated.
  const { getToken } = useAuth();

  const agent = useEveAgent({
    auth: { bearer: async () => (await getToken()) ?? "" },
    initialEvents: initialData?.events,
    initialSession: initialData?.sessionState,
    // The only place a *transport* failure is visible. Everything else here
    // reads the event stream, and a stream that dies never delivers one:
    // eve's store catches the throw, sets status to "error" and calls this
    //
    //   isAbortError(t) ? (status = 'ready', …)
    //                   : (this.#l = toError(t), status = 'error', …, onError(this.#l))
    //   — client/eve-agent-store.js
    //
    // Left unwired (as it was), a 401 from proxy.ts or a dropped connection
    // produced nothing at all: "error" is outside isBusy's
    // ("submitted"|"streaming") set, so the composer re-enabled and the stall
    // watchdog disarmed, while onEvent never fired to set a message. The
    // spinner just stopped, no banner, nothing in Sentry. That is the "the AI
    // is stuck" report, and the reason production had zero diagnostics for it.
    //
    // The live trigger seen in production: Clerk's session `touch` fails, the
    // token stops refreshing, `bearer` below resolves to "", and proxy.ts
    // answers /eve/* with a 401.
    //
    // Continue rather than a dead end: eve sessions are durable, so the turn
    // may still be running server-side with output worth picking up — and a
    // Continue that fails re-raises this banner instead of failing silently.
    onError: (error) => {
      // Consumed, not just read: the store gates the event-derived call on
      // `this.#l === void 0`, so only the first failure of a session re-reports
      // here and a later one would leave this latched on forever. The thrown
      // transport path has no such gate, which is the case that matters.
      if (failureFromEventRef.current) {
        failureFromEventRef.current = false;
        return;
      }
      turnIdRef.current = null;
      compactingRef.current = false;
      logEveError("stream:failed", { name: error.name, message: error.message });
      setSendError(`The assistant lost its connection: ${error.message}`);
      setCanContinue(true);
    },
    // Turn-boundary bookkeeping for abandonTurn's cancel guard, the
    // context-meter reading, and diagnostics. All O(1) per event.
    onEvent: (event) => {
      logEveEvent(event);

      // eve's reducer handles `turn.failed` with `return state` and the client
      // store only turns `session.failed` into agent.error — so a failed turn
      // otherwise produces an assistant message with no parts, which renders as
      // nothing at all. The reply just never arrives and the composer
      // re-enables, which is the "AI not responding" report: users re-send into
      // the silence, leaving a run of user bubbles with no answers between them.
      //
      // Surfaced with the upstream code attached, since the message is relayed
      // verbatim from the gateway/provider and is the only clue about cause.
      // Continue is offered for a *turn* failure but not a session one:
      // `session.failed` is the terminal session-level variant, and sending to a
      // terminal session id fails instead of reopening it, so the button would
      // reliably re-error.
      if (event.type === "turn.failed" || event.type === "session.failed") {
        turnIdRef.current = null;
        compactingRef.current = false;
        // Claim this failure before eve's store re-reports it through onError.
        failureFromEventRef.current = true;
        const { code, message } = event.data;
        setSendError(
          `The assistant stopped: ${message || "the model stream failed"}${code ? ` (${code})` : ""}`,
        );
        setCanContinue(event.type === "turn.failed");
        return;
      }

      if (event.type === "turn.started") turnIdRef.current = event.data.turnId;
      else if (event.type === "turn.completed" || event.type === "turn.cancelled") {
        turnIdRef.current = null;
        compactingRef.current = false;
      } else if (event.type === "compaction.requested") {
        // Opens a summarization model call over the whole context that emits
        // nothing until its checkpoint lands — exactly the shape the stall
        // watchdog is built to kill, so it has to stand down for it.
        compactingRef.current = true;
      } else if (event.type === "compaction.completed") {
        compactingRef.current = false;
      } else if (event.type === "step.completed") {
        // eve re-runs a step in place after a transient model-call failure
        // (runModelCallWithRetries in harness/tool-loop.js — 3 attempts, 500ms
        // then 1s), discarding the first attempt and emitting nothing to say
        // so: no step.failed, and step.started is suppressed on retries. A
        // repeated stepIndex within a turn is the only client-visible trace it
        // leaves. It costs a wasted model call, re-executes tools that already
        // ran, and is the mechanism behind duplicated replies (see
        // dropRetriedRuns in lib/eve-messages.ts).
        //
        // Warn, not error: eve absorbs this and the turn carries on, so it is
        // evidence rather than an incident — at error level it opened a Sentry
        // issue and printed a red console error for a failure that had already
        // healed, which is exactly the noise that sends you chasing the wrong
        // thing. A retry that does *not* recover surfaces as step.failed /
        // turn.failed, which are still errors.
        //
        // Note which failures reach here: classifyModelCallError (0.38.3,
        // harness/model-call-error.js) only routes `retry` through the retry
        // loop — an isRetryable error, a transient-tagged one, or HTTP
        // 408/409/429/5xx. An empty model response is `recoverable`, not
        // `retry`, so it parks the session for the user instead of re-running.
        const stepKey = `${event.data.turnId}:${event.data.stepIndex}`;
        const isRetry = seenSteps.current.has(stepKey);
        seenSteps.current.add(stepKey);

        const usage = event.data.usage;
        if (isRetry) {
          logEveWarn("step:retried", {
            turnId: event.data.turnId,
            stepIndex: event.data.stepIndex,
            // The discriminator when reading one of these back: a genuine
            // re-emission carries a new `sequence`, whereas the same sequence
            // twice would mean a duplicate delivery got past the store's
            // dedupe and this is a false positive, not a real retry.
            sequence: event.data.sequence,
            finishReason: event.data.finishReason,
            // Identical input tokens across attempts confirm the discarded
            // attempt's output never entered the conversation.
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        } else if (usage?.outputTokens) {
          // Billed from here rather than from an effect over `agent.events`,
          // which also carries the replayed history and so re-charged the whole
          // saved thread on every reload, thread switch and mode switch — at
          // whatever mode was selected *now*. eve's dedupe makes onEvent
          // exactly-once for new events, which is the guarantee that
          // bookkeeping was reimplementing.
          //
          // The retry branch is deliberately not billed: only one of the two
          // attempts reaches the conversation.
          recordStepUsage(sentModeRef.current, {
            costUsd: usage.costUsd,
            outputTokens: usage.outputTokens,
          });
        }

        if (usage?.inputTokens === undefined) return;
        setContextUsage((prev) => ({
          // Replaced, not summed: this is the size of the context as of the
          // latest call, and it *drops* after eve compacts — which is the whole
          // signal the meter exists to show.
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          // Cost is the opposite: a running total for the session.
          costUsd: (prev?.costUsd ?? 0) + (usage.costUsd ?? 0),
        }));
      }
    },
    // The one place chat history is written. eve calls this from the store's
    // `finally`, so it covers a turn that succeeded, errored, or was aborted —
    // which is why this needs no debounce, no pending-payload ref and no
    // unmount flush. Callbacks are re-bound on every render (setCallbacks in
    // eve/react), so threadId/projectId here are never stale.
    onFinish: (snapshot) => {
      if (!snapshot.session?.sessionId) return;
      void saveThreadSnapshot(
        projectId,
        threadId,
        compactEvents(snapshot.events),
        snapshot.session,
      ).then((ok) => {
        if (!ok) logEveError("persist:failed", { threadId, events: snapshot.events.length });
      });
    },
  });

  // useEveAgent hands back a fresh snapshot object per event, so a callback that
  // closed over `agent` sees a stale status once it fires on a timer. The
  // STALL_TIMEOUT_MS watchdog below reads this to log the status as of when it
  // actually fires, not as of whenever its effect last ran.
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const convertEvePart = useCallback((part: EveMessagePart, messageId: string, index: number) => {
    // 1. Plain text — assistant-ui TextMessagePart.
    //    Hide the leading [mode: …]/[projectId: …] markers we inject in onNew:
    //    the model still receives them, but users shouldn't see them.
    if (part.type === "text") {
      const text = part.text.replace(MARKER_PREFIX, "");
      return { type: "text" as const, text };
    }

    // 2. Reasoning/thinking — assistant-ui native ReasoningMessagePart (renders
    //    via the built-in <ReasoningRoot> collapsible in thread.tsx)
    if (part.type === "reasoning") {
      return { type: "reasoning" as const, text: part.text };
    }

    // 3. Dynamic tool calls — covers all Eve harness tools, HITL, subagents.
    //    The toolName is overridden so EveToolCalls can dispatch to the right card.
    if (part.type === "dynamic-tool") {
      // Eve *merges* toolMetadata forward on every update, so `inputRequest`
      // survives long after the prompt was answered and the tool ran. Routing
      // on its presence alone therefore sent settled calls back to the
      // approval card: the real tool result never rendered, and the card
      // re-offered live buttons for a dead requestId (HitlCard's in-session
      // `submitted` flag hid that until a reload or a mode switch remounted
      // the thread). Terminal states are results, not prompts.
      const isTerminal =
        part.state === "output-available" ||
        part.state === "output-error" ||
        part.state === "output-denied";
      // HITL: either explicit approval states, or the tool itself is ask_question,
      // or an inputRequest object has already been populated by Eve.
      const isApproval =
        part.state === "approval-requested" ||
        part.state === "approval-responded" ||
        (!isTerminal &&
          (part.toolName === "ask_question" || Boolean(part.toolMetadata?.eve?.inputRequest)));
      const isSubagent = part.toolMetadata?.eve?.kind === "subagent-call";

      // Resolved display toolName for our custom card registry
      const displayToolName = isApproval ? "__hitl__" : isSubagent ? "__subagent__" : part.toolName;

      return {
        type: "tool-call" as const,
        toolCallId: part.toolCallId,
        toolName: displayToolName,
        args: {
          // Raw input for display
          input: part.input,
          // Keep original tool name available inside the card
          toolName: part.toolName,
          toolMetadata: part.toolMetadata,
          state: part.state,
          // HITL input request — carries requestId, prompt, options
          inputRequest: isApproval ? part.toolMetadata?.eve?.inputRequest : undefined,
          errorText: "errorText" in part ? part.errorText : undefined,
        },
        result: "output" in part ? part.output : undefined,
        isError: part.state === "output-error",
      } as unknown as ThreadMessageLike["content"][number];
    }

    // 4. OAuth/connection authorization
    if (part.type === "authorization") {
      return {
        type: "tool-call" as const,
        toolCallId: `auth-${messageId}-${index}`,
        toolName: "__oauth__",
        args: {
          name: part.name,
          displayName: part.displayName,
          description: part.description,
          authorization: part.authorization,
          state: part.state,
          outcome: "outcome" in part ? part.outcome : undefined,
        },
        result: "outcome" in part ? part.outcome : undefined,
        isError: "outcome" in part && (part.outcome === "failed" || part.outcome === "timed-out"),
      } as unknown as ThreadMessageLike["content"][number];
    }

    // step-start and unknown part types: skip
    return null;
  }, []);

  const convertEveMessage = useCallback(
    (msg: EveMessage): ThreadMessageLike => {
      type UiPart = Exclude<ThreadMessageLike["content"], string>[number];
      const parts = msg.parts
        .map((part, i) => convertEvePart(part, msg.id, i))
        .filter((p): p is NonNullable<typeof p> => p !== null) as UiPart[];

      // Pull "<attachment name=…>" blocks out of the text and back into real
      // attachments, so a pasted file or terminal log renders as a chip instead
      // of a wall of text. The model still received the full inlined version.
      // User messages only: assistant text merely *mentioning* the tag must not
      // sprout chips (and assistant parts stream, so a block could match half-open).
      const attachments: NonNullable<ThreadMessageLike["attachments"]>[number][] = [];
      const content = parts
        .map((part) => {
          if (msg.role !== "user") return part;
          if (part.type !== "text") return part;
          const { text: withoutBlocks, blocks } = extractAttachmentBlocks(part.text);
          for (const block of blocks) {
            attachments.push({
              id: `${msg.id}-attachment-${attachments.length}`,
              type: "document",
              name: block.name,
              contentType: "text/plain",
              status: { type: "complete" },
              content: [{ type: "text", text: block.body }],
            });
          }
          // Drop the "[file: …]" line Eve leaves where the image was, so the
          // tile below is the only thing representing it.
          return { ...part, text: stripPartPlaceholders(withoutBlocks) };
        })
        .filter((part) => part.type !== "text" || part.text.length > 0);

      // Eve projects what the user attached back onto the message as `file`
      // parts carrying the data URL it was sent with, so the tile is rebuilt
      // from the message itself. A part without a `url` kept its bytes server
      // side (a sandbox ref); there is nothing to render, so it is skipped.
      for (const part of msg.parts) {
        if (part.type !== "file" || !part.url) continue;
        const isImage = part.mediaType.startsWith("image/");
        attachments.push({
          id: `${msg.id}-file-${attachments.length}`,
          type: isImage ? "image" : "file",
          name: part.filename ?? part.mediaType,
          contentType: part.mediaType,
          status: { type: "complete" },
          content: [
            isImage
              ? { type: "image", image: part.url }
              : { type: "file", data: part.url, mimeType: part.mediaType },
          ],
        });
      }

      return {
        id: msg.id,
        role: msg.role,
        content: content,
        attachments,
      };
    },
    [convertEvePart],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      setIsSending(true);
      // A new turn owns its own failures; anything attributed to the last one
      // must not silence onError for this one.
      failureFromEventRef.current = false;
      try {
        // Pre-flight credit/mode-access check. This is a UX gate, not the security
        // boundary — a client that skips it still gets billed (and can go negative)
        // by the server-side deduction below, so failing open on a network hiccup
        // here is safe: it doesn't bypass accounting, just the friendly early block.
        // Bounded: without a deadline a hung request would strand the send forever,
        // and the catch below already fails open, which is the intended behaviour.
        try {
          const res = await fetch("/api/eve/credits", {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const status: {
              includedBalance: number;
              purchasedBalance: number;
              allowedModes: EveMode[];
            } = await res.json();
            if (!status.allowedModes.includes(modeRef.current)) {
              setSendError(
                `${modeRef.current} mode isn't available on your plan. Upgrade to unlock it.`,
              );
              return;
            }
            if (status.includedBalance + status.purchasedBalance <= 0) {
              setSendError(
                "Out of AI credits for this workspace this month. Upgrade or buy a top-up to continue.",
              );
              return;
            }
          }
        } catch (e) {
          console.error("Credit pre-flight check failed, sending anyway", e);
        }

        // Force save any unsaved changes in the editor before sending
        const promises: Promise<unknown>[] = [];
        window.dispatchEvent(new CustomEvent("somescript:force-save", { detail: { promises } }));
        if (promises.length > 0) {
          try {
            await Promise.all(promises);
          } catch (e) {
            console.error("Failed to force save before sending message", e);
          }
        }

        // Attachments arrive already converted by the adapters above: text files
        // as an <attachment> text part, images as a data URL. Names are kept
        // alongside the pixels so the tile can show the real filename.
        const parts: OutgoingPart[] = [];
        for (const part of message.content) {
          if (part.type === "text") parts.push({ type: "text", text: part.text });
        }
        let attachmentParts = attachmentsToParts(message.attachments ?? []).parts;
        // Defensive: Lite is text-only, so drop any image/PDF that slipped
        // through — e.g. attached in Pro, then switched to Lite before sending
        // (the adapter swap doesn't remove already-pending attachments).
        if (modeRef.current === "lite") {
          attachmentParts = attachmentParts.filter(
            (p) =>
              !(
                p.type === "file" &&
                (p.mediaType.startsWith("image/") || p.mediaType === "application/pdf")
              ),
          );
        }
        parts.push(...attachmentParts);

        if (parts.length > 0) {
          const marker = buildContextMarker({
            mode: modeRef.current,
            projectId,
            openFile: openFileRef.current,
          });
          const textPart = parts.find(
            (p): p is Extract<OutgoingPart, { type: "text" }> => p.type === "text",
          );
          if (textPart) {
            textPart.text = `${marker}\n${textPart.text}`;
          } else {
            parts.unshift({ type: "text", text: marker });
          }

          const firstPart = parts[0];
          const sendArgs: Parameters<typeof agent.send>[0] =
            parts.length === 1 && firstPart.type === "text" ? firstPart.text : parts;
          try {
            setSendError(null);
            setCanContinue(false);
            sentModeRef.current = modeRef.current;
            // `text` is what the user actually sent, markers and all — the
            // client half of the transcript, and the only place the pre-send
            // text exists if agent.send() never lands. Markers are kept
            // deliberately: they are the record of which mode and which open
            // file this turn claimed, which is what the mode bug hid.
            logEveAction("send", {
              mode: sentModeRef.current,
              parts: parts.length,
              chars: parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0),
              text: clipText(textPart?.text),
            });
            await agent.send(sendArgs);
          } catch (e) {
            // Rethrowing would reject into assistant-ui's send handler and vanish
            // silently, leaving a cleared composer and no message on screen.
            setSendError(e instanceof Error ? e.message : String(e));
            logEveError("send:failed", { error: e instanceof Error ? e.message : String(e) });
          }
        }
      } finally {
        // Every exit path — the two early plan/credit returns, a thrown
        // pre-flight, an empty message, or a completed send — has to clear
        // this, or the composer stays disabled for the rest of the session.
        setIsSending(false);
      }
    },
    [agent, projectId],
  );

  const isBusy = (agent.status === "submitted" || agent.status === "streaming") && !canContinue;
  // agent.status only turns busy once eve accepts the turn, so the pre-send
  // async work in onNew has to be folded in here — otherwise the composer is
  // both cleared and idle-looking while that runs. Also gates isDisabled, so a
  // second message can't be submitted into the same in-flight onNew.
  //
  // `!canContinue` covers the stall path: if eve's stream never delivers the
  // `turn.cancelled` boundary (the open-but-silent-connection bug documented at
  // STALL_TIMEOUT_MS), agent.status can stay "streaming" forever even after
  // abandonTurn() asks the server to stop. canContinue is already set the
  // moment the watchdog gives up, so reusing it here un-disables the composer
  // immediately instead of waiting on a status flip that may never come.
  const isPending = isBusy || isSending;

  // See filterOrphanedMessages for why the raw list can't go straight to the
  // runtime: it can contain orphaned artifacts of an aborted-and-resent turn
  // that would otherwise render as a duplicated question with a stray
  // assistant reply sandwiched above the resend.
  const visibleMessages = useMemo(
    () => filterOrphanedMessages(agent.data.messages as EveMessage[]),
    [agent.data.messages],
  );

  // Giving up on the current turn, from anywhere.
  //
  // eve turns are durable, so cancelling only asks the server to stop — the
  // reply keeps streaming until eve confirms with `turn.cancelled` then
  // `session.waiting`, and the reducer's `turn.cancelled` case is what flips
  // still-streaming text and reasoning parts to `done`. agent.cancel()
  // (eve/react, 0.38+) is the supported way to do this: it waits to identify
  // the active turn if `turn.started` hasn't landed yet, sends one guarded
  // cancellation request, and keeps the stream attached until the boundary
  // arrives — eve now owns the "a late click/watchdog must not cancel a newer
  // turn" guard, so this doesn't have to track a turnId to hand it one.
  // (Before eve 0.38, the only client primitive was agent.stop(), a bare local
  // abort that never told the server anything — this used to be a manual
  // client.sessions.attach(sessionId).cancel({ turnId }) call to work around
  // that. See [[eve-stalled-stream-issue-1159]] in memory.)
  const abandonTurn = useCallback(async () => {
    logEveAction("cancel:requested", {
      sessionId: agent.session?.sessionId,
      turnId: turnIdRef.current,
      status: agent.status,
    });
    try {
      const result = await agent.cancel();
      logEveAction("cancel:accepted", { result });
    } catch (e) {
      // Cancellation is advisory (eve counts `no_active_turn` as success) and
      // every caller is on a recovery path that must not break here.
      logEveError("cancel:failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }, [agent]);

  const runtime = useExternalStoreRuntime<EveMessage>({
    isRunning: isPending,
    messages: visibleMessages,
    convertMessage: convertEveMessage,
    onNew,
    // Without this the composer's Stop button (rendered by thread.tsx whenever
    // isRunning) is a silent no-op: assistant-ui calls the handler optionally,
    // so a missing onCancel means clicking it does nothing at all. That left a
    // stalled turn with no escape short of waiting out the watchdog below.
    onCancel: abandonTurn,
    isDisabled: isPending,
    adapters: { attachments: attachmentAdapter },
  });

  // Is the turn quiet because something is legitimately working (or waiting on
  // the user), rather than because the stream died? eve's event protocol has no
  // heartbeat — between `actions.requested` and `action.result` nothing is
  // emitted for the entire tool execution — so a plain idle timer cannot tell a
  // tectonic compile, a web search, or an open HITL/OAuth prompt apart from a
  // dead connection, and would abort all of them.
  //
  // Only the very last message counts, and only if it's the assistant's. eve
  // can't retract a tool part once started, so an abandoned turn leaves one
  // frozen mid-flight forever; keying off "last *assistant* message" would let
  // that debris disarm the watchdog for good. After a Continue, optimistic
  // projection appends the new user message first, so a trailing user message
  // means the current turn has produced nothing yet and anything above it is
  // stale by definition.
  //
  // Tradeoff: a tool that genuinely hangs forever now spins forever too, since
  // the watchdog stays disarmed. That is why onCancel above had to be fixed
  // first — Stop is the escape hatch for that case.
  const isAwaitingTool = useMemo(() => {
    const messages = agent.data.messages as EveMessage[] | undefined;
    const last = messages?.at(-1);
    if (last?.role !== "assistant") return false;
    return last.parts.some((part) =>
      part.type === "dynamic-tool"
        ? part.state !== "output-available" &&
          part.state !== "output-error" &&
          part.state !== "output-denied"
        : part.type === "authorization" && part.state === "required",
    );
  }, [agent.data.messages]);

  // Backstop for the stalled-stream bug described at STALL_TIMEOUT_MS: if a turn
  // goes quiet for that long with no tool or prompt to explain it, abandon it and
  // say so, rather than leaving the spinner stuck forever. Re-armed on every
  // event via the `agent` dependency, since useEveAgent hands back a new snapshot
  // object on each one — so this measures silence, not total turn length.
  //
  // No silent auto-retry. It used to resend the whole message once before
  // surfacing anything, which was wrong twice over: agent.stop() doesn't stop the
  // server-side turn, so the resend raced a live turn that was still writing
  // files, and an invisible recovery that can itself fail just delays the same
  // dead end. A visible banner with a working Continue is the honest version.
  //
  // Compaction is the other legitimate silence, and unlike a tool it leaves no
  // trace in the message list — see compactingRef. This effect re-runs on every
  // event (abandonTurn is rebuilt from the new `agent` snapshot), so reading
  // the ref here is enough to arm and disarm on the bracketing events.
  //
  // setCanContinue(true) is what actually un-disables the composer here (see
  // isBusy above) — it doesn't wait on abandonTurn's cancellation request to
  // resolve, let alone on eve's stream delivering `turn.cancelled`, since a
  // truly stalled connection may never deliver that boundary at all.
  useEffect(() => {
    if (!isBusy || isAwaitingTool || compactingRef.current) return;
    const timer = setTimeout(() => {
      logEveError("stall:timeout", {
        afterMs: STALL_TIMEOUT_MS,
        status: agentRef.current.status,
        turnId: turnIdRef.current,
      });
      void abandonTurn();
      setSendError(
        "The assistant stopped responding. Continue to try picking up where it left off.",
      );
      setCanContinue(true);
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [abandonTurn, isAwaitingTool, isBusy]);

  // User-triggered recovery from the "stopped responding" banner: sends a
  // plain "continue" turn rather than replaying the original message
  // verbatim, since eve/the model may have already produced partial output
  // worth building on. Goes through the same watchdog as any other send
  // (isBusy re-arms it), so a stalled continue surfaces the banner again.
  const continueTurn = useCallback(() => {
    setSendError(null);
    setCanContinue(false);
    // Same reason as onNew: this is a new turn, so the previous turn's failure
    // must not suppress onError if this one dies at the transport layer too.
    failureFromEventRef.current = false;
    logEveAction("continue", { sessionId: agent.session?.sessionId });
    agent.send("continue").catch((e) => {
      logEveError("continue:failed", { error: e instanceof Error ? e.message : String(e) });
      setSendError(e instanceof Error ? e.message : String(e));
    });
  }, [agent]);

  // Pin the session cursor as soon as eve mints one, before the first turn
  // settles. onFinish covers every later save, but a reload *during* the very
  // first turn would otherwise find nothing saved at all — no cursor, so no
  // durable session to resume, and the thread comes back empty. eve's own
  // guidance: "persist the session state as soon as it contains a sessionId"
  // (docs/guides/frontend/overview.mdx). Latched, so this is one write per
  // session, not per event.
  //
  // Known gap, not fixable from here in 0.31.3: this restores the *cursor*,
  // not the turn. `sessions.attach()` performs no I/O and the store only opens
  // a stream from send(), so reloading mid-turn leaves the server-side turn
  // running (and billing) with nothing rendering it — a truncated reply and a
  // re-enabled composer. eve's documented recovery is
  // `session.stream({ startIndex: savedEvents.length })` from the lower-level
  // client, but useEveAgent exposes no way to feed those events back into its
  // reducer, so driving it would mean owning the whole store. Detecting it is
  // no better: only turn 1 leaves a mid-turn blob (later turns save on
  // onFinish, at a boundary), and the optimistic user message is never in
  // `events` to save — "optimistic events are reducer-facing projection events
  // only". Sending anything resumes the same durable session, so the
  // conversation is intact; only the interrupted turn's output is lost to the
  // UI.
  useEffect(() => {
    const sessionId = agent.session?.sessionId;
    if (!sessionId || cursorPinnedRef.current === sessionId) return;
    cursorPinnedRef.current = sessionId;
    void saveThreadSnapshot(projectId, threadId, compactEvents(agent.events), agent.session);
    // Same latch, so this is one call per session. sessionId is the join key
    // across every surface: it resolves a Sentry issue to an `eve traces` span
    // tree, to the server transcript in agent/hooks/transcript.ts, and to the
    // run in Vercel's Agent Runs tab.
    Sentry.setContext("eve", { sessionId, threadId, projectId, mode: modeRef.current });
  }, [threadId, projectId, agent.session, agent.events]);

  // Name the thread after its first user message. Latched by titleWrittenRef
  // so this only fires once per thread, instead of on every stream event.
  // page.tsx owns the thread list (fetched from the cloud index), so it
  // decides whether the current title is still the default worth replacing —
  // this effect just reports the candidate title once it has one.
  useEffect(() => {
    if (titleWrittenRef.current) return;
    const firstUserMessage = agent.data?.messages?.find((m) => m.role === "user");
    const firstPart = firstUserMessage?.parts?.find(
      (p: { type: string; text?: string }) => p.type === "text",
    );
    if (!firstPart || !("text" in firstPart) || !firstPart.text) return;
    // Strip the injected "[mode: …]"/"[projectId: …]" context markers
    // (same as convertEvePart) so the title shows the actual message.
    const cleanText = firstPart.text.replace(MARKER_PREFIX, "").trim();
    if (!cleanText) return;

    titleWrittenRef.current = true;
    onTitleChange(cleanText.length > 25 ? cleanText.substring(0, 22) + "..." : cleanText);
  }, [threadId, projectId, agent.data?.messages, onTitleChange]);

  // Watch agent messages/events for completed tool calls
  useEffect(() => {
    if (!agent.data?.messages) return;
    // The first pass sees the whole replayed thread (see toolsHydrated). Walk
    // it so the once-only Sets below learn what has already happened, then
    // dispatch nothing. Without this, every reload, thread switch and mode
    // switch re-fires the tail of the saved history as if it had just
    // occurred: the editor jumps to the last file Eve ever wrote in this
    // thread, and `somescript:compiled` replays a stale Tectonic log into the
    // terminal and swaps the PDF pane under whatever the user was reading
    // (see the listener in app/page.tsx).
    const replaying = !toolsHydrated.current;
    toolsHydrated.current = true;

    let shouldRefresh = false;
    // Last file Eve successfully wrote this pass — the editor jumps to it, so a
    // multi-file turn lands on the file it finished with.
    let wrotePath: string | null = null;
    // compile-project drives the editor's real terminal panel and PDF pane, not
    // just its chat card, so both ends of its lifecycle are mirrored as events:
    // one when it starts (clear the terminal, spin) and one when it settles (log,
    // gutter marks, PDF refresh). See the listeners in app/page.tsx.
    let compileStarted = false;
    let compiled: CompiledEventDetail | null = null;

    for (const msg of agent.data.messages) {
      if (msg.role === "assistant" && msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "dynamic-tool" && part.state === "output-available") {
            const toolCallId = part.toolCallId;
            if (!completedToolCalls.current.has(toolCallId)) {
              completedToolCalls.current.add(toolCallId);
              const name = part.toolName;
              if (
                name === "write_file" ||
                name === "write-file" ||
                name === "delete_file" ||
                name === "delete-file" ||
                name === "move" ||
                name === "main-file"
              ) {
                shouldRefresh = true;
              }
              // edit-file rides the same path: without this the splice lands in
              // storage but the user's open editor never reloads it.
              if (name === "write_file" || name === "write-file" || name === "edit-file") {
                const input = part.input as { path?: string } | undefined;
                const output = part.output as { ok?: boolean; path?: string } | undefined;
                const path = input?.path ?? output?.path;
                if (path && output?.ok !== false) wrotePath = path;
              }
            }
          }
        }
      }
    }

    // Compile lifecycle, kept separate because it's the only tool with a *start*
    // side effect and so needs both edges. Routed on the terminal state (not
    // "anything that isn't output-available"), otherwise an errored or denied call
    // would leave the terminal spinner running forever.
    for (const msg of agent.data.messages) {
      if (msg.role !== "assistant" || !msg.parts) continue;
      for (const part of msg.parts) {
        if (part.type !== "dynamic-tool" || part.toolName !== COMPILE_TOOL_NAME) continue;

        const isSettled =
          part.state === "output-available" ||
          part.state === "output-error" ||
          part.state === "output-denied";

        if (!isSettled) {
          if (!compileStartedCalls.current.has(part.toolCallId)) {
            compileStartedCalls.current.add(part.toolCallId);
            compileStarted = true;
          }
          continue;
        }

        if (compileSettledCalls.current.has(part.toolCallId)) continue;
        compileSettledCalls.current.add(part.toolCallId);

        const output =
          part.state === "output-available"
            ? (part.output as CompileToolOutput | undefined)
            : undefined;

        // A set `error` (or no output at all) means the compile never ran — wrong
        // compiler mode, throttled, tool threw. There's no log to show, so the
        // listener only stops the spinner and leaves the terminal as it was.
        compiled =
          output && !output.error
            ? {
                ok: Boolean(output.ok),
                path: output.path ?? "",
                pdfPath: output.pdfPath ?? null,
                log: output.log ?? "",
              }
            : { ok: false, path: "", pdfPath: null, log: null };
      }
    }

    if (replaying) return;

    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
    if (wrotePath) {
      // The file the turn finished on. Paired with the tool:requested record,
      // this is the end-to-end trail for "the AI changed my document".
      logEveAction("edit:applied", { path: wrotePath });
      window.dispatchEvent(new CustomEvent("somescript:open-file", { detail: wrotePath }));
    }
    if (compileStarted) {
      window.dispatchEvent(new CustomEvent("somescript:compiling"));
    }
    if (compiled) {
      logEveAction("compile:settled", {
        ok: compiled.ok,
        path: compiled.path,
        hasLog: compiled.log !== null,
      });
      window.dispatchEvent(
        new CustomEvent<CompiledEventDetail>("somescript:compiled", { detail: compiled }),
      );
    }
  }, [agent.data?.messages]);

  // Dispatch refresh when agent finishes all work
  useEffect(() => {
    if (agent.status === "ready") {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
  }, [agent.status]);

  const error = sendError ?? (agent.error ? agent.error.message : null);

  return {
    runtime,
    agent,
    error,
    contextUsage,
    canContinue,
    continueTurn,
    dismissError: () => {
      setSendError(null);
      setCanContinue(false);
    },
  };
}
