# Design Specification: Desktop AI Chat File Upload & Vision Model Support

**Date:** 2026-10-31  
**Target:** `apps/tauri` (SomeScript Desktop)  
**Status:** Approved for Implementation  

---

## 1. Overview

SomeScript Desktop features a local Bring-Your-Own-Key (BYOK) AI assistant running on a local Rust (`src-tauri`) HTTP server and a Vite/React webview. While the web editor had an Eve-backed file attachment system, the desktop chat lacked file upload capabilities (paperclip button, drag-and-drop, clipboard paste) and could only send text.

This specification defines the architecture for:
1. **File Upload Entrypoints**: File input button (Paperclip), drag-and-drop onto the chat thread, and clipboard paste.
2. **Vision Model Detection**: Identifying whether the currently active model is a multimodal/vision model across BYOK providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio, custom endpoints).
3. **Hybrid File & PDF Ingestion**:
   - Text documents (`.tex`, `.bib`, `.txt`, `.md`, `.json`, `.csv`, `.py`, `.ts`, `.log`, etc.) read into text attachments readable by any model.
   - Images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) read as base64 data URLs for vision models; guarded with a clear toast notification when attempted on text-only models.
   - PDFs: Hybrid approach — native base64 document attachments for models supporting native documents (Anthropic Claude 3+, Gemini), and local text extraction for models requiring text (GPT-4o or text-only models).
4. **Multimodal Protocol Serialization in Rust**:
   - Updating `Msg::User` in `src-tauri/src/ai/protocol.rs` and `agent.rs`.
   - Formatting `image_url` for OpenAI-compatible providers.
   - Formatting `image` and `document` blocks for Anthropic providers.

---

## 2. Architecture & Component Breakdown

### 2.1 Frontend (`apps/tauri/src/chat/`)

```
apps/tauri/src/chat/
├── vision.ts              # Model capability detector (isVisionModel, supportsNativePdf)
├── vision.test.ts         # Unit tests for vision heuristics across providers
├── file-attachment.ts     # File reader (text, image data URL, local PDF extraction)
├── file-attachment.test.ts# Unit tests for file attachment parsing
├── types.ts               # Enhanced Attachment interface with type, url, mediaType
├── chat-thread.tsx        # Composer with Paperclip, Dropzone, Paste, and Attachment pills
└── use-chat.ts            # Passes full attachment array to /api/ai/chat
```

### 2.2 Backend (`apps/tauri/src-tauri/src/ai/`)

```
apps/tauri/src-tauri/src/ai/
├── protocol.rs            # Extended Msg::User with multimodal UserPart (Text, Image, Document)
│                          # openai_body with image_url
│                          # anthropic_body with image and document blocks
└── agent.rs               # history_from_client parses { name, text, type, url, mediaType }
```

---

## 3. Vision Model Detection Logic (`vision.ts`)

### 3.1 Rules & Heuristics
A model is classified as a vision model via `isVisionModel(providerKind, modelName, providerHint)`:
- **Anthropic**: Every model matching `claude-3*`, `claude-sonnet*`, `claude-opus*`, `claude-haiku*` is multimodal.
- **OpenAI**: `gpt-4o*`, `gpt-4-turbo*`, `gpt-4-vision*`, `o1` (excluding `o1-mini`), `chatgpt-4o*`.
- **Google Gemini**: `gemini-1.5*`, `gemini-2.0*`, `gemini-2.5*`, `gemini-exp*`.
- **Open-source / Local / Gateway**: Any model whose identifier (case-insensitive) matches:
  - `-vision`, `vision-`, `_vision`, `vision`
  - `-vl`, `vl-`, `_vl`, `vl`
  - `llava`, `bakllava`, `pixtral`, `minicpm-v`, `internvl`, `cogvlm`, `mistral-small-3`
  - `llama-3.2-*vision*`, `qwen-vl*`, `qwen2-vl*`, `qwen2.5-vl*`

