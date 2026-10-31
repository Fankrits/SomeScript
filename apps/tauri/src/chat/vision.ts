/**
 * Vision and multimodal capability detection for AI models.
 * Supports OpenAI, Anthropic, Gemini, OpenRouter, Ollama, and local custom endpoints.
 */

const VISION_REGEX =
  /(?:^|[-/_])(?:vision|vl|llava|bakllava|pixtral|minicpm-v|internvl|cogvlm)(?:$|[-/_:])|llama-3\.2-(?:11|90)b-vision/i;

const OPENAI_VISION_REGEX =
  /^(?:openai\/)?(?:gpt-4o(?:-mini)?|gpt-4-turbo|gpt-4-vision|chatgpt-4o|o1)(?:$|[-_])/i;
const OPENAI_TEXT_ONLY_REGEX = /^(?:openai\/)?(?:o1-mini|o3-mini|gpt-4$|gpt-3\.5)/i;

const GEMINI_VISION_REGEX = /(?:google\/)?gemini-(?:1\.5|2\.0|2\.5|exp)/i;
const ANTHROPIC_VISION_REGEX = /(?:anthropic\/)?claude-(?:3|sonnet|opus|haiku)/i;

/**
 * Checks if the given model supports visual / image inputs.
 */
export function isVisionModel(
  providerKind: string,
  modelName: string | null | undefined,
  providerHint?: string,
): boolean {
  if (!modelName) return false;
  const name = modelName.trim().toLowerCase();

  // Explicit text-only exclusions first
  if (OPENAI_TEXT_ONLY_REGEX.test(name)) return false;

  // Anthropic provider: all Claude 3+ models support vision
  if (providerKind === "anthropic") {
    if (name.includes("claude-2") || name.includes("claude-instant")) return false;
    if (ANTHROPIC_VISION_REGEX.test(name)) return true;
    return true; // Anthropic default for modern endpoints
  }

  // Model names routed via OpenAI-compatible endpoints (OpenRouter, Gemini, OpenAI, Ollama, etc.)
  if (OPENAI_VISION_REGEX.test(name)) return true;
  if (GEMINI_VISION_REGEX.test(name)) return true;
  if (ANTHROPIC_VISION_REGEX.test(name)) return true;
  if (VISION_REGEX.test(name)) return true;

  // Check provider hint if present (e.g. OpenRouter modality tags)
  if (providerHint && /image|multimodal|vision/i.test(providerHint)) {
    return true;
  }

  return false;
}

/**
 * Checks if the given model natively accepts PDF documents as base64 content
 * without requiring text extraction first (e.g., Anthropic document blocks or Gemini).
 */
export function supportsNativePdf(
  providerKind: string,
  modelName: string | null | undefined,
): boolean {
  if (!modelName) return false;
  const name = modelName.trim().toLowerCase();

  // Anthropic Claude 3+ supports PDF documents natively
  if (providerKind === "anthropic") {
    return !name.includes("claude-2") && !name.includes("claude-instant");
  }

  // Anthropic or Gemini routed via OpenRouter / gateway
  if (ANTHROPIC_VISION_REGEX.test(name)) return true;
  if (GEMINI_VISION_REGEX.test(name)) return true;

  return false;
}
