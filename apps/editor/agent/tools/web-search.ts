import { defineTool } from "eve/tools";
import { z } from "zod";
import { TOOL_FETCH_TIMEOUT_MS, isAbortLike, withDeadline } from "../lib/deadline";

// General web search via Tavily (AI-agent-optimized). Swap the provider by
// changing the endpoint/body below; keep the env var name so setup docs hold.
// Docs: https://docs.tavily.com
type TavilyResult = { title?: string; url?: string; content?: string };

export default defineTool({
  description:
    "Searches the web via Tavily for general information: package docs, error messages, how-tos, current facts. Use when the answer isn't in the project files and isn't an academic citation (use cite-search for those). Requires TAVILY_API_KEY.",
  inputSchema: z.object({
    query: z.string().describe("What to search the web for"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Max results to return (default 5)"),
  }),
  async execute({ query, maxResults = 5 }, ctx) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return "Web search is unavailable: TAVILY_API_KEY is not set. Add it to apps/editor/.env.local to enable web search.";
    }
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.min(maxResults, 10),
          search_depth: "basic",
          include_answer: true,
        }),
        signal: withDeadline(ctx.abortSignal),
      });
      if (!res.ok) return `Web search failed (HTTP ${res.status}).`;

      const data = (await res.json()) as { answer?: string; results?: TavilyResult[] };
      const results = data.results ?? [];
      if (results.length === 0) return `No web results found for "${query}".`;

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title ?? "(untitled)"}\n   ${r.url ?? ""}\n   ${(r.content ?? "").trim()}`,
        )
        .join("\n\n");
      return `${data.answer ? `Summary: ${data.answer}\n\n` : ""}Web results for "${query}":\n\n${formatted}`;
    } catch (e) {
      if (isAbortLike(e)) {
        return `Web search timed out after ${TOOL_FETCH_TIMEOUT_MS / 1000}s. Try a narrower query, or answer from the project files.`;
      }
      return `Error searching the web: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
