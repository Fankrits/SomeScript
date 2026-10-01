import { askQuestion } from "eve/tools/ask_question";

// Opt-in since eve 0.65: it is no longer a default tool, so without this file the
// model has no way to ask and instructions.md / the HITL card (HitlCard in
// components/assistant-ui/eve-tool-calls.tsx) would point at a tool that doesn't
// exist. The card reads the stream's `input.requested` payload, not this tool's
// input schema, so nothing client-side depends on the tool's own shape.
export default askQuestion();
