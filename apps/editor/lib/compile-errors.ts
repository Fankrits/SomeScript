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

  for (const rawLine of clean.split("\n")) {
    const match = ERROR_LINE_RE.exec(rawLine.trim());
    if (!match) continue;
    const [, file, line, message] = match;
    errors.push({
      file: file === rootBasename ? compilePath : file,
      line: Number(line),
      message: message.trim(),
    });
  }

  return errors;
}
