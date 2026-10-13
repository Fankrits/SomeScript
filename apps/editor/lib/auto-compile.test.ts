import { describe, expect, test } from "bun:test";
import { planAutoCompile } from "./auto-compile";

const base = {
  enabled: true,
  selectedPath: "main.tex",
  loadedPath: "main.tex",
  editedCode: "hello",
  baseline: { path: "main.tex", code: "hello" },
};

describe("planAutoCompile", () => {
  test("does nothing when the buffer matches what was last compiled", () => {
    expect(planAutoCompile(base)).toEqual({ kind: "idle" });
  });

  test("schedules a compile once the buffer differs from the last compile", () => {
    expect(planAutoCompile({ ...base, editedCode: "hello world" })).toEqual({ kind: "schedule" });
  });

  // The regression this module exists for: autosave writes the edit to disk a second after the
  // last keystroke. The plan takes no "saved text" input, so saving can never cancel it; only a
  // compile moving the baseline does.
  test("walks type -> autosave -> compile without losing the pending compile", () => {
    let baseline: { path: string; code: string } | null = null;
    const plan = (editedCode: string) =>
      planAutoCompile({ ...base, editedCode, baseline: baseline });

    const opened = plan("hello");
    expect(opened.kind).toBe("adopt");
    if (opened.kind === "adopt") baseline = opened.baseline;

    expect(plan("hello!")).toEqual({ kind: "schedule" }); // typed
    expect(plan("hello!")).toEqual({ kind: "schedule" }); // autosave re-rendered; still pending
    baseline = { path: "main.tex", code: "hello!" }; // the compile ran
    expect(plan("hello!")).toEqual({ kind: "idle" });
  });

  test("stops once the baseline catches up to the edit (after a compile)", () => {
    expect(
      planAutoCompile({
        ...base,
        editedCode: "hello world",
        baseline: { path: "main.tex", code: "hello world" },
      }),
    ).toEqual({ kind: "idle" });
  });

  test("adopts the content of a file it has not seen yet instead of compiling it", () => {
    expect(planAutoCompile({ ...base, baseline: null })).toEqual({
      kind: "adopt",
      baseline: { path: "main.tex", code: "hello" },
    });
    expect(
      planAutoCompile({ ...base, baseline: { path: "other.tex", code: "something else" } }),
    ).toEqual({ kind: "adopt", baseline: { path: "main.tex", code: "hello" } });
  });

  test("is idle while disabled, with no file, or while the buffer still holds another file", () => {
    const edited = { ...base, editedCode: "changed" };
    expect(planAutoCompile({ ...edited, enabled: false })).toEqual({ kind: "idle" });
    expect(planAutoCompile({ ...edited, selectedPath: null })).toEqual({ kind: "idle" });
    expect(planAutoCompile({ ...edited, loadedPath: "other.tex" })).toEqual({ kind: "idle" });
    expect(planAutoCompile({ ...edited, loadedPath: null })).toEqual({ kind: "idle" });
  });
});
