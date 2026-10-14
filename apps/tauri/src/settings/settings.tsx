import { useCallback, useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  FileText,
  FolderOpen,
  FolderSync,
  Info,
  KeyRound,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteProvider,
  getAiSettings,
  setAiPreferences,
  type AiSettings,
  type Provider,
} from "../chat/api";
import { AI_SETTINGS_CHANGED } from "../chat/use-ai-settings";
import { FolderDialog, OfflineDialog } from "../library/dialogs";
import * as library from "../library/api";
import { checkForUpdate, installUpdate, openExternalUrl, type Update } from "../updater/updater";
import { backTarget } from "./back-target";
import { ProviderDialog } from "./provider-dialog";

export type Section = "ai" | "general" | "about";

export function sectionFromUrl(search: string): Section | null {
  const section = new URLSearchParams(search).get("section");
  if (section === "ai" || section === "general" || section === "about") {
    return section;
  }
  return null;
}

const changed = () => window.dispatchEvent(new Event(AI_SETTINGS_CHANGED));
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    return sectionFromUrl(window.location.search) ?? "ai";
  });

  const scrollTo = (id: Section, smooth = true) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: smooth && !prefersReduced ? "smooth" : "auto",
        block: "start",
      });
    }
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    const initial = sectionFromUrl(window.location.search);
    if (initial) {
      setActiveSection(initial);
      const el = document.getElementById(initial);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
  }, []);

  useEffect(() => {
    const aiEl = document.getElementById("ai");
    const generalEl = document.getElementById("general");
    const aboutEl = document.getElementById("about");
    if (!aiEl || !generalEl || !aboutEl) return;

    const observer = new IntersectionObserver(
      () => {
        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40;
        if (atBottom) {
          setActiveSection("about");
          return;
        }

        const visibleSections = [aiEl, generalEl, aboutEl].filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 60;
        });

        if (visibleSections.length > 0) {
          setActiveSection(visibleSections[0].id as Section);
        }
      },
      {
        rootMargin: "-60px 0px -40% 0px",
        threshold: [0, 0.1, 0.5, 1],
      },
    );

    observer.observe(aiEl);
    observer.observe(generalEl);
    observer.observe(aboutEl);

    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40) {
        setActiveSection("about");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10"
      data-testid="settings-page"
    >
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => window.location.assign(backTarget(window.location.search))}
        >
          <ArrowLeft />
        </Button>
        <div className="grid">
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            These apply to the whole app, not to one project.
          </p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Sticky left nav (<md collapses into horizontal row) */}
        <nav className="flex md:flex-col gap-1 w-full md:w-52 shrink-0 md:sticky md:top-6 self-start">
          <button
            type="button"
            onClick={() => scrollTo("ai")}
            data-testid="nav-ai"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
              activeSection === "ai"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <Sparkles className="size-4 shrink-0" />
            AI assistant
          </button>
          <button
            type="button"
            onClick={() => scrollTo("general")}
            data-testid="nav-general"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
              activeSection === "general"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <FolderOpen className="size-4 shrink-0" />
            General
          </button>
          <button
            type="button"
            onClick={() => scrollTo("about")}
            data-testid="nav-about"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
              activeSection === "about"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <Info className="size-4 shrink-0" />
            About
          </button>
        </nav>

        {/* Content Column */}
        <div className="flex-1 min-w-0 flex flex-col gap-12 w-full">
          <section id="ai" className="scroll-mt-6 grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">AI assistant</h2>
            <AiSection />
          </section>

          <section id="general" className="scroll-mt-6 grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">General</h2>
            <GeneralSection />
          </section>

          <section id="about" className="scroll-mt-6 grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">About</h2>
            <AboutSection />
          </section>
        </div>
      </div>
    </main>
  );
}

// ---- AI ---------------------------------------------------------------------------------------

