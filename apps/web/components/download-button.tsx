"use client";

import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Release, REPO, RELEASES_URL } from "@/lib/release";
import { useDetectedOs, getOsExtension, type SupportedOS } from "@/lib/detect-os";

export interface DownloadVersionLineProps {
  release: Release;
  os?: SupportedOS;
  className?: string;
}

export function DownloadVersionLine({
  release,
  os: explicitOs,
  className,
}: DownloadVersionLineProps) {
  const detectedOs = useDetectedOs();
  const os = explicitOs ?? detectedOs;
  const ext = getOsExtension(os);

  return (
    <p
      className={cn(
        "text-xs text-muted-foreground flex flex-wrap items-center justify-center gap-1.5",
        className,
      )}
    >
      {release.version ? <span>v{release.version} ·</span> : null}
      <span>{ext}</span>
      <span>·</span>
      <a
        href={RELEASES_URL}
        className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        all platforms
      </a>
      <span>·</span>
      <a
        href={REPO}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        GitHub
      </a>
    </p>
  );
}

export interface DownloadButtonProps {
  release: Release;
  size?: "default" | "sm" | "lg" | "xs";
  className?: string;
  showVersionLine?: boolean;
}

export function DownloadButton({
  release,
  size = "lg",
  className,
  showVersionLine = false,
}: DownloadButtonProps) {
  const os = useDetectedOs();
  const downloadUrl = release.downloads[os] ?? RELEASES_URL;

  const button = (
    <Button
      asChild
      size={size}
      className={cn(
        "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md shadow-primary/10 transition-all",
        className,
      )}
    >
      <a href={downloadUrl}>
        <Download className="mr-2 h-4 w-4 shrink-0" />
        Download for {os}
      </a>
    </Button>
  );

  if (!showVersionLine) {
    return button;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {button}
      <DownloadVersionLine release={release} os={os} />
    </div>
  );
}
