import { describe, expect, test } from "bun:test";
import { readEvents } from "./ndjson";
import type { ChatEvent } from "./types";

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) return controller.close();
      const c = chunks[i++];
      controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const out: ChatEvent[] = [];
  for await (const e of readEvents(stream, signal)) out.push(e);
  return out;
}

const line = (e: object) => JSON.stringify(e) + "\n";

describe("readEvents", () => {
  test("yields one event per line", async () => {
    const events = await collect(
      streamOf([line({ type: "start", provider: "P", model: "m" }) + line({ type: "text", delta: "hi" })]),
    );
    expect(events).toEqual([
      { type: "start", provider: "P", model: "m" },
      { type: "text", delta: "hi" },
    ]);
  });

  test("a line split across chunks (even inside a multi-byte character) is reassembled", async () => {
    const bytes = new TextEncoder().encode(line({ type: "text", delta: "สวัสดีชาวโลก" }));
    const chunks = Array.from({ length: bytes.length }, (_, i) => bytes.slice(i, i + 1));
    expect(await collect(streamOf(chunks))).toEqual([{ type: "text", delta: "สวัสดีชาวโลก" }]);
  });

  test("blank lines and garbage are skipped, not fatal", async () => {
    const events = await collect(
      streamOf([
        "\n",
        "<html>gateway error</html>\n",
        line({ type: "text", delta: "ok" }),
        '{"no":"type"}\n',
        "[1,2,3]\n",
        "null\n",
      ]),
    );
    expect(events).toEqual([{ type: "text", delta: "ok" }]);
  });

  test("a final line without a newline is still delivered", async () => {
    const events = await collect(streamOf([line({ type: "text", delta: "a" }), JSON.stringify({ type: "done", reason: "stop" })]));
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
  });

  test("an empty stream yields nothing", async () => {
    expect(await collect(streamOf([]))).toEqual([]);
  });

  test("stops reading once aborted", async () => {
    const controller = new AbortController();
    const seen: ChatEvent[] = [];
    const stream = streamOf([line({ type: "text", delta: "1" }), line({ type: "text", delta: "2" })]);
    for await (const e of readEvents(stream, controller.signal)) {
      seen.push(e);
      controller.abort();
    }
    expect(seen).toHaveLength(1);
  });
});
