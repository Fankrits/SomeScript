import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { verifyToken } from "@clerk/backend";
import { Pool } from "pg";
import { createHash } from "crypto";
import * as Y from "yjs";
// @hocuspocus/server v4 split networking out of the Hocuspocus class into a
// separate `Server` wrapper that only runs on Node (it hardcodes
// crossws/adapters/node, which throws under Bun). This service runs on Bun
// (`bun run server.ts`), so it drives the Bun-native path the Hocuspocus
// maintainers document for non-Node runtimes instead: the `Hocuspocus` class
// directly, bridged to Bun.serve via crossws's own Bun adapter. Reference:
// https://github.com/ueberdosis/hocuspocus/blob/main/playground/backend/src/bun.ts
import crossws from "crossws/adapters/bun";
import type { Peer, Message } from "crossws";
// Reuse the editor's storage abstraction (local FS / S3) so collaborative edits
// land in the exact same store the compiler reads. The Dockerfile copies this
// single file into the image; keep it dependency-light (npm-only imports).
import { storage, isBinaryContent, type FileNode } from "../editor/lib/storage";
import { spliceText } from "./splice";

// Binary Y.Doc state, stored next to (not instead of) the plaintext files.
// Lives under .somescript/ which storage.ts EXCLUDEs from listProjectFiles, so
// it never shows in the file tree, never gets compiled, and is never itself
// seeded as a Y.Text. Plaintext remains the source of truth for the compiler;
// this only carries CRDT *operation identity* — see onLoadDocument.
const COLLAB_STATE_PATH = ".somescript/collab-state.bin";

const port = Number(process.env.PORT) || 1234;
const redisUrl = process.env.REDIS_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const collabInternalSecret = process.env.COLLAB_INTERNAL_SECRET;
const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rooms are named `project:<projectId>`. Everything hangs off the project id:
// the ownership check and (via the Y.Text keys `file:<path>`) persistence.
function projectIdFromRoom(documentName: string): string {
  const prefix = "project:";
  if (!documentName.startsWith(prefix)) throw new Error(`Unauthorized: unexpected room "${documentName}"`);
  return documentName.slice(prefix.length);
}

// Same ownership predicate /api/files enforces (apps/editor/lib/authz.ts): the
// project's workspace must equal the caller's active workspace (org, else user).
async function assertProjectAccess(projectId: string, workspace: string): Promise<void> {
  if (projectId === "default") {
    if (process.env.NODE_ENV === "production") throw new Error("Project not found");
    return; // local sandbox, non-prod only
  }
  if (!UUID_RE.test(projectId)) throw new Error("Project not found");
  if (!pool) throw new Error("Collaboration server misconfigured: DATABASE_URL is not set");
  const res = await pool.query("SELECT workspace_id FROM projects WHERE id = $1", [projectId]);
  if (!res.rows[0] || res.rows[0].workspace_id !== workspace) {
    throw new Error("Forbidden: caller's workspace does not own this project");
  }
}

// Skip re-persisting files that haven't changed since we last wrote them — this
// is what stops a debounce from writing a STALE room copy over a file it never
// saw change (an out-of-band write from Eve, /api/files, or /apply). The record
// of "last written" lives INSIDE the Y.Doc as a hidden map (path -> content
// hash), NOT in process memory, so it rides the same extension-redis sync every
// other shared type does: with >1 replica, replica B sees what replica A already
// persisted instead of clobbering it. Keyed on a hash, not the text, so it costs
// a few bytes per file rather than doubling the document.
const LAST_WRITTEN_MAP = "__lastWritten";
function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

let redisHost = process.env.REDIS_HOST || "127.0.0.1";
let redisPort = Number(process.env.REDIS_PORT) || 6379;
let redisPassword = process.env.REDIS_PASSWORD;

if (redisUrl) {
  try {
    const u = new URL(redisUrl);
    redisHost = u.hostname;
    redisPort = Number(u.port) || 6379;
    redisPassword = u.password || undefined;
  } catch {}
}

