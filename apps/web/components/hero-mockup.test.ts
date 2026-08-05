import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./hero-mockup.tsx", import.meta.url), "utf8");

test("uses desktop anchors and mobile normal flow for the product previews", () => {
  expect(source).toContain("lg:absolute lg:top-0 lg:right-0");
  expect(source).toContain("lg:absolute lg:bottom-0 lg:left-0");
  expect(source).toContain("flex flex-col gap-6 lg:block");
});

test("renders an optional centered overlay above both previews", () => {
  expect(source).toContain("overlay?: React.ReactNode");
  expect(source).toContain("lg:absolute lg:inset-0 lg:z-30");
});
