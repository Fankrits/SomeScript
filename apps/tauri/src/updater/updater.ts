// Official source: https://v2.tauri.app/plugin/updater/
// Implements Tauri v2 updater checks, installs and storage settings.

import type { Update } from "@tauri-apps/plugin-updater";
import { inTauri } from "../library/api";

export type { Update };

export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Pure decision function: checks if more than intervalMs (default 12 hours)
 * has passed since the last check timestamp.
 */
export function shouldCheckForUpdate(
  lastCheck: number | null,
  now: number = Date.now(),
  intervalMs: number = TWELVE_HOURS_MS,
): boolean {
  if (lastCheck === null) return true;
  if (!Number.isFinite(lastCheck)) return true;
  return now - lastCheck > intervalMs;
}

/**
 * Checks for updates using the official Tauri updater plugin if running in Tauri.
 * Returns null if not in Tauri or if no update is available.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!inTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return await check();
}

/**
 * Downloads and installs the given update, reporting progress, then relaunches the app.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (downloaded: number, total?: number) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength;
        onProgress?.(0, total);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case "Finished":
        onProgress?.(downloaded, total);
        break;
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/**
 * Opens a URL in the user's default browser. In Tauri, uses @tauri-apps/plugin-opener.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (inTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else if (typeof window !== "undefined") {
    window.open(url, "_blank", "noreferrer,noopener");
  }
}
