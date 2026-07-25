"use client";

import { useCallback, useEffect, useState } from "react";
import type { EveMode } from "@/lib/eve-modes";

export interface CreditStatus {
  includedBalance: number;
  purchasedBalance: number;
  allowedModes: EveMode[];
}

// Reuses the same cross-component refresh pattern as "somescript:refresh-workspace"
// in use-eve-runtime.ts — dispatched after a deduction so the mode picker's lock
// state stays current without prop-drilling or a shared fetch cache.
const CREDITS_UPDATED_EVENT = "somescript:credits-updated";

export function notifyCreditsUpdated() {
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT));
}

/** Null while loading/unknown — callers should treat that as "don't restrict yet". */
export function useCreditStatus(): CreditStatus | null {
  const [status, setStatus] = useState<CreditStatus | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/eve/credits")
      .then((res) => (res.ok ? (res.json() as Promise<CreditStatus>) : null))
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => {
        // Best-effort UI state — the real gate is server-side in the credits API.
      });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CREDITS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CREDITS_UPDATED_EVENT, refresh);
  }, [refresh]);

  return status;
}
