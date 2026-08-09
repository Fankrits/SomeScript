import { describe, expect, test } from "bun:test";
import { clip } from "../agent/hooks/transcript";

// Lives in lib/, not next to its source, so eve's discovery never sees a
// *.test.ts inside agent/hooks/ and tries to register it as a hook.

/** clip() returns `unknown`; narrow with a check rather than an assertion. */
function clipString(value: unknown, content: boolean): string {
  const result = clip(value, content);
  if (typeof result !== "string") throw new TypeError(`expected a string, got ${typeof result}`);
  return result;
}

function clipArray(value: unknown, content: boolean): unknown[] {
  const result = clip(value, content);
  if (!Array.isArray(result)) throw new TypeError(`expected an array, got ${typeof result}`);
  return result;
}

describe("transcript clip", () => {
  test("keeps short text verbatim when content capture is on", () => {
    expect(clip("compile the paper", true)).toBe("compile the paper");
  });

  test("truncates long text but keeps the real length visible", () => {
    const result = clipString("x".repeat(9000), true);
    expect(result).toStartWith("x".repeat(4000));
    expect(result).toEndWith("(9000)");
    // The whole point of the cap: a log line that survives platform truncation.
    expect(result.length).toBeLessThan(4100);
  });

  test("records only lengths when content capture is off", () => {
    // The gate that keeps users' LaTeX out of logs. A regression here is silent.
    expect(clip("secret thesis text", false)).toBe("«18 chars»");
    expect(clip({ message: "secret thesis text" }, false)).toEqual({ message: "«18 chars»" });
  });

  test("shortens data URLs regardless of the content setting", () => {
    const dataUrl = `data:image/png;base64,${"A".repeat(5000)}`;
    for (const content of [true, false]) {
      const result = clipString(dataUrl, content);
      expect(result.length).toBeLessThan(120);
      expect(result).toEndWith(`(${dataUrl.length})`);
    }
  });

  test("caps arrays and keeps a count of what was dropped", () => {
    const result = clipArray(
      Array.from({ length: 60 }, (_, i) => i),
      true,
    );
    expect(result).toHaveLength(51);
    expect(result[50]).toBe("… 10 more");
  });

  test("stops recursing past the depth cap instead of blowing the stack", () => {
    const deep: Record<string, unknown> = {};
    let node = deep;
    for (let i = 0; i < 20; i++) {
      const child: Record<string, unknown> = {};
      node.next = child;
      node = child;
    }
    expect(() => JSON.stringify(clip(deep, true))).not.toThrow();
    expect(JSON.stringify(clip(deep, true))).toContain("{…}");
  });

  test("passes non-string scalars through untouched", () => {
    expect(clip({ inputTokens: 826_900, ok: false, missing: null }, true)).toEqual({
      inputTokens: 826_900,
      ok: false,
      missing: null,
    });
  });
});
