/**
 * Best-effort server-side cancellation of a session's in-flight turn.
 *
 * `agent.stop()` from `eve/react` is not enough on its own: `EveAgentStore.stop()`
 * is just `this.#abortController?.abort()`, which aborts the *local* stream read.
 * eve runs durable backend turns, so the server keeps executing tools — and keeps
 * writing project files — long after the client stopped listening. Anything that
 * abandons a turn has to call this too, or it leaks a live turn that can race the
 * next one.
 *
 * The path is eve's stable `EVE_CANCEL_TURN_ROUTE_PATTERN`
 * (`/eve/v1/session/:sessionId/cancel`), inlined because eve only exports its
 * builder from `#protocol/routes.js`, which isn't a public entrypoint. Same-origin:
 * `useEveAgent` is constructed with the default host (`""`) and no `auth`, so there
 * are no credentials to attach here.
 *
 * Never throws. Cancellation is advisory — eve counts `no_active_turn` as a success
 * — and every caller is already on a UI recovery path that must not break because
 * the cancel round-trip failed.
 */
export async function cancelEveTurn(sessionId: string): Promise<void> {
  try {
    await fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("Failed to cancel Eve turn", e);
  }
}
