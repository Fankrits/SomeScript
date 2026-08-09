import type { EveMessage, EveMessagePart } from "eve/react";

/**
 * Kept apart from the runtime hook because the ordering bug it fixes is
 * subtle enough to be worth pinning down with its own test.
 *
 * eve's message store only ever appends, never reorders or deletes. When a
 * turn is abandoned (the stall watchdog in use-eve-runtime.ts, the Stop button,
 * or any other send failure) and the user then recovers with Continue, the new
 * turn's optimistic user message is appended *after* the abandoned turn's
 * leftovers: the failed send's
 * optimistic echo of the same question (renders identically to a normal
 * message — nothing marks it as failed) and its assistant reply frozen
 * mid-"streaming" forever (eve has no way to cancel/remove a part once
 * started). The net effect on screen is the question appearing to duplicate,
 * with a stray assistant bubble sandwiched above the resend.
 *
 * Only the *last* message of each role can legitimately still be
 * failed/streaming (a currently in-flight turn, or a terminal stall awaiting
 * "Continue"); any earlier one was superseded and is dropped.
 */
export function filterOrphanedMessages(all: readonly EveMessage[]): EveMessage[] {
  const lastUserIdx = all.findLastIndex((m) => m.role === "user");
  const lastAssistantIdx = all.findLastIndex((m) => m.role === "assistant");
  return all
    .filter((m, i) => {
      if (m.role === "user" && m.metadata?.status === "failed" && i !== lastUserIdx) return false;
      if (m.role === "assistant" && m.metadata?.status === "streaming" && i !== lastAssistantIdx)
        return false;
      return true;
    })
    .map(dropRetriedRuns);
}

type RunPart = Extract<EveMessagePart, { type: "text" | "reasoning" }>;

const isRun = (part: EveMessagePart): part is RunPart =>
  part.type === "text" || part.type === "reasoning";

/**
 * Drops the leftovers of a step eve silently re-ran.
 *
 * On a transient model-call failure eve retries the *same* step — same
 * `stepIndex`, same prompt — via `runModelCallWithRetries` in
 * `harness/tool-loop.js`, discarding the first attempt's output. It emits
 * nothing to the client for this: no `step.failed`, no `step.started` (retries
 * pass `suppressStepStartedEmission`), only a server-side
 * `log.warn("model call failed transiently — retrying")`. The tell in a
 * client-side log is two `step.completed` events sharing a `stepIndex` with
 * *identical* `inputTokens` — proof the first attempt's output never entered
 * the conversation.
 *
 * That alone would be invisible, but `upsertRun` in eve's message reducer
 * replaces a run only while it is still `streaming`:
 *
 *   n !== -1 && parts[n].state === `streaming` ? [replace] : [...parts, t]
 *
 * The abandoned attempt left its run at `done`, so the retry *appends* beside
 * it and the reply renders twice — near-identical prose back to back, which is
 * what a user reports as the chat duplicating or the UI shifting under them.
 *
 * Keeping the *last* run is what keeps the client honest, not merely tidy: the
 * retry is the attempt eve returns and writes to durable session history, so
 * any other choice would show text the model itself can no longer see.
 *
 * A no-op on a healthy turn — eve emits one run per type per step, which is the
 * same invariant `upsertRun` is written against.
 *
 * ponytail: prose only. Tool parts key on `toolCallId`, so a retry's duplicate
 * cards survive this — and they have to, because one step legitimately calls the
 * same tool several times (three `read-file`s in a step is routine), leaving no
 * safe client-side signal to tell a retry's copy from a real second call.
 * Fixing that half needs eve to mark the retry; tracked upstream.
 */
function dropRetriedRuns(message: EveMessage): EveMessage {
  const lastAt = new Map<string, number>();
  message.parts.forEach((part, i) => {
    if (isRun(part) && part.stepIndex !== undefined) {
      lastAt.set(`${part.type}:${part.stepIndex}`, i);
    }
  });
  if (lastAt.size === 0) return message;

  const parts = message.parts.filter(
    (part, i) =>
      !isRun(part) ||
      part.stepIndex === undefined ||
      lastAt.get(`${part.type}:${part.stepIndex}`) === i,
  );
  return parts.length === message.parts.length ? message : { ...message, parts };
}
