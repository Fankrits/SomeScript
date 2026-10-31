import { describe, expect, it } from "bun:test";
import {
  isImageFile,
  isPdfFile,
  isTextFile,
  parsePdfTextStream,
  processUploadedFile,
} from "./file-attachment";

describe("file classification", () => {
  it("classifies text files correctly", () => {
    expect(isTextFile(new File(["content"], "main.tex", { type: "" }))).toBe(true);
    expect(isTextFile(new File(["content"], "references.bib", { type: "" }))).toBe(true);
    expect(isTextFile(new File(["{}"], "data.json", { type: "application/json" }))).toBe(true);
    expect(isTextFile(new File(["notes"], "todo.txt", { type: "text/plain" }))).toBe(true);
    expect(isTextFile(new File(["fn main() {}"], "script.rs", { type: "" }))).toBe(true);
  });

  it("classifies image files correctly", () => {
    expect(isImageFile(new File(["img"], "plot.png", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File(["img"], "diagram.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isImageFile(new File(["img"], "graph.webp", { type: "" }))).toBe(true);
    expect(isImageFile(new File(["txt"], "main.tex", { type: "" }))).toBe(false);
  });

  it("classifies PDF files correctly", () => {
    expect(isPdfFile(new File(["pdf"], "paper.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isPdfFile(new File(["pdf"], "report.pdf", { type: "" }))).toBe(true);
    expect(isPdfFile(new File(["txt"], "paper.tex", { type: "" }))).toBe(false);
  });
});

describe("PDF text parsing", () => {
  it("extracts text from standard PDF text streams", () => {
    const stream = `
BT
/F1 12 Tf
(Hello World) Tj
ET
BT
[(Some) 10 (LaTeX) 20 (Text)] TJ
ET
`;
    const text = parsePdfTextStream(stream);
    expect(text).toContain("Hello World");
    expect(text).toContain("Some LaTeX Text");
  });

  it("handles unescaped characters in PDF strings", () => {
    const stream = `
BT
(Equation \\(E=mc^2\\) with \\\\ and \\n newline) Tj
ET
`;
    const text = parsePdfTextStream(stream);
    expect(text).toContain("Equation (E=mc^2) with \\ and \n newline");
  });
});

describe("processUploadedFile", () => {
  it("processes text files for any model", async () => {
    const file = new File(["\\documentclass{article}"], "main.tex", { type: "text/x-tex" });
    const res = await processUploadedFile(file, { isVision: false, isNativePdf: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.name).toBe("main.tex");
      expect(res.attachment.text).toBe("\\documentclass{article}");
      expect(res.attachment.type).toBe("text");
    }
  });

  it("blocks images if model does not have vision", async () => {
    const file = new File(["fake_img"], "figure.png", { type: "image/png" });
    const res = await processUploadedFile(file, { isVision: false, isNativePdf: false });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("does not support images");
    }
  });

  it("processes images if model has vision", async () => {
    const file = new File(["fake_img"], "figure.png", { type: "image/png" });
    const res = await processUploadedFile(file, { isVision: true, isNativePdf: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.name).toBe("figure.png");
      expect(res.attachment.type).toBe("image");
      expect(res.attachment.url).toBeDefined();
    }
  });

  it("processes PDFs as base64 document if model supports native PDF", async () => {
    const file = new File(["%PDF-1.4 dummy"], "doc.pdf", { type: "application/pdf" });
    const res = await processUploadedFile(file, { isVision: true, isNativePdf: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.name).toBe("doc.pdf");
      expect(res.attachment.type).toBe("file");
      expect(res.attachment.mediaType).toBe("application/pdf");
    }
  });

  it("extracts text from PDF if model does not support native PDF", async () => {
    const pdfContent = "%PDF-1.4\nBT\n(Extracted PDF Content) Tj\nET\n%%EOF";
    const file = new File([pdfContent], "paper.pdf", { type: "application/pdf" });
    const res = await processUploadedFile(file, { isVision: false, isNativePdf: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.name).toBe("paper.pdf");
      expect(res.attachment.text).toContain("Extracted PDF Content");
      expect(res.attachment.type).toBe("text");
    }
  });
});
