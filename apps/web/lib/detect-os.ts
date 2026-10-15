import { useSyncExternalStore } from "react";

export type SupportedOS = "macOS" | "Windows" | "Linux";

/** Pure user-agent based OS detection. */
export function detectOs(userAgent?: string | null): SupportedOS {
  if (!userAgent) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac|iPhone|iPad/i.test(userAgent)) return "macOS";
  if (/Linux|Android|X11/i.test(userAgent)) return "Linux";
  return "macOS";
}

/** Get the primary installer file extension for an OS */
export function getOsExtension(os: SupportedOS): string {
  switch (os) {
    case "macOS":
      return ".dmg";
    case "Windows":
      return ".exe";
    case "Linux":
      return ".AppImage";
  }
}

const emptySubscribe = () => () => {};

/**
 * Client-safe hook to detect the user's OS without hydration mismatches.
 * Returns "macOS" on the server / during SSR, then detects client OS on mount.
 */
export function useDetectedOs(): SupportedOS {
  return useSyncExternalStore(
    emptySubscribe,
    () => detectOs(typeof navigator !== "undefined" ? navigator.userAgent : ""),
    () => "macOS",
  );
}
