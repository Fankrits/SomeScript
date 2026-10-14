import { useCallback, useEffect, useState } from "react";
import { getAiSettings, setAiPreferences, type AiSettings } from "./api";

/** Fired after the Settings screen (or the model picker) changes something, in this window. */
export const AI_SETTINGS_CHANGED = "somescript:ai-settings-changed";

/**
 * The saved providers and the active model. It reloads when the window regains focus, so coming
 * back from the Settings screen shows the provider you just added without a manual refresh.
 */
export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSettings(await getAiSettings());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(AI_SETTINGS_CHANGED, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AI_SETTINGS_CHANGED, onFocus);
    };
  }, [refresh]);

  const choose = useCallback(async (providerId: string, model: string | null) => {
    const next = await setAiPreferences({ activeProviderId: providerId, activeModel: model });
    setSettings(next);
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED));
  }, []);

  return { settings, failed, refresh, choose };
}

/** The provider and model a chat would use right now (mirrors `AiSettings::resolve` in Rust). */
export function activeChoice(settings: AiSettings | null): { name: string; model: string } | null {
  const provider =
    settings?.providers.find((p) => p.id === settings.activeProviderId) ?? settings?.providers[0];
  if (!settings || !provider) return null;
  const saved = settings.activeProviderId === provider.id ? settings.activeModel : null;
  const model = saved || provider.defaultModel || provider.models[0] || "";
  return { name: provider.name, model };
}
