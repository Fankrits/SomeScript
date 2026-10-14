import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import * as api from "./api";
import { FailureAlert } from "./failure-alert";

/** The name and template behind both the New project dialog and the last step of first-run setup. */
export function useNewProject(active: boolean) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("starter");
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!active) return;
    setName("");
    setError(null);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((e) =>
        toast.error(`Couldn't load templates: ${e instanceof Error ? e.message : String(e)}`),
      );
  }, [active]);

  /** Creates the project and opens it in the editor. */
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      api.openProject(await api.createProject(name, template));
    } catch (e) {
      // Shown in place, not as a toast: the message says which folder and what to try, and has to
      // stay on screen long enough to be read and acted on.
      setError(e);
      setBusy(false);
    }
  };

  return {
    name,
    setName,
    template,
    setTemplate,
    templates,
    busy,
    error,
    create,
    canCreate: name.trim() !== "",
  };
}
export type NewProjectForm = ReturnType<typeof useNewProject>;

/** What `name` will be called on disk, once the user stops typing. Only a nicety: errors are ignored. */
function useFolderName(name: string, delayMs = 250) {
  const [result, setResult] = useState<{ name: string; id: string; changed: boolean } | null>(null);
  const wanted = name.trim();
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    const timer = setTimeout(() => {
      api
        .folderName(name)
        .then((r) => current && setResult({ name: wanted, ...r }))
        .catch(() => undefined);
    }, delayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [name, wanted, delayMs]);
  return wanted !== "" && result?.name === wanted ? result : null;
}

export function NewProjectFields({
  form,
  autoFocus = true,
}: {
  form: NewProjectForm;
  autoFocus?: boolean;
}) {
  const folder = useFolderName(form.name);
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          autoFocus={autoFocus}
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder="My thesis"
        />
        {folder?.changed && (
          <p className="text-xs text-muted-foreground" data-testid="folder-name-preview">
            Saved in a folder named{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{folder.id}</code> (folder
            names can't use some characters, and each one must be different).
          </p>
        )}
      </div>
      <RadioGroup value={form.template} onValueChange={form.setTemplate} className="gap-2">
        {form.templates.map((t) => (
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
      {form.error !== null && (
        <FailureAlert
          title="Couldn't create the project"
          error={form.error}
          data-testid="create-error"
        />
      )}
    </>
  );
}
