# Spec: VS Code Style Code Search and Replace Tab

Add a sidebar search tab and backend search/replace API to the LaTeX editor workspace.

## 1. Requirements

- **Visuals**: A clean, VS Code-like side panel featuring input search field, match options (match case, whole word, regex), file/scope selectors (current vs all files), line range limits (from/to), a replace input, and collapsible results grouped by file with line numbers.
- **Search Scope**: Search across all project files or restrict to the active file.
- **Replace Scope**: Replace all search matches globally or in the current file.
- **Keyboard Shortcuts**: `Cmd+F` or `Ctrl+F` should trigger the search sidebar and focus search input.
- **Navigation**: Clicking a search result item opens that file in the editor and jumps/scrolls the cursor to that line.

## 2. Architecture & Components

### 2.1 Backend API Route (`/api/search`)

A new API route: `apps/editor/app/api/search/route.ts`

#### GET `/api/search`
Queries all non-binary text files under the active project.
- **Inputs**:
  - `query` (string)
  - `matchCase` (boolean)
  - `matchWholeWord` (boolean)
  - `useRegex` (boolean)
  - `scope` (`"all" | "current"`)
  - `selectedPath` (string, required if scope is `"current"`)
  - `startLine` (number)
  - `endLine` (number)
- **Output JSON**:
  ```json
  {
    "results": [
      {
        "fileId": "main.tex",
        "fileName": "main.tex",
        "line": 42,
        "text": "This is a match line content",
        "matchIndex": 10
      }
    ]
  }
  ```

#### POST `/api/search`
Applies replacements.
- **Inputs**:
  - `query` (string)
  - `replaceText` (string)
  - `matchCase` (boolean)
  - `matchWholeWord` (boolean)
  - `useRegex` (boolean)
  - `scope` (`"all" | "current"`)
  - `selectedPath` (string, required if scope is `"current"`)
- **Output JSON**:
  ```json
  {
    "success": true,
    "count": 5
  }
  ```

### 2.2 Frontend Components

- **`apps/editor/components/editor/search-panel.tsx`**: Renders inputs, handles keypresses, calls the backend APIs, handles local state for expanding/collapsing results, and fires callbacks.
- **`apps/editor/app/page.tsx`**: Modifies the side sidebar tabs to include the Search tab, handles the layout, handles `pendingLineJump` to scroll CodeMirror, and triggers file updates/reloads when files are modified by global replacements.
