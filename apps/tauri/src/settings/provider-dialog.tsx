import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Plus, RefreshCw, XCircle, X } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  saveProvider,
  testProvider,
  type AiSettings,
  type Provider,
  type ProviderForm,
  type ProviderKind,
} from "../chat/api";
import { PRESETS, presetFor, type Preset } from "./presets";

type Check =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "ok"; message: string }
  | { state: "fail"; message: string };

interface Draft {
  presetId: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  clearKey: boolean;
  apiKeyHeader: string;
  models: string[];
  defaultModel: string;
}

const blank = (preset: Preset): Draft => ({
  presetId: preset.id,
  name: preset.id === "custom" ? "" : preset.name,
  kind: preset.kind,
  baseUrl: preset.baseUrl,
  apiKey: "",
  clearKey: false,
  apiKeyHeader: "",
  models: preset.models,
  defaultModel: preset.models[0] ?? "",
});

const fromProvider = (p: Provider): Draft => ({
  presetId: presetFor(p.baseUrl)?.id ?? "custom",
  name: p.name,
  kind: p.kind,
  baseUrl: p.baseUrl,
  apiKey: "",
  clearKey: false,
  apiKeyHeader: p.apiKeyHeader,
  models: p.models,
  defaultModel: p.defaultModel,
});

