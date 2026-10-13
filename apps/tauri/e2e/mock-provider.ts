// A scripted model provider for the end-to-end tests: speaks the OpenAI chat-completions and the
// Anthropic messages protocols well enough to drive the whole assistant (streaming text, tool
// calls, errors, a hung answer) without a key or a network. It also records every request, so a
// test can assert on exactly what the app sent (model, headers, tool results).
//
// What a request does is chosen from the LAST USER MESSAGE, so one server serves every test:
//   "edit ..."     read_file -> edit_file (main.tex) -> a markdown summary
//   "plan ..."     todo_write -> text
//   "compile ..."  compile_project -> text
//   "search ..."   grep -> list_files -> text
//   "fail ..."     HTTP 401 echoing the Authorization header (the app must redact the key),
//                  unless the key contains "good"
//   a key containing "reject" gets a 401 on every request
//   "slow ..."     streams a word every 150 ms until the client disconnects
//   "boom ..."     a stream error event halfway through
//   anything else  a short markdown answer
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

type Chunk = string | Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockProvider {
  readonly requests: Recorded[] = [];
  /** Requests whose client went away mid-stream (the Stop button). */
  disconnects = 0;
  private server: Server;
  url = "";

  constructor() {
    this.server = createServer((req, res) => void this.handle(req, res));
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async close() {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }

  /** OpenAI-style base URL. */
  get openai() {
    return `${this.url}/v1`;
  }

  chatRequests() {
    return this.requests.filter((r) => r.method === "POST");
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", this.url);
    let raw = "";
    for await (const c of req) raw += c;
    let body: any = undefined;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      /* not JSON */
    }
    this.requests.push({
      method: req.method ?? "GET",
      path: url.pathname,
      headers: req.headers,
      body,
    });

    // A key containing "reject" is a wrong key, whatever the request.
    const credential = String(req.headers.authorization ?? req.headers["x-api-key"] ?? "");
    if (credential.includes("reject")) {
      return json(res, 401, { error: { message: `Incorrect API key provided: ${credential}` } });
    }

    if (req.method === "GET" && url.pathname.endsWith("/models")) {
      return json(res, 200, {
        data: [{ id: "mock-small" }, { id: "mock-large" }, { id: "mock-vision" }],
      });
    }
    if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
      return this.openaiChat(req, res, body);
    }
    if (req.method === "POST" && url.pathname.endsWith("/messages")) {
      return this.anthropicChat(req, res, body);
    }
    json(res, 404, { error: { message: `no such route ${url.pathname}` } });
  }

  // ---- OpenAI ------------------------------------------------------------------------------

  private async openaiChat(req: IncomingMessage, res: ServerResponse, body: any) {
    const msgs: any[] = body.messages ?? [];
    const lastUserIdx = msgs.map((m) => m.role).lastIndexOf("user");
    const prompt = String(msgs[lastUserIdx]?.content ?? "");
    const turnTools = msgs.slice(lastUserIdx + 1).filter((m) => m.role === "tool").length;
    const plan = this.plan(prompt, turnTools, String(req.headers.authorization ?? ""));

    if (plan.kind === "http-error") {
      return json(res, plan.status, {
        error: { message: plan.message(req.headers.authorization ?? "") },
      });
    }
    const chunks: Chunk[] =
      plan.kind === "tool"
        ? [
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_${turnTools}`,
                        type: "function",
                        function: { name: plan.name, arguments: "" },
                      },
                    ],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { arguments: JSON.stringify(plan.args) } }],
                  },
                },
              ],
            },
            { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
            "[DONE]",
          ]
        : [
            ...(plan.kind === "text" ? plan.parts : []).map((p) => ({
              choices: [{ delta: { content: p } }],
            })),
            ...(plan.kind === "stream-error"
              ? [
                  { choices: [{ delta: { content: "Partial answer " } }] },
                  { error: { message: "The mock model crashed mid-answer" } },
                ]
              : [{ choices: [{ delta: {}, finish_reason: "stop" }] }, "[DONE]"]),
          ];
    await this.stream(
      req,
      res,
      plan.kind === "slow" ? undefined : chunks,
      plan.kind === "slow" ? "openai" : undefined,
    );
  }

  // ---- Anthropic ---------------------------------------------------------------------------

  private async anthropicChat(req: IncomingMessage, res: ServerResponse, body: any) {
    const msgs: any[] = body.messages ?? [];
    const texts = (m: any) =>
      typeof m.content === "string"
        ? m.content
        : (m.content ?? [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("");
    const lastUserIdx = msgs
      .map((m, i) => (m.role === "user" && texts(m) ? i : -1))
      .reduce((a, b) => Math.max(a, b), -1);
    const prompt = texts(msgs[lastUserIdx] ?? { content: "" });
    const turnTools = msgs.slice(lastUserIdx + 1).filter((m) => m.role === "user").length;
    const plan = this.plan(prompt, turnTools, String(req.headers["x-api-key"] ?? ""));
    const ev = (event: string, data: Record<string, unknown>) =>
      `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;

    if (plan.kind === "http-error") {
      return json(res, plan.status, {
        type: "error",
        error: {
          type: "authentication_error",
          message: plan.message(String(req.headers["x-api-key"] ?? "")),
        },
      });
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(ev("message_start", { message: { usage: { input_tokens: 10, output_tokens: 1 } } }));
    if (plan.kind === "tool") {
      res.write(
        ev("content_block_start", {
          index: 0,
          content_block: { type: "tool_use", id: `toolu_${turnTools}`, name: plan.name, input: {} },
        }),
      );
      res.write(
        ev("content_block_delta", {
          index: 0,
          delta: { type: "input_json_delta", partial_json: JSON.stringify(plan.args) },
        }),
      );
      res.write(ev("content_block_stop", { index: 0 }));
      res.write(
        ev("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }),
      );
    } else {
      res.write(ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }));
      for (const p of plan.kind === "text" ? plan.parts : ["…"]) {
        res.write(ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: p } }));
        await sleep(15);
      }
      res.write(ev("content_block_stop", { index: 0 }));
      res.write(
        ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
      );
    }
    res.end(ev("message_stop", {}));
  }

  // ---- shared ------------------------------------------------------------------------------

  private plan(
    prompt: string,
    turnTools: number,
    credential: string,
  ):
    | { kind: "text"; parts: string[] }
    | { kind: "tool"; name: string; args: Record<string, unknown> }
    | { kind: "http-error"; status: number; message: (auth: string) => string }
    | { kind: "stream-error" }
    | { kind: "slow" } {
    const p = prompt.toLowerCase();
    const say = (...parts: string[]) => ({ kind: "text" as const, parts });
    // "fail" gets a 401 unless the key looks fixed (contains "good"): that is how a test retries.
    if (p.includes("fail") && turnTools === 0 && !credential.includes("good")) {
      return {
        kind: "http-error",
        status: 401,
        message: (auth) => `Incorrect API key provided: ${auth}`,
      };
    }
    if (p.includes("boom")) return { kind: "stream-error" };
    if (p.includes("slow")) return { kind: "slow" };
    if (p.includes("edit")) {
      if (turnTools === 0) return { kind: "tool", name: "read_file", args: { path: "main.tex" } };
      if (turnTools === 1)
        return {
          kind: "tool",
          name: "edit_file",
          args: {
            path: "main.tex",
            oldText: "Start writing here.",
            newText: "Hello from the mock assistant!",
          },
        };
      return say(
        "I changed the greeting in ",
        "`main.tex`.\n\n",
        "```latex\nHello from the mock assistant!\n```",
      );
    }
    if (p.includes("plan")) {
      if (turnTools === 0) {
        return {
          kind: "tool",
          name: "todo_write",
          args: {
            todos: [
              { content: "Read the file", status: "completed" },
              { content: "Write the intro", status: "in_progress" },
              { content: "Compile", status: "pending" },
            ],
          },
        };
      }
      return say("Plan saved.");
    }
    if (p.includes("compile")) {
      if (turnTools === 0) return { kind: "tool", name: "compile_project", args: {} };
      return say("Compiled.");
    }
    if (p.includes("search")) {
      if (turnTools === 0) return { kind: "tool", name: "grep", args: { query: "document" } };
      if (turnTools === 1) return { kind: "tool", name: "list_files", args: {} };
      return say("Searched.");
    }
    return say("Sure! ", "Here is **markdown** ", "and a list:\n\n- one\n- two\n");
  }

  private async stream(
    req: IncomingMessage,
    res: ServerResponse,
    chunks: Chunk[] | undefined,
    endless?: "openai",
  ) {
    let closed = false;
    res.on("close", () => {
      if (!res.writableFinished) {
        closed = true;
        this.disconnects++;
      }
    });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const write = (c: Chunk) =>
      res.write(`data: ${typeof c === "string" ? c : JSON.stringify(c)}\n\n`);
    if (endless) {
      for (let i = 0; !closed; i++) {
        write({ choices: [{ delta: { content: `word${i} ` } }] });
        await sleep(150);
      }
      return;
    }
    for (const c of chunks ?? []) {
      write(c);
      await sleep(10);
    }
    res.end();
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
