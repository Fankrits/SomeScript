import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, FolderOpen, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import * as api from "./api";
import { FailureAlert } from "./failure-alert";
import { stripZip } from "./format";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shared shell: a titled dialog around one form with Cancel + a primary action. */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busy,
  canSubmit = true,
  onSubmit,
  children,
}: DialogProps & {
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  canSubmit?: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit && !busy) onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || busy}>
              {busy && <Spinner />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const failed = (what: string, e: unknown) =>
  toast.error(`${what}: ${e instanceof Error ? e.message : String(e)}`);

export function NewProjectDialog({ open, onOpenChange }: DialogProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("starter");
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((e) => failed("Couldn't load templates", e));
  }, [open]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      api.openProject(await api.createProject(name, template));
    } catch (e) {
      // In the dialog, not a toast: the message says which folder and what to try, and has to
      // stay on screen long enough to be read and acted on.
      setError(e);
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      description="It's created as a folder in your library."
      submitLabel="Create"
      busy={busy}
      canSubmit={name.trim() !== ""}
      onSubmit={create}
    >
      <div className="grid gap-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My thesis"
        />
      </div>
      <RadioGroup value={template} onValueChange={setTemplate} className="gap-2">
        {templates.map((t) => (
          <Label
            key={t.id}
            htmlFor={`template-${t.id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-checked]]:border-primary has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem value={t.id} id={`template-${t.id}`} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">{t.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{t.description}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {error !== null && (
        <FailureAlert
          title="Couldn't create the project"
          error={error}
          data-testid="create-error"
        />
      )}
    </FormDialog>
  );
}

export function RenameDialog({
  project,
  onOpenChange,
  onDone,
}: {
  project: api.Project | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(project?.name ?? ""), [project]);

  const rename = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await api.renameProject(project.id, name);
      onOpenChange(false);
      onDone();
    } catch (e) {
      failed("Couldn't rename the project", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={project !== null}
      onOpenChange={onOpenChange}
      title="Rename project"
      description="This renames the project's folder too."
      submitLabel="Rename"
      busy={busy}
      canSubmit={name.trim() !== "" && name !== project?.name}
      onSubmit={rename}
    >
      <Input
        aria-label="Project name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </FormDialog>
  );
}

export function ImportDialog({ open, onOpenChange }: DialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setName("");
    }
  }, [open]);

  const pick = (f: File | null) => {
    setFile(f);
    if (f) setName(stripZip(f.name));
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      api.openProject(await api.importZip(file, name));
    } catch (e) {
      failed("Couldn't import the ZIP", e);
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import a project"
      description="Choose a ZIP of a LaTeX project, such as one exported from Overleaf or SomeScript."
      submitLabel="Import"
      busy={busy}
      canSubmit={file !== null && name.trim() !== ""}
      onSubmit={run}
    >
      <Input
        type="file"
        accept=".zip,application/zip"
        aria-label="ZIP file"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {file && (
        <div className="grid gap-2">
          <Label htmlFor="import-name">Project name</Label>
          <Input id="import-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
    </FormDialog>
  );
}

export function FolderDialog({
  open,
  onOpenChange,
  current,
  onDone,
}: DialogProps & { current: string; onDone: () => void }) {
  const [path, setPath] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPath(current), [open, current]);

  const browse = async () => {
    const chosen = await pickFolder({ directory: true, defaultPath: path || undefined });
    if (typeof chosen === "string") setPath(chosen);
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.setLibraryPath(path.trim());
      onOpenChange(false);
      onDone();
    } catch (e) {
      failed("Couldn't use that folder", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Library folder"
      description="Where your projects live. Existing projects stay where they are; the app shows whatever is in the folder you pick."
      submitLabel="Use this folder"
      busy={busy}
      canSubmit={path.trim() !== "" && path.trim() !== current}
      onSubmit={save}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Folder path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="font-mono text-xs"
        />
        {api.inTauri() && (
          <Button type="button" variant="outline" onClick={browse}>
            <FolderOpen /> Browse
          </Button>
        )}
      </div>
    </FormDialog>
  );
}

type Offline = { state: "running" | "done" | "failed"; log: string };

/** Compiles a warm-up document so common packages are cached for use without a connection. */
export function OfflineDialog({ open, onOpenChange }: DialogProps) {
  const [run, setRun] = useState<Offline>({ state: "running", log: "" });
  const started = useRef(false);

  const start = () => {
    setRun({ state: "running", log: "" });
    api
      .prepareOffline((log) => setRun({ state: "running", log }))
      .then((log) => setRun({ state: log.includes("[SUCCESS]") ? "done" : "failed", log }))
      .catch((e) => setRun({ state: "failed", log: String(e) }));
  };
  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      start();
    }
    if (!open) started.current = false;
  }, [open]);

  const offlineIssue = run.log.includes("[NETWORK]");
  const tail = run.log.trim().split("\n").slice(-6).join("\n");

  return (
    <Dialog open={open} onOpenChange={(o) => (run.state !== "running" || !o) && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prepare for offline use</DialogTitle>
          <DialogDescription>
            Downloads the LaTeX packages most documents need, once, so compiling works without a
            connection afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm" role="status">
          {run.state === "running" && (
            <>
              <Spinner /> Downloading packages. The first run can take a minute or two.
            </>
          )}
          {run.state === "done" && (
            <>
              <CheckCircle2 className="size-4 text-emerald-600" /> All set. These packages now work
              offline.
            </>
          )}
          {run.state === "failed" && (
            <>
              <WifiOff className="size-4 text-destructive" />
              {offlineIssue
                ? "Couldn't reach the package server. Check your connection and try again."
                : "Preparing failed. See the log below."}
            </>
          )}
        </div>
        {tail && run.state !== "done" && (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {tail}
          </pre>
        )}
        <DialogFooter>
          {run.state === "failed" && (
            <Button variant="outline" onClick={start}>
              Try again
            </Button>
          )}
          <Button disabled={run.state === "running"} onClick={() => onOpenChange(false)}>
            {run.state === "running" ? "Working…" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