### 3.2 Native PDF Support
`supportsNativePdf(providerKind, modelName)`:
- True for Anthropic Claude 3+ (`claude-3-5-sonnet`, `claude-3-opus`, `claude-3-haiku`, etc.).
- True for Gemini models on Google AI / OpenRouter (`gemini-1.5*`, `gemini-2.0*`, `gemini-2.5*`).

---

## 4. File Attachment Ingestion (`file-attachment.ts`)

### 4.1 Ingestion Flow
When files are selected via picker, dropped, or pasted:
1. **Text Files** (`.tex`, `.bib`, `.txt`, `.md`, `.json`, `.csv`, `.py`, `.js`, `.ts`, `.rs`, `.toml`, `.log`, etc.):
   - Read via `FileReader.readAsText`.
   - Truncated at `MAX_ATTACHMENT_CHARS = 200_000`.
   - Attachment: `{ name, text, type: "text" }`.
2. **Image Files** (`image/png`, `image/jpeg`, `image/webp`, `image/gif`):
   - Check `isVisionModel(provider, model)`.
   - If not vision: Toast warning *"Selected model does not support images. Switch to a vision model (e.g. GPT-4o, Claude 3.5, Gemini 1.5, LLaVA)."*
   - If vision: Read via `FileReader.readAsDataURL`.
   - Attachment: `{ name, text: "", type: "image", url, mediaType }`.
3. **PDF Documents** (`application/pdf`):
   - If `supportsNativePdf(provider, model)`:
     - Read via `FileReader.readAsDataURL`.
     - Attachment: `{ name, text: "", type: "file", url, mediaType: "application/pdf" }`.
   - If not native PDF:
     - Extract text locally using client-side PDF parser (e.g., standard text extraction from PDF streams).
     - Attachment: `{ name, text: extractedText, type: "text" }`.

---

## 5. Rust Backend Multimodal Payloads

### 5.1 Attachment Representation in Rust
In `agent.rs`:
```rust
#[derive(Clone, Debug, PartialEq)]
pub enum UserPart {
    Text(String),
    Image { media_type: String, data: String },
    Document { media_type: String, data: String },
}

#[derive(Clone, Debug, PartialEq)]
pub enum Msg {
    User(Vec<UserPart>),
    Assistant { text: String, calls: Vec<ToolCall> },
    Tool { call_id: String, name: String, content: String },
}
```

### 5.2 OpenAI Wire Format (`protocol.rs`)
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "user prompt text with any text attachments formatted" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```
*(If only text is present, fallback to `"content": "string"` for strict OpenAI-compatible servers).*

### 5.3 Anthropic Wire Format (`protocol.rs`)
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "user prompt text" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } },
    { "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "..." } }
  ]
}
```

---

## 6. UI Implementation (`chat-thread.tsx`)

1. **Dropzone**:
   - `onDragOver` / `onDragLeave` / `onDrop` on the container with visual drag overlay.
2. **Composer Toolbar**:
   - `<Button size="icon-sm" variant="ghost" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /></Button>`.
   - Hidden `<input type="file" ref={fileInputRef} multiple ... />`.
3. **Paste Support**:
   - `onPaste` on the textarea inspects `e.clipboardData.files`.
4. **Attachment Pills**:
   - Render image thumbnail (`<img src={att.url} />`) for images.
   - Render `<FileText />` for text/pdf.
   - File name and remove button (`<X />`).

---

## 7. Verification & Testing

1. **Rust Tests**:
   - `cargo test` in `src-tauri` testing `openai_body` and `anthropic_body` with multimodal parts, and `history_from_client` parsing image/document attachments.
2. **Frontend Tests**:
   - `bun test` in `apps/tauri` testing `vision.test.ts` and `file-attachment.test.ts`.
3. **Typecheck**:
   - `bun run typecheck` across `apps/tauri`.
4. **Build Verification**:
   - `bun run web:build` in `apps/tauri`.
