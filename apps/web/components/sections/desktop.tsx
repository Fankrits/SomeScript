"use client";

import React, { useState } from "react";
import {
  Apple,
  Download,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Terminal,
  WifiOff,
  UserCheck,
} from "lucide-react";
import { type Release, RELEASES_URL } from "@/lib/release";
import { InstallPanel } from "@/components/install-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDetectedOs, type SupportedOS } from "@/lib/detect-os";
import { cn } from "@/lib/utils";

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 5.48L10.36 4.4v7.03H3V5.48zm0 13.04l7.36 1.08V12.57H3v5.95zm8.38 1.23L21 21.2V12.57h-9.62v7.18zM21 2.8l-9.62 1.45v7.18H21V2.8z" />
    </svg>
  );
}

interface PlatformCard {
  os: SupportedOS;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
  requirement: string;
  ext: string;
}

const PLATFORMS: PlatformCard[] = [
  {
    os: "macOS",
    name: "macOS",
    icon: Apple,
    detail:
      "Universal build for Apple silicon and Intel. Available as a .dmg or via Homebrew cask.",
    requirement: "macOS 12 Monterey or newer",
    ext: ".dmg",
  },
  {
    os: "Windows",
    name: "Windows",
    icon: WindowsIcon,
    detail: "Standalone installer (.exe), or install with a single PowerShell command.",
    requirement: "Windows 10 & 11 · x64 (arm64 emulated)",
    ext: ".exe",
  },
  {
    os: "Linux",
    name: "Linux",
    icon: Terminal,
    detail: "Portable AppImage that runs on modern distributions, plus .deb and .rpm packages.",
    requirement: "Linux x64 with glibc 2.39+",
    ext: ".AppImage",
  },
];

const FEATURES = [
  {
    title: "Free & no account",
    description: "No sign-up, no telemetry, and no subscription. Start writing immediately.",
    icon: UserCheck,
  },
  {
    title: "Your own folders",
    description:
      "Projects are plain folders on your computer. No proprietary databases or locked vaults.",
    icon: FolderOpen,
  },
  {
    title: "Works offline",
    description:
      "Bundled Tectonic compiler typesets papers offline. Prepare packages once, compile anywhere.",
    icon: WifiOff,
  },
  {
    title: "Bring-your-own-key AI",
    description:
      "Connect OpenAI, Anthropic, Gemini, OpenRouter, or local Ollama. API keys never leave your device.",
    icon: KeyRound,
  },
  {
    title: "Updates itself",
    description:
      "Checks for new versions on its own and installs them with one click, so you always have the latest fixes.",
    icon: RefreshCw,
  },
];

export function DesktopSection({ release }: { release: Release }) {
  const detected = useDetectedOs();
  const [selectedOs, setSelectedOs] = useState<SupportedOS | null>(null);

  const activeOs = selectedOs ?? detected;

  return (
    <section
      id="desktop"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10 border-t border-border/40"
    >
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-primary mb-2">
          SomeScript Desktop
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium font-serif tracking-tight text-foreground leading-tight">
          Prefer to keep it on your computer?
        </h2>
        <p className="mt-4 text-sm sm:text-base text-foreground/70 font-light leading-relaxed">
          The desktop app gives you the same AI-assisted LaTeX experience offline. Your files stay
          in your own folders, your AI keys stay on your machine, and no account is required.
        </p>
      </div>

      {/* Unified Download Hub: Direct GUI Installers + Terminal Commands */}
      <div className="rounded-2xl border border-border/80 bg-card/40 p-5 sm:p-7 lg:p-9 mb-16 shadow-xs backdrop-blur-xs">
        {/* 3-Card Platforms Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const downloadUrl = release.downloads[platform.os] ?? RELEASES_URL;
            const isSelected = activeOs === platform.os;
            const isDetected = detected === platform.os;

            return (
              <div
                key={platform.os}
                onClick={() => setSelectedOs(platform.os)}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-5 sm:p-6 text-card-foreground transition-all cursor-pointer group",
                  isSelected
                    ? "border-primary/80 bg-card shadow-sm ring-1 ring-primary/20"
                    : "border-border/80 bg-card/60 hover:border-foreground/25 hover:bg-card/90",
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-muted text-foreground group-hover:bg-muted/80",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isDetected && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-medium"
                        >
                          Your OS
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">{platform.ext}</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-serif font-semibold text-foreground mb-1.5">
                    {platform.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-foreground/70 leading-relaxed font-light mb-3">
                    {platform.detail}
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-light mb-5">
                    Requires {platform.requirement}
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <Button
                    asChild
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-center text-xs font-medium cursor-pointer transition-all"
                  >
                    <a href={downloadUrl} onClick={(e) => e.stopPropagation()}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download for {platform.name}
                    </a>
                  </Button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOs(platform.os);
                    }}
                    className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 transition-colors cursor-pointer py-0.5"
                  >
                    <Terminal className="h-3 w-3" />
                    <span>View single-line command</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider connecting GUI download to Terminal install */}
        <div className="relative my-8 sm:my-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" /> Or install with a single command
            </span>
          </div>
        </div>

        {/* Integrated Terminal / Single-Command Install Panel */}
        <InstallPanel
          selectedOs={activeOs}
          onSelectOs={setSelectedOs}
          className="shadow-none border-border/70 bg-background/60"
        />
      </div>

      {/* Feature Highlights Section */}
      <div className="space-y-8">
        <div className="text-center max-w-xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-serif font-medium text-foreground">
            Why choose the desktop app?
          </h3>
          <p className="text-xs sm:text-sm text-foreground/70 font-light mt-1">
            Built for privacy, speed, and an offline-first workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="flex items-start gap-3.5 rounded-lg border border-border/60 bg-muted/20 p-4 transition-colors hover:border-border"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-serif font-medium text-foreground">{feature.title}</h4>
                  <p className="text-xs text-foreground/70 leading-relaxed font-light">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
