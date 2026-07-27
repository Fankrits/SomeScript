# Design Spec: File Tree Context Menu — Duplicate, Download, Upload

**Date**: 2026-07-27
**Target Workspace**: `apps/editor`

---

## 1. Goal

Extend the editor's file tree (`components/ai-elements/file-tree.tsx`, rendered in `app/page.tsx`) so users can:
1. Duplicate a file or folder from its context menu.
2. Download a file from its context menu.
3. Upload files into the project — both via a toolbar button and by dragging files from the OS onto the tree.

## 2. Current State (verified by reading the code)

- The file tree's context menu (`NodeRenderer` in `file-tree.tsx`) only offers **Rename** and **Delete**, wired to `onMove`/`onDelete` props from `page.tsx`.
- `POST /api/files` (`app/api/files/route.ts`) supports `action: "create" | "save" | "move" | "delete"` only — no copy action.
- `GET /api/files` serves PDFs and known image extensions as raw bytes; every other file (including `.tex`) comes back as `{ content: "..." }` JSON, which is not directly downloadable as a file.
- `StorageProvider` (`lib/storage.ts`) has `readFile`, `readBinaryFile`, `writeFile`, `createDirectory`, `move`, `delete`, `listProjectFiles` — no `copy`.
- There is **no per-file upload path in the editor at all**. The only upload capability in the repo is whole-project `.zip` import (`app/api/project/import/route.ts`), triggered from the dashboard in `apps/web`, outside the editor entirely.
- The "New File" / "New Folder" toolbar buttons (`app/page.tsx`, ~line 1841) always create at project root with an auto-incremented name (`untitled.tex`, `untitled-1.tex`, ...) via a dedupe loop in `handleCreateResourceSubmit`; there is no per-folder "create inside this folder" today.
- `handleDownloadPdf` (`app/page.tsx`, ~line 1498) is the existing precedent for triggering a browser download: build a URL to `/api/files`, create a temporary `<a download>`, click it, remove it.
- `app/api/project/export/route.ts` (`type=zip`) is the existing precedent for zipping a subtree with `jszip`, but it zips the *whole* project — out of scope to generalize to arbitrary folders (see §5).
- Auth: `requireProject()` (`lib/authz.ts`) already gates every file mutation to the signed-in owner of the project's workspace. There is no separate read-only role, so no new permission logic is needed for copy/upload/download — the existing gate is sufficient.
- Rate limiting precedent: `app/api/project/import/route.ts` calls `checkRate("import", 5, 60_000)` before handling an upload.
- Size limit precedent: `MAX_UPLOAD_BYTES = 250 * 1024 * 1024` in `lib/zip.ts`.
- Test precedent: only `lib/*.ts` modules have colocated `bun:test` files (e.g. `lib/storage.test.ts`); there are no tests for API route handlers or for `file-tree.tsx` today.

## 3. Changes Summary

### A. `lib/storage.ts`
- Add `copy(projectId, srcPath, destPath): Promise<void>` to the `StorageProvider` interface.
- `LocalStorageProvider.copy`: resolve both paths via the existing `getLocalPath` guard, `fs.mkdir` the destination's parent, then `fs.cp(src, dest, { recursive: true })` (works for both a single file and a directory tree).
- `S3StorageProvider.copy`: same list-and-`CopyObjectCommand` loop `move()` already uses, minus the trailing `DeleteObjectCommand` call. Implemented as its own method (not refactored to share code with `move`) to avoid any behavior risk to the existing move path.

### B. `app/api/files/route.ts`
- POST: add `action === "copy"` — takes `path` (source) and `newPath` (destination, computed client-side), calls `storage.copy(projectId, path, newPath)`.
- GET: add a `download` query flag. When `download=1` is present, always serve the file via `readBinaryFile` (bypassing the current image/PDF/text branching) with headers `Content-Disposition: attachment; filename="<basename>"` and the same `Content-Type` resolution already used for images/PDFs, defaulting to `application/octet-stream` otherwise. Behavior without the flag is unchanged.

