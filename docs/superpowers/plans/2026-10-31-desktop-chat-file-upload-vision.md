# Desktop AI Chat File Upload & Vision Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable direct file uploads (file picker, drag-and-drop, and clipboard paste) in SomeScript Desktop AI Chat, with automatic vision model detection and hybrid PDF handling (native documents for Claude/Gemini, local text extraction for others).

**Architecture:** 
- Frontend (`apps/tauri/src/chat`): `vision.ts` identifies model modalities; `file-attachment.ts` handles reading and local PDF parsing; `chat-thread.tsx` adds UI for drag/drop, picker, and image/document attachment chips.
- Backend (`apps/tauri/src-tauri/src/ai`): `protocol.rs` and `agent.rs` extend `Msg::User` to support multimodal parts for OpenAI (`image_url`) and Anthropic (`image` and `document`).

**Tech Stack:** React 19, TypeScript, Lucide-react, Rust, Axum, Serde, Bun, Tauri 2.

## Global Constraints
- Target workspace: `apps/tauri` and `apps/tauri/src-tauri`
- Do not edit active LaTeX project files in `apps/editor/my-new-project/`
- Zero external cloud services for PDF processing; everything runs 100% locally
- Must pass `cargo test` in `src-tauri` and `bun run typecheck` in `apps/tauri`

---

### Task 1: Backend Rust Protocol & History Support for Multimodal Attachments

**Files:**
- Modify: `apps/tauri/src-tauri/src/ai/protocol.rs`
- Modify: `apps/tauri/src-tauri/src/ai/agent.rs`
- Test: `apps/tauri/src-tauri/src/ai/protocol.rs` (unit tests)
- Test: `apps/tauri/src-tauri/src/ai/agent.rs` (unit tests)

**Interfaces:**
- Consumes: JSON array of messages from client containing `{ role: "user", text, attachments?: [{ name, text, type, url, mediaType }] }`
- Produces: `Msg::User(UserContent)` where `UserContent` carries text and optional binary/data parts; `openai_body` serializes `{ type: "image_url", image_url: { url } }`; `anthropic_body` serializes `{ type: "image", source: { type: "base64", media_type, data } }` and `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`.

- [ ] **Step 1: Write unit tests in `protocol.rs` for multimodal serialization**
- [ ] **Step 2: Update `Msg::User` in `protocol.rs` and adapt `openai_body` / `anthropic_body`**
- [ ] **Step 3: Update `history_from_client` in `agent.rs` to extract multimodal attachments**
- [ ] **Step 4: Run `cargo test` in `apps/tauri/src-tauri` to verify**
- [ ] **Step 5: Commit changes**

---

### Task 2: Frontend Vision Detection Module

**Files:**
- Create: `apps/tauri/src/chat/vision.ts`
- Create: `apps/tauri/src/chat/vision.test.ts`

**Interfaces:**
- Produces:
  - `isVisionModel(providerKind: string, modelName: string): boolean`
  - `supportsNativePdf(providerKind: string, modelName: string): boolean`

- [ ] **Step 1: Write unit tests in `vision.test.ts` for all provider and model patterns**
- [ ] **Step 2: Implement `vision.ts` with comprehensive model regex and rules**
- [ ] **Step 3: Run `bun test src/chat/vision.test.ts` in `apps/tauri`**
- [ ] **Step 4: Commit changes**

---

### Task 3: Frontend File Attachment & Hybrid PDF Processor

**Files:**
- Create: `apps/tauri/src/chat/file-attachment.ts`
- Create: `apps/tauri/src/chat/file-attachment.test.ts`
- Modify: `apps/tauri/src/chat/types.ts`

**Interfaces:**
- Modifies `Attachment` in `types.ts`:
  ```ts
  export interface Attachment {
    name: string;
    text: string;
    type?: "text" | "image" | "file";
    url?: string;
    mediaType?: string;
  }
  ```
- Produces `processUploadedFile(file: File, isVision: boolean, isNativePdf: boolean): Promise<Attachment | { error: string }>`

- [ ] **Step 1: Update `types.ts` with attachment fields**
- [ ] **Step 2: Write unit tests for `file-attachment.ts`**
- [ ] **Step 3: Implement `file-attachment.ts` supporting text, images, and local PDF extraction**
- [ ] **Step 4: Run `bun test src/chat/file-attachment.test.ts` in `apps/tauri`**
- [ ] **Step 5: Commit changes**

---

### Task 4: Frontend Chat Thread Composer Integration

**Files:**
- Modify: `apps/tauri/src/chat/chat-thread.tsx`

**Interfaces:**
- Integrates `vision.ts` and `file-attachment.ts`
- Adds:
  - Paperclip attachment button in composer toolbar
  - Hidden `<input type="file" multiple />`
  - Drag-and-drop zone with visual overlay on the chat window
  - Clipboard paste listener on chat textarea
  - Visual attachment preview chips with thumbnails for images and remove button
  - Sonner / UI toast notification when image/PDF is dropped on text-only model

- [ ] **Step 1: Add drag-and-drop state & handlers to `ChatThread` and `Composer`**
- [ ] **Step 2: Add Paperclip button and hidden file input**
- [ ] **Step 3: Add clipboard paste file handler**
- [ ] **Step 4: Render image thumbnail and file badge previews in Composer**
- [ ] **Step 5: Commit changes**

---

### Task 5: Comprehensive Verification & Regression Tests

- [ ] **Step 1: Run Rust test suite (`cargo test` in `src-tauri`)**
- [ ] **Step 2: Run Frontend test suite (`bun test` in `apps/tauri`)**
- [ ] **Step 3: Run TypeScript typecheck (`bun run typecheck`)**
- [ ] **Step 4: Run Vite build (`bun run web:build`)**
- [ ] **Step 5: Commit changes**
