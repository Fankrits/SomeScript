import type { EveMessage } from "eve/react";

/**
 * Kept apart from the runtime hook because the ordering bug it fixes is
 * subtle enough to be worth pinning down with its own test.
 *
 * eve's message store only ever appends, never reorders or deletes. When a
 * turn is aborted (the stall watchdog in use-eve-runtime.ts, or any other
 * send failure) and then resent, the resend's optimistic user message is
 * appended *after* the abandoned turn's leftovers: the failed send's
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
  return all.filter((m, i) => {
    if (m.role === "user" && m.metadata?.status === "failed" && i !== lastUserIdx) return false;
    if (m.role === "assistant" && m.metadata?.status === "streaming" && i !== lastAssistantIdx) return false;
    return true;
  });
}
