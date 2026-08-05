import safeRegex from "safe-regex2";
import { ApiError } from "./authz";

const MAX_QUERY_LENGTH = 512;

/**
 * Builds the search RegExp shared by search GET and replace POST.
 * ponytail: safe-regex2 is a heuristic (star-height) ReDoS screen; swap for RE2 if it ever misses in practice.
 */
export function buildSearchPattern(
  query: string,
  opts: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean },
): RegExp {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ApiError(400, `Query too long (max ${MAX_QUERY_LENGTH} characters)`);
  }

  let flags = "g";
  if (!opts.matchCase) flags += "i";

  if (opts.useRegex) {
    if (!safeRegex(query)) {
      throw new ApiError(400, "Pattern too complex");
    }
    try {
      return new RegExp(query, flags);
    } catch {
      throw new ApiError(400, "Invalid regular expression");
    }
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(opts.matchWholeWord ? `\\b${escaped}\\b` : escaped, flags);
}

/**
 * Replaces exactly one match at the offset returned by the search endpoint.
 * The pattern is global so all occurrences can be enumerated deterministically.
 * Returns null when the source line no longer contains a match at that offset.
 */
export function replaceMatchAt(
  lineText: string,
  pattern: RegExp,
  matchIndex: number,
  replacement: string,
  expectedLineText?: string,
): string | null {
  if (expectedLineText !== undefined && lineText !== expectedLineText) {
    return null;
  }
  if (!pattern.global || !Number.isInteger(matchIndex) || matchIndex < 0) {
    return null;
  }

  pattern.lastIndex = 0;
  try {
    let match = pattern.exec(lineText);
    while (match !== null) {
      if (match.index === matchIndex) {
        return (
          lineText.slice(0, match.index) +
          replacement +
          lineText.slice(match.index + match[0].length)
        );
      }
      if (match[0].length === 0) pattern.lastIndex += 1;
      match = pattern.exec(lineText);
    }
    return null;
  } finally {
    pattern.lastIndex = 0;
  }
}
