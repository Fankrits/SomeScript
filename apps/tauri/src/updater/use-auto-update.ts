import { useEffect } from "react";
import { toast } from "sonner";
import { getSettings, inTauri, setUpdatePrefs } from "../library/api";
import { checkForUpdate, installUpdate, openExternalUrl, shouldCheckForUpdate } from "./updater";

const RELEASES_URL = "https://github.com/Fankrits/SomeScript/releases/latest";

export function useAutoUpdate(): void {
  useEffect(() => {
    if (!inTauri()) return;

    let mounted = true;

    async function check() {
      try {
        const settings = await getSettings();
        if (!mounted) return;
        if (!settings.autoUpdate) return;
        if (!shouldCheckForUpdate(settings.lastUpdateCheck)) return;

        void setUpdatePrefs({ lastUpdateCheck: Date.now() }).catch(() => {});
        const update = await checkForUpdate();
        if (!mounted || !update) return;

        toast(`SomeScript ${update.version} is available`, {
          duration: Infinity,
          action: {
            label: "Install and restart",
            onClick: async () => {
              try {
                await installUpdate(update);
              } catch (e) {
                console.error("Failed to install update automatically:", e);
                toast.error("Couldn't install the update automatically", {
                  action: {
                    label: "Download",
                    onClick: () => {
                      void openExternalUrl(RELEASES_URL);
                    },
                  },
                });
              }
            },
          },
          cancel: {
            label: "Dismiss",
            onClick: () => {},
          },
        });
      } catch (e) {
        // Auto-check failures are silent (offline is normal).
        console.warn("Auto-update check failed:", e);
      }
    }

    void check();

    return () => {
      mounted = false;
    };
  }, []);
}
