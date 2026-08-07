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
import { cancelEveTurn } from "@/lib/eve-cancel";
import type { HandleMessageStreamEvent, ClientSessionState } from "eve/client";
import {
  loadThreadHistory,
  saveThreadHistory,
  syncThreadToCloud,
  getThreadTitle,
  threadsListKey,
} from "@/lib/thread-history";
import { notifyCreditsUpdated } from "@/hooks/use-credit-status";

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
// readNdjsonStream (eve/dist/src/client/ndjson.js) awaits reader.read() with no
// timeout, and followStreamIterable only reconnects when the body *throws*, so
// an open-but-silent connection blocks the `for await` indefinitely. Open
// upstream: https://github.com/vercel/eve/issues/1159.
//
// That issue blames Vercel brotli-buffering the stream, but that doesn't apply
// here — eve sends `application/x-ndjson`, which is not on Vercel's compression
// allowlist — and the stall reproduces on a plain local `bun dev` run with no CDN
// in the path. So this backstop is needed in every environment.
//
// ponytail: app-level idle timer, delete once eve ships the real fix.
// https://github.com/vercel/eve/pull/1186 adds a native `streamIdleTimeoutMs`
// that reconnects from the last durable cursor mid-turn. It merged 2026-07-29 but
// is NOT in 0.27.12 (the newest release, published hours earlier). When a release
// containing it lands, bump eve, delete this watchdog, and delete
// filterOrphanedMessages with it — a resumed turn is never abandoned, so it
// leaves no orphans to filter.
//
// 60s, not the 15s that issue's reporter used: their case was short
// conversational replies, ours runs tectonic compiles and web searches through
// tools. See isAwaitingTool below for why a flat timer isn't enough on its own.
const STALL_TIMEOUT_MS = 60_000;

// How long a thread's events must stay quiet before the cloud backup fires
// (see syncThreadToCloud in lib/thread-history.ts) — coalesces a whole burst
// of per-token stream events into one write instead of one per event.
const CLOUD_SYNC_DEBOUNCE_MS = 4_000;

