import { eveChannel } from "eve/channels/eve";
import { UnauthenticatedError, type AuthFn } from "eve/channels/auth";

/**
 * Verifies the Clerk session token the browser attaches to every eve request
 * (hooks/use-eve-runtime.ts sets it via `auth.bearer`) and projects the caller's
 * workspace onto the runtime session.
 *
 * This is what makes project ownership checkable inside tool execution. Tools
 * read the workspace back off `ctx.session.auth` (agent/lib/workspace.ts), so
 * the model-supplied `projectId` is only ever a *selector* — never the
 * authority. Before this, resolveToolProject() fell back to UUID-format
 * validation whenever Clerk's `auth()` could not run in eve's runtime, which is
 * the live path: any well-formed id the model emitted was accepted.
 *
 * Mirrors apps/collaboration/server.ts's onAuthenticate — same verifyToken call,
 * same "active org, else personal workspace" rule — so the two services can
 * never disagree about who owns a project.
 *
 * `none()` is deliberately absent: the walk now rejects any request without a
 * verifiable Clerk token, instead of admitting it anonymously.
 */
function clerkAuth(): AuthFn {
  return async (request) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.error("[eve-auth] CLERK_SECRET_KEY is not set — rejecting every agent request.");
      return null;
    }

    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;

    // Lazy import: @clerk/nextjs ships ESM with extensionless imports Node's
    // resolver rejects, and eve bundles this module into its own runtime, so a
    // top-level clerk import crashes it at load. Same reasoning as lib/authz.ts.
    const { verifyToken } = await import("@clerk/nextjs/server");

    let claims: Awaited<ReturnType<typeof verifyToken>>;
    try {
      claims = await verifyToken(token, { secretKey });
    } catch (err) {
      console.error("[eve-auth] Clerk token verification failed:", err);
      throw new UnauthenticatedError({
        code: "authentication_required",
        message: "Your session expired. Reload the editor to continue.",
      });
    }

    const userId = claims.sub;
    if (!userId) return null;

    // Both session-token shapes: flat `org_id` and nested `o.id`.
    const orgClaim = claims as { org_id?: string; o?: { id?: string } };
    const workspaceId = orgClaim.org_id || orgClaim.o?.id || userId;

    return {
      attributes: { workspaceId },
      authenticator: "clerk",
      principalId: userId,
      principalType: "user",
    };
  };
}

export default eveChannel({ auth: [clerkAuth()] });
