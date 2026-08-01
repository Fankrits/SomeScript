import { Hocuspocus } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { verifyToken } from "@clerk/backend";
import { Pool } from "pg";
// Reuse the editor's storage abstraction (local FS / S3) so collaborative edits
// land in the exact same store the compiler reads. The Dockerfile copies this
// single file into the image; keep it dependency-light (npm-only imports).
import { storage, isBinaryContent, type FileNode } from "../editor/lib/storage";

const port = Number(process.env.PORT) || 1234;
const redisUrl = process.env.REDIS_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
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

const server = new Hocuspocus({
  port,
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
  // blanked. Loading from storage here (once per room, server-side, before any
  // client syncs) is race-free and makes disk the source of truth.
  async onLoadDocument(data: { documentName: string; document: any }) {
    let projectId: string;
    try {
      projectId = projectIdFromRoom(data.documentName);
    } catch {
      return;
    }
    const doc = data.document;

    const flatten = (nodes: FileNode[]): string[] =>
      nodes.flatMap((n) => (n.isDir ? flatten(n.children ?? []) : [n.path]));

    let paths: string[] = [];
    try {
      paths = flatten(await storage.listProjectFiles(projectId));
    } catch (err) {
      console.error(`[collab] failed to list ${projectId}:`, err);
      return doc;
    }

    for (const relPath of paths) {
      try {
        const buf = await storage.readBinaryFile(projectId, relPath);
        // Same NUL-byte sniff /api/files uses — never force-decode binaries
        // (PDFs, images, fonts) into a Y.Text.
        if (isBinaryContent(buf)) continue;
        const text = buf.toString("utf-8");
        if (text.length === 0) continue;
        const ytext = doc.getText(`file:${relPath}`);
        if (ytext.length === 0) ytext.insert(0, text);
      } catch (err) {
        console.error(`[collab] failed to seed ${projectId}/${relPath}:`, err);
      }
    }
    console.log(`📄 Seeded room ${data.documentName} with ${paths.length} path(s) from storage`);
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
    for (const key of doc.share.keys()) {
      if (!key.startsWith("file:")) continue;
      const relPath = key.slice("file:".length);
      const text = doc.getText(key).toString();
      // Skip empties: a never-seeded Y.Text must not clobber a real file. A
      // genuine "user cleared the file" still persists via the editor's explicit
      // save (before compile / on switch / unload).
      if (text.length === 0) continue;
      try {
        await storage.writeFile(projectId, relPath, text);
      } catch (err) {
        console.error(`[collab] failed to persist ${projectId}/${relPath}:`, err);
      }
    }
  },
});

process.on("uncaughtException", (err: any) => {
  if (err?.code === "EADDRINUSE" || err?.syscall === "listen" || String(err?.message || "").includes("in use")) {
    console.log(`[COLLABORATION] Port ${port} is already in use (e.g. running in Docker). Skipping local collaboration startup.`);
    setInterval(() => {}, 100000);
  } else {
    console.error("Uncaught exception in collaboration server:", err);
    process.exit(1);
  }
});

server.listen(port).then(() => {
  console.log(`🚀 Hocuspocus collaboration server listening on port ${port}`);
}).catch((err: any) => {
  if (err?.code === "EADDRINUSE" || err?.syscall === "listen" || String(err?.message || "").includes("in use")) {
    console.log(`[COLLABORATION] Port ${port} is already in use (e.g. running in Docker). Skipping local collaboration startup.`);
    setInterval(() => {}, 100000);
  } else {
    console.error("Failed to start Hocuspocus server:", err);
    process.exit(1);
  }
});