function AiSection() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Provider | "new" | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [instructions, setInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  const apply = useCallback((next: AiSettings) => {
    setSettings(next);
    setInstructions(next.customInstructions);
    changed();
  }, []);

  useEffect(() => {
    getAiSettings()
      .then((s) => {
        setSettings(s);
        setInstructions(s.customInstructions);
      })
      .catch((e) => setLoadError(errorText(e)));
  }, []);

  const activate = async (p: Provider) => {
    try {
      apply(await setAiPreferences({ activeProviderId: p.id }));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      apply(await deleteProvider(removing.id));
      toast.success(`Removed ${removing.name}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRemoving(null);
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      apply(await setAiPreferences({ customInstructions: instructions }));
      toast.success("Instructions saved");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSavingInstructions(false);
    }
  };

  if (loadError) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        Couldn't load the AI settings: {loadError}
      </p>
    );
  }
  if (!settings) return <Skeleton className="h-40 w-full" />;

  const { providers } = settings;
  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-labelledby="providers-title">
        <div className="flex items-center gap-3">
          <div className="grid">
            <h2 id="providers-title" className="text-sm font-semibold">
              Providers
            </h2>
            <p className="text-sm text-muted-foreground">
              Bring your own key. It is stored on this computer and only ever sent to the provider
              you add.
            </p>
          </div>
          <Button
            className="ml-auto shrink-0"
            onClick={() => setDialog("new")}
            data-testid="add-provider"
          >
            <Plus /> Add provider
          </Button>
        </div>

        {providers.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center"
            data-testid="no-providers"
          >
            <KeyRound className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No provider yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add OpenAI, Anthropic, OpenRouter, Gemini, a local model like Ollama, or any custom
              OpenAI-compatible endpoint to turn on the assistant.
            </p>
            <Button className="mt-2" onClick={() => setDialog("new")}>
              <Plus /> Add provider
            </Button>
          </div>
        ) : (
          <ul className="grid gap-2" data-testid="provider-list">
            {providers.map((p) => {
              const active = p.id === (settings.activeProviderId ?? providers[0].id);
              return (
                <li
                  key={p.id}
                  data-testid={`provider-${p.name}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3",
                    active ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      {active && (
                        <Badge variant="secondary">
                          <Check /> In use
                        </Badge>
                      )}
                    </div>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {p.baseUrl}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.kind === "anthropic" ? "Anthropic API" : "OpenAI-compatible"} ·{" "}
                      {p.hasKey ? `key …${p.keyHint || "saved"}` : "no key"} ·{" "}
                      {p.defaultModel || p.models[0] || "no model chosen"}
                    </span>
                  </div>
                  {!active && (
                    <Button variant="outline" size="sm" onClick={() => void activate(p)}>
                      Use
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => setDialog(p)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setRemoving(p)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="instructions-title">
        <div className="grid">
          <h2 id="instructions-title" className="text-sm font-semibold">
            Your instructions
          </h2>
          <p className="text-sm text-muted-foreground">
            Added to every chat, for every project. For example: "Use biblatex, not natbib", or
            "Reply in Thai".
          </p>
        </div>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          maxLength={4000}
          aria-label="Custom instructions"
          data-testid="custom-instructions"
          placeholder="Optional"
        />
        <div>
          <Button
            variant="outline"
            disabled={savingInstructions || instructions === settings.customInstructions}
            onClick={() => void saveInstructions()}
            data-testid="save-instructions"
          >
            {savingInstructions && <Spinner />} Save instructions
          </Button>
        </div>
      </section>

      <ProviderDialog target={dialog} onClose={() => setDialog(null)} onSaved={apply} />

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved key is deleted from this computer. Your chats stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- General ----------------------------------------------------------------------------------

function GeneralSection() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [logFile, setLogFile] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"folder" | "offline" | null>(null);

  const load = useCallback(() => {
    library
      .getSettings()
      .then((s) => {
        setLibraryPath(s.libraryPath);
        setLogFile(s.logFile);
      })
      .catch(() => setLibraryPath(""));
  }, []);
  useEffect(load, [load]);

  // Where the system lets us, put the report on the clipboard; otherwise say so, rather than fail silently.
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(await library.diagnostics());
      toast.success("Copied. Paste it into your bug report.");
    } catch (e) {
      toast.error(`Couldn't copy the report: ${errorText(e)}`);
    }
  };

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Projects folder</h2>
          <p className="text-sm text-muted-foreground">Where your projects are stored.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs" data-testid="library-path">
            {libraryPath ?? "…"}
          </code>
          {library.inTauri() && libraryPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revealItemInDir(libraryPath).catch((e) => toast.error(errorText(e)))}
            >
              <FolderOpen /> Show
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDialog("folder")}>
            <FolderSync /> Change…
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Offline use</h2>
          <p className="text-sm text-muted-foreground">
            The first compile downloads the LaTeX packages a document needs. Fetch the common ones
            now so compiling works without a connection.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={() => setDialog("offline")}>
            <WifiOff /> Prepare for offline use…
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Setup</h2>
          <p className="text-sm text-muted-foreground">
            Go through the first-run steps again: projects folder, offline packages, a first
            project. Your projects and settings stay as they are.
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            onClick={() => window.location.assign("/welcome?rerun=1")}
            data-testid="run-setup-again"
          >
            <RotateCw /> Run setup again
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Diagnostics</h2>
          <p className="text-sm text-muted-foreground">
            If something doesn't work, copy this report into your bug report. It lists versions,
            folders and the end of the log. It never includes your API keys or the contents of your
            files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copyDiagnostics()}>
            <ClipboardCopy /> Copy diagnostics
          </Button>
          {library.inTauri() && logFile && (
            <Button
              variant="outline"
              onClick={() => revealItemInDir(logFile).catch((e) => toast.error(errorText(e)))}
            >
              <FileText /> Show log file
            </Button>
          )}
        </div>
      </section>

      <FolderDialog
        open={dialog === "folder"}
        onOpenChange={(o) => !o && setDialog(null)}
        current={libraryPath ?? ""}
        onDone={load}
      />
      <OfflineDialog open={dialog === "offline"} onOpenChange={(o) => !o && setDialog(null)} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- About ------------------------------------------------------------------------------------

function AboutSection() {
  const [version, setVersion] = useState("development build");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [loadedSettings, setLoadedSettings] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);

  useEffect(() => {
    if (library.inTauri()) {
      import("@tauri-apps/api/app")
        .then((m) => m.getVersion())
        .then((v) => setVersion(v))
        .catch(() => setVersion("development build"));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    library
      .getSettings()
      .then((s) => {
        if (!mounted) return;
        setAutoUpdate(s.autoUpdate);
        setLoadedSettings(true);
      })
      .catch((e) => {
        console.warn("Failed to load settings:", e);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleAutoUpdate = async (checked: boolean) => {
    const prev = autoUpdate;
    setAutoUpdate(checked);
    try {
      await library.setUpdatePrefs({ autoUpdate: checked });
    } catch (e) {
      console.error("Failed to save update preference:", e);
      setAutoUpdate(prev);
      toast.error("Couldn't save update settings");
    }
  };

  const handleCheckUpdates = async () => {
    if (!library.inTauri()) return;
    setChecking(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setAvailableUpdate(null);
    setProgressText(null);

    try {
      const update = await checkForUpdate();
      if (!update) {
        const vDisplay = version.startsWith("v") ? version : `v${version}`;
        setStatusMessage(`You're up to date (${vDisplay})`);
      } else {
        setAvailableUpdate(update);
        setStatusMessage(`Version ${update.version} is available`);
      }
    } catch (e) {
      setErrorMessage(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!availableUpdate) return;
    setInstalling(true);
    setErrorMessage(null);
    setProgressText("Starting download…");

    try {
      await installUpdate(availableUpdate, (downloaded, total) => {
        if (total && total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          setProgressText(`${formatBytes(downloaded)} / ${formatBytes(total)} (${pct}%)`);
        } else {
          setProgressText(`${formatBytes(downloaded)} downloaded`);
        }
      });
    } catch (e) {
      console.error("Install failed:", e);
      setErrorMessage("Couldn't install the update automatically");
      toast.error("Couldn't install the update automatically", {
        action: {
          label: "Download",
          onClick: () => {
            void openExternalUrl("https://github.com/Fankrits/SomeScript/releases/latest");
          },
        },
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (library.inTauri()) {
      e.preventDefault();
      void openExternalUrl(url);
    }
  };

  return (
    <div className="grid gap-8">
      {/* App info */}
      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">SomeScript</h2>
          <p className="text-sm text-muted-foreground">
            Version{" "}
            <span className="font-mono text-xs" data-testid="app-version">
              {version}
            </span>
          </p>
        </div>
      </section>

      {/* Check for updates */}
      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Updates</h2>
          <p className="text-sm text-muted-foreground">Check for new releases of SomeScript.</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={checking || installing || !library.inTauri()}
              onClick={() => void handleCheckUpdates()}
              data-testid="check-updates"
            >
              {checking && <Spinner />} Check for updates
            </Button>
            {!library.inTauri() && (
              <span className="text-xs text-muted-foreground">
                Updates are only available in the desktop app
              </span>
            )}
            {checking && <span className="text-xs text-muted-foreground">Checking…</span>}
            {!checking && statusMessage && (
              <span className="text-xs text-muted-foreground">{statusMessage}</span>
            )}
            {!checking && errorMessage && (
              <span className="text-xs text-destructive">{errorMessage}</span>
            )}
          </div>
          {availableUpdate && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="default"
                disabled={installing}
                onClick={() => void handleInstall()}
                data-testid="install-update"
              >
                {installing && <Spinner />} Install and restart
              </Button>
              {progressText && (
                <span className="text-xs text-muted-foreground">{progressText}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Auto-update switch */}
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
          <div className="grid gap-0.5">
            <label htmlFor="auto-update" className="text-sm font-semibold cursor-pointer">
              Check for updates automatically
            </label>
            <p className="text-sm text-muted-foreground">
              Periodically check for new releases in the background.
            </p>
          </div>
          <Switch
            id="auto-update"
            checked={autoUpdate}
            disabled={!loadedSettings}
            onCheckedChange={handleToggleAutoUpdate}
            data-testid="auto-update"
          />
        </div>
      </section>

      {/* Links */}
      <section className="grid gap-3">
        <div className="grid">
          <h2 className="text-sm font-semibold">Links</h2>
          <p className="text-sm text-muted-foreground">
            Project repository, website, and issue tracker.
          </p>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-sm font-medium">Source code</span>
            <a
              href="https://github.com/Fankrits/SomeScript"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => handleLinkClick(e, "https://github.com/Fankrits/SomeScript")}
              className="text-xs text-muted-foreground hover:text-foreground font-mono truncate"
            >
              https://github.com/Fankrits/SomeScript
            </a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-sm font-medium">Website</span>
            <a
              href="https://somescript.com"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => handleLinkClick(e, "https://somescript.com")}
              className="text-xs text-muted-foreground hover:text-foreground font-mono truncate"
            >
              https://somescript.com
            </a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-sm font-medium">Report an issue</span>
            <a
              href="https://github.com/Fankrits/SomeScript/issues"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => handleLinkClick(e, "https://github.com/Fankrits/SomeScript/issues")}
              className="text-xs text-muted-foreground hover:text-foreground font-mono truncate"
            >
              https://github.com/Fankrits/SomeScript/issues
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
