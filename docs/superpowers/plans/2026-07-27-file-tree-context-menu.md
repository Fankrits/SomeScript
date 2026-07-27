# File Tree Context Menu — Duplicate, Download, Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Duplicate and Download to the editor's file tree context menu, and add file upload (toolbar button + drag-and-drop) — none of which exist today.

**Architecture:** Extend the existing `StorageProvider` interface (`lib/storage.ts`) with a `copy()` method used by both a new POST action on `/api/files` and unchanged elsewhere; add a `download=1` flag to the existing `GET /api/files` so any file type (not just images/PDFs) can be force-downloaded; add a new sibling route `/api/files/upload` mirroring the existing `/api/project/import` multipart-upload pattern; extend `FileTree` (`components/ai-elements/file-tree.tsx`) with new context-menu items and native HTML5 drag-and-drop; wire it all together in `app/page.tsx` following the exact shape of the existing `handleFileMove`/`handleFileDelete`/`handleDownloadPdf` handlers.

**Tech Stack:** Next.js 16 App Router route handlers, `react-arborist` tree component, Radix `ContextMenu` primitives (`components/ui/context-menu.tsx`), `bun:test`, existing `StorageProvider` abstraction (local FS + S3).

**Full design context:** [docs/superpowers/specs/2026-07-27-file-tree-context-menu-design.md](../specs/2026-07-27-file-tree-context-menu-design.md)

## Global Constraints