const extensions: any[] = [new Logger()];

if (redisUrl || process.env.REDIS_HOST) {
  console.log(`🔌 Connecting Hocuspocus Redis extension to ${redisHost}:${redisPort}`);
  extensions.push(
    new Redis({
      host: redisHost,
      port: redisPort,
      options: redisPassword ? { password: redisPassword } : undefined,
      prefix: "hocuspocus:",
    })
  );
}

// The Hocuspocus class itself has no `port`/`.listen()` in v4 — those moved to
// the Node-only `Server` wrapper this file deliberately doesn't use (see the
// crossws import note above). Networking is wired up below via Bun.serve.
const hocuspocus = new Hocuspocus({
  name: "somescript-collaboration",
  extensions,

  // Reject any socket that isn't a signed-in user who owns the room's project.
  // Fails closed: a missing CLERK_SECRET_KEY rejects every connection unless
  // ALLOW_COLLAB_GUEST=true is set explicitly (bare-metal local dev only) —
  // it must never be the silent default, or a deploy that forgot to set the
  // key would serve every project to anyone with zero auth.
  async onAuthenticate(data: { token?: string; documentName: string }) {
    if (!clerkSecretKey) {
      if (process.env.ALLOW_COLLAB_GUEST !== "true") {
        throw new Error(
          "Unauthorized: no CLERK_SECRET_KEY configured (set ALLOW_COLLAB_GUEST=true to allow anonymous local dev)"
        );
      }
      return { user: { id: `guest-${Math.random().toString(36).substring(2, 9)}`, name: "Anonymous Editor" } };
    }

    const token = data.token;
    if (!token) throw new Error("Unauthorized: missing token");

    let claims: any;
    try {
      claims = await verifyToken(token, {
        secretKey: clerkSecretKey,
        ...(authorizedParties.length ? { authorizedParties } : {}),
      });
    } catch (err) {
      console.error("[collab] Clerk token verification failed:", err);
      throw new Error("Unauthorized: invalid token");
    }

    const userId = claims.sub as string;
    // Mirror authz.ts: workspace = active org, else the personal (user) workspace.
    // Support both session-token shapes (flat `org_id` and nested `o.id`).
    const orgId = (claims.org_id as string) || claims.o?.id || null;
    const workspace = orgId || userId;

    const projectId = projectIdFromRoom(data.documentName);
    await assertProjectAccess(projectId, workspace);

    // Presence name/avatar come from client awareness; id is enough for context.
    return { user: { id: userId } };
  },

  // Authoritative seeding. Hocuspocus keeps a room only while clients are
  // attached; once the last one leaves the doc is unloaded and its state is
  // gone. Without this hook a reconnecting client syncs an EMPTY room and then
  // binds its editor to an empty Y.Text — which is exactly how open files got
  // blanked.
  //
  // Restoring the binary snapshot FIRST is what makes reloading safe to repeat.
  // Yjs identifies content by operation identity (clientID + clock), not by the
  // characters, so re-inserting the same plaintext into a fresh Y.Doc mints
  // genuinely NEW operations. A client that kept its Y.Doc across the reconnect
  // (the editor memoizes it per room, so it always does) then merges the old and
  // new operations — and every line of the file appears TWICE, compounding on
  // each reconnect and persisting to disk via onStoreDocument. Applying the
  // snapshot instead replays the ORIGINAL operations, which the returning
  // client already has, so the merge is a no-op. Verified by
  // splice.test.ts's "reload" cases.
  async onLoadDocument(data: { documentName: string; document: any }) {
    let projectId: string;
    try {
      projectId = projectIdFromRoom(data.documentName);
    } catch {
      return;
    }
    const doc = data.document;

    let restored = false;
    try {
      const snapshot = await storage.readBinaryFile(projectId, COLLAB_STATE_PATH);
      if (snapshot.length > 0) {
        Y.applyUpdate(doc, new Uint8Array(snapshot));
        restored = true;
      }
    } catch {
      // No snapshot yet (first ever load of this project) — the plaintext pass
      // below seeds from scratch, which is safe precisely once.
    }

    const flatten = (nodes: FileNode[]): string[] =>
      nodes.flatMap((n) => (n.isDir ? flatten(n.children ?? []) : [n.path]));

    let paths: string[] = [];
    try {
      paths = flatten(await storage.listProjectFiles(projectId));
    } catch (err) {
      console.error(`[collab] failed to list ${projectId}:`, err);
      return doc;
    }

    let mutated = false;
    const seenTextPaths = new Set<string>();
    for (const relPath of paths) {
      try {
        const buf = await storage.readBinaryFile(projectId, relPath);
        // Same NUL-byte sniff /api/files uses — never force-decode binaries
        // (PDFs, images, fonts) into a Y.Text.
        if (isBinaryContent(buf)) continue;
        const text = buf.toString("utf-8");
        seenTextPaths.add(relPath);
        if (text.length === 0) continue;
        // Reconciles storage edits made while the room was unloaded (Eve,
        // /api/files, search-replace). A no-op when the snapshot already
        // matches, so the common reload path mints no operations at all.
        if (spliceText(doc.getText(`file:${relPath}`), text)) mutated = true;
      } catch (err) {
        console.error(`[collab] failed to seed ${projectId}/${relPath}:`, err);
      }
    }

    // A snapshot outlives the files it describes: anything deleted from storage
    // while the room was unloaded would otherwise come back from the snapshot
    // and be re-persisted by onStoreDocument. Clearing it leaves an empty
    // Y.Text, which onStoreDocument skips.
    for (const key of doc.share.keys()) {
      if (!key.startsWith("file:")) continue;
      const relPath = key.slice("file:".length);
      if (seenTextPaths.has(relPath)) continue;
      if (spliceText(doc.getText(key), "")) mutated = true;
    }

    // Persist the snapshot NOW if this load minted operations. onStoreDocument
    // can't be relied on here: a load that only seeds (no client edit follows)
    // never triggers a store, so the snapshot would still be missing on the
    // next load — which would seed from plaintext all over again and duplicate
    // against the returning client's retained doc. That is the exact bug this
    // whole mechanism exists to prevent, so close the window at the source.
    if (!restored || mutated) {
      try {
        await storage.writeFile(projectId, COLLAB_STATE_PATH, Buffer.from(Y.encodeStateAsUpdate(doc)));
      } catch (err) {
        console.error(`[collab] failed to persist CRDT snapshot for ${projectId}:`, err);
      }
    }

    console.log(
      `📄 Loaded room ${data.documentName}: ${paths.length} path(s), ` +
        `snapshot=${restored ? "restored" : "seeded"}${mutated ? "+reconciled" : ""}`
    );
    return doc;
  },

  // World-standard Hocuspocus "autosave": debounced write-back of the CRDT to
  // durable storage. Each opened file is a Y.Text keyed `file:<relPath>`; write
  // every materialized one back as plaintext so the compiler keeps reading files.
  async onStoreDocument(data: { documentName: string; document: any }) {
    let projectId: string;
    try {
      projectId = projectIdFromRoom(data.documentName);
    } catch {
      return;
    }
    const doc = data.document;
    // Shared, doc-resident record of what each file was last written as (see
    // LAST_WRITTEN_MAP). Skipped by the "file:" prefix check in every file loop,
    // so it never seeds as a Y.Text or persists as a file of its own.
    const lastWritten = doc.getMap(LAST_WRITTEN_MAP);
    for (const key of doc.share.keys()) {
      if (!key.startsWith("file:")) continue;
      const relPath = key.slice("file:".length);
      const text = doc.getText(key).toString();
      // Skip empties: a never-seeded Y.Text must not clobber a real file. A
      // genuine "user cleared the file" still persists via the editor's explicit
      // save (before compile / on switch / unload).
      if (text.length === 0) continue;
      // Skip untouched files: without this, every debounce rewrites EVERY
      // materialized file in the room, including ones nobody edited. That
      // stomps out-of-band writes (Eve, /api/files) applied via /apply below —
      // editing any file in the room would persist every other file's stale
      // room copy straight back over the change that just landed on disk.
      const hash = contentHash(text);
      if (lastWritten.get(relPath) === hash) continue;
      try {
        await storage.writeFile(projectId, relPath, text);
        lastWritten.set(relPath, hash);
      } catch (err) {
        console.error(`[collab] failed to persist ${projectId}/${relPath}:`, err);
      }
    }

    // The CRDT operation log, so the next room load can restore identity rather
    // than re-inserting plaintext (see onLoadDocument). Written after the files:
    // if this fails, the plaintext above is still correct and the next load just
    // falls back to seeding — degraded, not lost.
    // ponytail: full state every debounce. Yjs GCs deleted content, so this
    // tracks document size rather than edit count; switch to appending
    // incremental updates if snapshot writes ever show up as a cost.
    try {
      await storage.writeFile(projectId, COLLAB_STATE_PATH, Buffer.from(Y.encodeStateAsUpdate(doc)));
    } catch (err) {
      console.error(`[collab] failed to persist CRDT snapshot for ${projectId}:`, err);
    }
  },
});

