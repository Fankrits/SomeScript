"use client";

interface ImageViewerProps {
  /** Relative project path, e.g. "figures/diagram.png" */
  path: string;
}

/**
 * Renders a binary image file from the project via the /api/files endpoint.
 * Displays it centred with overflow scroll in case the image is larger than
 * the available viewport.
 */
export function ImageViewer({ path }: ImageViewerProps) {
  const projectId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("projectId") ?? "default"
      : "default";
  // No cache-buster needed: the /api/files image response sets Cache-Control: no-store.
  const src = `/api/files?path=${encodeURIComponent(path)}&projectId=${encodeURIComponent(projectId)}`;
  const filename = path.split("/").pop() ?? path;

  return (
    <div
      className="flex flex-col items-center justify-start h-full w-full overflow-auto bg-background p-4 gap-3"
      aria-label={`Image preview: ${filename}`}
    >
      <p className="text-xs text-muted-foreground font-mono self-start select-all">{path}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={filename}
        className="max-w-full object-contain rounded border border-border shadow"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