- Type safety: run `cd apps/editor && bun x tsc --noEmit` after every task that touches a `.ts`/`.tsx` file under `apps/editor` (required per this repo's CLAUDE.md).
- `apps/editor` is Clerk-auth-gated end to end. Do **not** bypass, mock, or work around Clerk auth to verify a route — for any task whose only verification would require a signed-in session, verify via `tsc` + careful code reading instead, and say so explicitly rather than claiming it was exercised live. Only the final integration task attempts live browser verification, and only if a session already exists in the preview.
- Every mutating route already funnels through `requireProject()` (`lib/authz.ts`), which enforces sign-in + project ownership. None of this work adds a new permission system — copy/upload/download reuse that same check.
- Reuse the existing `MAX_UPLOAD_BYTES` constant (`lib/zip.ts`, 250MB) as the per-file upload size cap. Do not introduce a second size constant.
- Match existing code style exactly where a near-identical sibling function already exists in the file being edited (e.g. `handleFileDuplicate` should look like `handleFileMove`/`handleFileDelete`, not invent a new error-handling convention).

---

### Task 1: `StorageProvider.copy()` + tests

**Files:**
- Modify: `apps/editor/lib/storage.ts`
- Modify: `apps/editor/lib/storage.test.ts`

**Interfaces:**
- Produces: `copy(projectId: string, srcPath: string, destPath: string): Promise<void>` on the `StorageProvider` interface, implemented by both `LocalStorageProvider` and `S3StorageProvider`, available via the existing `storage` singleton export.

- [ ] **Step 1: Write the failing tests**

Replace the top of `apps/editor/lib/storage.test.ts` (the import lines) with:

```ts
import { expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { LocalStorageProvider, isBinaryContent } from "./storage";

const p = new LocalStorageProvider();
```

Then append these tests at the end of the file:

```ts
test("copy rejects traversal in the source path", async () => {
  await expect(p.copy("abc", "../abc-evil/secret.txt", "dest.txt")).rejects.toThrow("Directory traversal");
});

test("copy rejects traversal in the destination path", async () => {
  await expect(p.copy("abc", "secret.txt", "../abc-evil/dest.txt")).rejects.toThrow("Directory traversal");
});

test("copy duplicates a file without removing the original", async () => {
  const projectId = `test-copy-file-${Date.now()}`;
  const baseDir = path.join(process.cwd(), "projects", projectId);
  try {
    await p.writeFile(projectId, "original.tex", "hello world");
    await p.copy(projectId, "original.tex", "duplicate.tex");
    expect(await p.readFile(projectId, "original.tex")).toBe("hello world");
    expect(await p.readFile(projectId, "duplicate.tex")).toBe("hello world");
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test("copy recursively duplicates a directory", async () => {
  const projectId = `test-copy-dir-${Date.now()}`;
  const baseDir = path.join(process.cwd(), "projects", projectId);
  try {
    await p.writeFile(projectId, "sections/intro.tex", "intro content");
    await p.copy(projectId, "sections", "sections-dup");
    expect(await p.readFile(projectId, "sections-dup/intro.tex")).toBe("intro content");
    expect(await p.readFile(projectId, "sections/intro.tex")).toBe("intro content");
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/editor && bun test lib/storage.test.ts`
Expected: the four new tests FAIL (`p.copy is not a function`); the pre-existing tests in this file still pass.

- [ ] **Step 3: Implement `copy()`**

In `apps/editor/lib/storage.ts`, add `copy` to the `StorageProvider` interface, right after `move`:

```ts
export interface StorageProvider {
  readFile(projectId: string, fileRelativePath: string): Promise<string>;
  readBinaryFile(projectId: string, fileRelativePath: string): Promise<Buffer>;
  writeFile(projectId: string, fileRelativePath: string, content: string | Buffer): Promise<void>;
  createDirectory(projectId: string, dirRelativePath: string): Promise<void>;
  listProjectFiles(projectId: string): Promise<FileNode[]>;
  move(projectId: string, oldPath: string, newPath: string): Promise<void>;
  copy(projectId: string, srcPath: string, destPath: string): Promise<void>;
  delete(projectId: string, fileRelativePath: string): Promise<void>;
}
```

In `LocalStorageProvider`, add this method right after `move`:

```ts
  async copy(projectId: string, srcPath: string, destPath: string): Promise<void> {
    const srcFullPath = this.getLocalPath(projectId, srcPath);
    const destFullPath = this.getLocalPath(projectId, destPath);
    await fs.mkdir(path.dirname(destFullPath), { recursive: true });
    await fs.cp(srcFullPath, destFullPath, { recursive: true });
  }
```

In `S3StorageProvider`, add this method right after `move` (note: unlike `move`'s single-object branch, this does **not** swallow errors in a try/catch — the file's own header comment states "S3 errors now propagate to callers", and a failed copy must surface as a failure):

```ts
  async copy(projectId: string, srcPath: string, destPath: string): Promise<void> {
    const srcPrefix = this.getS3Key(projectId, srcPath);
    const destPrefix = this.getS3Key(projectId, destPath);

    const listResponse = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: srcPrefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: encodeURIComponent(`${this.bucket}/${srcPrefix}`),
          Key: destPrefix,
        })
      );
      return;
    }

    for (const object of listResponse.Contents) {
      if (!object.Key) continue;
      const relativePart = object.Key.substring(srcPrefix.length);
      const destKey = destPrefix + relativePart;

      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: encodeURIComponent(`${this.bucket}/${object.Key}`),
          Key: destKey,
        })
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/editor && bun test lib/storage.test.ts`
Expected: all tests PASS (the 5 pre-existing ones plus the 4 new ones).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no errors.

```bash
git add apps/editor/lib/storage.ts apps/editor/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): add copy() to the storage provider

Backs the upcoming Duplicate context-menu action. Mirrors move()'s
list-and-copy shape for S3 but doesn't swallow errors, since a failed
copy must surface to the caller rather than silently no-op.
EOF
)"
```

---

### Task 2: `/api/files` — copy action + download flag

**Files:**
- Modify: `apps/editor/app/api/files/route.ts`

**Interfaces:**
- Consumes: `storage.copy(projectId, srcPath, destPath): Promise<void>` from Task 1.
- Produces:
  - `POST /api/files` with body `{ projectId, action: "copy", path: string, newPath: string }` → `{ success: true }` on success, `{ error: string }` with a non-2xx status on failure (via the existing `apiError` helper).
  - `GET /api/files?projectId=...&path=...&download=1` → the raw file bytes with `Content-Disposition: attachment; filename="..."`, for **any** file type (today only images/PDFs return raw bytes; everything else returns `{ content }` JSON, which isn't directly downloadable).

- [ ] **Step 1: Add the `download=1` branch to GET**

In `apps/editor/app/api/files/route.ts`, inside the `GET` handler, the current code is:

```ts
    if (filePath) {
      const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
      const imageMime = IMAGE_MIME[ext];

      if (filePath.endsWith(".pdf")) {
```

Replace it with (adds one new branch, everything after is unchanged):

```ts
    if (filePath) {
      const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
      const imageMime = IMAGE_MIME[ext];

      if (searchParams.get("download") === "1") {
        const buffer = await storage.readBinaryFile(projectId, filePath);
        const filename = filePath.split("/").pop() || filePath;
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": filePath.endsWith(".pdf") ? "application/pdf" : imageMime || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": buffer.length.toString(),
          },
        });
      }

      if (filePath.endsWith(".pdf")) {
```

- [ ] **Step 2: Add the `copy` action to POST**

The current POST handler has this sequence of `if (body.action === ...)` blocks: `"create"`, `"save"`, `"move"`, `"delete"`. Insert a new block right after the `"move"` block and before the `"delete"` block:

```ts
    if (body.action === "move") {
      await storage.move(projectId, body.oldPath, body.newPath);
      return Response.json({ success: true });
    }

    if (body.action === "copy") {
      if (typeof body.path !== "string" || typeof body.newPath !== "string") {
        throw new ApiError(400, "Missing path or newPath");
      }
      await storage.copy(projectId, body.path, body.newPath);
      return Response.json({ success: true });
    }

    if (body.action === "delete") {
```

(Validated the same way the `save` action already validates its body — a copy with a missing/non-string path should come back as a clean 400, not an unhandled 500 from deep inside the storage layer.)

- [ ] **Step 3: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify by reading, not by live request**

This route requires a signed-in Clerk session (`requireProject` calls `auth()` first) — per the Global Constraints, don't bypass that to test. Instead, trace both new branches by hand against the code and confirm:
- The `download=1` branch reads via `storage.readBinaryFile`, which already handles both text and binary files without throwing on either (unlike the JSON `{content}` branch, which force-decodes as UTF-8).
- The `copy` action calls the exact same `storage.copy` signature added in Task 1.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/app/api/files/route.ts
git commit -m "$(cat <<'EOF'
feat(editor): add copy action and download flag to /api/files

download=1 forces any file (not just images/PDFs) to stream back as
attachment bytes instead of the default {content} JSON shape, and
action:"copy" backs the new Duplicate context-menu item.
EOF
)"
```

---

### Task 3: Upload route (`/api/files/upload`)

**Files:**
- Modify: `apps/editor/lib/zip.ts`
- Modify: `apps/editor/lib/zip.test.ts`
- Create: `apps/editor/app/api/files/upload/route.ts`

**Interfaces:**
- Consumes: `storage.writeFile(projectId, path, Buffer): Promise<void>`, `storage.listProjectFiles(projectId): Promise<FileNode[]>` (both pre-existing), `MAX_UPLOAD_BYTES` (pre-existing, from `lib/zip.ts`), `checkRate(bucket, limit, windowMs): Promise<void>` (pre-existing, `lib/rate-limit.ts`), `requireProject`/`apiError`/`ApiError` (pre-existing, `lib/authz.ts`).
- Produces:
  - `flattenFilePaths(nodes: FileNode[]): Set<string>` — exported from `lib/zip.ts`.
  - `dedupeUploadName(existingPaths: Set<string>, targetDir: string, name: string): string` — exported from `lib/zip.ts`. Returns `name` (joined with `targetDir`) unchanged if it doesn't collide; otherwise appends `-1`, `-2`, ... before the extension until it finds a free name.
  - `POST /api/files/upload` — multipart form fields `projectId` (string), `path` (string, target directory, `""` for root), `files` (one or more File entries) → `{ success: true, saved: string[] }` (the written paths) on success.

This route has no automated test (matching this repo's existing pattern: only `lib/*.ts` modules get colocated `bun:test` files — no API route has ever had one). The two pure helpers it depends on are extracted into `lib/zip.ts` specifically so the actual branching/looping logic (name collision handling) gets a real test, consistent with how `safeZipPath` already lives there and is tested in `zip.test.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/editor/lib/zip.test.ts`:

```ts
test("flattenFilePaths collects every path in a nested tree", () => {
  const tree = [
    { name: "main.tex", path: "main.tex", isDir: false },
    {
      name: "sections", path: "sections", isDir: true, children: [
        { name: "intro.tex", path: "sections/intro.tex", isDir: false },
      ],
    },
  ];
  const paths = flattenFilePaths(tree);
  expect(paths.has("main.tex")).toBe(true);
  expect(paths.has("sections")).toBe(true);
  expect(paths.has("sections/intro.tex")).toBe(true);
  expect(paths.size).toBe(3);
});

test("dedupeUploadName returns the plain name when there's no collision", () => {
  const existing = new Set(["main.tex"]);
  expect(dedupeUploadName(existing, "", "photo.png")).toBe("photo.png");
  expect(dedupeUploadName(existing, "assets", "photo.png")).toBe("assets/photo.png");
});

test("dedupeUploadName appends -1, -2, ... before the extension on collision", () => {
  const existing = new Set(["photo.png", "photo-1.png"]);
  expect(dedupeUploadName(existing, "", "photo.png")).toBe("photo-2.png");
});

test("dedupeUploadName handles extensionless names", () => {
  const existing = new Set(["Makefile"]);
  expect(dedupeUploadName(existing, "", "Makefile")).toBe("Makefile-1");
});
```

And update the import line at the top of `apps/editor/lib/zip.test.ts`:

```ts
import { expect, test } from "bun:test";
import { safeZipPath, flattenFilePaths, dedupeUploadName } from "./zip";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/editor && bun test lib/zip.test.ts`
Expected: the 4 new tests FAIL (`flattenFilePaths`/`dedupeUploadName` are not exported); the 2 pre-existing tests still pass.

- [ ] **Step 3: Implement the helpers**

In `apps/editor/lib/zip.ts`, replace the single existing import line:

```ts
import path from "path";
```

with:

```ts
import path from "path";
import type { FileNode } from "./storage";
```

Then append these two functions at the end of the file (after `safeZipPath`):

```ts
/** Collects every node's `path` in a file tree into a flat set, for O(1) collision checks. */
export function flattenFilePaths(nodes: FileNode[], out: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    out.add(node.path);
    if (node.children) flattenFilePaths(node.children, out);
  }
  return out;
}