/** Add a provider (pick a preset first) or edit one. The saved key is never shown, only replaced. */
export function ProviderDialog(props: {
  /** `null` closed; `"new"` adding; a provider = editing it. */
  target: Provider | "new" | null;
  onClose: () => void;
  onSaved: (settings: AiSettings) => void;
}) {
  const { target } = props;
  const editing = target !== null && target !== "new" ? target : null;
  const open = target !== null;
  const [draft, setDraft] = useState<Draft>(() => blank(PRESETS[0]));
  const [picked, setPicked] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<Check>({ state: "idle" });
  const [chat, setChat] = useState<Check>({ state: "idle" });
  const [fetched, setFetched] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (target === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    setDraft(target === "new" ? blank(PRESETS[0]) : fromProvider(target));
    setPicked(target !== "new");
    setShowKey(false);
    setConnection({ state: "idle" });
    setChat({ state: "idle" });
    setFetched([]);
    setModelInput("");
    setFilter("");
  }, [target]);

  const preset = PRESETS.find((p) => p.id === draft.presetId);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const form = (): ProviderForm => ({
    id: editing?.id,
    name: draft.name.trim(),
    kind: draft.kind,
    baseUrl: draft.baseUrl.trim(),
    // Blank means "keep what's saved" when editing; the server never sends the key back.
    ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
    ...(draft.clearKey ? { clearKey: true } : {}),
    apiKeyHeader: draft.apiKeyHeader.trim(),
    models: draft.models,
    defaultModel: draft.defaultModel.trim(),
  });

  const canTest = draft.baseUrl.trim() !== "";
  const hasKey = draft.apiKey.trim() !== "" || (editing?.hasKey === true && !draft.clearKey);

  const runCheck = async (
    set: (c: Check) => void,
    mode: "models" | "chat",
    onOk: (r: { models?: string[]; sample?: string; ms?: number }) => string,
  ) => {
    set({ state: "busy" });
    try {
      const model = draft.defaultModel.trim() || draft.models[0] || "";
      const r = await testProvider(
        { ...form(), name: draft.name.trim() || "Provider" },
        mode,
        model,
      );
      set(r.ok ? { state: "ok", message: onOk(r) } : { state: "fail", message: r.error });
    } catch (e) {
      set({ state: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const testConnection = () =>
    runCheck(setConnection, "models", (r) => {
      setFetched(r.models ?? []);
      const n = r.models?.length ?? 0;
      return n > 0 ? `Connected. ${n} models available.` : "Connected.";
    });
  const testChat = () =>
    runCheck(
      setChat,
      "chat",
      (r) => `The model answered${r.ms ? ` in ${(r.ms / 1000).toFixed(1)}s` : ""}.`,
    );

  const addModel = (name: string) => {
    const m = name.trim();
    if (!m || draft.models.includes(m)) return;
    setDraft((d) => ({ ...d, models: [...d.models, m], defaultModel: d.defaultModel || m }));
  };
  const removeModel = (name: string) =>
    setDraft((d) => {
      const models = d.models.filter((m) => m !== name);
      return {
        ...d,
        models,
        defaultModel: d.defaultModel === name ? (models[0] ?? "") : d.defaultModel,
      };
    });

  const suggestions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return fetched
      .filter((m) => !draft.models.includes(m) && m.toLowerCase().includes(q))
      .slice(0, 60);
  }, [fetched, filter, draft.models]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings } = await saveProvider(form());
      toast.success(editing ? "Provider updated" : "Provider added");
      props.onSaved(settings);
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && props.onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="provider-dialog"
      >
        {!picked ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add a provider</DialogTitle>
              <DialogDescription>
                Choose where the assistant should send your questions. You can change this any time.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`preset-${p.id}`}
                  onClick={() => {
                    setDraft(blank(p));
                    setPicked(true);
                  }}
                  className="rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="block font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.needsKey ? "API key" : p.id === "custom" ? "Your own URL" : "No key needed"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {editing ? `Edit ${editing.name}` : `Add ${preset?.name ?? "provider"}`}
              </DialogTitle>
              <DialogDescription>
                {preset?.hint ??
                  "Your key is stored on this computer and only used to call this provider."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="My provider"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="p-url">Base URL</Label>
              <Input
                id="p-url"
                value={draft.baseUrl}
                onChange={(e) => set("baseUrl", e.target.value)}
                placeholder="https://api.example.com/v1"
                className="font-mono text-xs"
                spellCheck={false}
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="p-key">API key</Label>
                {preset?.keyUrl && (
                  <a
                    href={preset.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Get a key <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="p-key"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, apiKey: e.target.value, clearKey: false }))
                  }
                  placeholder={
                    editing?.hasKey && !draft.clearKey
                      ? `Saved (…${editing.keyHint || "••••"}). Type to replace`
                      : preset && !preset.needsKey
                        ? "Optional"
                        : "Paste your key"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showKey ? "Hide key" : "Show key"}
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {editing?.hasKey && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draft.clearKey}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, clearKey: e.target.checked, apiKey: "" }))
                    }
                  />
                  Remove the saved key
                </label>
              )}
            </div>

            <details
              className="rounded-lg border border-border/60 px-3 py-2 text-sm"
              open={draft.presetId === "custom" || draft.apiKeyHeader !== ""}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Advanced
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="p-kind">API style</Label>
                  <NativeSelect
                    className="w-full"
                    id="p-kind"
                    value={draft.kind}
                    onChange={(e) => set("kind", e.target.value as ProviderKind)}
                  >
                    <NativeSelectOption value="openai">
                      OpenAI-compatible (chat completions)
                    </NativeSelectOption>
                    <NativeSelectOption value="anthropic">Anthropic (messages)</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-header">Send the key in this header</Label>
                  <Input
                    id="p-header"
                    value={draft.apiKeyHeader}
                    onChange={(e) => set("apiKeyHeader", e.target.value)}
                    placeholder={
                      draft.kind === "anthropic"
                        ? "x-api-key (default)"
                        : "Authorization: Bearer (default)"
                    }
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Azure OpenAI wants api-key. Leave empty otherwise.
                  </p>
                </div>
              </div>
            </details>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="p-model-input">Models</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!canTest || connection.state === "busy"}
                  onClick={testConnection}
                  data-testid="fetch-models"
                >
                  {connection.state === "busy" ? <Spinner /> : <RefreshCw />} Fetch from provider
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="model-chips">
                {draft.models.map((m) => (
                  <span
                    key={m}
                    className={cn(
                      "flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs",
                      m === draft.defaultModel ? "border-primary/40 bg-primary/5" : "border-border",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => set("defaultModel", m)}
                      title="Use as the default"
                      className="font-mono"
                    >
                      {m}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${m}`}
                      onClick={() => removeModel(m)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {draft.models.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No models yet. Add the name of one below.
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="p-model-input"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addModel(modelInput);
                      setModelInput("");
                    }
                  }}
                  placeholder="Model name, e.g. gpt-4.1"
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!modelInput.trim()}
                  onClick={() => {
                    addModel(modelInput);
                    setModelInput("");
                  }}
                >
                  <Plus /> Add
                </Button>
              </div>
              {fetched.length > 0 && (
                <div
                  className="grid gap-1.5 rounded-lg border border-border/60 p-2"
                  data-testid="fetched-models"
                >
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={`Filter ${fetched.length} models…`}
                    className="h-8 text-xs"
                  />
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                    {suggestions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => addModel(m)}
                        className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                      >
                        + {m}
                      </button>
                    ))}
                    {suggestions.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nothing matches.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canTest || connection.state === "busy"}
                  onClick={testConnection}
                  data-testid="test-connection"
                >
                  {connection.state === "busy" && <Spinner />} Test connection
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !canTest ||
                    chat.state === "busy" ||
                    !(draft.defaultModel.trim() || draft.models[0]) ||
                    (!hasKey && preset?.needsKey === true)
                  }
                  onClick={testChat}
                  data-testid="test-chat"
                >
                  {chat.state === "busy" && <Spinner />} Send a test message
                </Button>
              </div>
              <CheckLine check={connection} testId="connection-result" />
              <CheckLine check={chat} testId="chat-result" />
              <p className="text-xs text-muted-foreground">
                {draft.defaultModel || draft.models[0]
                  ? `The test message goes to ${draft.defaultModel || draft.models[0]}.`
                  : "Add a model to send a test message."}
              </p>
            </div>

            <DialogFooter>
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => setPicked(false)}
                  disabled={saving}
                >
                  Back
                </Button>
              )}
              <Button type="button" variant="outline" onClick={props.onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !draft.name.trim() || !draft.baseUrl.trim()}
                data-testid="save-provider"
              >
                {saving && <Spinner />} {editing ? "Save changes" : "Add provider"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckLine({ check, testId }: { check: Check; testId: string }) {
  if (check.state === "idle" || check.state === "busy") return null;
  const ok = check.state === "ok";
  return (
    <p
      data-testid={testId}
      role="status"
      className={cn(
        "flex items-start gap-1.5 text-xs",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span className="min-w-0 break-words">{check.message}</span>
    </p>
  );
}
