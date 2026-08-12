import path from "path";
import { storage, type FileNode } from "./storage";

/**
 * Content search over a project's text files, shared by the Search panel's API
 * route (app/api/search/route.ts) and the agent's grep tool (agent/tools/grep.ts).
 *
 * It lives in lib/ rather than in the route because the route imports next/server
 * and lib/rate-limit (which reaches Clerk at module load), neither of which eve's
 * tool runtime can bundle. Sharing it here is also what keeps BINARY_EXTENSIONS
 * single-sourced — a drifted copy means the agent streams .woff bytes into its
 * context window.
 *
 * Directory exclusions are NOT applied here: storage.listProjectFiles() already
 * hides node_modules/.git/.eve/.somescript/.preview-cache and the compiled PDF
 * sitting beside its .tex. That product logic is exactly why this beats a raw
 * filesystem grep.
 */

const BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".zip",
  ".gz",
  ".tar",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
]);

/** Extension deny-list. Cheaper than sniffing content, and it never reads the file. */
export function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

export interface FileMatch {
  path: string;
  name: string;
  /** 1-based. */
  line: number;
  /** 0-based offset within the line. */
  column: number;
  length: number;
  /**
   * The full, untruncated line. Callers that need to save tokens must clip at
   * the presentation layer: the search route feeds this back as
   * `expectedLineText` for single-match replace (lib/search-pattern.ts), so a
   * clipped value here would make every replace in the UI report "stale".
   */
  text: string;
}

export interface SearchFilesOptions {
  /**
   * Limits the search to files whose full project-relative path matches this
   * glob, or equals it exactly. Exact-equality is checked first so a single
   * selected path still works when its name contains glob metacharacters.
   */
  pathGlob?: string;
  /** 1-based, inclusive. Only meaningful when the search is scoped to one file. */
  startLine?: number | null;
  endLine?: number | null;
  maxResults?: number;
}

export interface SearchFilesResult {
  matches: FileMatch[];
  filesSearched: number;
  /** True when maxResults cut the walk short, so callers can say so. */
  truncated: boolean;
}

const DEFAULT_MAX_RESULTS = 2000;

export async function searchFiles(
  projectId: string,
  pattern: RegExp,
  opts: SearchFilesOptions = {},
): Promise<SearchFilesResult> {
  const { pathGlob, startLine = null, endLine = null, maxResults = DEFAULT_MAX_RESULTS } = opts;

  const matches: FileMatch[] = [];
  let filesSearched = 0;
  let truncated = false;

  const nodes = await storage.listProjectFiles(projectId);

  const traverse = async (list: FileNode[]) => {
    for (const node of list) {
      // Reached only when files remain unscanned, so this is a real truncation.
      if (matches.length >= maxResults) {
        truncated = true;
        return;
      }

      if (node.isDir) {
        if (node.children) await traverse(node.children);
        continue;
      }

      if (pathGlob && node.path !== pathGlob && !path.matchesGlob(node.path, pathGlob)) continue;
      if (!isTextFile(node.name)) continue;

      let content: string;
      try {
        content = await storage.readFile(projectId, node.path);
      } catch {
        continue; // Unreadable file: skip it rather than failing the whole search.
      }
      filesSearched++;

      const lines = content.split("\n");
      for (let idx = 0; idx < lines.length; idx++) {
        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }
        const lineNum = idx + 1;
        // Applied here rather than as a post-filter: filtering afterwards would
        // under-return whenever maxResults trimmed out-of-range lines first.
        if (startLine !== null && lineNum < startLine) continue;
        if (endLine !== null && lineNum > endLine) continue;

        const lineText = lines[idx];
        pattern.lastIndex = 0;
        let match = pattern.exec(lineText);
        while (match !== null) {
          if (matches.length >= maxResults) {
            truncated = true;
            return;
          }
          matches.push({
            path: node.path,
            name: node.name,
            line: lineNum,
            column: match.index,
            length: match[0].length,
            text: lineText,
          });
          if (match[0].length === 0) pattern.lastIndex++;
          match = pattern.exec(lineText);
        }
      }
    }
  };

  await traverse(nodes);
  return { matches, filesSearched, truncated };
}