/**
 * Returns a path (joined under targetDir) for `name` that isn't in existingPaths,
 * appending -1, -2, ... before the extension on collision. Never overwrites.
 */
export function dedupeUploadName(existingPaths: Set<string>, targetDir: string, name: string): string {
  const join = (n: string) => (targetDir ? `${targetDir}/${n}` : n);
  if (!existingPaths.has(join(name))) return join(name);

  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

  let counter = 1;
  let candidate = join(`${base}-${counter}${ext}`);
  while (existingPaths.has(candidate)) {
    counter++;
    candidate = join(`${base}-${counter}${ext}`);
  }
  return candidate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/editor && bun test lib/zip.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Write the upload route**

Create `apps/editor/app/api/files/upload/route.ts`:

```ts
import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { MAX_UPLOAD_BYTES, flattenFilePaths, dedupeUploadName } from "@/lib/zip";
import { checkRate } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    await checkRate("upload", 20, 60_000);
    const formData = await req.formData();
    const projectId = await requireProject(formData.get("projectId") as string | null);
    const targetDir = (formData.get("path") as string | null) ?? "";
    const files = formData.getAll("files") as File[];

    if (files.length === 0) throw new ApiError(400, "No files provided");

    const tree = await storage.listProjectFiles(projectId);
    const existingPaths = flattenFilePaths(tree);

    const saved: string[] = [];
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, `"${file.name}" is too large`);
      const destPath = dedupeUploadName(existingPaths, targetDir, file.name);
      existingPaths.add(destPath);
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.writeFile(projectId, destPath, buffer);
      saved.push(destPath);
    }

    return Response.json({ success: true, saved });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 6: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/editor/lib/zip.ts apps/editor/lib/zip.test.ts apps/editor/app/api/files/upload/route.ts
git commit -m "$(cat <<'EOF'
feat(editor): add /api/files/upload route

Mirrors the existing /api/project/import multipart pattern. Name
collisions auto-dedupe (photo.png -> photo-1.png) instead of silently
overwriting; the dedupe/flatten logic is pure and tested in zip.ts
since the route itself follows this repo's existing no-route-tests
convention.
EOF
)"
```

---

### Task 4: `FileTree` component — Duplicate/Download menu items + drag-and-drop

**Files:**
- Modify: `apps/editor/components/ai-elements/file-tree.tsx`

**Interfaces:**
- Consumes: nothing new — this task only adds optional props and internal handlers.
- Produces: `FileTreeProps` gains `onDuplicate?: (path: string) => void`, `onDownload?: (path: string) => void`, `onUploadFiles?: (files: FileList, targetDir: string) => void`. All optional, so existing callers (there's only one, `app/page.tsx`, updated in Task 5) keep compiling unchanged in the meantime.

- [ ] **Step 1: Update imports**

Replace the top imports in `apps/editor/components/ai-elements/file-tree.tsx`:

```ts
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  FileIcon,
  FileText,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  Edit2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { Tree } from "react-arborist";
import type { NodeRendererProps } from "react-arborist";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
```

with:

```ts
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  FileIcon,
  FileText,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  Edit2Icon,
  Trash2Icon,
  CopyIcon,
  DownloadIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { Tree } from "react-arborist";
import type { NodeRendererProps } from "react-arborist";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
```

- [ ] **Step 2: Extend `FileTreeProps` and the component signature**

Replace:

```ts
export type FileTreeProps = {
  data: FileNode[];
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onMove?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  className?: string;
};
```

with:

```ts
export type FileTreeProps = {
  data: FileNode[];
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onMove?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onDownload?: (path: string) => void;
  onUploadFiles?: (files: FileList, targetDir: string) => void;
  className?: string;
};
```

Replace the destructured props of the `FileTree` component:

```ts
export const FileTree = ({
  data,
  selectedPath,
  onSelect,
  onMove,
  onDelete,
  className,
}: FileTreeProps) => {
```

with:

```ts
export const FileTree = ({
  data,
  selectedPath,
  onSelect,
  onMove,
  onDelete,
  onDuplicate,
  onDownload,
  onUploadFiles,
  className,
}: FileTreeProps) => {
```

- [ ] **Step 3: Add drag-and-drop handlers (folder rows only)**

Per the approved design spec (§3D), OS file drops are only handled on folder rows and the tree's root container — not on file rows. A drop on a file row isn't given its own handler at all; it naturally bubbles up to the container's root-drop handler added in Step 5, so it still works (falls back to root) without any file-row-specific code.

Inside `NodeRenderer`, right after the existing `const isFolder = !node.isLeaf;` line, add:

```ts
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.add("bg-primary/10", "ring-1", "ring-primary/20");
    };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.classList.remove("bg-primary/10", "ring-1", "ring-primary/20");
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove("bg-primary/10", "ring-1", "ring-primary/20");
      if (e.dataTransfer.files.length > 0) {
        onUploadFiles?.(e.dataTransfer.files, node.id);
      }
    };
```

(`e.dataTransfer.types.includes("Files")` distinguishes an OS file drop from react-arborist's own internal drag-to-reorder, which doesn't carry a `Files` type — so this never intercepts the existing move/rename drag behavior. `stopPropagation` keeps a folder row's drop from also bubbling into the container-level handler added in Step 5. These three functions reference `node.id` directly, which is only correct as a drop target when the row is a folder — that's enforced in Step 4 by only attaching them to folder rows.)

- [ ] **Step 4: Wire the handlers onto folder rows only, and add the context menu items**

Replace the row `<div>`'s opening tag:

```tsx
          <div
            style={style}
            ref={dragHandle}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors font-mono text-sm group select-none relative",
              isSelected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              node.isDragging && "opacity-40",
              node.willReceiveDrop && "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
            )}
            onClick={handleClick}
          >
```

with:

```tsx
          <div
            style={style}
            ref={dragHandle}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors font-mono text-sm group select-none relative",
              isSelected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              node.isDragging && "opacity-40",
              node.willReceiveDrop && "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
            )}
            onClick={handleClick}
            {...(isFolder ? { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop } : {})}
          >
```

Replace the `ContextMenuContent` block:

```tsx
        <ContextMenuContent className="w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onClick={() => setTimeout(() => node.edit(), 50)} className="gap-2">
            <Edit2Icon className="size-3.5" />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDelete?.(node.id)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2Icon className="size-3.5" />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
```

with:

```tsx
        <ContextMenuContent className="w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onClick={() => setTimeout(() => node.edit(), 50)} className="gap-2">
            <Edit2Icon className="size-3.5" />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicate?.(node.id)} className="gap-2">
            <CopyIcon className="size-3.5" />
            <span>Duplicate</span>
          </ContextMenuItem>
          {!isFolder && (
            <ContextMenuItem onClick={() => onDownload?.(node.id)} className="gap-2">
              <DownloadIcon className="size-3.5" />
              <span>Download</span>
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onDelete?.(node.id)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2Icon className="size-3.5" />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
```

- [ ] **Step 5: Add drop-to-root handling on the tree container**

Replace the outer container `<div>`:

```tsx
    <div
      ref={containerRef}
      className={cn(
        "bg-background font-mono text-sm w-full h-full min-h-[400px]",
        className
      )}
      role="tree"
    >
```

with:

```tsx
    <div
      ref={containerRef}
      className={cn(
        "bg-background font-mono text-sm w-full h-full min-h-[400px]",
        className
      )}
      role="tree"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.currentTarget.classList.add("bg-primary/5");
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove("bg-primary/5");
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.currentTarget.classList.remove("bg-primary/5");
        if (e.dataTransfer.files.length > 0) {
          onUploadFiles?.(e.dataTransfer.files, "");
        }
      }}
    >
```

- [ ] **Step 6: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/editor/components/ai-elements/file-tree.tsx
git commit -m "$(cat <<'EOF'
feat(editor): add Duplicate/Download menu items and file drag-and-drop

Duplicate applies to files and folders (matches Rename/Delete already
applying to both); Download is file-only. Drop handlers check
dataTransfer.types for "Files" so OS file drops never intercept
react-arborist's own internal drag-to-move.
EOF
)"
```

---

### Task 5: `app/page.tsx` — handlers, Upload button, wiring

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/files` `action:"copy"` and `GET /api/files?download=1` (Task 2), `POST /api/files/upload` (Task 3), `FileTree`'s `onDuplicate`/`onDownload`/`onUploadFiles` props (Task 4).
- Produces: a working end-to-end feature — no further tasks depend on this one.

- [ ] **Step 1: Add the `Upload` icon import**

In the icon import block:

```ts
import { ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ArrowLeft, Clock, Trash2, Plus, Settings, Search, Download } from "lucide-react";
```

add `Upload`:

```ts
import { ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ArrowLeft, Clock, Trash2, Plus, Settings, Search, Download, Upload } from "lucide-react";
```

- [ ] **Step 2: Add the hidden file input ref**

Right after this existing line (~line 502):

```ts
  const [newItemName, setNewItemName] = useState<string>("");
```

add:

```ts
  const uploadInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Add the three handlers**

Right after the existing `handleFileDelete` callback (ends with `}, [projectId, selectedPath, refreshWorkspace]);` around line 1367), add:

```ts
  const handleFileDuplicate = useCallback(async (path: string) => {
    const exists = (candidate: string, nodes: FileNode[]): boolean => {
      for (const n of nodes) {
        if (n.path === candidate) return true;
        if (n.children && exists(candidate, n.children)) return true;
      }
      return false;
    };

    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
    const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

    let candidateName = `${base} copy${ext}`;
    let counter = 2;
    while (exists(dir ? `${dir}/${candidateName}` : candidateName, fileTree)) {
      candidateName = `${base} copy ${counter}${ext}`;
      counter++;
    }
    const newPath = dir ? `${dir}/${candidateName}` : candidateName;

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "copy", path, newPath }),
      });
      const data = await res.json();
      if (data.success) {
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to duplicate file", err);
    }
  }, [projectId, fileTree, refreshWorkspace]);

  const handleFileDownload = useCallback((path: string) => {
    const url = withProject(`/api/files?path=${encodeURIComponent(path)}&download=1`);
    const link = document.createElement("a");
    link.href = url;
    link.download = path.split("/").pop() || path;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [withProject]);

  const handleUploadFiles = useCallback(async (files: FileList, targetDir: string) => {
    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("path", targetDir);
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        refreshWorkspace();
      } else {
        toast.error(data.error || "Failed to upload files");
      }
    } catch (err) {
      console.error("Failed to upload files", err);
      toast.error("Failed to upload files");
    }
  }, [projectId, refreshWorkspace]);
