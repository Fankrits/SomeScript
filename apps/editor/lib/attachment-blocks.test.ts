import { expect, test } from "bun:test";
import {
  attachmentsToParts,
  extractAttachmentBlocks,
  stripEventFileData,
  stripPartPlaceholders,
  mediaTypeOf,
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

// --- projectId marker (hidden from the bubble and the thread title) ---

test("the marker line is stripped from the visible message", () => {
  expect(`[projectId: proj1]\nlook at this`.replace(STRIP_MARKER, "")).toBe("look at this");
});

// The optimistic message Eve renders before the server answers still flattens
// the attachment to a placeholder line; the echo that replaces it does not.
test("optimistic placeholder is stripped alongside the marker", () => {
  const optimistic = `[projectId: proj1]\nlook at this\n[file: photo.png]`;
  expect(stripPartPlaceholders(optimistic.replace(STRIP_MARKER, ""))).toBe("look at this");
});

// --- stripEventFileData (what gets persisted as chat history) ---

const receivedEvent = (url?: string) => ({
  type: "message.received",
  data: {
    message: "look at this",
    turnId: "t1",
    parts: [
      { type: "text", text: "look at this" },
      { type: "file", mediaType: "image/png", filename: "photo.png", ...(url ? { url } : {}) },
    ],
  },
});

// A photo's data URL is most of the ~5MB localStorage quota; persisting it
// would cost the conversation to keep a thumbnail.
test("image bytes are dropped from the persisted event log", () => {
  const [event] = stripEventFileData([receivedEvent("data:image/png;base64,AAAA")]);
  const file = event.data.parts[1] as Record<string, unknown>;
  expect(file.url).toBeUndefined();
  expect(JSON.stringify(event)).not.toContain("base64");
});

test("the attachment still has its name and type after stripping", () => {
  const [event] = stripEventFileData([receivedEvent("data:image/png;base64,AAAA")]);
  expect(event.data.parts[1]).toEqual({
    type: "file",
    mediaType: "image/png",
    filename: "photo.png",
  });
});

test("text parts and other events pass through untouched", () => {
  const other = { type: "turn.completed", data: { turnId: "t1", sequence: 3 } };
  const events = [receivedEvent(), other];
  const out = stripEventFileData(events);
  expect(out[0]).toBe(events[0]); // nothing to strip: same reference
  expect(out[1]).toBe(other);
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
