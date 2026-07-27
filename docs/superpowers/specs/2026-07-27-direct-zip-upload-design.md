# Design Spec: Direct ZIP Upload on Dashboard

**Date**: 2026-07-27  
**Status**: Approved  
**Scope**: `apps/web/`

---

## 1. Overview

Users need a fast, frictionless way to create LaTeX projects by uploading `.zip` archives directly on the workspace dashboard. Currently, users must open an `Import ZIP` modal dialog, select a file, enter a name, and submit.

This feature enables **direct drag-and-drop file upload** on the dashboard page. Dropping one or more `.zip` files anywhere onto the dashboard instantly imports them into the active workspace with project names derived from the archive filenames.

---

## 2. Requirements & User Experience

### 2.1 Drag-and-Drop Interaction
- **Full-Viewport Drop Zone**: Dragging files over any area of the dashboard page triggers a visually rich, glassmorphic full-screen overlay ("Drop your LaTeX .zip project here").
- **Drag Counter Logic**: Handles HTML5 drag-and-drop counter tracking (`dragenter`, `dragleave`) to prevent flickering when hovering over nested DOM elements.
- **Visual Feedback**:
  - Dark backdrop overlay (`bg-background/80 backdrop-blur-md`).
  - Animated pulsing border (`border-2 border-dashed border-primary`).
  - Clear icon and callout text ("Release to import project(s)").

### 2.2 File Validation & Batch Processing
- **Extension Check**: Filters dropped files for `.zip` extensions (`file.name.endsWith('.zip')` or MIME type `application/zip`, `application/x-zip-compressed`).
- **Non-ZIP Warning**: Dropping invalid files triggers a Sonner error/warning toast (*"Only .zip files can be imported as LaTeX projects"*).
- **Batch Processing**: Supports dropping multiple `.zip` files at once. Each ZIP is processed asynchronously.
- **Automatic Naming**: Formats clean project names from file basenames:
  - `my-paper.zip` $\rightarrow$ `"my-paper"`
  - `thesis_final_v2.zip` $\rightarrow$ `"thesis final v2"`

### 2.3 Progress & Feedback
- **Toast Notifications**:
  - Shows loading toast for each importing file (`"Importing project..."`).
  - Shows success toast when import completes (`"Project 'my-paper' imported successfully!"`).
  - Shows error toast if a file fails to import (`"Failed to import 'my-paper': error details"`).
- **Dashboard Refresh**: Calls `revalidatePath('/dashboard')` in the server action, updating the projects table in real-time.

---

## 3. Architecture & Component Structure

```
apps/web/
├── components/
│   └── dashboard-dropzone.tsx    # Client component for drag-and-drop state, overlay, & batch upload
└── app/dashboard/
    ├── page.tsx                  # Server component wrapping page content with <DashboardDropzone>
    └── actions.ts               # Server action `importProject` (existing)
```

### Component Details: `DashboardDropzone`
- **Type**: Client Component (`"use client"`).
- **Props**: `children: React.ReactNode`.
- **State**:
  - `isDragging: boolean`: Controls rendering of the overlay UI.
  - `dragCounter: number`: Internal ref/state to count enter/leave events.
  - `isUploading: boolean`: Global loading state for drag-and-drop uploads.
- **Upload Handler**:
  - Constructs `FormData` with `name` and `file`.
  - Invokes `importProject(formData)` server action.
  - Manages Sonner toast lifecycle.

---

## 4. Error Handling & Edge Cases

| Scenario | Behavior |
| --- | --- |
| Dragging text/links (non-files) | Ignored; overlay only triggers when `e.dataTransfer.types` includes `"Files"`. |
| Dropping non-ZIP files | Shows toast: `"Only .zip files can be imported as LaTeX projects"`. |
| Empty ZIP file (0 bytes) | Server action catches and returns error toast: `"ZIP file is required"`. |
| Workspace limit reached | `assertProjectLimit` returns error toast gracefully without crashing. |
| Unauthenticated / Session expired | Server action returns `"Unauthorized"`. |

---

## 5. Verification Plan

1. **Single ZIP Drag & Drop**: Drag a single `.zip` file onto the dashboard page. Verify overlay displays, file uploads, project appears in projects table with correct name, and toast succeeds.
2. **Multiple ZIP Batch Drop**: Drag 3 `.zip` files simultaneously. Verify all 3 projects are imported and listed.
3. **Non-ZIP File Drop**: Drag a `.pdf` or `.png` file. Verify warning toast is shown and no project is created.
4. **Empty State Drop**: Test drag and drop when workspace has 0 projects. Verify project list populates immediately.
