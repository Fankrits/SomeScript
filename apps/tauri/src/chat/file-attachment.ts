import type { Attachment } from "./types";

export const MAX_ATTACHMENT_CHARS = 200_000;

export interface ProcessFileOptions {
  isVision: boolean;
  isNativePdf: boolean;
}

export type ProcessFileResult = { ok: true; attachment: Attachment } | { ok: false; error: string };

const TEXT_EXTENSIONS = new Set([
  "tex",
  "bib",
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "rs",
  "toml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "c",
  "cpp",
  "h",
  "hpp",
  "java",
  "go",
  "html",
  "css",
  "xml",
  "log",
  "diff",
  "patch",
  "env",
  "cls",
  "sty",
  "dtx",
  "ins",
]);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/x-latex") return true;
  const ext = getExtension(file.name);
  return TEXT_EXTENSIONS.has(ext);
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = getExtension(file.name);
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext);
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || getExtension(file.name) === "pdf";
}

/**
 * Extracts plain text from an uncompressed or FlateDecode PDF stream buffer.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder("latin1");
  const rawString = textDecoder.decode(bytes);

  const textParts: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(rawString)) !== null) {
    const streamContent = match[1];
    const streamStartIndex = match.index + match[0].indexOf(streamContent);
    const streamBytes = bytes.subarray(streamStartIndex, streamStartIndex + streamContent.length);

    let decodedText = "";
    if (typeof DecompressionStream !== "undefined") {
      try {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        void writer.write(streamBytes);
        void writer.close();
        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        decodedText = new TextDecoder("utf-8", { fatal: false }).decode(merged);
      } catch {
        // Fallback to uncompressed string
        decodedText = streamContent;
      }
    } else {
      decodedText = streamContent;
    }

    const extracted = parsePdfTextStream(decodedText);
    if (extracted.trim()) {
      textParts.push(extracted.trim());
    }
  }

  // Also parse any unstreamed text blocks
  if (textParts.length === 0) {
    const unstreamed = parsePdfTextStream(rawString);
    if (unstreamed.trim()) {
      textParts.push(unstreamed.trim());
    }
  }

  return textParts.join("\n\n").slice(0, MAX_ATTACHMENT_CHARS);
}

/**
 * Parses BT ... ET blocks and extracts text from (..) Tj, [(..)] TJ, etc.
 */
export function parsePdfTextStream(stream: string): string {
  const lines: string[] = [];
  const btRegex = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(stream)) !== null) {
    const block = btMatch[1];
    const words: string[] = [];

    // Match string literal: ( ... ) Tj or ' or "
    const tjRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      words.push(unescapePdfString(tjMatch[1]));
    }

    // Match array of strings: [ (foo) 20 (bar) ] TJ
    const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayTjRegex.exec(block)) !== null) {
      const inner = arrayMatch[1];
      const innerItemRegex = /\(((?:[^()\\]|\\.)*)\)/g;
      let innerMatch: RegExpExecArray | null;
      while ((innerMatch = innerItemRegex.exec(inner)) !== null) {
        words.push(unescapePdfString(innerMatch[1]));
      }
    }

    if (words.length > 0) {
      lines.push(words.join(" "));
    }
  }

  return lines.join("\n");
}

function unescapePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

async function readFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    const text = await file.text();
    return text.slice(0, MAX_ATTACHMENT_CHARS);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).slice(0, MAX_ATTACHMENT_CHARS));
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Validates and converts an uploaded file into an Attachment object according to
 * the active model's vision and PDF capabilities.
 */
export async function processUploadedFile(
  file: File,
  options: ProcessFileOptions,
): Promise<ProcessFileResult> {
  if (isImageFile(file)) {
    if (!options.isVision) {
      return {
        ok: false,
        error: `The current model does not support images. Switch to a vision model (e.g. GPT-4o, Claude 3.5, Gemini 1.5, or LLaVA).`,
      };
    }
    const url = await readFileAsDataUrl(file);
    return {
      ok: true,
      attachment: {
        name: file.name,
        text: "",
        type: "image",
        url,
        mediaType: file.type || "image/png",
      },
    };
  }

  if (isPdfFile(file)) {
    if (options.isNativePdf) {
      const url = await readFileAsDataUrl(file);
      return {
        ok: true,
        attachment: {
          name: file.name,
          text: "",
          type: "file",
          url,
          mediaType: "application/pdf",
        },
      };
    }

    // Hybrid approach: extract text locally for models without native PDF support (GPT-4o, local models, text models)
    try {
      const buffer = await file.arrayBuffer();
      const extractedText = await extractPdfText(buffer);
      if (extractedText.trim().length > 0) {
        return {
          ok: true,
          attachment: {
            name: file.name,
            text: extractedText,
            type: "text",
          },
        };
      }
    } catch {
      // Extraction failed or empty
    }

    // If text extraction yielded nothing (e.g. image-only PDF), check if model has vision
    if (options.isVision) {
      const url = await readFileAsDataUrl(file);
      return {
        ok: true,
        attachment: {
          name: file.name,
          text: "",
          type: "file",
          url,
          mediaType: "application/pdf",
        },
      };
    }

    return {
      ok: false,
      error: `Could not extract text from "${file.name}" and the active model is text-only. Switch to a vision model to inspect it.`,
    };
  }

  if (isTextFile(file)) {
    const text = await readFileAsText(file);
    return {
      ok: true,
      attachment: {
        name: file.name,
        text,
        type: "text",
      },
    };
  }

  return {
    ok: false,
    error: `Unsupported file type "${file.name}". Please upload text, code, image, or PDF files.`,
  };
}
