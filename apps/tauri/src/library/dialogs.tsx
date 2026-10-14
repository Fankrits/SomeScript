import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import * as api from "./api";
import { FailureAlert } from "./failure-alert";
import { FolderPicker } from "./folder-picker";
import { FolderStatus } from "./folder-status";
import { stripZip } from "./format";
import { NewProjectFields, useNewProject } from "./new-project";
import { OfflineStatus, useOfflinePrep } from "./offline";
import { useFolderCheck } from "./use-folder-check";

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
  const form = useNewProject(open);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      description="It's created as a folder in your library."
      submitLabel="Create"
      busy={form.busy}
      canSubmit={form.canCreate}
      onSubmit={form.create}
    >
      <NewProjectFields form={form} />
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
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setPath(current);
    setError(null);
  }, [open, current]);
  const { check, error: checkError, checking, recheck } = useFolderCheck(open ? path : "");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setLibraryPath(path.trim());
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const unchanged = path.trim() === current;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Library folder"
      description="Where your projects live. Existing projects stay where they are; the app shows whatever is in the folder you pick."
      submitLabel="Use this folder"
      busy={busy}
      canSubmit={path.trim() !== "" && !unchanged && !checking && check?.issue === null}
      onSubmit={save}
    >
      <FolderPicker value={path} onChange={setPath} disabled={busy} />
      {!unchanged && (
        <FolderStatus
          check={check}
          checking={checking}
          error={checkError}
          onUse={setPath}
          onRecheck={recheck}
        />
      )}
      {error !== null && <FailureAlert title="Couldn't use that folder" error={error} />}
    </FormDialog>
  );
}

/** Compiles a warm-up document so common packages are cached for use without a connection. */
export function OfflineDialog({ open, onOpenChange }: DialogProps) {
  const { run: current, start } = useOfflinePrep();
  const run = current ?? { state: "running" as const, log: "" };
  const started = useRef(false);
  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      start();
    }
    if (!open) started.current = false;
  }, [open, start]);

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

        <OfflineStatus run={run} />
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
