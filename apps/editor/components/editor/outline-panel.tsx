import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { nestOutline, type OutlineEntry, type OutlineNode } from "@/lib/latex-outline";

interface OutlinePanelProps {
  outline: OutlineEntry[];
  isLatex: boolean;
  onSelect: (line: number) => void;
}

export function OutlinePanel({ outline, isLatex, onSelect }: OutlinePanelProps) {
  // Keyed by line number (unique per document) rather than array index, so a
  // collapsed heading stays collapsed as sibling sections are added/removed above it.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  if (!isLatex) {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        Open a .tex file to see its outline.
      </p>
    );
  }
  if (outline.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">No headings found.</p>;
  }

  const toggle = (line: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  return (
    <OutlineList
      nodes={nestOutline(outline)}
      collapsed={collapsed}
      onToggle={toggle}
      onSelect={onSelect}
      root
    />
  );
}

function OutlineList({
  nodes,
  collapsed,
  onToggle,
  onSelect,
  root = false,
}: {
  nodes: OutlineNode[];
  collapsed: Set<number>;
  onToggle: (line: number) => void;
  onSelect: (line: number) => void;
  root?: boolean;
}) {
  const items = nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const isOpen = !collapsed.has(node.line);
    return (
      <div key={node.line}>
        <div className="flex items-center gap-0.5 rounded transition-colors hover:bg-muted/40">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.line)}
              aria-label={isOpen ? "Collapse section" : "Expand section"}
              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon
                className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
              />
            </button>
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(node.line)}
            title={node.title}
            className="min-w-0 flex-1 truncate py-0.5 pr-2 text-left font-mono text-sm text-muted-foreground hover:text-foreground"
          >
            {node.title}
          </button>
        </div>
        {hasChildren && isOpen && (
          <OutlineList
            nodes={node.children}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        )}
      </div>
    );
  });

  if (root) return <>{items}</>;
  return <div className="ml-[7px] border-l border-border pl-3">{items}</div>;
}