```

(`handleFileDuplicate` deliberately matches `handleFileMove`/`handleFileDelete`'s silent-on-failure style — no `toast` — for consistency with its nearest siblings. `handleUploadFiles` uses `toast.error` because a multi-file drag-and-drop failing silently is a much bigger surprise than a single rename/delete failing silently, matching the approved design spec.)

- [ ] **Step 4: Add the toolbar Upload button and hidden input**

The current Project Files panel header is:

```tsx
            <div className="flex gap-1.5 items-center">
              <button
                type="button"
                onClick={() => handleCreateResourceSubmit(false)}
                className="p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                title="New File"
              >
                <FilePlus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateResourceSubmit(true)}
                className="p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                title="New Folder"
              >
                <FolderPlus className="size-3.5" />
              </button>
            </div>
```

Replace it with:

```tsx
            <div className="flex gap-1.5 items-center">
              <button
                type="button"
                onClick={() => handleCreateResourceSubmit(false)}
                className="p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                title="New File"
              >
                <FilePlus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateResourceSubmit(true)}
                className="p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                title="New Folder"
              >
                <FolderPlus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                title="Upload Files"
              >
                <Upload className="size-3.5" />
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUploadFiles(e.target.files, "");
                  }
                  e.target.value = "";
                }}
              />
            </div>