### C. New `app/api/files/upload/route.ts`
Mirrors the structure of `app/api/project/import/route.ts`:
- `checkRate("upload", 20, 60_000)`.
- `formData()` POST with fields: `projectId`, `path` (target directory, `""` for root), one or more `files` entries (`formData.getAll("files")`).
- Per file: reject if `file.size > MAX_UPLOAD_BYTES` (reused from `lib/zip.ts`, `413` on violation); compute a collision-free destination name by calling `storage.listProjectFiles(projectId)` once per request (this route has no access to client React state) and checking candidate names against the target directory's existing entries (same dedupe approach as `handleCreateResourceSubmit`: `photo.png` → `photo-1.png` → `photo-2.png`, never silently overwrite); `storage.writeFile(projectId, destPath, Buffer.from(await file.arrayBuffer()))`.
- Returns `{ success: true }`; the client refetches the tree (no auto-open of uploaded files, matching that "New File" doesn't auto-open either).

### D. `components/ai-elements/file-tree.tsx`
- Add props: `onDuplicate?: (path: string) => void`, `onDownload?: (path: string) => void`, `onUploadFiles?: (files: FileList, targetDir: string) => void`.
- Context menu: add **Duplicate** (`Copy` icon) for both files and folders, and **Download** (`Download` icon) for files only — per the approved scope, folders don't get a Download entry. Add a `<ContextMenuSeparator />` before the destructive **Delete** item so it's visually set apart from the new non-destructive actions.
- Native OS drag-and-drop: `onDragOver` / `onDragLeave` / `onDrop` handlers on each folder row and on the tree's outer container (drop-to-root). Guard with `e.dataTransfer.types.includes("Files")` so this never intercepts react-arborist's own internal drag-to-move handling for reordering tree nodes. On drop, call `onUploadFiles(e.dataTransfer.files, targetDir)`. Reuse the existing `willReceiveDrop` visual treatment for the drag-over affordance.

### E. `app/page.tsx`
- `handleFileDuplicate(path)`: compute a "copy" name using the same `exists()`-loop dedupe style as `handleCreateResourceSubmit` (`sections/intro.tex` → `sections/intro copy.tex` → `sections/intro copy 2.tex`), `POST /api/files` with `action: "copy"`, then `refreshWorkspace()`.
- `handleFileDownload(path)`: same shape as `handleDownloadPdf` — build `/api/files?path=...&projectId=...&download=1`, create a temporary `<a download>`, click, remove.
- `handleUploadFiles(files, targetDir)`: build `FormData` (`projectId`, `path: targetDir`, each file appended as `files`), `POST /api/files/upload`, `toast.error(...)` on failure (matching the existing `toast` usage), `refreshWorkspace()` on success.
- New toolbar **Upload** icon button next to the existing New File / New Folder buttons: opens a hidden `<input type="file" multiple>` and forwards the selected `FileList` to `handleUploadFiles(files, "")` — uploads from this button always land at project root, matching New File/New Folder's existing root-only convention.
- Pass `onDuplicate`, `onDownload`, `onUploadFiles` through to `<FileTree />`.

## 4. Defaults Applied (flagged, not asked)

- **Duplicate scope**: files *and* folders (recursive copy) — kept symmetric with Rename/Delete, which already apply to both.
- **Upload collisions**: auto-dedupe (`photo.png` → `photo-1.png`), never silent overwrite.
- **Upload size cap**: reuses the existing `MAX_UPLOAD_BYTES` (250MB) constant rather than introducing a second limit.
- **Upload destination**: toolbar button → project root (matches New File/New Folder); drag-and-drop onto a folder row → that folder; drag-and-drop onto empty tree space → project root.

## 5. Out of Scope

- Downloading a folder as a `.zip` (approved as files-only for this pass; the whole-project zip export already covers the "everything" case).
- Dragging whole OS folders (with nested contents) onto the tree — only flat file drops are handled; a dropped folder is silently skipped by the browser's file-drop API, no special-cased error handling added for it.
- Any new permission/role model — the existing `requireProject()` owner check is reused unchanged for copy/upload/download.

## 6. Testing / Verification Plan

- `lib/storage.test.ts`: add `bun:test` cases for `LocalStorageProvider.copy` — copying a file leaves the original intact and creates the duplicate; a directory-traversal attempt in either path argument is rejected (same style as the existing traversal tests in that file).
- Manual verification via the dev server browser preview: right-click → Duplicate and → Download on a file; drag a file from the OS onto a folder row and onto empty tree space; click the new Upload button and pick multiple files.
- `cd apps/editor && bun x tsc --noEmit` after the `page.tsx` / `file-tree.tsx` / route changes, per this repo's required type-check step.
- No new test scaffolding for API route handlers or for `file-tree.tsx` itself — neither has any test coverage today, and adding a first-of-its-kind harness for one feature isn't warranted here.
