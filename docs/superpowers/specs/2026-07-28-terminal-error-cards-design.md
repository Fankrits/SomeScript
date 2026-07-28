# Design Specification: Terminal Log & Error Cards UI

**Date**: 2026-07-28  
**Status**: Approved  
**Scope**: `apps/editor`  

## 1. Overview
The LaTeX Editor currently renders compiler logs in a raw ANSI terminal panel (`TerminalContent`). When compilation fails, users have to parse dense terminal text manually to locate syntax errors. 

This design introduces a **View Toggle** (Raw Log vs. Error Cards) in the bottom terminal panel. In Error Cards mode, parsed LaTeX compile errors are rendered as visual cards with direct code jumping, error severity indicators, and AI assistant actions.

---

## 2. Components & Architecture

### 2.1 `TerminalLogViewer` Component
A wrapper component located at `apps/editor/components/editor/terminal-log-viewer.tsx` replacing direct `<Terminal>` usage in `apps/editor/app/page.tsx`.

#### Props:
- `output: string` — Raw ANSI compiler output log.
- `isStreaming?: boolean` — Whether compilation is currently in progress.
- `compilePath: string` — Current main `.tex` file path (used for error parsing context).
- `onSelectError?: (file: string, line: number) => void` — Callback to jump editor cursor to error location.
- `onSendToChat?: (text?: string) => void` — Callback to send log/error context to Eve AI thread.
- `onClear?: () => void` — Clear log output callback.

#### State:
- `viewMode: 'cards' | 'raw'` — Active view mode. Defaults to `'cards'` if errors exist, otherwise persists user selection.

---

## 3. UI/UX Details

### 3.1 Header Toolbar Switcher
In the top right of the terminal header bar:
- **Segmented Control**: `[ 💻 Raw Log | 🗂️ Error Cards (N) ]`
  - Shows error count badge `(N)` when errors exist.
- **Action Buttons**:
  - `Send to chat` button.
  - `Copy` log button.
  - `Clear` log button.

### 3.2 Error Card View Rendering
When `viewMode === 'cards'`:
1. **Summary Banner**:
   - `X Errors found` badge when compile errors exist.
   - `Compilation Succeeded` banner with green checkmark when output is clean.
2. **Card Components**:
   - **Header**: Red Alert Icon, File path pill (e.g. `main.tex`), Line number pill (`Line 42`).
   - **Body**: Clean error message extracted via `parseCompileErrors()`.
   - **Actions**:
     - `Jump to Line` button: Focuses file and moves cursor directly to the line in CodeMirror.
     - `Ask Eve` button: Formats prompt `"Fix error in main.tex line 42: <message>"` and sends to chat.
3. **Fallback to Raw Output**:
   - A quick link at the bottom of the card list: `"View raw terminal output ->"` to switch back to ANSI log anytime.

---

## 4. Implementation Plan Summary
1. Create `apps/editor/components/editor/terminal-log-viewer.tsx`.
2. Extract error parsing logic into memoized errors array using `parseCompileErrors`.
3. Integrate `TerminalLogViewer` inside `terminalPane` in `apps/editor/app/page.tsx`.
4. Connect editor line jump handler `handleSelectMatch` / `handleJumpToError`.
5. Run `bun x tsc --noEmit` in `apps/editor` to ensure type safety.

---

## 5. Verification Checklist
- [ ] Raw terminal view retains ANSI color formatting.
- [ ] Toggling to Cards view cleanly displays parsed compile errors.
- [ ] Clicking an error card opens the file and moves the editor cursor to the error line.
- [ ] "Ask Eve" button correctly populates AI chat.
- [ ] TypeScript compilation passes cleanly (`bun x tsc --noEmit`).
