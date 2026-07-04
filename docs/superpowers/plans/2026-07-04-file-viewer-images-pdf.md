# File Viewer: Images & PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the editor to open and display image files (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`) and PDF files (`.pdf`) directly from the file tree, instead of trying to render them as garbled text in CodeMirror.

**Architecture:** A `viewMode` state variable in `page.tsx` drives which panel is shown in the code area — `"code"` for text files (existing behaviour), `"image"` for raster/vector images, and `"pdf-standalone"` for PDFs selected directly from the file tree (as opposed to the existing compiled-PDF preview). The existing PDF pane on the right is reused for standalone PDF viewing. A new `ImageViewer` component renders images via a plain `<img>` tag pointing at the `/api/files` endpoint, which is updated to serve the correct `Content-Type` header for each image format.

**Tech Stack:** Next.js 15 App Router · TypeScript · React · `@embedpdf/react-pdf-viewer` (already installed) · Vanilla CSS / Tailwind via existing globals

## Global Constraints

- All edits stay within `apps/editor/` — do not touch `apps/web/` or `apps/compiler/`.
- Never edit files inside `apps/editor/my-new-project/` (the LaTeX sandbox).
- After touching any `.tsx` or `.ts` file in `apps/editor/`, run `bun x tsc --noEmit` inside `apps/editor/` to verify type safety.
- The editor already uses `@embedpdf/react-pdf-viewer` for compiled-PDF preview; use the same component for standalone PDF viewing — do **not** add a new PDF library.
- No new npm packages are required for this feature.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/editor/app/api/files/route.ts` | Modify | Add `Content-Type` headers for image formats in the GET binary branch |
| `apps/editor/app/page.tsx` | Modify | Add `viewMode` state; update `handleFileSelect`; conditionally render `ImageViewer` or reuse PDF pane for standalone PDF |
| `apps/editor/components/editor/image-viewer.tsx` | **Create** | Self-contained `<ImageViewer>` component that renders a file-tree image via the API endpoint |
| `apps/editor/components/ai-elements/file-tree.tsx` | Modify | Add distinct icons for image and PDF file types |

---

## Task 1: Fix API — Serve Images with Correct Content-Type

**Files:**
- Modify: `apps/editor/app/api/files/route.ts:18-34`

**Interfaces:**
- Produces: `GET /api/files?path=<relative-path>` returns image bytes with the correct `Content-Type` header (`image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`, `image/webp`)

- [ ] **Step 1: Identify the binary-serving block in `route.ts`**

Open `apps/editor/app/api/files/route.ts`. The relevant block starts at `if (filePath) {` (line 18). Currently only `.pdf` is handled as binary; everything else falls through to `storage.readFile()` (text read), which corrupts binary files.

- [ ] **Step 2: Add a MIME type helper and an image binary branch**

Replace the `if (filePath) { ... }` block (lines 18-34) with:

```ts
if (filePath) {
  console.log("[FILES API] Reading file:", filePath);

  const IMAGE_MIME: Record<string, string> = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".svg":  "image/svg+xml",
    ".webp": "image/webp",
  };
  const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
  const imageMime = IMAGE_MIME[ext];

  if (filePath.endsWith(".pdf")) {
    const buffer = await storage.readBinaryFile(projectId, filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": buffer.length.toString(),
        "Accept-Ranges": "bytes",
      },
    });
  }

  if (imageMime) {
    const buffer = await storage.readBinaryFile(projectId, filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": imageMime,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  }

  const content = await storage.readFile(projectId, filePath);
  console.log("[FILES API] File content fetched successfully");
  return Response.json({ content });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/editor && bun x tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`bun run dev` in root) and navigate to `http://localhost:3000/api/files?path=<an-image-path>` in the browser. The browser should display the image inline, not download a garbled file.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/app/api/files/route.ts
git commit -m "fix(api): serve images with correct Content-Type headers"
```

---

## Task 2: Create the `ImageViewer` Component

**Files:**
- Create: `apps/editor/components/editor/image-viewer.tsx`

**Interfaces:**
- Consumes: `GET /api/files?path=<relative>` (from Task 1) returns image bytes.
- Produces: `<ImageViewer path={string} />` — a React component that renders a centred, scrollable preview of the image. Used by `page.tsx` in Task 3.

- [ ] **Step 1: Create the file**

Create `apps/editor/components/editor/image-viewer.tsx` with this content:

```tsx
"use client";

interface ImageViewerProps {
  /** Relative project path, e.g. "figures/diagram.png" */
  path: string;
}

/**
 * Renders a binary image file from the project via the /api/files endpoint.
 * Displays it centred with overflow scroll in case the image is larger than
 * the available viewport.
 */
export function ImageViewer({ path }: ImageViewerProps) {
  const src = `/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`;
  const filename = path.split("/").pop() ?? path;

  return (
    <div
      className="flex flex-col items-center justify-start h-full w-full overflow-auto bg-background p-4 gap-3"
      aria-label={`Image preview: ${filename}`}
    >
      <p className="text-xs text-muted-foreground font-mono self-start select-all">{path}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={filename}
        className="max-w-full object-contain rounded border border-border shadow"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/editor && bun x tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/editor/components/editor/image-viewer.tsx
git commit -m "feat(editor): add ImageViewer component for binary image files"
```

---

## Task 3: Integrate View Mode into `page.tsx`

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Interfaces:**
- Consumes: `ImageViewer` from `apps/editor/components/editor/image-viewer.tsx` (Task 2)
- Consumes: `PDFViewer` already dynamically imported (existing, line 91)
- Produces: The editor area renders one of three views based on `viewMode`:
  - `"code"` → existing CodeMirror (default)
  - `"image"` → `<ImageViewer path={selectedPath} />`
  - `"pdf-standalone"` → right PDF pane shows the PDF; left panel shows a placeholder hint

> **Key insight:** For standalone PDFs the cleanest UX is to expand the right PDF pane and show the PDF there (same mechanism as compiled PDFs), because `@embedpdf/react-pdf-viewer` is already perfectly configured there. This avoids duplicating the PDF viewer and keeps the layout consistent.

- [ ] **Step 1: Add `viewMode` state (near line 388)**

In the code editor state block (around line 387-392), add the new state right after `currentLanguage`:

```ts
// View mode: "code" for text | "image" for images | "pdf-standalone" for PDFs opened from tree
const [viewMode, setViewMode] = useState<"code" | "image" | "pdf-standalone">("code");
```

- [ ] **Step 2: Add a `getViewMode` helper (after `getLanguageFromPath` at ~line 712)**

```ts
const getViewMode = (filePath: string): "code" | "image" | "pdf-standalone" => {
  const ext = filePath.includes(".") ? filePath.split(".").pop()!.toLowerCase() : "";
  const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
  if (imageExts.includes(ext)) return "image";
  if (ext === "pdf") return "pdf-standalone";
  return "code";
};
```

- [ ] **Step 3: Update `handleFileSelect` to set `viewMode` and skip text-loading for binary files**

Replace the entire `handleFileSelect` callback (lines 715-758) with:

```ts
const handleFileSelect = useCallback(async (path: string) => {
  if (selectedPath && editedCode !== currentCode) {
    try {
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", path: selectedPath, content: editedCode }),
      });
    } catch (err) {
      console.error("Failed to save changes before file switch", err);
    }
  }

  setSelectedPath(path);

  const mode = getViewMode(path);
  setViewMode(mode);

  if (mode === "image") {
    // Image files: no text to load, clear the PDF pane
    setPdfUrl(null);
    setCurrentCode("");
    setEditedCode("");
    return;
  }

  if (mode === "pdf-standalone") {
    // Show the PDF in the right PDF pane (same mechanism as compiled PDFs)
    const url = `${window.location.origin}/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`;
    setPdfUrl(url);
    setCurrentCode("");
    setEditedCode("");
    // Expand PDF pane if it was collapsed
    if (pdfPanelRef.current?.isCollapsed()) {
      pdfPanelRef.current.expand();
    }
    return;
  }

  // mode === "code" — existing .tex and text file logic
  if (path.endsWith(".tex")) {
    const pdfPath = path.replace(/\.tex$/, ".pdf");
    const findPdf = (nodes: any[]): boolean => {
      for (const n of nodes) {
        if (n.path === pdfPath) return true;
        if (n.children && findPdf(n.children)) return true;
      }
      return false;
    };
    if (findPdf(fileTree)) {
      setPdfUrl(`${window.location.origin}/api/files?path=${encodeURIComponent(pdfPath)}&t=${Date.now()}`);
    } else {
      setPdfUrl(null);
    }
  } else {
    setPdfUrl(null);
  }

  try {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.content !== undefined) {
      setCurrentCode(data.content);
      setEditedCode(data.content);
      setCurrentLanguage(getLanguageFromPath(path));
      setSaveStatus("saved");
    }
  } catch (err) {
    console.error("Failed to read file", err);
  }
}, [selectedPath, editedCode, currentCode, fileTree]);
```

- [ ] **Step 4: Import `ImageViewer`**

Near the top of `page.tsx` (with other component imports), add:

```ts
import { ImageViewer } from "@/components/editor/image-viewer";
```

- [ ] **Step 5: Update the editor panel render (around lines 1920-1938)**

Replace the block that conditionally shows `<CodeMirror>` or the empty placeholder:

```tsx
{/* BEFORE */}
{selectedPath ? (
  <CodeMirror
    value={editedCode}
    height="100%"
    theme="dark"
    extensions={currentLanguage === "latex" ? [latex(), EditorView.lineWrapping] : [EditorView.lineWrapping]}
    onChange={(value) => setEditedCode(value)}
    onCreateEditor={(view) => {
      editorViewRef.current = view;
    }}
    onUpdate={handleUpdate}
    className="absolute inset-0 w-full h-full text-sm font-mono border-none focus:outline-none"
  />
) : (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
    // Select a file from the sidebar to edit
  </div>
)}
```

```tsx
{/* AFTER */}
{selectedPath && viewMode === "image" ? (
  <ImageViewer path={selectedPath} />
) : selectedPath && viewMode === "pdf-standalone" ? (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
    <span className="opacity-60">PDF displayed in preview pane →</span>
  </div>
) : selectedPath && viewMode === "code" ? (
  <CodeMirror
    value={editedCode}
    height="100%"
    theme="dark"
    extensions={currentLanguage === "latex" ? [latex(), EditorView.lineWrapping] : [EditorView.lineWrapping]}
    onChange={(value) => setEditedCode(value)}
    onCreateEditor={(view) => {
      editorViewRef.current = view;
    }}
    onUpdate={handleUpdate}
    className="absolute inset-0 w-full h-full text-sm font-mono border-none focus:outline-none"
  />
) : (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
    // Select a file from the sidebar to edit
  </div>
)}
```

- [ ] **Step 6: Hide EditorToolbar for non-code views**

Find the `EditorToolbar` render (around line 1910) and update its guard:

```tsx
{/* BEFORE */}
{selectedPath && (
  <EditorToolbar ... />
)}

