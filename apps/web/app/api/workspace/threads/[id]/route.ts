import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, chatThreads } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

/**
 * Upserts a chat thread's durable backup. Write-through only for now — the
 * client still reads exclusively from localStorage (see
 * apps/editor/lib/thread-history.ts); this just makes sure a copy survives a
 * cleared browser or a localStorage-quota eviction. The client debounces
 * calls here, so this isn't hit per stream event.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = orgId || userId;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const projectId = body?.projectId;
  const title = body?.title;
  const events = body?.events;
  const sessionState = body?.sessionState ?? null;
  if (typeof projectId !== "string" || typeof title !== "string" || !Array.isArray(events)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  // id is a client-generated UUID (crypto.randomUUID(), not realistically
  // guessable, but this must not rely on that): for an existing thread,
  // ownership is checked against the row's own projectId, not whatever
  // projectId the request body claims, or a stale/forged body could
  // overwrite a thread that belongs to a different workspace.
  const existing = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, id) });
  const ownedProjectId = existing ? existing.projectId : projectId;
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, ownedProjectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  await db
    .insert(chatThreads)
    .values({ id, projectId, title, events, sessionState })
    .onConflictDoUpdate({
      target: chatThreads.id,
      set: { title, events, sessionState, updatedAt: new Date() },
    });

  return Response.json({ ok: true });
}
