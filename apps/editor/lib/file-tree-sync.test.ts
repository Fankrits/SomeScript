import { expect, test } from "bun:test";
import { fileTreeVersionKey } from "./file-tree-sync";

test("file-tree version key changes when a collaborator announces a mutation", () => {
  const before = [{ clientId: 7, fileTreeVersion: "v1" }];
  const after = [{ clientId: 7, fileTreeVersion: "v2" }];

  expect(fileTreeVersionKey(before)).not.toBe(fileTreeVersionKey(after));
});

test("cursor-only awareness updates do not change the file-tree version key", () => {
  const before = [{ clientId: 7, fileTreeVersion: "v1" }];
  const after = [{ clientId: 7, fileTreeVersion: "v1" }];

  expect(fileTreeVersionKey(before)).toBe(fileTreeVersionKey(after));
});
