import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CloudDownload, FolderOpen, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import * as api from "../library/api";
import { ImportDialog } from "../library/dialogs";
import { FailureAlert } from "../library/failure-alert";
import { FolderPicker } from "../library/folder-picker";
import { FolderStatus } from "../library/folder-status";
import { NewProjectFields, useNewProject } from "../library/new-project";
import { OfflineStatus, useOfflinePrep } from "../library/offline";
import { useFolderCheck } from "../library/use-folder-check";
import { fileManagerName } from "./platform";

/**
 * First-run setup (`/welcome`): choose where projects live (creating and checking that folder, which is
 * where the OS may ask for permission), optionally fetch the LaTeX packages, create a first project.
 * Setup counts as done as soon as the folder step succeeds, so closing the app after it never
 * brings the user back here; the last two steps are conveniences the dashboard also offers.
 * `/welcome?rerun=1` (Settings → Run setup again) starts at the folder step.
 */
type Step = "welcome" | "folder" | "engine" | "project";
const STEPS: Step[] = ["welcome", "folder", "engine", "project"];

export default function Welcome() {
  const rerun = new URLSearchParams(window.location.search).has("rerun");
  const [settings, setSettings] = useState<api.LibrarySettings | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [step, setStep] = useState<Step>(rerun ? "folder" : "welcome");

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        if (s.onboarded && !rerun) window.location.replace("/dashboard");
        else setSettings(s);
      })
      .catch(setLoadError);
  }, [rerun]);

  if (loadError) {
    return (
      <Frame step={null}>
        <FailureAlert title="Couldn't start setup" error={loadError} />
        <Button onClick={() => window.location.assign("/dashboard")}>Go to my projects</Button>
      </Frame>
    );
  }
  if (!settings) return null;

  return (
    <Frame step={step}>
      {step === "welcome" && (
        <WelcomeStep
          settings={settings}
          onNext={() => setStep("folder")}
          onSkipFailed={() => setStep("folder")}
        />
      )}
      {step === "folder" && (
        <FolderStep
          initial={rerun ? settings.libraryPath : settings.defaultLibraryPath}
          onBack={rerun ? undefined : () => setStep("welcome")}
          onDone={() => setStep("engine")}
        />
      )}
      {step === "engine" && (
        <EngineStep onBack={() => setStep("folder")} onNext={() => setStep("project")} />
      )}
      {step === "project" && <ProjectStep onBack={() => setStep("engine")} />}
    </Frame>
  );
}

