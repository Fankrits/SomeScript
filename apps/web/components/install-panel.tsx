"use client";

import React, { useState } from "react";
import { Apple, Check, Copy, Terminal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDetectedOs, type SupportedOS } from "@/lib/detect-os";
import { BREW_CMD, CURL_CMD, IRM_CMD } from "@/lib/desktop";
import { cn } from "@/lib/utils";

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 5.48L10.36 4.4v7.03H3V5.48zm0 13.04l7.36 1.08V12.57H3v5.95zm8.38 1.23L21 21.2V12.57h-9.62v7.18zM21 2.8l-9.62 1.45v7.18H21V2.8z" />
    </svg>
  );
}

interface CommandItem {
  label: string;
  command: string;
}

interface TabConfig {
  os: SupportedOS;
  icon: React.ComponentType<{ className?: string }>;
  commands: CommandItem[];
  note: string;
}

const TABS: TabConfig[] = [
  {
    os: "macOS",
    icon: Apple,
    commands: [
      {
        label: "Homebrew Cask",
        command: BREW_CMD,
      },
      {
        label: "Direct Script",
        command: CURL_CMD,
      },
    ],
    note: "Universal build for Apple silicon and Intel. Installs to /Applications. (Homebrew before 7: omit brew trust).",
  },
  {
    os: "Windows",
    icon: WindowsIcon,
    commands: [
      {
        label: "PowerShell",
        command: IRM_CMD,
      },
    ],
    note: "Runs the installer per user. Windows 10/11 x64, and arm64 under emulation.",
  },
  {
    os: "Linux",
    icon: Terminal,
    commands: [
      {
        label: "Direct Script",
        command: CURL_CMD,
      },
    ],
    note: "Installs AppImage to ~/.local/bin/somescript. .deb and .rpm packages are on the release page.",
  },
];

interface InstallPanelProps {
  className?: string;
  selectedOs?: SupportedOS | null;
  onSelectOs?: (os: SupportedOS) => void;
}

export function InstallPanel({ className, selectedOs, onSelectOs }: InstallPanelProps) {
  const detected = useDetectedOs();
  const [internalSelectedOs, setInternalSelectedOs] = useState<SupportedOS | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const activeOs =
    selectedOs !== undefined ? (selectedOs ?? detected) : (internalSelectedOs ?? detected);

  const handleSelectOs = (val: SupportedOS) => {
    if (onSelectOs) {
      onSelectOs(val);
    } else {
      setInternalSelectedOs(val);
    }
  };

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
    <div
      className={cn(
        "w-full max-w-2xl mx-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden",
        className,
      )}
    >
      <Tabs
        value={activeOs}
        onValueChange={(val) => handleSelectOs(val as SupportedOS)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 bg-muted/60 p-1 border-b border-border/40 rounded-none h-11">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.os}
                value={tab.os}
                className="flex items-center justify-center gap-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.os}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="p-4 sm:p-5 min-h-[220px] flex flex-col justify-between">
          {TABS.map((tab) => (
            <TabsContent
              key={tab.os}
              value={tab.os}
              className="mt-0 space-y-4 focus-visible:outline-none flex-1 flex flex-col justify-between"
            >
              <div className="space-y-3">
                {tab.commands.map(({ label, command }) => {
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
                      <div className="group relative flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-2.5 sm:p-3 transition-colors hover:border-border">
                        <pre className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-foreground/90 pr-2">
                          <code className="whitespace-pre-wrap break-all">
                            <span className="select-none text-muted-foreground/60 mr-2">$</span>
                            {command}
                          </code>
                        </pre>
                        <button
                          type="button"
                          aria-label={`Copy ${tab.os} ${label} command`}
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

              <p className="border-t border-border/40 pt-3 text-xs text-muted-foreground leading-normal mt-4">
                {tab.note}
              </p>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
