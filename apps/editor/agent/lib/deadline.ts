/**
 * Wall-clock ceiling for one outbound call made from inside a tool.
 *
 * A tool that fails is recoverable — the model reads the message and tries
 * something else. A tool that *hangs* is not: eve's protocol emits nothing
 * between `actions.requested` and `action.result`, and the client deliberately
 * disarms its stall watchdog for the whole of that window (see isAwaitingTool
 * in hooks/use-eve-runtime.ts, which spells out the tradeoff — "a tool that
 * genuinely hangs forever now spins forever too"). So an unbounded socket in
 * here is an unbounded spinner out there, with no error and no recovery but
 * the Stop button.
 *
 * This never fires in development, which is why it went unnoticed: the same
 * calls resolve against localhost. In production they cross the network to
 * Tavily, Crossref, Railway and S3.
 *
 * 30s is well past the p99 of every call this guards and well inside the
 * function's own budget, so it only ever trips on something genuinely wedged.
 */
export const TOOL_FETCH_TIMEOUT_MS = 30_000;

/**
 * A tool's abort signal combined with a deadline.
 *
 * `ctx.abortSignal` alone only covers turn cancellation — it says nothing
 * about a peer that accepted the connection and then went quiet. Composing the
 * two keeps cancellation working (a cancelled turn still aborts immediately)
 * and adds the ceiling that was missing.
 *
 * Both primitives are native and need no dependency; the Vercel runtime is
 * Node 24 (see the deploy's `[nitro:vercel] Using nodejs24.x runtime` line).
 */
export function withDeadline(signal?: AbortSignal, ms: number = TOOL_FETCH_TIMEOUT_MS): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/**
 * True when a caught error is this deadline (or a cancellation) rather than a
 * genuine failure of the remote service.
 *
 * Worth distinguishing in the message handed back to the model: "timed out" is
 * a hint to narrow the query or move on, whereas "HTTP 500" is a hint to retry.
 * `AbortSignal.timeout` rejects with a `TimeoutError` DOMException, and
 * `AbortSignal.any` forwards whichever reason fired first.
 */
export function isAbortLike(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}
