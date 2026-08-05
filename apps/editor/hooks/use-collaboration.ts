"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  createVersionToken,
  FILE_TREE_VERSION_FIELD,
  TASK_LIST_VERSION_FIELD,
  PROJECT_SETTINGS_VERSION_FIELD,
} from "@/lib/file-tree-sync";

export interface CollaboratorCursor {
  anchor: unknown;
  head: unknown;
}

export interface Collaborator {
  clientId: number;
  user: {
    id?: string;
    name: string;
    color?: string;
    avatar?: string;
  };
  activeFile?: string;
  selection?: { anchor: number; head: number } | null;
  cursor?: CollaboratorCursor | null;
  cursorLine?: number;
  fileTreeVersion?: string;
  taskListVersion?: string;
  projectSettingsVersion?: string;
}

export type CollabStatus = "disconnected" | "connecting" | "connected" | "unauthorized";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined;
}

function normalizeAvatar(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeUser(value: unknown): Collaborator["user"] | null {
  if (!isRecord(value)) return null;
  const rawName = typeof value.name === "string" ? value.name.trim() : "";
  const id = typeof value.id === "string" ? value.id.slice(0, 128) : undefined;
  return {
    ...(id ? { id } : {}),
    name: rawName.slice(0, 120) || "Anonymous",
    color: normalizeColor(value.color),
    avatar: normalizeAvatar(value.avatar),
  };
}

function normalizeSelection(value: unknown): Collaborator["selection"] {
  if (!isRecord(value)) return null;
  const { anchor, head } = value;
  if (
    typeof anchor !== "number" ||
    typeof head !== "number" ||
    !Number.isInteger(anchor) ||
    !Number.isInteger(head) ||
    anchor < 0 ||
    head < 0
  ) {
    return null;
  }
  return { anchor, head };
}

function normalizeCursor(value: unknown): Collaborator["cursor"] {
  if (!isRecord(value) || value.anchor == null || value.head == null) return null;
  return { anchor: value.anchor, head: value.head };
}

function normalizeActiveFile(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 4096 ? value : undefined;
}

function normalizeCursorLine(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

// Shared by every *Version field — all opaque short tokens (see
// createVersionToken), not meaningful strings on their own.
function normalizeVersionToken(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 128 ? value : undefined;
}

interface UseCollaborationOptions {
  roomName: string;
  enabled?: boolean;
  /** Returns a fresh Clerk session token; called on every (re)connect. */
  getToken?: () => Promise<string | null>;
  user?: {
    name: string;
    color?: string;
    avatar?: string;
  };
}

// Stable per-tab caret color so a peer keeps the same color across renders and
// file switches (regenerating it would make remote carets flicker between hues).
function randomColor(): string {
  const hues = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];
  return hues[Math.floor(Math.random() * hues.length)];
}

export function useCollaboration({
  roomName,
  enabled = true,
  getToken,
  user,
}: UseCollaborationOptions) {
  const [status, setStatus] = useState<CollabStatus>("disconnected");
  const [synced, setSynced] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  // One Y.Doc per room (project). getText(`file:<path>`) yields a Y.Text per file.
  // roomName isn't read inside the callback — it's a deliberate recompute key.
  const ydoc = useMemo(() => new Y.Doc(), [roomName]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = useMemo(() => user?.color || randomColor(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref (not state) so the setActiveFile/setCursor callbacks stay referentially
  // stable — consumer effects depend on them and would thrash on every render.
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!enabled || !roomName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to the disconnected state is part of syncing with the provider (an external system); status is otherwise driven by the provider's own callbacks below
      setStatus("disconnected");
      setSynced(false);
      return;
    }

    const wsUrl =
      process.env.NEXT_PUBLIC_COLLAB_WS_URL ||
      (typeof window !== "undefined" && window.location.protocol === "https:"
        ? `wss://${window.location.hostname}:1234`
        : "ws://localhost:1234");

    const hocusProvider = new HocuspocusProvider({
      url: wsUrl,
      name: roomName,
      document: ydoc,
      // Async so a fresh, unexpired Clerk token is sent on every reconnect.
      // Must never resolve to a falsy value: @hocuspocus/provider only sends an
      // AuthenticationMessage when `!!token` is true (see its isAuthenticationRequired
      // getter) — an empty string skips the handshake entirely and the connection
      // just hangs (server-side onAuthenticate never runs to reject it). A signed-out
      // user or a transient getToken() failure must still trigger — and fail — the
      // real server-side check, not silently bypass it.
      token: async () => (getToken ? (await getToken()) || "no-session" : "no-session"),
      onStatus: ({ status: newStatus }) => setStatus(newStatus),
      onSynced: () => setSynced(true),
      onAuthenticationFailed: () => setStatus("unauthorized"),
      onDisconnect: () => setSynced(false),
    });

    providerRef.current = hocusProvider;
    setProvider(hocusProvider);

    if (user && hocusProvider.awareness) {
      hocusProvider.awareness.setLocalStateField("user", {
        name: user.name,
        color,
        avatar: user.avatar,
      });
    }

    // Peer presence: everyone but us, with their active file + live cursor.
    const handleAwarenessChange = () => {
      const awareness = hocusProvider.awareness;
      if (!awareness) return;
      const localClientId = awareness.clientID;
      const activePeers: Collaborator[] = [];
      awareness.getStates().forEach((state: unknown, clientId: number) => {
        const record = isRecord(state) ? state : null;
        const peerUser = normalizeUser(record?.user);
        if (peerUser && clientId !== localClientId) {
          activePeers.push({
            clientId,
            user: peerUser,
            activeFile: normalizeActiveFile(record ? record.activeFile : undefined),
            selection: normalizeSelection(record ? record.selection : undefined),
            cursor: normalizeCursor(record ? record.cursor : undefined),
            cursorLine: normalizeCursorLine(record ? record.cursorLine : undefined),
            fileTreeVersion: normalizeVersionToken(
              record ? record[FILE_TREE_VERSION_FIELD] : undefined,
            ),
            taskListVersion: normalizeVersionToken(
              record ? record[TASK_LIST_VERSION_FIELD] : undefined,
            ),
            projectSettingsVersion: normalizeVersionToken(
              record ? record[PROJECT_SETTINGS_VERSION_FIELD] : undefined,
            ),
          });
        }
      });
      setCollaborators(activePeers);
    };

    hocusProvider.awareness?.on("change", handleAwarenessChange);

    return () => {
      hocusProvider.awareness?.off("change", handleAwarenessChange);
      hocusProvider.destroy();
      providerRef.current = null;
      setProvider(null);
      setSynced(false);
    };
    // Tracks user?.name/user?.avatar deliberately instead of the whole `user`
    // object — Clerk's useUser() returns a new object reference most renders,
    // and depending on `user` itself would reconnect the socket on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, enabled, ydoc, getToken, color, user?.name, user?.avatar]);

  const getYTextForFile = useCallback(
    (filePath: string): Y.Text => ydoc.getText(`file:${filePath}`),
    [ydoc],
  );

  // Fallback seeding for a file created AFTER the room was loaded (upload, new
  // file, an Eve write) — the server's onLoadDocument only sees what existed at
  // room-load time. Guarded purely on "the shared text is still empty": there is
  // deliberately no persistent "already seeded" flag, because such a flag lives
  // in the shared doc forever and, once set, permanently blocks re-seeding — an
  // empty Y.Text could then never recover and every client would render blank.
  const seedFile = useCallback(
    (filePath: string, content: string) => {
      if (content.length === 0) return; // genuinely empty file — nothing to seed
      const ytext = ydoc.getText(`file:${filePath}`);
      if (ytext.length > 0) return; // already has content (server- or peer-seeded)
      ydoc.transact(() => {
        if (ytext.length === 0) ytext.insert(0, content);
      });
    },
    [ydoc],
  );

  const setActiveFile = useCallback((filePath: string) => {
    providerRef.current?.awareness?.setLocalStateField("activeFile", filePath);
  }, []);

  const setCursor = useCallback(
    (data: { selection?: { anchor: number; head: number } | null; cursorLine?: number }) => {
      const awareness = providerRef.current?.awareness;
      if (!awareness) return;
      awareness.setLocalStateField("selection", data.selection ?? null);
      awareness.setLocalStateField("cursorLine", data.cursorLine);
    },
    [],
  );

  const notifyFileTreeChanged = useCallback(() => {
    providerRef.current?.awareness?.setLocalStateField(
      FILE_TREE_VERSION_FIELD,
      createVersionToken(),
    );
  }, []);

  // Tasks have no CRDT of their own (tasks.json is a whole-list overwrite —
  // see api/tasks/route.ts) — this is the cheap fix for peers not seeing
  // each other's tasks live: bump a version token on save, other tabs watch
  // for it (page.tsx) and refetch. Still last-write-wins on a true race
  // between two saves; only kills the staleness window, not the conflict.
  const notifyTasksChanged = useCallback(() => {
    providerRef.current?.awareness?.setLocalStateField(
      TASK_LIST_VERSION_FIELD,
      createVersionToken(),
    );
  }, []);

  // Same shape as notifyTasksChanged, for mainFilePath/compilerEngine
  // (api/project-settings/route.ts) — also a whole-object overwrite, no CRDT.
  const notifyProjectSettingsChanged = useCallback(() => {
    providerRef.current?.awareness?.setLocalStateField(
      PROJECT_SETTINGS_VERSION_FIELD,
      createVersionToken(),
    );
  }, []);

  return useMemo(
    () => ({
      ydoc,
      provider,
      status,
      synced,
      collaborators,
      getYTextForFile,
      seedFile,
      setActiveFile,
      setCursor,
      notifyFileTreeChanged,
      notifyTasksChanged,
      notifyProjectSettingsChanged,
    }),
    [
      ydoc,
      provider,
      status,
      synced,
      collaborators,
      getYTextForFile,
      seedFile,
      setActiveFile,
      setCursor,
      notifyFileTreeChanged,
      notifyTasksChanged,
      notifyProjectSettingsChanged,
    ],
  );
}
