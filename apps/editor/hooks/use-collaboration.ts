"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

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
  cursorLine?: number;
}

export type CollabStatus = "disconnected" | "connecting" | "connected" | "unauthorized";

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
  const hues = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
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
  const ydoc = useMemo(() => new Y.Doc(), [roomName]);
  const color = useMemo(() => user?.color || randomColor(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref (not state) so the setActiveFile/setCursor callbacks stay referentially
  // stable — consumer effects depend on them and would thrash on every render.
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!enabled || !roomName) {
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
      onStatus: ({ status }) => setStatus(status as CollabStatus),
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
      awareness.getStates().forEach((state: any, clientId: number) => {
        if (state.user && clientId !== localClientId) {
          activePeers.push({
            clientId,
            user: state.user,
            activeFile: state.activeFile,
            selection: state.selection || null,
            cursorLine: state.cursorLine,
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
  }, [roomName, enabled, ydoc, getToken, color, user?.name, user?.avatar]);

  const getYTextForFile = useCallback(
    (filePath: string): Y.Text => ydoc.getText(`file:${filePath}`),
    [ydoc]
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
    [ydoc]
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
    []
  );

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
    }),
    [ydoc, provider, status, synced, collaborators, getYTextForFile, seedFile, setActiveFile, setCursor]
  );
}