// Internal HTTP endpoint for out-of-band writes (Eve's tools, /api/files) to
// push a change into the live CRDT. Those writers hit storage directly —
// correct, since Eve/API routes must keep working with collab disabled or
// down — but without this, nothing tells an already-loaded room that
// storage moved out from under it, and the next debounce would silently
// overwrite the fresh write with the stale in-memory text (this is exactly
// how a prior collaboration bug destroyed a real project file).
//
// Trusted service-to-service call, not a per-user request — auth is a
// shared secret, not a Clerk token, and there is deliberately no per-user
// ownership check here (the caller already did one before writing storage).
// Fails closed: COLLAB_INTERNAL_SECRET must be set, matching the
// onAuthenticate posture for CLERK_SECRET_KEY above.
//
// Lives outside the Hocuspocus config on purpose: the `onRequest` hook's
// payload is still Node's IncomingMessage/ServerResponse even in v4 (it's
// only ever invoked by the Node-only `Server` wrapper this file doesn't use),
// so this route is wired directly into the Bun.serve fetch handler below
// instead, using web-standard Request/Response.
async function handleApplyRequest(request: Request): Promise<Response> {
  const fail = (status: number, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (!collabInternalSecret) return fail(503, "Collaboration server misconfigured: COLLAB_INTERNAL_SECRET is not set");
  if (request.headers.get("x-collab-secret") !== collabInternalSecret) return fail(401, "Unauthorized");

  let body: unknown;
  try {
    // Manual capped read (not request.json()) so an oversized body is rejected
    // by actual bytes received, not a Content-Length header the caller could
    // omit or lie about — same bound the old for-await-of-request loop kept.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262_144) {
          await reader.cancel("Body too large").catch(() => {});
          throw new Error("Body too large");
        }
        chunks.push(value);
      }
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return fail(400, "Invalid JSON body");
  }

  const { projectId, paths } = (body ?? {}) as { projectId?: unknown; paths?: unknown };
  if (typeof projectId !== "string" || !Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
    return fail(400, "Expected { projectId: string, paths: string[] }");
  }
  if (projectId !== "default" && !UUID_RE.test(projectId)) return fail(400, "Invalid projectId");

  // Read every path from storage FIRST. DirectConnection.transact() does not
  // await its callback (it calls `transaction(this.document)` fire-and-forget,
  // then immediately triggers the store hooks) — an async callback here would
  // let onStoreDocument persist the doc before any splice actually landed.
  // The callback below must therefore be synchronous.
  // ponytail: silently caps a project-wide search-replace touching >200
  // files — those extra files are still correctly written to storage by
  // the caller, just not pushed live until the room reloads. Raise this or
  // chunk the caller's notify call if that gap is ever reported as real.
  const nextContents = await Promise.all(
    paths.slice(0, 200).map(async (relPath) => {
      try {
        const buf = await storage.readBinaryFile(projectId, relPath);
        return { relPath, text: isBinaryContent(buf) ? null : buf.toString("utf-8") };
      } catch {
        return { relPath, text: "" }; // not found on disk -> the write was a delete
      }
    })
  );

  const documentName = `project:${projectId}`;
  const connection = await hocuspocus.openDirectConnection(documentName, {});
  try {
    await connection.transact((doc: any) => {
      for (const { relPath, text } of nextContents) {
        if (text === null) continue; // binary — never force-decode into a Y.Text
        spliceText(doc.getText(`file:${relPath}`), text);
      }
    });
  } finally {
    await connection.disconnect();
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

process.on("uncaughtException", (err: any) => {
  if (err?.code === "EADDRINUSE" || err?.syscall === "listen" || String(err?.message || "").includes("in use")) {
    console.log(`[COLLABORATION] Port ${port} is already in use (e.g. running in Docker). Skipping local collaboration startup.`);
    setInterval(() => {}, 100000);
  } else {
    console.error("Uncaught exception in collaboration server:", err);
    process.exit(1);
  }
});

// Tracks each socket's ClientConnection by its crossws Peer. A WeakMap (not a
// property bolted onto `peer`, which is what Hocuspocus's own Bun example
// does with an `as any` cast) keeps this typed and lets entries drop for free
// once a peer is garbage-collected after close.
const connections = new WeakMap<Peer, ReturnType<typeof hocuspocus.handleConnection>>();

const ws = crossws({
  hooks: {
    open(peer: Peer) {
      // peer.websocket is a live Partial<WebSocket> that hits Bun's Proxy
      // `this`-binding issue with ServerWebSocket when handed to code that
      // doesn't call through the peer itself (the Hocuspocus team hit this
      // exact issue writing playground/backend/src/bun.ts) — bridge through
      // peer's own bound send/close instead of the raw websocket.
      const wsLike: WebSocketLike = {
        get readyState() {
          return peer.websocket.readyState ?? 3; // 3 = CLOSED
        },
        send: (data) => peer.send(data),
        close: (code, reason) => peer.close(code, reason),
      };
      connections.set(peer, hocuspocus.handleConnection(wsLike, peer.request));
    },
    message(peer: Peer, message: Message) {
      connections.get(peer)?.handleMessage(message.uint8Array());
    },
    close(peer: Peer, event) {
      // Hocuspocus's handleClose wants the DOM CloseEvent shape (code/reason
      // required); crossws's close details make both optional. 1005 is the
      // WebSocket spec's own "no status was actually provided" code.
      connections.get(peer)?.handleClose({
        code: event.code ?? 1005,
        reason: event.reason ?? "",
        wasClean: true,
      } as CloseEvent);
    },
    error(peer: Peer, error) {
      console.error("[collab] WebSocket error for peer:", peer.id, error);
    },
  },
});

try {
  Bun.serve({
    port,
    websocket: ws.websocket,
    async fetch(request, server) {
      if (request.headers.get("upgrade") === "websocket") {
        return ws.handleUpgrade(request, server);
      }
      if (request.method === "POST" && new URL(request.url).pathname === "/apply") {
        return handleApplyRequest(request);
      }
      return new Response("Welcome to Hocuspocus!");
    },
  });
  console.log(`🚀 Hocuspocus collaboration server listening on port ${port}`);
} catch (err: any) {
  // Bun.serve throws synchronously (not a rejected promise) on a bind
  // failure — confirmed empirically: {code: "EADDRINUSE", syscall: "listen"}.
  if (err?.code === "EADDRINUSE" || err?.syscall === "listen" || String(err?.message || "").includes("in use")) {
    console.log(`[COLLABORATION] Port ${port} is already in use (e.g. running in Docker). Skipping local collaboration startup.`);
    setInterval(() => {}, 100000);
  } else {
    console.error("Failed to start Hocuspocus server:", err);
    process.exit(1);
  }
}
