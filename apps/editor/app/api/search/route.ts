import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { getProjectPath, getProjectIdFromPath } from "@/lib/project";
import path from "path";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  text: string;
  matchIndex: number;
}

const BINARY_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".gz", ".tar",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3"
]);

function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

export async function GET(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const matchCase = searchParams.get("matchCase") === "true";
    const matchWholeWord = searchParams.get("matchWholeWord") === "true";
    const useRegex = searchParams.get("useRegex") === "true";
    const scope = searchParams.get("scope") || "all"; // "all" | "current"
    const selectedPath = searchParams.get("selectedPath") || "";
    const startLineStr = searchParams.get("startLine") || "";
    const endLineStr = searchParams.get("endLine") || "";

    if (!query) {
      return Response.json({ results: [], resultsByFile: {} });
    }

    const startLine = startLineStr ? parseInt(startLineStr, 10) : null;
    const endLine = endLineStr ? parseInt(endLineStr, 10) : null;

    const files = await storage.listProjectFiles(projectId);
    const results: SearchResult[] = [];

    const traverse = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          if (node.children) await traverse(node.children);
        } else {
          // Scope limit
          if (scope === "current" && node.path !== selectedPath) {
            continue;
          }
          if (!isTextFile(node.name)) {
            continue;
          }

          try {
            const content = await storage.readFile(projectId, node.path);
            const lines = content.split("\n");

            lines.forEach((lineText, idx) => {
              const lineNum = idx + 1;
              if (scope === "current") {
                if (startLine !== null && lineNum < startLine) return;
                if (endLine !== null && lineNum > endLine) return;
              }

              if (useRegex) {
                try {
                  const flags = matchCase ? "g" : "gi";
                  const re = new RegExp(query, flags);
                  let match = re.exec(lineText);
                  while (match !== null) {
                    results.push({
                      fileId: node.path,
                      fileName: node.name,
                      line: lineNum,
                      text: lineText,
                      matchIndex: match.index,
                    });
                    match = re.exec(lineText);
                  }
                } catch {
                  // Invalid Regex
                }
              } else {
                const q = matchCase ? query : query.toLowerCase();
                const l = matchCase ? lineText : lineText.toLowerCase();
                let pos = l.indexOf(q);
                while (pos !== -1) {
                  let valid = true;
                  if (matchWholeWord) {
                    const before = pos > 0 ? l[pos - 1] : " ";
                    const after = pos + q.length < l.length ? l[pos + q.length] : " ";
                    const isWordChar = (c: string) => /[a-zA-Z0-9_]/.test(c);
                    if (isWordChar(before) || isWordChar(after)) {
                      valid = false;
                    }
                  }
                  if (valid) {
                    results.push({
                      fileId: node.path,
                      fileName: node.name,
                      line: lineNum,
                      text: lineText,
                      matchIndex: pos,
                    });
                  }
                  pos = l.indexOf(q, pos + 1);
                }
              }
            });
          } catch {
            // Ignored
          }
        }
      }
    };

    await traverse(files);

    const resultsByFile: Record<string, { name: string; matches: SearchResult[] }> = {};
    results.forEach((res) => {
      if (!resultsByFile[res.fileId]) {
        resultsByFile[res.fileId] = { name: res.fileName, matches: [] };
      }
      resultsByFile[res.fileId].matches.push(res);
    });

    return Response.json({ results, resultsByFile });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);

    const body = await req.json();
    const query = body.query || "";
    const replaceText = body.replaceText ?? "";
    const matchCase = body.matchCase === true;
    const matchWholeWord = body.matchWholeWord === true;
    const useRegex = body.useRegex === true;
    const scope = body.scope || "all";
    const selectedPath = body.selectedPath || "";

    if (!query) {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    let flags = "g";
    if (!matchCase) flags += "i";

    let pattern: RegExp;
    if (useRegex) {
      pattern = new RegExp(query, flags);
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (matchWholeWord) {
        pattern = new RegExp(`\\b${escaped}\\b`, flags);
      } else {
        pattern = new RegExp(escaped, flags);
      }
    }

    const files = await storage.listProjectFiles(projectId);
    let count = 0;
    const modifiedFiles: string[] = [];

    const traverse = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          if (node.children) await traverse(node.children);
        } else {
          if (scope === "current" && node.path !== selectedPath) {
            continue;
          }
          if (!isTextFile(node.name)) {
            continue;
          }

          try {
            const content = await storage.readFile(projectId, node.path);
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
              const newContent = content.replace(pattern, replaceText);
              await storage.writeFile(projectId, node.path, newContent);
              count += matches.length;
              modifiedFiles.push(node.path);
            }
          } catch {
            // Ignored
          }
        }
      }
    };

    await traverse(files);
    return Response.json({ success: true, count, modifiedFiles });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
