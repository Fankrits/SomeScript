"use client";

import React, { useState } from "react";
import {
  Apple,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Terminal,
  WifiOff,
  UserCheck,
} from "lucide-react";
import { type Release, RELEASES_URL } from "@/lib/release";
import { BREW_CMD, CURL_CMD, IRM_CMD } from "@/lib/desktop";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDetectedOs, type SupportedOS } from "@/lib/detect-os";

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 5.48L10.36 4.4v7.03H3V5.48zm0 13.04l7.36 1.08V12.57H3v5.95zm8.38 1.23L21 21.2V12.57h-9.62v7.18zM21 2.8l-9.62 1.45v7.18H21V2.8z" />
    </svg>
  );
}

interface PlatformConfig {
  os: SupportedOS;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
  requirement: string;
  ext: string;
  commands: { label: string; command: string }[];
  note: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    os: "macOS",
    name: "macOS",
    icon: Apple,
    detail: "Universal build for Apple silicon (M1/M2/M3/M4) and Intel Macs.",
    requirement: "macOS 12 Monterey or newer",
    ext: ".dmg",
    commands: [
      { label: "Homebrew Cask", command: BREW_CMD },
      { label: "Direct Script", command: CURL_CMD },
    ],
    note: "Universal build for Apple silicon and Intel. Installs to /Applications. (Homebrew before 7: omit brew trust).",
  },
  {
    os: "Windows",
    name: "Windows",
    icon: WindowsIcon,
    detail: "Standalone setup installer for Windows 10 & 11.",
    requirement: "Windows 10 & 11 · x64 (arm64 emulated)",
    ext: ".exe",
    commands: [{ label: "PowerShell", command: IRM_CMD }],
    note: "Runs the installer per user. Windows 10/11 x64, and arm64 under emulation.",
  },
  {
    os: "Linux",
    name: "Linux",
    icon: Terminal,
    detail: "Portable AppImage that runs on modern distributions, plus .deb and .rpm packages.",
    requirement: "Linux x64 with glibc 2.39+",
    ext: ".AppImage",
    commands: [{ label: "Direct Script", command: CURL_CMD }],
    note: "Installs AppImage to ~/.local/bin/somescript. .deb and .rpm packages are on the release page.",
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
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const activeOs = selectedOs ?? detected;

  const handleCopy = (command: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(command).catch(() => {});
    }
    setCopiedCmd(command);
    setTimeout(() => {
      setCopiedCmd((current) => (current === command ? null : current));
    }, 2000);
  };

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

      {/* Single Combined Download Card */}
      <div className="w-full max-w-4xl mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden mb-16 sm:mb-20">
        <Tabs
          value={activeOs}
          onValueChange={(val) => setSelectedOs(val as SupportedOS)}
          className="w-full"
        >
          {/* OS Switcher Tabs */}
          <div className="p-3 sm:p-4 bg-muted/40 border-b border-border/60">
            <TabsList className="grid w-full grid-cols-3 bg-muted/80 p-1 rounded-xl h-12">
              {PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                const isDetected = detected === platform.os;
                return (
                  <TabsTrigger
                    key={platform.os}
                    value={platform.os}
                    className="flex items-center justify-center gap-2 text-xs sm:text-sm font-medium transition-all cursor-pointer rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs py-2"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{platform.name}</span>
                    <span className="hidden sm:inline font-mono text-[11px] text-muted-foreground">
                      {platform.ext}
                    </span>
                    {isDetected && (
                      <Badge
                        variant="secondary"
                        className="hidden md:inline-flex text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-medium ml-1"
                      >
                        Your OS
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Tab Content for each Platform */}
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const downloadUrl = release.downloads[platform.os] ?? RELEASES_URL;
            const isDetected = detected === platform.os;

            return (
              <TabsContent
                key={platform.os}
                value={platform.os}
                className="m-0 p-5 sm:p-7 lg:p-8 focus-visible:outline-none"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
                  {/* Left Column: Direct Download Installer (5 cols) */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-6 lg:border-r lg:border-border/60 lg:pr-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2">
                          {isDetected && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-medium"
                            >
                              Your OS
                            </Badge>
                          )}
                          <Badge variant="outline" className="font-mono text-xs">
                            {platform.ext}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xl font-serif font-semibold text-foreground">
                          {platform.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-foreground/70 leading-relaxed font-light mt-1.5">
                          {platform.detail}
                        </p>
                      </div>

                      <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground border border-border/50">
                        <p className="font-medium text-foreground/80 mb-0.5">System Requirement</p>
                        <p>{platform.requirement}</p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Button
                        asChild
                        size="lg"
                        className="w-full justify-center text-xs sm:text-sm font-medium cursor-pointer shadow-xs"
                      >
                        <a href={downloadUrl}>
                          <Download className="mr-2 h-4 w-4" />
                          Download for {platform.name}
                        </a>
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground font-light">
                        Standalone {platform.ext} installer · No account needed
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Terminal Installation Commands (7 cols) */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-primary" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Install with a single command
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-light hidden sm:inline">
                          Automated CLI setup
                        </span>
                      </div>

                      <div className="space-y-3">
                        {platform.commands.map(({ label, command }) => {
                          const isCopied = copiedCmd === command;
                          return (
                            <div key={label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-0.5">
                                <span>{label}</span>
                                {isCopied && (
                                  <span className="text-primary font-normal lowercase tracking-normal">
                                    copied to clipboard
                                  </span>
                                )}
                              </div>
                              <div className="group relative flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-2.5 sm:p-3 transition-colors hover:border-border">
                                <pre className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-foreground/90 pr-2 overflow-x-auto">
                                  <code className="whitespace-pre-wrap break-all">
                                    <span className="select-none text-muted-foreground/60 mr-2">
                                      $
                                    </span>
                                    {command}
                                  </code>
                                </pre>
                                <button
                                  type="button"
                                  aria-label={`Copy ${platform.os} ${label} command`}
                                  onClick={() => handleCopy(command)}
                                  className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                                >
                                  {isCopied ? (
                                    <Check className="h-4 w-4 text-primary" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <p className="border-t border-border/50 pt-3 text-xs text-muted-foreground leading-normal mt-4">
                      {platform.note}
                    </p>
                  </div>
                </div>
              </TabsContent>
            );
          })}

          {/* Card Footer: Quick switch & GitHub releases */}
          <div className="px-5 sm:px-8 py-3.5 bg-muted/20 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/80">Other platforms:</span>
              {PLATFORMS.filter((p) => p.os !== activeOs).map((p) => (
                <button
                  key={p.os}
                  type="button"
                  onClick={() => setSelectedOs(p.os)}
                  className="text-foreground hover:underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  {p.name} ({p.ext})
                </button>
              ))}
            </div>
            <a
              href={release.html_url || RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline inline-flex items-center gap-1 transition-colors"
            >
              <span>All releases on GitHub</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </Tabs>
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
