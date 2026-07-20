import { expect, test } from "bun:test";
import { extractAttachmentBlocks } from "./attachment-blocks";

const wrap = (name: string, body: string) =>
  `<attachment name=${name}>\n${body}\n</attachment>`;

test("plain message passes through untouched", () => {
  const r = extractAttachmentBlocks("just a question");
  expect(r.blocks).toEqual([]);
  expect(r.text).toBe("just a question");
});

test("text + one attachment", () => {
  const r = extractAttachmentBlocks(`why does this fail?\n${wrap("build.log", "! Error\nl.5")}`);
  expect(r.text).toBe("why does this fail?");
  expect(r.blocks).toEqual([{ name: "build.log", body: "! Error\nl.5" }]);
});

test("two adjacent attachments, no user text", () => {
  const r = extractAttachmentBlocks(`${wrap("a.log", "aaa")}\n${wrap("b.log", "bbb")}`);
  expect(r.text).toBe("");
  expect(r.blocks.map((b) => b.name)).toEqual(["a.log", "b.log"]);
  expect(r.blocks.map((b) => b.body)).toEqual(["aaa", "bbb"]);
});

test("body containing a literal </attachment> line stays in one block", () => {
  const body = "before\n</attachment>\nafter";
  const r = extractAttachmentBlocks(`hi\n${wrap("tricky.log", body)}`);
  expect(r.text).toBe("hi");
  expect(r.blocks).toEqual([{ name: "tricky.log", body }]);
});

test("name containing '>' is captured whole", () => {
  const r = extractAttachmentBlocks(wrap("a>b.txt", "body"));
  expect(r.blocks).toEqual([{ name: "a>b.txt", body: "body" }]);
});

test("assistant-style prose mentioning the opening tag alone is untouched", () => {
  const text = "the format is <attachment name=foo> followed by the body";
  const r = extractAttachmentBlocks(text);
  expect(r.blocks).toEqual([]);
  expect(r.text).toBe(text);
});
