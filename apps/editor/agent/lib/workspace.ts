import type { SessionAuth } from "eve/context";

/**
 * The caller's workspace id, as verified by the channel's Clerk auth walk
 * (agent/channels/eve.ts) — never anything the model supplied.
 *
 * `auth.current` is the caller for the active inbound turn; `auth.initiator` is
 * whoever started the durable session. Both are set by the runtime from a
 * verified token, so falling back to the initiator keeps continuation paths
 * (a resumed turn with no fresh inbound auth) working without weakening the
 * check. Returns null when neither is present, which callers must treat as
 * "not authenticated" rather than "skip the check".
 */
export function workspaceFrom(ctx: { session: { auth: SessionAuth } }): string | null {
  const auth = ctx.session.auth;
  const value = auth.current?.attributes?.workspaceId ?? auth.initiator?.attributes?.workspaceId;
  return typeof value === "string" && value.length > 0 ? value : null;
}
