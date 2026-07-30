export interface CompileError {
  file: string;
  line: number;
  message: string;
}

const ANSI_RE = /\[[0-9;]*m/g;
// Tectonic's own error format: `error: <file>:<line>: <message>`. Some fatal
// errors (e.g. "!File ended while scanning...") have no file:line and are
// skipped here — they still show up in the terminal, just without a gutter mark.
const ERROR_LINE_RE = /^error: (.+?):(\d+): (.+)$/;

// compilePath is the project-relative .tex path we asked the compiler to
// build; used as a fallback when a line references the root file by its
// bare basename ("main.tex") rather than a relative path with subdirs.
export function parseCompileErrors(log: string, compilePath: string): CompileError[] {
  const clean = log.replace(ANSI_RE, "");
  const rootBasename = compilePath.split("/").pop();
  const errors: CompileError[] = [];
  // The compiler compiles twice on a cold cache — once with `-C`, then again with
  // remote package fetching (see apps/compiler/index.ts) — so one mistake in the
  // document appears in the log once per pass. Same file, same line, same message
  // is the same error; reporting it twice double-marks the gutter and tells the
  // agent there are two problems to fix.
  const seen = new Set<string>();

  for (const rawLine of clean.split("\n")) {
    const match = ERROR_LINE_RE.exec(rawLine.trim());
    if (!match) continue;
    const [, file, line, message] = match;
    const error: CompileError = {
      file: file === rootBasename ? compilePath : file,
      line: Number(line),
      message: message.trim(),
    };
    const key = `${error.file}:${error.line}:${error.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    errors.push(error);
  }

  return errors;
}

// A clean Tectonic log is a few KB, but a run that fetches packages can produce
// megabytes of progress lines. The structured errors above carry the part that
// matters, so the model only needs the tail for context.
const MAX_MODEL_LOG_CHARS = 4000;

/** Compact rendering of a compile outcome for a tool's `toModelOutput`. */
export function formatCompileForModel(errors: CompileError[], log: string): string {
  const parts: string[] = [];

  if (errors.length > 0) {
    parts.push(
      `Errors (${errors.length}):\n${errors.map((e) => `- ${e.file}:${e.line}: ${e.message}`).join("\n")}`
    );
  }

  const clean = log.replace(ANSI_RE, "").trimEnd();
  if (clean) {
    parts.push(
      `Log:\n${clean.length > MAX_MODEL_LOG_CHARS ? `…(truncated)\n${clean.slice(-MAX_MODEL_LOG_CHARS)}` : clean}`
    );
  }

  return parts.join("\n\n");
}
