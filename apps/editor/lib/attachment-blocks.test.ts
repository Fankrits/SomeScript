import { expect, test } from "bun:test";
import {
  attachmentsToParts,
  extractAttachmentBlocks,
  stripPartPlaceholders,
  imageMarkerFor,
  mediaTypeOf,
  parseImageMarker,
} from "./attachment-blocks";

// The regex every consumer uses to hide the context marker from the user
// (convertEvePart, and the thread-title builder in use-eve-runtime.ts).
const STRIP_MARKER = /^\[projectId: [^\]]*\]\n?/;

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

// --- stripPartPlaceholders (what Eve leaves where a file part was sent) ---

// The two spellings, one per side of the round trip.
test("client-store placeholder is stripped", () => {
  expect(stripPartPlaceholders("look at this\n[file: photo.png]")).toBe("look at this");
});

test("server-echo placeholder (with media type) is stripped", () => {
  expect(stripPartPlaceholders("look at this\n[file: photo.png (image/png)]")).toBe("look at this");
});

test("nameless placeholder is stripped", () => {
  expect(stripPartPlaceholders("look at this\n[file]")).toBe("look at this");
});

test("image-only send leaves empty text", () => {
  expect(stripPartPlaceholders("[file: photo.png]")).toBe("");
});

test("multiple attached files are all stripped", () => {
  const msg = "two shots\n[file: a.png]\n[file: b.jpg (image/jpeg)]";
  expect(stripPartPlaceholders(msg)).toBe("two shots");
});

test("inline mention of a placeholder mid-line is not stripped", () => {
  const text = "the log said [file: photo.png] somewhere";
  expect(stripPartPlaceholders(text)).toBe(text);
});

// --- image marker (the anchor linking a message to its kept image data) ---

test("marker round-trips the image id", () => {
  const marker = imageMarkerFor("proj1", "img-abc");
  expect(parseImageMarker(marker)).toBe("img-abc");
});

test("marker without images carries no id", () => {
  expect(parseImageMarker(imageMarkerFor("proj1"))).toBeUndefined();
});

// Regression: the marker must stay inside the [projectId: …] line, otherwise
// the id leaks into the visible message and the thread title.
test("existing strip regex removes the whole marker line", () => {
  const text = `${imageMarkerFor("proj1", "img-abc")}\nlook at this`;
  expect(text.replace(STRIP_MARKER, "")).toBe("look at this");
});

test("a plain projectId marker is unaffected by image parsing", () => {
  const text = `${imageMarkerFor("proj1")}\nhello`;
  expect(parseImageMarker(text)).toBeUndefined();
  expect(text.replace(STRIP_MARKER, "")).toBe("hello");
});

// Regression for the real bug: each side spells the placeholder differently,
// so it can never be the anchor. Both were captured from the actual library.
test("marker survives the client-store spelling", () => {
  const optimistic = `${imageMarkerFor("proj1", "img-abc")}\nlook at this\n[file: photo.png]`;
  expect(parseImageMarker(optimistic)).toBe("img-abc");
  expect(stripPartPlaceholders(optimistic.replace(STRIP_MARKER, ""))).toBe("look at this");
});

test("marker survives the server-echo spelling", () => {
  const echoed = `${imageMarkerFor("proj1", "img-abc")}\nlook at this\n[file: photo.png (image/png)]`;
  expect(parseImageMarker(echoed)).toBe("img-abc");
  expect(stripPartPlaceholders(echoed.replace(STRIP_MARKER, ""))).toBe("look at this");
});

test("mediaTypeOf reads the data URL prefix", () => {
  expect(mediaTypeOf("data:image/png;base64,iVBOR")).toBe("image/png");
  expect(mediaTypeOf("data:image/jpeg;base64,/9j/4")).toBe("image/jpeg");
  expect(mediaTypeOf("not-a-data-url")).toBe("image/*");
});

// --- outgoing parts (what actually gets sent to Eve) ---

const PNG = "data:image/png;base64,iVBORw0KGgo=";

// The regression that made attached images vanish: the composer produces an
// {type:"image"} part, and Eve's parser answers any type other than text/file
// with 400 "Unsupported message part type", failing the whole message.
test("an attached image goes out as a file part, never an image part", () => {
  const { parts } = attachmentsToParts([
    { name: "photo.png", content: [{ type: "image", image: PNG }] },
  ]);
  expect(parts).toEqual([
    { type: "file", mediaType: "image/png", data: PNG, filename: "photo.png" },
  ]);
});

test("every outgoing part type is one Eve accepts", () => {
  const { parts } = attachmentsToParts([
    { name: "photo.png", content: [{ type: "image", image: PNG }] },
    { name: "notes.txt", content: [{ type: "text", text: "hi" }] },
    { name: "odd.bin", content: [{ type: "unknown-future-type" }] },
  ]);
  for (const part of parts) expect(["text", "file"]).toContain(part.type);
});

test("image pixels come back for the gallery, keyed to their filename", () => {
  const { images } = attachmentsToParts([
    { name: "photo.png", content: [{ type: "image", image: PNG }] },
    { name: "notes.txt", content: [{ type: "text", text: "hi" }] },
  ]);
  expect(images).toEqual([{ url: PNG, name: "photo.png" }]);
});

test("a text attachment sends its inlined body, contributing no image", () => {
  const { parts, images } = attachmentsToParts([
    { name: "notes.txt", content: [{ type: "text", text: wrap("notes.txt", "body") }] },
  ]);
  expect(parts).toEqual([{ type: "text", text: wrap("notes.txt", "body") }]);
  expect(images).toEqual([]);
});

test("no attachments produces nothing to send", () => {
  expect(attachmentsToParts([])).toEqual({ parts: [], images: [] });
});

test("a text file and an image in one message: both extract", () => {
  const msg = `check these\n${wrap("notes.txt", "some notes")}\n[file: photo.png]`;
  const blocks = extractAttachmentBlocks(msg);
  expect(blocks.blocks).toEqual([{ name: "notes.txt", body: "some notes" }]);
  expect(stripPartPlaceholders(blocks.text)).toBe("check these");
});
