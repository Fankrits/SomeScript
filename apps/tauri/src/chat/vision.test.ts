import { describe, expect, it } from "bun:test";
import { isVisionModel, supportsNativePdf } from "./vision";

describe("vision detection", () => {
  it("recognizes Anthropic Claude 3+ models as vision models", () => {
    expect(isVisionModel("anthropic", "claude-3-5-sonnet-20241022")).toBe(true);
    expect(isVisionModel("anthropic", "claude-3-opus-20240229")).toBe(true);
    expect(isVisionModel("anthropic", "claude-3-haiku-20240307")).toBe(true);
    expect(isVisionModel("anthropic", "claude-sonnet-4-5")).toBe(true);
    expect(isVisionModel("openai", "anthropic/claude-3.5-sonnet")).toBe(true);
  });

  it("recognizes OpenAI vision models", () => {
    expect(isVisionModel("openai", "gpt-4o")).toBe(true);
    expect(isVisionModel("openai", "gpt-4o-mini")).toBe(true);
    expect(isVisionModel("openai", "gpt-4-turbo")).toBe(true);
    expect(isVisionModel("openai", "gpt-4-vision-preview")).toBe(true);
    expect(isVisionModel("openai", "chatgpt-4o-latest")).toBe(true);
    expect(isVisionModel("openai", "o1")).toBe(true);
  });

  it("recognizes Gemini vision models", () => {
    expect(isVisionModel("openai", "gemini-1.5-pro")).toBe(true);
    expect(isVisionModel("openai", "gemini-1.5-flash")).toBe(true);
    expect(isVisionModel("openai", "gemini-2.5-pro")).toBe(true);
    expect(isVisionModel("openai", "google/gemini-2.5-flash")).toBe(true);
  });

  it("recognizes open source / local multimodal models", () => {
    expect(isVisionModel("openai", "llama-3.2-11b-vision-instruct")).toBe(true);
    expect(isVisionModel("openai", "llava:13b")).toBe(true);
    expect(isVisionModel("openai", "qwen/qwen2-vl-7b-instruct")).toBe(true);
    expect(isVisionModel("openai", "pixtral-12b-2409")).toBe(true);
    expect(isVisionModel("openai", "minicpm-v:8b")).toBe(true);
  });

  it("rejects text-only models", () => {
    expect(isVisionModel("openai", "gpt-3.5-turbo")).toBe(false);
    expect(isVisionModel("openai", "gpt-4")).toBe(false);
    expect(isVisionModel("openai", "o1-mini")).toBe(false);
    expect(isVisionModel("openai", "o3-mini")).toBe(false);
    expect(isVisionModel("openai", "deepseek-chat")).toBe(false);
    expect(isVisionModel("openai", "deepseek-reasoner")).toBe(false);
    expect(isVisionModel("openai", "llama-3.3-70b-versatile")).toBe(false);
    expect(isVisionModel("openai", "qwen2.5-coder:32b")).toBe(false);
    expect(isVisionModel("anthropic", "claude-2.1")).toBe(false);
  });

  it("detects native PDF support", () => {
    expect(supportsNativePdf("anthropic", "claude-3-5-sonnet-20241022")).toBe(true);
    expect(supportsNativePdf("anthropic", "claude-3-haiku-20240307")).toBe(true);
    expect(supportsNativePdf("openai", "anthropic/claude-3.5-sonnet")).toBe(true);
    expect(supportsNativePdf("openai", "gemini-1.5-pro")).toBe(true);
    expect(supportsNativePdf("openai", "google/gemini-2.5-flash")).toBe(true);

    expect(supportsNativePdf("openai", "gpt-4o")).toBe(false);
    expect(supportsNativePdf("openai", "llama-3.2-11b-vision-instruct")).toBe(false);
    expect(supportsNativePdf("openai", "deepseek-chat")).toBe(false);
  });
});