function Frame({ step, children }: { step: Step | null; children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-10"
      data-testid="welcome"
      data-step={step ?? "error"}
    >
      {step && (
        <ol className="flex gap-1.5" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={s === step ? "step" : undefined}
              aria-label={`Step ${i + 1} of ${STEPS.length}`}
              className={`h-1.5 flex-1 rounded-full ${
                i <= STEPS.indexOf(step) ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </ol>
      )}
      {children}
    </main>
  );
}

/** A step's title. Takes focus when the step appears, so keyboard and screen-reader users land on it. */
function Title({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
      {children}
    </h1>
  );
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        {icon}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

function WelcomeStep({
  settings,
  onNext,
  onSkipFailed,
}: {
  settings: api.LibrarySettings;
  onNext: () => void;
  onSkipFailed: () => void;
}) {
  const [skipping, setSkipping] = useState(false);
  const fileManager = fileManagerName();

  // Skipping still sets the folder up (the dashboard needs one). If that can't be done the folder
  // step explains why, so a broken folder can never be skipped past.
  const skip = async () => {
    setSkipping(true);
    try {
      await api.setLibraryPath(settings.defaultLibraryPath);
      await api.finishSetup();
      window.location.assign("/dashboard");
    } catch {
      setSkipping(false);
      onSkipFailed();
    }
  };

  return (
    <section className="grid gap-6" data-testid="step-welcome">
      <header className="grid gap-3">
        <img src="/icon.svg" alt="" className="size-12" />
        <Title>Welcome to SomeScript</Title>
        <p className="text-muted-foreground">
          A free LaTeX editor that keeps everything on your computer. Setting up takes about a
          minute.
        </p>
      </header>
      <ul className="grid gap-4">
        <Point icon={<FolderOpen className="size-4" />} title="Your files stay yours">
          Every project is a normal folder. Open it in {fileManager}, back it up or sync it however
          you like.
        </Point>
        <Point icon={<CloudDownload className="size-4" />} title="Works offline">
          Compiling uses a built-in engine. Download the common packages once and you don't need a
          connection.
        </Point>
        <Point icon={<Sparkles className="size-4" />} title="An AI assistant, if you want one">
          Add your own key in Settings whenever you like. Nothing is sent anywhere until you do.
        </Point>
      </ul>
      <p className="text-sm text-muted-foreground">
        Your projects will be saved in{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
          {settings.defaultLibraryPath}
        </code>
        . You can change that in the next step.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={onNext} disabled={skipping} data-testid="get-started">
          Get started <ArrowRight />
        </Button>
        <Button variant="ghost" onClick={skip} disabled={skipping} data-testid="skip-setup">
          {skipping && <Spinner />}
          Skip setup
        </Button>
      </div>
    </section>
  );
}

function FolderStep({
  initial,
  onBack,
  onDone,
}: {
  initial: string;
  onBack?: () => void;
  onDone: () => void;
}) {
  const [path, setPath] = useState(initial);
  const { check, error: checkError, checking, recheck } = useFolderCheck(path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileManager = fileManagerName();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      // Creates the folder if needed and proves it can be written to before remembering it. Any
      // permission prompt from the OS appears now, with this screen's explanation on display.
      await api.setLibraryPath(path.trim());
      await api.finishSetup();
      onDone();
    } catch (e) {
      setError(e);
      recheck();
    } finally {
      setBusy(false);
    }
  };

  const ready = !checking && check !== null && check.issue === null && path.trim() !== "";
  return (
    <section className="grid gap-5" data-testid="step-folder">
      <header className="grid gap-2">
        <Title>Where should your projects live?</Title>
        <p className="text-muted-foreground">
          Each project is a normal folder in here, so you can open it in {fileManager}, back it up
          or sync it. Your system may ask permission when SomeScript creates the folder.
        </p>
      </header>
      <FolderPicker value={path} onChange={setPath} disabled={busy} />
      <FolderStatus
        check={check}
        checking={checking}
        error={checkError}
        onUse={setPath}
        onRecheck={recheck}
      />
      {error !== null && <FailureAlert title="Couldn't set up that folder" error={error} />}
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} disabled={busy}>
            <ArrowLeft /> Back
          </Button>
        )}
        <Button onClick={confirm} disabled={!ready || busy} data-testid="folder-continue">
          {busy && <Spinner />}
          {check?.exists ? "Use this folder" : "Create folder & continue"}
          {!busy && <ArrowRight />}
        </Button>
      </div>
    </section>
  );
}

function EngineStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { run, start } = useOfflinePrep();
  return (
    <section className="grid gap-5" data-testid="step-engine">
      <header className="grid gap-2">
        <Title>Get ready to compile</Title>
        <p className="text-muted-foreground">
          SomeScript compiles with a built-in LaTeX engine. The first compile downloads the packages
          a document needs. Fetch the common ones now, and compiling works offline from then on.
        </p>
      </header>
      {run === null ? (
        <div>
          <Button variant="outline" onClick={start} data-testid="download-packages">
            <CloudDownload /> Download common packages
          </Button>
        </div>
      ) : (
        <>
          <OfflineStatus run={run} />
          {run.state === "failed" && (
            <div>
              <Button variant="outline" onClick={start}>
                Try again
              </Button>
            </div>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onBack} disabled={run?.state === "running"}>
          <ArrowLeft /> Back
        </Button>
        <Button onClick={onNext} disabled={run?.state === "running"} data-testid="engine-continue">
          {run?.state === "done" ? "Continue" : "Skip for now"} <ArrowRight />
        </Button>
      </div>
    </section>
  );
}

function ProjectStep({ onBack }: { onBack: () => void }) {
  const form = useNewProject(true);
  const [importing, setImporting] = useState(false);
  return (
    <section className="grid gap-5" data-testid="step-project">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.canCreate && !form.busy) void form.create();
        }}
      >
        <header className="grid gap-2">
          <Title>Create your first project</Title>
          <p className="text-muted-foreground">
            Pick a starting point. You can add more projects, or import one you already have, from
            your projects page at any time.
          </p>
        </header>
        <NewProjectFields form={form} />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={form.busy}>
            <ArrowLeft /> Back
          </Button>
          <Button type="submit" disabled={!form.canCreate || form.busy} data-testid="create-first">
            {form.busy && <Spinner />}
            Create project
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button variant="link" className="px-0" onClick={() => setImporting(true)}>
          <Upload /> Import a ZIP instead
        </Button>
        <Button
          variant="link"
          className="px-0"
          onClick={() => window.location.assign("/dashboard")}
          data-testid="finish-setup"
        >
          Skip, take me to my projects
        </Button>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </section>
  );
}