// Same coalescing for the localStorage save, much shorter: unlike the cloud
// backup, localStorage is the primary read path (loadThreadHistory on the
// next mount) — without this, every token delta re-stringifies and writes
// the whole event log, and a long session with a big tool result (a Tectonic
// log, a large read_file) turns that into a main-thread stall on every token.
const LOCAL_SAVE_DEBOUNCE_MS = 300;

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
  openFile?: string | null,
) {
  const completedToolCalls = useRef<Set<string>>(new Set());
  // Separate from completedToolCalls: compile-project is mirrored into the editor
  // on both edges, so each edge needs its own once-only guard.
  const compileStartedCalls = useRef<Set<string>>(new Set());
  const compileSettledCalls = useRef<Set<string>>(new Set());
  const processedSteps = useRef<Set<string>>(new Set());
  // Debounce for the cloud backup below: the autosave effect re-runs on every
  // stream event (token deltas included), but a network call per event would
  // hammer the API for no benefit — only the settled result needs to land.
  const cloudSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce + in-flight payload for the localStorage save below, mirroring
  // the cloud-sync timer's pattern but flushed on unmount (see the effect
  // near the bottom) since this one can't afford to lose a pending write.
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocalSaveRef = useRef<{ events: unknown[]; session: unknown } | null>(null);
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

  // Load initial state synchronously on mount/remount. A blob written by a
  // different eve client is replayed into this one's reducer and session, so a
  // shape change between versions can wedge the whole thread; bump the stamp
  // whenever eve is upgraded and the mismatched blob is dropped for a fresh
  // session instead.
  const [initialData] = useState(() =>
    typeof window === "undefined"
      ? null
      : loadThreadHistory<HandleMessageStreamEvent, ClientSessionState>(threadId, localStorage),
  );

  const agent = useEveAgent({
    initialEvents: initialData?.events,
    initialSession: initialData?.sessionState,
  });

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
      // HITL: either explicit approval states, or the tool itself is ask_question,
      // or an inputRequest object has already been populated by Eve.
      const isApproval =
        part.state === "approval-requested" ||
        part.state === "approval-responded" ||
        part.toolName === "ask_question" ||
        Boolean(part.toolMetadata?.eve?.inputRequest);
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
            await agent.send(sendArgs);
          } catch (e) {
            // Rethrowing would reject into assistant-ui's send handler and vanish
            // silently, leaving a cleared composer and no message on screen.
            setSendError(e instanceof Error ? e.message : String(e));
            console.error("Failed to send message to Eve", e);
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

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  // agent.status only turns busy once eve accepts the turn, so the pre-send
  // async work in onNew has to be folded in here — otherwise the composer is
  // both cleared and idle-looking while that runs. Also gates isDisabled, so a
  // second message can't be submitted into the same in-flight onNew.
  const isPending = isBusy || isSending;

  // See filterOrphanedMessages for why the raw list can't go straight to the
  // runtime: it can contain orphaned artifacts of an aborted-and-resent turn
  // that would otherwise render as a duplicated question with a stray
  // assistant reply sandwiched above the resend.
  const visibleMessages = useMemo(
    () => filterOrphanedMessages(agent.data.messages as EveMessage[]),
    [agent.data.messages],
  );

  // Giving up on the current turn, from anywhere: stop reading the stream *and*
  // tell the server to stop producing it. agent.stop() alone only aborts the
  // local fetch — eve turns are durable, so without the cancel the abandoned
  // turn keeps running tools server-side and can still write project files
  // underneath whatever happens next. See lib/eve-cancel.ts.
  const abandonTurn = useCallback(async () => {
    agent.stop();
    const sessionId = agent.session?.sessionId;
    if (sessionId) await cancelEveTurn(sessionId);
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
  useEffect(() => {
    if (!isBusy || isAwaitingTool) return;
    const timer = setTimeout(() => {
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
    agent.send("continue").catch((e) => {
      setSendError(e instanceof Error ? e.message : String(e));
    });
  }, [agent]);

  useEffect(() => {
    if (agent.session?.sessionId) {
      // Coalesce the burst of per-token stream events into one write instead
      // of one per token. Never throws: losing saved history is survivable,
      // but an error out of this effect unmounts the thread mid-conversation.
      const strippedEvents = stripEventFileData(agent.events);
      pendingLocalSaveRef.current = { events: strippedEvents, session: agent.session };
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = setTimeout(() => {
        pendingLocalSaveRef.current = null;
        if (!saveThreadHistory(threadId, projectId, strippedEvents, agent.session)) {
          console.error("Failed to persist chat history: localStorage is full");
        }
      }, LOCAL_SAVE_DEBOUNCE_MS);

      // Auto-update the title of the conversation in the threads list based on the first user message
      const threadListRaw = localStorage.getItem(threadsListKey(projectId));
      if (threadListRaw) {
        try {
          const list = JSON.parse(threadListRaw) as { id: string; title: string }[];
          const threadIndex = list.findIndex((t) => t.id === threadId);
          // Also repair threads whose title was previously saved as the raw
          // "[projectId: ...]" marker before this fix.
          const needsTitle =
            threadIndex !== -1 &&
            (list[threadIndex].title === "New Chat" ||
              list[threadIndex].title.startsWith("[projectId:"));
          if (needsTitle) {
            const firstUserMessage = agent.data?.messages?.find((m) => m.role === "user");
            const firstPart = firstUserMessage?.parts?.find(
              (p: { type: string; text?: string }) => p.type === "text",
            );
            if (firstPart && "text" in firstPart && firstPart.text) {
              // Strip the injected "[mode: …]"/"[projectId: …]" context markers
              // (same as convertEvePart) so the title shows the actual message.
              const cleanText = firstPart.text.replace(MARKER_PREFIX, "").trim();
              if (cleanText) {
                list[threadIndex].title =
                  cleanText.length > 25 ? cleanText.substring(0, 22) + "..." : cleanText;
                localStorage.setItem(threadsListKey(projectId), JSON.stringify(list));
                window.dispatchEvent(new Event("storage"));
              }
            }
          }
        } catch (e) {
          console.error("Failed to update thread title", e);
        }
      }

      // Cloud backup (durability only — reads still come from localStorage
      // above; see syncThreadToCloud's doc comment). Re-armed on every event,
      // same debounce pattern as the stall watchdog earlier in this file.
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = setTimeout(() => {
        void syncThreadToCloud(
          threadId,
          projectId,
          getThreadTitle(projectId, threadId),
          stripEventFileData(agent.events),
          agent.session,
        );
      }, CLOUD_SYNC_DEBOUNCE_MS);
    }
  }, [threadId, projectId, agent.events, agent.session, agent.data?.messages]);

  // Flush isn't needed on unmount: a mode switch remounts this whole hook
  // (key={mode} in eve-thread.tsx) mid-debounce, but the next turn's autosave
  // re-arms the same debounce and catches up — this is a backup copy, not
  // something a few seconds of lag can corrupt.
  useEffect(
    () => () => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
    },
    [],
  );

  // Unlike the cloud backup above, localStorage is the primary read path
  // (loadThreadHistory replays it on the next mount) — a mode switch right
  // after Eve's reply finishes but before this timer fires would otherwise
  // drop that reply from history. Flush synchronously instead of just
  // clearing the timer.
  useEffect(
    () => () => {
      if (localSaveTimerRef.current) {
        clearTimeout(localSaveTimerRef.current);
        const pending = pendingLocalSaveRef.current;
        if (pending) saveThreadHistory(threadId, projectId, pending.events, pending.session);
      }
    },
    [threadId, projectId],
  );

  // Watch agent messages/events for completed tool calls
  useEffect(() => {
    if (!agent.data?.messages) return;

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
                name === "move"
              ) {
                shouldRefresh = true;
              }
              if (name === "write_file" || name === "write-file") {
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

    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
    if (wrotePath) {
      window.dispatchEvent(new CustomEvent("somescript:open-file", { detail: wrotePath }));
    }
    if (compileStarted) {
      window.dispatchEvent(new CustomEvent("somescript:compiling"));
    }
    if (compiled) {
      window.dispatchEvent(
        new CustomEvent<CompiledEventDetail>("somescript:compiled", { detail: compiled }),
      );
    }
  }, [agent.data?.messages]);

  // Bill completed model-call steps against the workspace's AI credit balance.
  // step.completed is the only place real output-token usage is reported at all
  // (eve has no server-side post-turn hook — see agent/agent.ts) — this is the
  // authoritative deduction, not the pre-flight check above.
  // ponytail: client-reported, so a dropped tab/network between a step completing
  // and this POST leaves that step's cost unbilled. Bounded to one step, not
  // systematically exploitable. Upgrade path if it ever matters: server-side OTel
  // span capture via eve's defineInstrumentation setup() hook (registerOTel).
  useEffect(() => {
    if (!agent.events) return;
    for (const event of agent.events) {
      if (event.type !== "step.completed") continue;
      const key = `${event.data.turnId}:${event.data.stepIndex}`;
      if (processedSteps.current.has(key)) continue;
      processedSteps.current.add(key);

      const outputTokens = event.data.usage?.outputTokens;
      if (!outputTokens || outputTokens <= 0) continue;

      fetch("/api/eve/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: sentModeRef.current, outputTokens }),
      })
        .then((res) => {
          if (res.ok) notifyCreditsUpdated();
        })
        .catch((e) => console.error("Failed to record Eve credit usage", e));
    }
  }, [agent.events]);

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
    canContinue,
    continueTurn,
    dismissError: () => {
      setSendError(null);
      setCanContinue(false);
    },
  };
}
