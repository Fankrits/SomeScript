import { NextRequest } from "next/server";
import { storage, type FileNode } from "@/lib/storage";
import { requireProject, touchProject, apiError } from "@/lib/authz";
import { notifyCollabPathsChanged } from "@/lib/collab-notify";
import { buildSearchPattern, replaceMatchAt } from "@/lib/search-pattern";
import path from "path";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  text: string;
  matchIndex: number;
}

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

function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

interface SingleMatchTarget {
  fileId: string;
  line: number;
  matchIndex: number;
  lineText: string;
}

function parseSingleMatchTarget(value: unknown): SingleMatchTarget | null {
  if (!value || typeof value !== "object") return null;
  const target = value as Record<string, unknown>;
  const fileId = target.fileId;
  const line = target.line;
  const matchIndex = target.matchIndex;
  const lineText = target.lineText;
  if (
    typeof fileId !== "string" ||
    fileId.length === 0 ||
    !isTextFile(fileId) ||
    typeof line !== "number" ||
    !Number.isInteger(line) ||
    line < 1 ||
    typeof matchIndex !== "number" ||
    !Number.isInteger(matchIndex) ||
    matchIndex < 0 ||
    typeof lineText !== "string" ||
    lineText.length > 1_000_000
  ) {
    return null;
  }
  return {
    fileId,
    line,
    matchIndex,
    lineText,
  };
}

function containsSearchableFile(nodes: FileNode[], targetPath: string): boolean {
  for (const node of nodes) {
    if (!node.isDir && node.path === targetPath) return true;
    if (node.isDir && node.children && containsSearchableFile(node.children, targetPath)) {
      return true;
    }
  }
  return false;
}

function parseLineBoundary(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

import { checkRate } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    await checkRate("search", 30, 60_000);
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));

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

    const pattern = buildSearchPattern(query, { matchCase, matchWholeWord, useRegex });
    const MAX_RESULTS = 2000;
    const results: SearchResult[] = [];
    const files = await storage.listProjectFiles(projectId);

    const traverse = async (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (results.length >= MAX_RESULTS) return;
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
                if (startLine !== null && !isNaN(startLine) && lineNum < startLine) return;
                if (endLine !== null && !isNaN(endLine) && lineNum > endLine) return;
              }

              pattern.lastIndex = 0;
              let match = pattern.exec(lineText);
              while (match !== null && results.length < MAX_RESULTS) {
                results.push({
                  fileId: node.path,
                  fileName: node.name,
                  line: lineNum,
                  text: lineText,
                  matchIndex: match.index,
                });
                if (match[0].length === 0) pattern.lastIndex++;
                match = pattern.exec(lineText);
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
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await checkRate("search", 30, 60_000);
    const body = await req.json();
    const projectId = await requireProject(body.projectId);

    const query = body.query || "";
    const replaceText = body.replaceText ?? "";
    const matchCase = body.matchCase === true;
    const matchWholeWord = body.matchWholeWord === true;
    const useRegex = body.useRegex === true;
    const scope = body.scope || "all";
    const selectedPath = body.selectedPath || "";
    const startLine = parseLineBoundary(body.startLine);
    const endLine = parseLineBoundary(body.endLine);

    if (scope !== "all" && scope !== "current") {
      return Response.json({ error: "Invalid search scope" }, { status: 400 });
    }
    if (startLine === undefined || endLine === undefined) {
      return Response.json({ error: "Invalid line range" }, { status: 400 });
    }

    if (!query) {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    const pattern = buildSearchPattern(query, { matchCase, matchWholeWord, useRegex });
    const files = await storage.listProjectFiles(projectId);

    // Single-match replace: target identifies one occurrence by file/line/offset
    // (as returned by GET) so only that occurrence is touched, not every match in the file.
    if (body.target !== undefined && body.target !== null) {
      const target = parseSingleMatchTarget(body.target);
      if (!target) {
        return Response.json({ error: "Invalid match target" }, { status: 400 });
      }
      if (!containsSearchableFile(files, target.fileId)) {
        return Response.json({ error: "File not found" }, { status: 404 });
      }
      if (
        (scope === "current" && (!selectedPath || target.fileId !== selectedPath)) ||
        (startLine !== null && target.line < startLine) ||
        (endLine !== null && target.line > endLine)
      ) {
        return Response.json(
          { error: "Search result is stale; refresh the search" },
          { status: 409 },
        );
      }

      let snapshot;
      try {
        snapshot = await storage.readFileWithVersion(projectId, target.fileId);
      } catch (error) {
        const details = error as { code?: string; name?: string; message?: string };
        if (
          details.code === "ENOENT" ||
          details.name === "NoSuchKey" ||
          details.message?.includes("ENOENT")
        ) {
          return Response.json({ error: "File not found" }, { status: 404 });
        }
        throw error;
      }
      const content = snapshot.content;
      const lines = content.split("\n");
      const lineText = lines[target.line - 1];
      if (lineText === undefined) {
        return Response.json(
          { error: "Search result is stale; refresh the search" },
          { status: 409 },
        );
      }

      const replacedLine = replaceMatchAt(
        lineText,
        pattern,
        target.matchIndex,
        replaceText,
        target.lineText,
      );
      if (replacedLine === null) {
        return Response.json(
          { error: "Search result is stale; refresh the search" },
          { status: 409 },
        );
      }

      lines[target.line - 1] = replacedLine;
      const wrote = await storage.writeFileIfVersion(
        projectId,
        target.fileId,
        snapshot.version,
        lines.join("\n"),
      );
      if (!wrote) {
        return Response.json(
          { error: "File changed while replacing; refresh the search" },
          { status: 409 },
        );
      }
      await touchProject(projectId);
      await notifyCollabPathsChanged(projectId, [target.fileId]);
      return Response.json({ success: true, count: 1, modifiedFiles: [target.fileId] });
    }

    let count = 0;
    const modifiedFiles: string[] = [];
    const conflicts: string[] = [];

    const traverse = async (nodes: FileNode[]) => {
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
            const snapshot = await storage.readFileWithVersion(projectId, node.path);
            const matches = snapshot.content.match(pattern);
            if (matches && matches.length > 0) {
              const newContent = snapshot.content.replace(pattern, () => replaceText);
              const wrote = await storage.writeFileIfVersion(
                projectId,
                node.path,
                snapshot.version,
                newContent,
              );
              if (!wrote) {
                conflicts.push(node.path);
                continue;
              }
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
    if (modifiedFiles.length > 0) {
      await touchProject(projectId);
      await notifyCollabPathsChanged(projectId, modifiedFiles);
    }
    if (conflicts.length > 0) {
      return Response.json(
        {
          success: false,
          error: "Some files changed while replacing; refresh the search",
          count,
          modifiedFiles,
          conflicts,
        },
        { status: 409 },
      );
    }
    return Response.json({ success: true, count, modifiedFiles });
  } catch (error) {
    return apiError(error);
  }
}
