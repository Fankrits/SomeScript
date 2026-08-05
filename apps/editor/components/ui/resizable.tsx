"use client";

import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-transparent ring-offset-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full cursor-col-resize aria-[orientation=horizontal]:cursor-row-resize",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-4 after:-translate-x-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-4 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        "group",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-0 bg-transparent transition-all duration-150 ease-in-out",
          "group-hover:bg-[#0f4c5c] group-hover:scale-x-[400%]",
          "group-[[aria-orientation=horizontal]]:group-hover:scale-x-100 group-[[aria-orientation=horizontal]]:group-hover:scale-y-[400%]",
        )}
      />
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
