import { expect, test } from "bun:test";
import * as Y from "yjs";
import { spliceText } from "./splice";

// spliceText is what /apply (server.ts) uses to push an out-of-band storage
// write (Eve, /api/files) into a live room's Y.Text. These pin the property
// that makes it safe to use on a room other clients are actively editing: it
// touches only the span that actually changed, so a full delete+reinsert
// never happens — which is what would otherwise sever every CRDT position
// (peer cursors, this test's own anchor) sitting outside that span.

function makeText(content: string): Y.Text {
  const doc = new Y.Doc();
  const ytext = doc.getText("t");
  ytext.insert(0, content);
  return ytext;
}

test("no-op when next equals the current text", () => {
  const ytext = makeText("unchanged content");
  spliceText(ytext, "unchanged content");
  expect(ytext.toString()).toBe("unchanged content");
});

test("pure append is inserted at the end only", () => {
  const ytext = makeText("hello");
  spliceText(ytext, "hello world");
  expect(ytext.toString()).toBe("hello world");
});

test("pure deletion trims from the end only", () => {
  const ytext = makeText("hello world");
  spliceText(ytext, "hello");
  expect(ytext.toString()).toBe("hello");
});

test("empty next clears the text (out-of-band delete)", () => {
  const ytext = makeText("goodbye");
  spliceText(ytext, "");
  expect(ytext.toString()).toBe("");
});

test("a change at the head leaves a position anchored in the tail intact", () => {
  // Simulates: a peer's cursor sits at the start of "CCCC" while an
  // out-of-band write (computed independently, unaware of the peer) changes
  // only the first word. A full replace would sever the anchor; a splice
  // that never touches the tail's characters keeps it resolvable.
  const ytext = makeText("AAAA BBBB CCCC");
  const doc = ytext.doc!;
  const anchor = Y.createRelativePositionFromTypeIndex(ytext, 10); // start of "CCCC"

  spliceText(ytext, "ZZZZ BBBB CCCC");

  expect(ytext.toString()).toBe("ZZZZ BBBB CCCC");
  const resolved = Y.createAbsolutePositionFromRelativePosition(anchor, doc);
  expect(resolved?.index).toBe(10);
  expect(ytext.toString().slice(resolved!.index)).toBe("CCCC");
});

test("a change at the tail leaves a position anchored in the head intact", () => {
  const ytext = makeText("AAAA BBBB CCCC");
  const doc = ytext.doc!;
  const anchor = Y.createRelativePositionFromTypeIndex(ytext, 0); // start of "AAAA"

  spliceText(ytext, "AAAA BBBB ZZZZ");

  const resolved = Y.createAbsolutePositionFromRelativePosition(anchor, doc);
  expect(resolved?.index).toBe(0);
});

// --- Room reload / reconnect duplication -------------------------------------
// Reproduces the mechanism that silently doubled real files on disk: Hocuspocus
// destroys a room when the last client leaves, but the browser keeps its Y.Doc
// (memoized per room). If the reloaded room re-seeds by INSERTING plaintext, it
// mints operations the returning client doesn't have, and Yjs — correctly —
// merges them alongside the client's originals. Every line appears twice, and
// compounds on each reconnect. onLoadDocument restores the binary snapshot
// first to keep operation identity stable across reloads.

const FILE = "\\documentclass{article}\n\\begin{document}\nHi.\n\\end{document}\n";
const KEY = "file:main.tex";

/** Two-way Yjs sync, the same state-vector exchange the provider performs. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

test("NEGATIVE CONTROL: re-seeding plaintext into a fresh room doubles content", () => {
  const room1 = new Y.Doc();
  room1.getText(KEY).insert(0, FILE); // server load #1
  const client = new Y.Doc();
  sync(room1, client);
  expect(client.getText(KEY).toString()).toBe(FILE);

  // Room unloaded and destroyed; a brand-new Y.Doc seeds from plaintext again.
  const room2 = new Y.Doc();
  room2.getText(KEY).insert(0, FILE);

  sync(room2, client); // client still holds room1's operations
  expect(client.getText(KEY).toString()).toBe(FILE + FILE); // the bug
});

test("restoring the snapshot across a reload keeps content intact", () => {
  const room1 = new Y.Doc();
  room1.getText(KEY).insert(0, FILE);
  const client = new Y.Doc();
  sync(room1, client);

  const snapshot = Y.encodeStateAsUpdate(room1); // what onStoreDocument persists

  const room2 = new Y.Doc();
  Y.applyUpdate(room2, snapshot); // onLoadDocument restores identity
  spliceText(room2.getText(KEY), FILE); // reconcile vs plaintext -> no-op here

  sync(room2, client);
  expect(client.getText(KEY).toString()).toBe(FILE);
  expect(room2.getText(KEY).toString()).toBe(FILE);
});

test("reload survives repeated reconnects without compounding", () => {
  const client = new Y.Doc();
  let snapshot: Uint8Array | null = null;

  for (let cycle = 0; cycle < 4; cycle++) {
    const room = new Y.Doc();
    if (snapshot) Y.applyUpdate(room, snapshot);
    spliceText(room.getText(KEY), FILE);
    sync(room, client);
    snapshot = Y.encodeStateAsUpdate(room);
    expect(room.getText(KEY).toString()).toBe(FILE);
  }
  expect(client.getText(KEY).toString()).toBe(FILE);
});

test("an out-of-band edit made while the room was unloaded still lands", () => {
  const room1 = new Y.Doc();
  room1.getText(KEY).insert(0, FILE);
  const client = new Y.Doc();
  sync(room1, client);
  const snapshot = Y.encodeStateAsUpdate(room1);

  // Room unloaded; Eve rewrites the file on disk, then a client rejoins.
  const edited = FILE.replace("Hi.", "Edited by Eve.");
  const room2 = new Y.Doc();
  Y.applyUpdate(room2, snapshot);
  spliceText(room2.getText(KEY), edited);

  sync(room2, client);
  expect(client.getText(KEY).toString()).toBe(edited);
});
