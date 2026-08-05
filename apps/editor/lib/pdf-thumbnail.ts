import { readFileSync } from "node:fs";
import path from "node:path";
import { init } from "@embedpdf/pdfium";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import sharp from "sharp";

let wasmBinary: Buffer | null = null;

/**
 * Rasterizes page 1 of a PDF to a PNG using the same pdfium engine (and the
 * same vendored wasm binary) the client-side viewer uses — reuses the
 * official pdfium build already in this repo instead of shelling out to a
 * separate rasterizer.
 */
export async function renderPdfThumbnail(pdfBuffer: Buffer, width = 600): Promise<Buffer> {
  if (!wasmBinary) {
    wasmBinary = readFileSync(path.join(process.cwd(), "public/pdfium.wasm"));
  }

  const wasmModule = await init({ wasmBinary });
  const engine = new PdfiumNative(wasmModule);
  try {
    const content = Uint8Array.from(pdfBuffer).buffer;
    const doc = await engine.openDocumentBuffer({ id: "thumbnail", content }).toPromise();
    const page = doc.pages[0];
    if (!page) throw new Error("PDF has no pages");

    const raw = await engine.renderThumbnailRaw(doc, page, { scaleFactor: 2 }).toPromise();
    return await sharp(Buffer.from(raw.data), {
      raw: { width: raw.width, height: raw.height, channels: 4 },
    })
      .resize({ width })
      .png()
      .toBuffer();
  } finally {
    await engine
      .destroy()
      .toPromise()
      .catch(() => {});
  }
}