```

- [ ] **Step 5: Wire the new props into `<FileTree />`**

Replace:

```tsx
            <FileTree
              className="border-none"
              data={fileTree}
              onSelect={handleFileSelect}
              selectedPath={selectedPath}
              onMove={handleFileMove}
              onDelete={setDeletePath}
            />
```

with:

```tsx
            <FileTree
              className="border-none"
              data={fileTree}
              onSelect={handleFileSelect}
              selectedPath={selectedPath}
              onMove={handleFileMove}
              onDelete={setDeletePath}
              onDuplicate={handleFileDuplicate}
              onDownload={handleFileDownload}
              onUploadFiles={handleUploadFiles}
            />
```

- [ ] **Step 6: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Live browser verification**

Start the editor dev server and open it in the browser preview.
- If a signed-in session is already active in the preview: open a project, right-click a file → Duplicate (confirm a `<name> copy.<ext>` entry appears), right-click a file → Download (confirm the browser downloads it with real content, not `{"content":...}` JSON), click the new Upload toolbar button and pick a file (confirm it appears in the tree), and drag a file from the OS onto a folder row and onto empty tree space (confirm both land in the right place and show a drag-over highlight).
- If the preview hits the Clerk sign-in wall and no authenticated session is available: **say so explicitly** rather than claiming the feature was verified live — the `tsc` pass plus the Task 1 unit tests are what's actually been verified at that point.

- [ ] **Step 8: Commit**

```bash
git add apps/editor/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(editor): wire up file duplicate, download, and upload in the UI

Adds the Upload toolbar button (multi-file picker) alongside New
File/New Folder, and connects FileTree's new onDuplicate/onDownload/
onUploadFiles props to /api/files (copy, download=1) and the new
/api/files/upload route.
EOF
)"
```
