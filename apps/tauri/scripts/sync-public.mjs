// Copies static assets the editor UI expects at the site root out of apps/editor, so the
// desktop app doesn't keep a second 4.6 MB copy of pdfium.wasm in git. Output is gitignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["../editor/public/pdfium.wasm", "public/pdfium.wasm"],
  ["../editor/app/icon.svg", "public/icon.svg"],
];

for (const [from, to] of copies) {
  const dest = resolve(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(resolve(root, from), dest);
}
