import { expect, test } from "bun:test";
import { detectOs, getOsExtension } from "./detect-os";

test("detects Windows user agents", () => {
  expect(
    detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"),
  ).toBe("Windows");
  expect(detectOs("Windows NT 11.0")).toBe("Windows");
});

test("detects macOS user agents", () => {
  expect(
    detectOs(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
    ),
  ).toBe("macOS");
  expect(detectOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("macOS");
  expect(detectOs("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe("macOS");
});

test("detects Linux and Android user agents", () => {
  expect(detectOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")).toBe("Linux");
  expect(detectOs("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Linux");
  expect(detectOs("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0)")).toBe("Linux");
});

test("defaults unknown or empty user agents to macOS", () => {
  expect(detectOs("")).toBe("macOS");
  expect(detectOs(null)).toBe("macOS");
  expect(detectOs(undefined)).toBe("macOS");
  expect(detectOs("UnknownRobot/1.0")).toBe("macOS");
});

test("returns correct file extension per OS", () => {
  expect(getOsExtension("macOS")).toBe(".dmg");
  expect(getOsExtension("Windows")).toBe(".exe");
  expect(getOsExtension("Linux")).toBe(".AppImage");
});
