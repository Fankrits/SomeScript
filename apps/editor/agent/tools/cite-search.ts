import { defineTool } from "eve/tools";
import { z } from "zod";

// Crossref is the canonical citation source; DOI content-negotiation returns
// official BibTeX so we never hand-roll a BibTeX encoder (CLAUDE.md policy).
// Docs: https://api.crossref.org  /  https://citation.crosscite.org
const UA = "SomeScript-LaTeX-Editor/1.0 (https://somescript.app)";

type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string }[];
  "container-title"?: string[];
  published?: { "date-parts"?: number[][] };
};

// DOI -> BibTeX via content negotiation (follows the doi.org redirect). No key.
async function fetchBibtex(doi: string): Promise<string | null> {
  try {
    const res = await fetch(`https://doi.org/${doi}`, {
      headers: { Accept: "application/x-bibtex", "User-Agent": UA },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.startsWith("@") ? text : null;
  } catch {
    return null;
  }
}

export default defineTool({
  description:
    "Searches published academic literature via Crossref and returns ready-to-paste BibTeX entries for real citations. Use to find sources and populate .bib files. No API key required.",
  inputSchema: z.object({
    query: z.string().describe("Search terms: paper title, authors, and/or keywords"),
    rows: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("How many results to return (default 3)"),
  }),
  async execute({ query, rows = 3 }) {
    try {
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.set("query.bibliographic", query);
      url.searchParams.set("rows", String(Math.min(rows, 5)));
      url.searchParams.set("select", "title,author,published,DOI,container-title");

      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) return `Crossref search failed (HTTP ${res.status}).`;

      const items: CrossrefWork[] = (await res.json())?.message?.items ?? [];
      if (items.length === 0) return `No results found for "${query}".`;

      const entries = await Promise.all(
        items.map(async (w) => {
          const doi = w.DOI ?? "";
          const title = w.title?.[0] ?? "(untitled)";
          const year = w.published?.["date-parts"]?.[0]?.[0] ?? "n.d.";
          const authors =
            w.author
              ?.map((a) => [a.given, a.family].filter(Boolean).join(" "))
              .filter(Boolean)
              .join(", ") ?? "";
          const venue = w["container-title"]?.[0] ?? "";
          const bibtex = doi ? await fetchBibtex(doi) : null;
          const header = [
            `${title} (${year})`,
            authors && `— ${authors}`,
            venue && `— ${venue}`,
          ]
            .filter(Boolean)
            .join(" ");
          return bibtex
            ? `${header}\nDOI: ${doi}\n\n${bibtex}`
            : `${header}\nDOI: ${doi}\n(BibTeX unavailable for this DOI)`;
        })
      );

      return `Found ${items.length} result(s) for "${query}":\n\n${entries.join("\n\n---\n\n")}`;
    } catch (e) {
      return `Error searching Crossref: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
