import { expect, test } from "bun:test";
import { safeZipPath, flattenFilePaths, dedupeUploadName } from "./zip";

test("normalizes and accepts plain relative paths", () => {
  expect(safeZipPath("sections/intro.tex")).toBe("sections/intro.tex");
  expect(safeZipPath("./figure.png")).toBe("figure.png");
});

test("rejects traversal, absolute, and backslash paths", () => {
  expect(safeZipPath("a/../../b.tex")).toBe(null);
  expect(safeZipPath("../evil.tex")).toBe(null);
  expect(safeZipPath("/etc/passwd")).toBe(null);
  expect(safeZipPath("a\\b.tex")).toBe(null);
});

test("flattenFilePaths collects every path in a nested tree", () => {
  const tree = [
    { name: "main.tex", path: "main.tex", isDir: false },
    {
      name: "sections", path: "sections", isDir: true, children: [
        { name: "intro.tex", path: "sections/intro.tex", isDir: false },
      ],
    },
  ];
  const paths = flattenFilePaths(tree);
  expect(paths.has("main.tex")).toBe(true);
  expect(paths.has("sections")).toBe(true);
  expect(paths.has("sections/intro.tex")).toBe(true);
  expect(paths.size).toBe(3);
});

test("dedupeUploadName returns the plain name when there's no collision", () => {
  const existing = new Set(["main.tex"]);
  expect(dedupeUploadName(existing, "", "photo.png")).toBe("photo.png");
  expect(dedupeUploadName(existing, "assets", "photo.png")).toBe("assets/photo.png");
});

test("dedupeUploadName appends -1, -2, ... before the extension on collision", () => {
  const existing = new Set(["photo.png", "photo-1.png"]);
  expect(dedupeUploadName(existing, "", "photo.png")).toBe("photo-2.png");
});

test("dedupeUploadName handles extensionless names", () => {
  const existing = new Set(["Makefile"]);
  expect(dedupeUploadName(existing, "", "Makefile")).toBe("Makefile-1");
});
