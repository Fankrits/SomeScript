// Tells the collaboration server that files changed on disk out-of-band (Eve's
// tools, /api/files) so it can splice the new content into the live Y.Doc —
// without this, an already-loaded room never learns storage moved, and the
// next autosave debounce silently overwrites the fresh write with stale CRDT
// text (see apps/collaboration/server.ts's onRequest for the /apply handler).
//
// Carries paths, not content: the collab server re-reads storage itself, so
// every caller sends the same tiny payload regardless of file size.
//
// Best-effort by design — collaboration being disabled or the service being
// down must never fail the file write that triggered this. No `@/` alias, no
// next/server, no Clerk: this file is imported by Eve's tool runtime, which
// only resolves relative/npm imports (see agent/tools/write-file.ts).
export async function notifyCollabPathsChanged(projectId: string, paths: string[]): Promise<void> {
  const url = process.env.COLLAB_HTTP_URL;
  const secret = process.env.COLLAB_INTERNAL_SECRET;
  if (!url || !secret || paths.length === 0) return;

  try {
    await fetch(`${url}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-collab-secret": secret },
      body: JSON.stringify({ projectId, paths }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[collab-notify] failed to notify ${projectId}:`, err);
  }
}

// Opposite direction from notifyCollabPathsChanged: forces the collab server to
// persist its live CRDT state to storage NOW instead of waiting out its own
// debounce (default 2s, capped at 10s under continuous typing). Callers that
// read project files for a compile MUST `await` this first — the fetch only
// resolves once the collab server's write has actually landed (see /flush in
// apps/collaboration/server.ts) — otherwise a compile started right after a
// live collaborative edit can silently read pre-edit bytes and produce a
// .synctex.gz whose line mapping no longer matches what's on screen.
//
// Still fails open like notifyCollabPathsChanged: collaboration being disabled,
// misconfigured, or briefly unreachable must never block a compile — it just
// reads whatever storage already has, same as before this existed.
export async function flushCollabProject(projectId: string): Promise<void> {
  const url = process.env.COLLAB_HTTP_URL;
  const secret = process.env.COLLAB_INTERNAL_SECRET;
  if (!url || !secret) return;

  try {
    await fetch(`${url}/flush`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-collab-secret": secret },
      body: JSON.stringify({ projectId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[collab-notify] failed to flush ${projectId}:`, err);
  }
}
