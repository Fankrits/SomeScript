"use client";

import React, { createContext, useContext } from "react";
import type { UseEveAgentHelpers, EveMessageData } from "eve/react";

/**
 * Provides direct access to the Eve agent's `send` method inside deeply nested
 * components such as the __hitl__ tool card, without prop-drilling through
 * assistant-ui's ToolCallMessagePartComponent props.
 */
export const EveAgentContext = createContext<UseEveAgentHelpers<EveMessageData> | null>(null);

export function useEveAgentCtx() {
  const agent = useContext(EveAgentContext);
  if (!agent) {
    throw new Error("useEveAgentCtx must be used inside <EveAgentContext.Provider>");
  }
  return agent;
}
