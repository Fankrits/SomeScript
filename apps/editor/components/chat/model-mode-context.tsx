"use client";

import React, { createContext, useContext } from "react";
import type { EveMode } from "@/lib/eve-modes";

/**
 * Shares the selected chat model mode (owned by <EveThread />) with the model
 * selector rendered deep inside the assistant-ui composer, without prop-drilling
 * through the Thread/Composer primitives.
 */
export const ModelModeContext = createContext<{
  mode: EveMode;
  setMode: (mode: EveMode) => void;
} | null>(null);

export function useModelMode() {
  const ctx = useContext(ModelModeContext);
  if (!ctx) {
    throw new Error("useModelMode must be used inside <ModelModeContext.Provider>");
  }
  return ctx;
}
