import React from "react";
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

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 5.48L10.36 4.4v7.03H3V5.48zm0 13.04l7.36 1.08V12.57H3v5.95zm8.38 1.23L21 21.2V12.57h-9.62v7.18zM21 2.8l-9.62 1.45v7.18H21V2.8z" />
    </svg>
  );
}

interface PlatformCard {
  os: "macOS" | "Windows" | "Linux";
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
  return (
    <section
      id="desktop"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10 border-t border-border/40"
    >
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
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

      {/* 3-Card Platforms Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 mb-12 sm:mb-16">
        {PLATFORMS.map((platform) => {
          const Icon = platform.icon;
          const downloadUrl = release.downloads[platform.os] ?? RELEASES_URL;

          return (
            <div
              key={platform.os}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 sm:p-6 text-card-foreground shadow-sm transition-all hover:border-foreground/20 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{platform.ext}</span>
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

              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs font-medium cursor-pointer"
              >
                <a href={downloadUrl}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download for {platform.name}
                </a>
              </Button>
            </div>
          );
        })}
      </div>

      {/* Short Feature List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-16 sm:mb-20">
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

      {/* Terminal / Install Commands Section */}
      <div className="space-y-4">
        <div className="text-center max-w-xl mx-auto mb-6">
          <h3 className="text-xl sm:text-2xl font-serif font-medium text-foreground">
            Install with a single command
          </h3>
          <p className="text-xs sm:text-sm text-foreground/70 font-light mt-1">
            Automate setup via package managers or shell scripts.
          </p>
        </div>

        <InstallPanel />
      </div>
    </section>
  );
}
