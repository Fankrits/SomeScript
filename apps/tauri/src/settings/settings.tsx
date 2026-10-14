import { useCallback, useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  FileText,
  FolderOpen,
  FolderSync,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { backTarget } from "./back-target";
import { ProviderDialog } from "./provider-dialog";

type Section = "ai" | "general";

const sectionFromUrl = (): Section =>
  new URLSearchParams(window.location.search).get("section") === "general" ? "general" : "ai";

const changed = () => window.dispatchEvent(new Event(AI_SETTINGS_CHANGED));
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SettingsPage() {
  const [section, setSection] = useState<Section>(sectionFromUrl);
  const toSection = (s: Section) => {
    setSection(s);
    const url = new URL(window.location.href);
    url.searchParams.set("section", s);
    window.history.replaceState(null, "", url);
  };

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10"
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

      <Tabs value={section} onValueChange={(v) => toSection(v as Section)}>
        <TabsList>
          <TabsTrigger value="ai" data-testid="tab-ai">
            <Sparkles /> AI assistant
          </TabsTrigger>
          <TabsTrigger value="general" data-testid="tab-general">
            <FolderOpen /> General
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "ai" ? <AiSection /> : <GeneralSection />}
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
