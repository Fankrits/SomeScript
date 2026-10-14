import { describe, expect, test } from "bun:test";
import { backTarget } from "./back-target";

const from = (value: string) => `?section=ai&from=${encodeURIComponent(value)}`;

describe("backTarget", () => {
  test("returns to the editor of the project that sent us", () => {
    expect(backTarget(from("/?projectId=My%20Thesis"))).toBe("/?projectId=My%20Thesis");
    expect(backTarget(from("/?projectId=thesis"))).toBe("/?projectId=thesis");
  });

  test("keeps awkward project ids intact and encoded", () => {
    expect(backTarget(from("/?projectId=" + encodeURIComponent("a&b=c/ü")))).toBe(
      "/?projectId=" + encodeURIComponent("a&b=c/ü"),
    );
  });

  test("without a usable origin, goes to the dashboard", () => {
    expect(backTarget("")).toBe("/dashboard");
    expect(backTarget("?section=ai")).toBe("/dashboard");
    expect(backTarget(from("/dashboard"))).toBe("/dashboard");
    expect(backTarget(from("/"))).toBe("/dashboard");
    expect(backTarget(from("/?projectId="))).toBe("/dashboard");
  });

  // Every value here is something a crafted link could put in `from`; none may leave the app.
  test.each([
    "//evil.example",
    "//evil.example/?projectId=x",
    "/\\evil.example",
    "/\\/evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "https://evil.example/?projectId=x",
    "http://evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "/.//evil.example",
    "/%2F%2Fevil.example",
    "evil.example",
    "../../evil.example",
    "   //evil.example",
  ])("%j cannot send you anywhere but this app", (value) => {
    const target = backTarget(from(value));
    expect(target === "/dashboard" || /^\/\?projectId=[^/\\:]*$/.test(target)).toBe(true);
    // Resolved against the app's own origin, the result stays on it.
    expect(new URL(target, "http://127.0.0.1:1471").origin).toBe("http://127.0.0.1:1471");
  });
});
