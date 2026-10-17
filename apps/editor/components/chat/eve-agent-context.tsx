"use client";

import React, { createContext, useContext } from "react";
import type { UseEveAgentHelpers, EveMessageData } from "eve/react";

/**
 * Provides direct access to the Eve agent's `send` method inside deeply nested
 * components such as the __hitl__ tool card, without prop-drilling through
 * assistant-ui's ToolCallMessagePartComponent props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EveAgentContext = createContext<UseEveAgentHelpers<any> | null>(null);

export function useEveAgentCtx() {
  const agent = useContext(EveAgentContext);
  if (!agent) {
    throw new Error("useEveAgentCtx must be used inside <EveAgentContext.Provider>");
  }
  return agent;
}