{/* AFTER */}
{selectedPath && viewMode === "code" && (
  <EditorToolbar ... />
)}
```

- [ ] **Step 7: Type-check**

```bash
cd apps/editor && bun x tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Manual end-to-end test**

1. Add a PNG image to `my-new-project/`.
2. Click the PNG in the file tree → left panel shows the image; toolbar hidden; PDF pane unchanged.
3. Click a `.pdf` file directly in the tree → right PDF pane opens with the PDF; left panel shows arrow placeholder.
4. Click a `.tex` file → CodeMirror shows, toolbar visible.
5. Compile `.tex` → PDF pane updates with compiled PDF as normal.
6. No console errors for any step.

- [ ] **Step 9: Commit**

```bash
git add apps/editor/app/page.tsx
git commit -m "feat(editor): open image and PDF files from file tree with dedicated viewers"
```

---

## Task 4: File-Tree Icon Improvements (UX Polish)

**Files:**
- Modify: `apps/editor/components/ai-elements/file-tree.tsx`

**Interfaces:**
- Consumes: File node `name` / `path` strings from the existing file tree component.
- Produces: Image files show a distinct `ImageIcon` (blue); PDF files show `FileText` (red); all existing icons for other types remain unchanged.

- [ ] **Step 1: Open and inspect the file-tree component**

