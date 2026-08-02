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
