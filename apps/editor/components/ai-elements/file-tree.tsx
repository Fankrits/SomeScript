"use client";

import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  FileIcon,
  FileText,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  Edit2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { Tree } from "react-arborist";
import type { NodeRendererProps } from "react-arborist";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export type FileTreeProps = {
  data: FileNode[];
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onMove?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  className?: string;
};

// Hook to measure dimensions of the containing element
function useDimensions<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    observer.observe(element);
    return () => observer.unobserve(element);
  }, []);

  return [ref, dimensions] as const;
}

export const FileTree = ({
  data,
  selectedPath,
  onSelect,
  onMove,
  onDelete,
  className,
}: FileTreeProps) => {
  const [containerRef, dimensions] = useDimensions<HTMLDivElement>();

  // Map our tree structure to the react-arborist structure (requires id instead of path)
  const arboristData = useMemo(() => {
    const mapNode = (node: FileNode): any => ({
      id: node.path,
      name: node.name,
      isDir: node.isDir,
      children: node.children ? node.children.map(mapNode) : undefined,
    });
    return data.map(mapNode);
  }, [data]);

  const handleMove = ({ dragIds, parentId }: { dragIds: string[]; parentId: string | null }) => {
    if (!onMove || dragIds.length === 0) return;
    const dragId = dragIds[0];
    const targetParentId = parentId; // null means root level
    
    // Construct new path
    const fileName = dragId.split("/").pop() || "";
    const newPath = targetParentId ? `${targetParentId}/${fileName}` : fileName;
    
    if (dragId !== newPath) {
      onMove(dragId, newPath);
    }
  };

  const handleRename = ({ id, name }: { id: string; name: string }) => {
    if (!onMove || !name.trim()) return;
    const parts = id.split("/");
    parts[parts.length - 1] = name;
    const newPath = parts.join("/");
    if (id !== newPath) {
      onMove(id, newPath);
    }
  };

  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);

  const getFileIcon = (name: string) => {
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    if (IMAGE_EXTS.has(ext))
      return <ImageIcon className="size-4 text-blue-400 shrink-0" />;
    if (ext === "pdf")
      return <FileText className="size-4 text-red-400 shrink-0" />;
    return <FileIcon className="size-4 text-muted-foreground shrink-0" />;
  };

  const NodeRenderer = ({ node, style, dragHandle }: NodeRendererProps<any>) => {
    const isSelected = selectedPath === node.id;
    const isFolder = !node.isLeaf;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isEditing) return;
      if (isFolder) {
        node.toggle();
      } else {
        onSelect?.(node.id);
      }
    };

    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            style={style}
            ref={dragHandle}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors font-mono text-sm group select-none relative",
              isSelected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              node.isDragging && "opacity-40",
              node.willReceiveDrop && "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
            )}
            onClick={handleClick}
          >
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {isFolder ? (
                <>
                  <ChevronRightIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      node.isOpen && "rotate-90"
                    )}
                  />
                  {node.isOpen ? (
                    <FolderOpenIcon className="size-4 text-blue-500 shrink-0" />
                  ) : (
                    <FolderIcon className="size-4 text-blue-500 shrink-0" />
                  )}
                </>
              ) : (
                <>
                  {/* Spacer matching folder chevron indentation */}
                  <span className="size-4 shrink-0" />
                  {getFileIcon(node.data.name)}
                </>
              )}

              {node.isEditing ? (
                <input
                  type="text"
                  defaultValue={node.data.name}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => node.submit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") node.submit(e.currentTarget.value);
                    if (e.key === "Escape") node.reset();
                  }}
                  className="flex-1 rounded border px-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary h-5 min-w-0"
                />
              ) : (
                <span className="truncate flex-1">{node.data.name}</span>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onClick={() => setTimeout(() => node.edit(), 50)} className="gap-2">
            <Edit2Icon className="size-3.5" />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDelete?.(node.id)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2Icon className="size-3.5" />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-background font-mono text-sm w-full h-full min-h-[400px]",
        className
      )}
      role="tree"
    >
      {dimensions.height > 0 && dimensions.width > 0 && (
        <Tree
          data={arboristData}
          onMove={handleMove}
          onRename={handleRename}
          width={dimensions.width}
          height={dimensions.height}
          indent={16}
          rowHeight={28}
          openByDefault={false}
        >
          {NodeRenderer}
        </Tree>
      )}
    </div>
  );
};

// Keep placeholder components so we don't break imports if they are present elsewhere
export const FileTreeFile = () => null;
export const FileTreeFolder = () => null;