Open `apps/editor/components/ai-elements/file-tree.tsx`. Locate where file extensions are mapped to icons. This is typically a `switch` or chain of `if`/`else if` statements on the file extension.

- [ ] **Step 2: Add `ImageIcon` import if not already present**

Ensure lucide-react imports include `ImageIcon` and `FileText`:

```ts
import { ImageIcon, FileText, /* existing icon names */ } from "lucide-react";
```

- [ ] **Step 3: Add icon rules for image and PDF extensions**

In the extension-to-icon logic, add:

```ts
const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
const fileExt = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

if (imageExts.includes(fileExt)) return <ImageIcon className="size-4 text-blue-400 shrink-0" />;
if (fileExt === "pdf") return <FileText className="size-4 text-red-400 shrink-0" />;
```

Adjust the exact colour classes to fit the surrounding design tokens in the file.

- [ ] **Step 4: Type-check**

```bash
cd apps/editor && bun x tsc --noEmit
```

- [ ] **Step 5: Visual verification in browser**

- PNG/JPG/SVG/GIF/WEBP files → blue image icon.
- PDF files → red file-text icon.
- `.tex`, `.bib`, `.md` → unchanged from before.

- [ ] **Step 6: Commit**

```bash
git add apps/editor/components/ai-elements/file-tree.tsx
git commit -m "feat(file-tree): add distinct icons for image and PDF files"
```

---

## Task 5: Final Verification Sweep

- [ ] **Step 1: Full TypeScript check**

```bash
cd apps/editor && bun x tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full feature matrix smoke test**

| Action | Expected result |
|--------|----------------|
| Click `.png` in file tree | Left panel shows `ImageViewer`; no toolbar; PDF pane unaffected |
| Click `.jpg` in file tree | Same as `.png` |
| Click `.svg` in file tree | SVG renders inline via `<img>` |
| Click `.pdf` directly in file tree | Right PDF pane opens with PDF; left panel shows `"PDF displayed in preview pane →"` |
| Click `.tex` in file tree | CodeMirror; toolbar visible; after compile PDF pane shows compiled PDF |
| Click `.md` / `.bib` / `.json` | CodeMirror with appropriate syntax highlighting |
| Switch from image → `.tex` | Editor toolbar reappears; no stale image state |
| Switch from standalone PDF → `.tex` | PDF pane updates to compiled tex PDF (or clears if not yet compiled) |

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final verification sweep for file viewer feature"
```
