"use client";

import { useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import * as Y from "yjs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { Collaborator } from "@/hooks/use-collaboration";

interface RemoteCursorAvatarsProps {
  view: EditorView | null;
  ytext: Y.Text | null;
  collaborators: Collaborator[];
}

function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

function resolveHeadPosition(cursor: Collaborator["cursor"], ytext: Y.Text): number | null {
  if (!cursor?.head || !ytext.doc) return null;

  try {
    const relativePosition = Y.createRelativePositionFromJSON(cursor.head);
    const absolutePosition = Y.createAbsolutePositionFromRelativePosition(
      relativePosition,
      ytext.doc,
    );
    if (
      !absolutePosition ||
      absolutePosition.type !== ytext ||
      !Number.isInteger(absolutePosition.index) ||
      absolutePosition.index < 0
    ) {
      return null;
    }
    return absolutePosition.index;
  } catch {
    return null;
  }
}

/**
 * Floating avatar over each peer's live caret. y-codemirror.next owns the
 * canonical caret as a Yjs relative position; resolving it against the active
 * Y.Text keeps it attached when concurrent edits move the document.
 */
export function RemoteCursorAvatars({ view, ytext, collaborators }: RemoteCursorAvatarsProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const root = view?.dom;
    const scroller = view?.scrollDOM;
    if (!root || !scroller) return;

    const refresh = () => forceTick((tick) => tick + 1);
    const ownerWindow = root.ownerDocument.defaultView;
    scroller.addEventListener("scroll", refresh, { passive: true });
    ownerWindow?.addEventListener("resize", refresh);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
    resizeObserver?.observe(root);
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", refresh);
      ownerWindow?.removeEventListener("resize", refresh);
      resizeObserver?.disconnect();
    };
  }, [view]);

  if (!view || !ytext) return null;
  const editorRect = view.dom.getBoundingClientRect();
  const peers = collaborators.filter((collaborator) => collaborator.cursor);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-20">
      {peers.map((collaborator) => {
        const position = resolveHeadPosition(collaborator.cursor, ytext);
        if (position === null || position > view.state.doc.length) return null;

        let coords;
        try {
          coords = view.coordsAtPos(position);
        } catch {
          coords = null;
        }
        if (!coords) return null;

        const top = coords.top - editorRect.top;
        if (top < 0 || top > editorRect.height) return null;
        const left = coords.left - editorRect.left;
        const avatarClass = top >= 28 ? "-translate-y-[calc(100%+4px)]" : "translate-y-1";

        return (
          <div
            key={collaborator.clientId}
            className={`absolute -translate-x-1/2 ${avatarClass}`}
            style={{ left, top }}
            title={collaborator.user.name}
          >
            <Avatar
              size="sm"
              className="size-5 border-2 shadow-md"
              style={{ borderColor: collaborator.user.color || "#3b82f6" }}
            >
              {collaborator.user.avatar && (
                <AvatarImage src={collaborator.user.avatar} alt={collaborator.user.name} />
              )}
              <AvatarFallback
                className="text-[8px] font-semibold text-white"
                style={{ backgroundColor: collaborator.user.color || "#3b82f6" }}
              >
                {initialsFor(collaborator.user.name)}
              </AvatarFallback>
            </Avatar>
          </div>
        );
      })}
    </div>
  );
}
