"use client";

import {
  FileTree,
} from "@/components/ai-elements/file-tree";
import { Terminal, TerminalContent } from "@/components/ai-elements/terminal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Scissors, Copy, ClipboardPaste, TextCursor, Undo2, Redo2, FileText } from "lucide-react";
import { ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ArrowLeft, Clock, Trash2, Plus, Settings, Search, Download, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useDefaultLayout } from "react-resizable-panels";
import { useEveAgent } from "eve/react";
import { SearchPanel, SearchPanelHandle } from "@/components/editor/search-panel";
import { TasksPanel, TasksPanelHandle } from "@/components/editor/tasks-panel";
import type { Task } from "@/lib/tasks";
import { search as searchExtension, SearchQuery, setSearchQuery } from "@codemirror/search";
import nextDynamic from "next/dynamic";

// The PDF stack (embedpdf + the ~3.5MB pdfium.wasm it fetches from the CDN) is only
// needed once a compile produces a PDF, so it stays out of the initial editor bundle.
const PdfPreview = nextDynamic(() => import("@/components/editor/pdf-preview"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
      Loading PDF Engine...
    </div>
  ),
});

// assistant-ui + the Eve runtime are the heaviest imports on this page, and the chat
// panel starts hidden behind a tab. Splitting them out lets the editor paint and
// hydrate without them; the thread still mounts on its own right after, so the
// "somescript:attach-to-chat" listener is in place before anything can fire it.
const EveThread = nextDynamic(
  () => import("@/components/chat/eve-thread").then((m) => m.EveThread),
  { ssr: false }
);

// Custom VS Code style Layout Toggle Icons
const LayoutIconLeft = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-4.5">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 1.5V14.5" stroke="currentColor" strokeWidth="1.5" />
    {active && <rect x="2.25" y="2.25" width="2.5" height="11.5" fill="currentColor" opacity="0.8" />}
  </svg>
);

const LayoutIconBottom = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-4.5">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 10.5H14.5" stroke="currentColor" strokeWidth="1.5" />
    {active && <rect x="2.25" y="11.25" width="11.5" height="2.5" fill="currentColor" opacity="0.8" />}
  </svg>
);

const LayoutIconRight = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-4.5">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 1.5V14.5" stroke="currentColor" strokeWidth="1.5" />
    {active && <rect x="11.25" y="2.25" width="2.5" height="11.5" fill="currentColor" opacity="0.8" />}
  </svg>
);
import CodeMirror, { EditorView, type ViewUpdate } from "@uiw/react-codemirror";
import { undo, redo, undoDepth, redoDepth, selectAll } from "@codemirror/commands";
import { wrapInsert, activeFormats } from "@/lib/latex-insert";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { CommandPalette } from "@/components/editor/command-palette";
import { ImageViewer } from "@/components/editor/image-viewer";
import { latex } from "codemirror-lang-latex";
import { useCodeMirrorExtensions } from "@/hooks/use-codemirror-extensions";
import Image from "next/image";


import type { BundledLanguage } from "shiki";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pickDetectedMainFile } from "@/lib/main-file";


// Types
interface MockFile {
  path: string;
  name: string;
  language: BundledLanguage;
  content: string;
}

interface MessageType {
  key: string;
  from: "user" | "assistant";
  content: string;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

// Mock file contents
const mockFiles: MockFile[] = [
  {
    content: `import { useState } from "react";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { validateForm } from "./utils/helpers";

export function App() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    const validation = validateForm({ name, email });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    console.log("Form submitted:", { name, email });
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Contact Form</h1>
      <Input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {errors.map((error) => (
        <p key={error} className="text-red-500">{error}</p>
      ))}
      <Button onClick={handleSubmit}>Submit</Button>
    </div>
  );
}`,
    language: "tsx",
    name: "app.tsx",
    path: "src/app.tsx",
  },
  {
    content: `import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../utils/helpers";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          "transition-colors focus-visible:outline-none focus-visible:ring-2",
          variant === "primary" && "bg-blue-500 text-white hover:bg-blue-600",
          variant === "secondary" && "bg-gray-200 text-gray-900 hover:bg-gray-300",
          variant === "ghost" && "hover:bg-gray-100",
          size === "sm" && "h-8 px-3 text-sm",
          size === "md" && "h-10 px-4",
          size === "lg" && "h-12 px-6 text-lg",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";`,
    language: "tsx",
    name: "button.tsx",
    path: "src/components/button.tsx",
  },
  {
    content: `import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../utils/helpers";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2",
          error ? "border-red-500" : "border-gray-300",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";`,
    language: "tsx",
    name: "input.tsx",
    path: "src/components/input.tsx",
  },
  {
    content: `export function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface FormData {
  name: string;
  email: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateForm(data: FormData): ValidationResult {
  const errors: string[] = [];

  if (!data.name.trim()) {
    errors.push("Name is required");
  }

  if (!data.email.trim()) {
    errors.push("Email is required");
  } else if (!isValidEmail(data.email)) {
    errors.push("Invalid email format");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}`,
    language: "typescript",
    name: "helpers.ts",
    path: "src/utils/helpers.ts",
  },
  {
    content: `{
  "name": "my-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "lint": "eslint src"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}`,
    language: "json",
    name: "package.json",
    path: "package.json",
  },
  {
    content: `# My App

A simple React application with form validation.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

- Contact form with validation
- Reusable Button and Input components
- TypeScript support
`,
    language: "markdown",
    name: "README.md",
    path: "README.md",
  },
];

// Mock chat messages
const mockMessages: MessageType[] = [
  {
    content: "Can you help me add email validation to the form?",
    from: "user",
    key: nanoid(),
  },
  {
    content: `I can help you add email validation. Looking at your code in \`src/utils/helpers.ts\`, I see you already have a \`validateForm\` function.

Here's what I'll do:

1. Add an \`isValidEmail\` helper function
2. Update \`validateForm\` to check email format
3. Show validation errors in the UI

The email validation uses a regex pattern to check for valid email format. The form will now show "Invalid email format" if the user enters an incorrectly formatted email address.`,
    from: "assistant",
    key: nanoid(),
  },
];

// Mock terminal output
const mockTerminalLines = [
  "\u001B[32m✓\u001B[0m Initializing Tectonic LaTeX environment...",
  "\u001B[36m  Loading core engines\u001B[0m: XeTeX, BibTeX, xdvipdfmx",
  "\u001B[36m  Connecting packages cache\u001B[0m: tectonic-cache-repo",
  "",
  "\u001B[32m✓\u001B[0m LaTeX system ready in \u001B[33m0.8s\u001B[0m",
  "",
  "System Status: IDLE",
  "Click 'Compile' on any .tex file to build and render the PDF document.",
];

// SSR-safe storage for useDefaultLayout — its getServerSnapshot touches localStorage directly.
const layoutStorage = {
  getItem: (key: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};

// Skeleton shown until the client mounts and the layout is restored from localStorage.
// Mirrors the real layout so there's no shift when the editor appears.
const SkeletonRow = ({ width }: { width: string }) => (
  <div className="h-3 rounded bg-muted/50" style={{ width }} />
);

const EditorSkeleton = () => (
  <div className="flex flex-col h-screen w-screen bg-background overflow-hidden animate-pulse">
    <header className="flex items-center justify-between border-b px-4 h-14 shrink-0">
      <div className="flex items-center gap-3">
        <div className="h-7 w-24 rounded-md bg-muted" />
        <div className="h-4 w-px bg-border" />
        <div className="h-5 w-40 rounded bg-muted/70" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-9 w-20 rounded-md bg-muted" />
        <div className="h-9 w-28 rounded-md bg-muted/60" />
      </div>
    </header>
    <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="h-11 border-b flex items-center gap-1 px-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 h-7 rounded bg-muted/60" />
          ))}
        </div>
        <div className="p-3 space-y-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 14}px` }}>
              <div className="size-3.5 rounded-sm bg-muted/70 shrink-0" />
              <SkeletonRow width={`${45 + ((i * 13) % 40)}%`} />
            </div>
          ))}
        </div>
      </div>
      {/* Center: editor + pdf, terminal below */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r flex flex-col">
            <div className="h-10 border-b flex items-center gap-2 px-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="size-6 rounded bg-muted/50" />
              ))}
            </div>
            <div className="flex-1 p-4 space-y-2.5">
              {Array.from({ length: 16 }).map((_, i) => (
                <SkeletonRow key={i} width={`${25 + ((i * 17) % 60)}%`} />
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col bg-muted/5">
            <div className="h-11 border-b flex items-center justify-between px-3">
              <div className="h-7 w-20 rounded-md bg-muted/50" />
              <div className="h-7 w-24 rounded-md bg-muted/50" />
              <div className="h-7 w-7 rounded-md bg-muted/50" />
            </div>
            <div className="flex-1 flex items-start justify-center p-6">
              <div className="w-full max-w-[420px] aspect-[1/1.3] rounded bg-muted/40" />
            </div>
          </div>
        </div>
        <div className="h-40 border-t p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} width={`${40 + ((i * 23) % 50)}%`} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const SIDEBAR_TABS = [
  { id: "files", label: "Files", Icon: FolderPlus },
  { id: "chat", label: "Agent", Icon: Sparkles },
  { id: "search", label: "Search", Icon: Search },
  { id: "tasks", label: "Tasks", Icon: ListTodoIcon },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;

const Example = () => {
  // File tree state
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);

  // Single source of truth for the active project — from the URL, set by the dashboard link.
  const [projectId] = useState<string>(() => {
    if (typeof window === "undefined") return "default";
    return new URLSearchParams(window.location.search).get("projectId") ?? "default";
  });

  const withProject = useCallback(
    (url: string) => `${url}${url.includes("?") ? "&" : "?"}projectId=${encodeURIComponent(projectId)}`,
    [projectId]
  );

  // SyncTeX/compiler-echoed paths can be absolute container paths (e.g. /app/workspaces/<id>/main.tex).
  // Everything sent to /api/files or /api/compile must be project-relative, so normalize at the boundary.
  const toProjectRelative = useCallback((raw: string): string => {
    if (!raw) return raw;
    const marker = `/${projectId}/`;
    const idx = raw.lastIndexOf(marker);
    if (idx >= 0) return raw.slice(idx + marker.length);
    return raw.replace(/^.*\/workspaces\/[^/]+\//, "").replace(/^\.?\/+/, "");
  }, [projectId]);

  // Code editor state
  const [currentCode, setCurrentCode] = useState<string>("// Select a file to view content");
  const [currentLanguage, setCurrentLanguage] = useState<string>("typescript");
  const [editedCode, setEditedCode] = useState<string>("");
  // Live mirror of the editor state, for callbacks that outlive their closure
  // (event handlers, in-flight fetches). Declared here so both can reach it.
  const stateRef = useRef({ selectedPath, editedCode, currentCode });
  useEffect(() => {
    stateRef.current = { selectedPath, editedCode, currentCode };
  }, [selectedPath, editedCode, currentCode]);
  // Which file's content the buffer above actually holds. selectedPath changes
  // the instant you click, but the content fetch lands later — until it does,
  // editedCode still holds the *previous* file (or "" on first mount). Writing
  // that to the new selectedPath truncates it, which is how main.tex hit 0 bytes.
  const loadedPathRef = useRef<string | null>(null);
  // Set synchronously by handleFileSelect, which fetches the content itself. The
  // selectedPath effect below would otherwise re-fetch the same file immediately —
  // loadedPathRef can't gate that, since it's only set once the fetch lands.
  const selectingPathRef = useRef<string | null>(null);
  const [newItemName, setNewItemName] = useState<string>("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Project-relative path of the last successfully compiled root .tex — SyncTeX
  // queries resolve the PDF/.synctex.gz from it. null until the first compile.
  const [compiledPath, setCompiledPath] = useState<string | null>(null);
  // Set only on an explicit editor double-click, or a task's page jump — the PDF scrolls
  // to this line/page then, not on cursor moves.
  const [pdfSyncRequest, setPdfSyncRequest] = useState<{ line?: number; frac?: number; page?: number; nonce: number } | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "idle">("idle");
  // View mode: "code" for text | "image" for images | "pdf-standalone" for PDFs opened from tree
  // | "unsupported" for binary files with no preview (set once /api/files sniffs the content)
  const [viewMode, setViewMode] = useState<"code" | "image" | "pdf-standalone" | "unsupported">("code");

  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string>("");
  const [isTerminalStreaming, setIsTerminalStreaming] =
    useState<boolean>(false);

  // Chat state
  const [chatText, setChatText] = useState<string>("");

  // Sidebar states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"files" | "search" | "chat" | "tasks" | "settings">("files");

  // Gates the skeleton: false until mounted + layout restored from localStorage (SSR-safe).
  const [mounted, setMounted] = useState<boolean>(false);

  // Persisted resizable-panel layouts (native to react-resizable-panels; localStorage-backed).
  const verticalLayout = useDefaultLayout({
    id: "somescript-editor-vertical",
    panelIds: ["editor-main", "terminal"],
    storage: layoutStorage,
  });
  const horizontalLayout = useDefaultLayout({
    id: "somescript-editor-horizontal",
    panelIds: ["code", "pdf"],
    storage: layoutStorage,
  });

  // Search Panel Refs and States
  const searchPanelRef = useRef<SearchPanelHandle>(null);
  const tasksPanelRef = useRef<TasksPanelHandle>(null);
  const [pendingLineJump, setPendingLineJump] = useState<{ path: string; line: number } | null>(null);
  const [searchState, setSearchState] = useState<{
    query: string;
    options: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean };
  }>({
    query: "",
    options: { matchCase: false, matchWholeWord: false, useRegex: false },
  });

  // Settings State
  const [settings, setSettings] = useState<{
    mainFilePath: string;
    compilerEngine: string;
    tooltipsEnabled: boolean;
    vimModeEnabled: boolean;
    foldingEnabled: boolean;
    autocompleteEnabled: boolean;
    bracketMatchingEnabled: boolean;
  }>({
    mainFilePath: "main.tex",
    compilerEngine: "tectonic",
    tooltipsEnabled: true,
    vimModeEnabled: false,
    foldingEnabled: true,
    autocompleteEnabled: true,
    bracketMatchingEnabled: true,
  });

  const extensions = useCodeMirrorExtensions(settings, currentLanguage);

  useEffect(() => {
    if (pendingLineJump && selectedPath === pendingLineJump.path && editorViewRef.current) {
      const view = editorViewRef.current;
      const line = pendingLineJump.line;
      const timer = setTimeout(() => {
        try {
          if (view.state.doc.length > 0) {
            const lineObj = view.state.doc.line(Math.min(line, view.state.doc.lines));
            // Select the whole line and focus so the jump target is visibly highlighted —
            // an unfocused CodeMirror renders no cursor/selection at all.
            view.dispatch({
              selection: { anchor: lineObj.from, head: lineObj.to },
              effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
            });
            view.focus();
            setPendingLineJump(null);
          }
        } catch (e) {
          console.error("Error jumping to line:", e);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingLineJump, selectedPath, editedCode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveTab("search");
        if (!isLeftSidebarOpen) {
          setIsLeftSidebarOpen(true);
        }
        setTimeout(() => {
          searchPanelRef.current?.focusSearch();
        }, 50);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    if (editorViewRef.current) {
      try {
        editorViewRef.current.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({
              search: searchState.query,
              caseSensitive: searchState.options.matchCase,
              literal: !searchState.options.useRegex,
              regexp: searchState.options.useRegex,
              wholeWord: searchState.options.matchWholeWord,
            })
          ),
        });
      } catch (e) {
        console.error("Error dispatching search query to CodeMirror:", e);
      }
    }
  }, [searchState, currentCode]);

  // Load Settings from LocalStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("somescript-user-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: settings hydrate from localStorage after mount
        setSettings({
          mainFilePath: parsed.mainFilePath ?? "main.tex",
          compilerEngine: parsed.compilerEngine ?? "tectonic",
          tooltipsEnabled: parsed.tooltipsEnabled ?? (typeof parsed.tooltipsEnabled === "boolean" ? parsed.tooltipsEnabled : true),
          vimModeEnabled: parsed.vimModeEnabled ?? false,
          foldingEnabled: parsed.foldingEnabled ?? true,
          autocompleteEnabled: parsed.autocompleteEnabled ?? true,
          bracketMatchingEnabled: parsed.bracketMatchingEnabled ?? true,
        });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    } else {
      setSettings({
        mainFilePath: "main.tex",
        compilerEngine: "tectonic",
        tooltipsEnabled: true,
        vimModeEnabled: false,
        foldingEnabled: true,
        autocompleteEnabled: true,
        bracketMatchingEnabled: true,
      });
    }
  }, []);

  // Restore sidebar open state from localStorage, then reveal the editor (hide skeleton).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedSidebar = localStorage.getItem("somescript-sidebar-open");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: hydrate layout from localStorage after mount
    if (savedSidebar !== null) setIsLeftSidebarOpen(savedSidebar === "true");
    setMounted(true);

    // After the layout is restored from localStorage, ensure the code panel is never
    // stuck collapsed on load. A brief rAF delay lets react-resizable-panels finish
    // its own restoration before we inspect / correct the panel state.
    const raf = requestAnimationFrame(() => {
      if (codePanelRef.current?.isCollapsed()) {
        codePanelRef.current.expand();
      }
    });
    return () => cancelAnimationFrame(raf);
  // codePanelRef is a stable ref — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist sidebar open state whenever it changes (post-mount to avoid clobbering the stored value).
  useEffect(() => {
    if (mounted) localStorage.setItem("somescript-sidebar-open", String(isLeftSidebarOpen));
  }, [isLeftSidebarOpen, mounted]);

  // Arrow-key navigation for the sidebar tablist. Roles without this would
  // announce "tab" to a screen reader while not behaving like one.
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = SIDEBAR_TABS.findIndex((t) => t.id === activeTab);
    const next = SIDEBAR_TABS[(i + dir + SIDEBAR_TABS.length) % SIDEBAR_TABS.length];
    setActiveTab(next.id);
    document.getElementById(`sidebar-tab-${next.id}`)?.focus();
  }, [activeTab]);

  const saveSettings = useCallback((newSettings: typeof settings) => {
    setSettings(newSettings);
    if (typeof window !== "undefined") {
      localStorage.setItem("somescript-user-settings", JSON.stringify(newSettings));
    }
  }, []);

  // Recursively collect all .tex files in project
  const getTexFiles = useCallback((nodes: FileNode[]): string[] => {
    const files: string[] = [];
    const traverse = (list: FileNode[]) => {
      for (const node of list) {
        if (node.isDir && node.children) {
          traverse(node.children);
        } else if (!node.isDir && node.name.endsWith(".tex")) {
          files.push(node.path);
        }
      }
    };
    traverse(nodes);
    return files;
  }, []);

  // Query the official synctex CLI (via /api/synctex -> compiler) per sync request.
  // type "view": { texRelativePath, line } -> { records }; type "edit": { page, x, y } -> { input, line }.
  // Return shape mirrors SynctexQuery in components/editor/pdf-preview.tsx.
  const synctexQuery = useCallback(async (query: Record<string, unknown>): Promise<{
    records?: { page: number; x: number; y: number; h: number; v: number; W: number; H: number }[];
    input?: string;
    line?: number;
  } | null> => {
    if (!compiledPath) return null;
    try {
      const res = await fetch("/api/synctex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path: compiledPath, ...query }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("SyncTeX query failed:", err);
      return null;
    }
  }, [projectId, compiledPath]);

  // Chat History / Multi-thread states
  const [threads, setThreads] = useState<Array<{ id: string; title: string; createdAt: number }>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Sync threads and active thread ID from localStorage
  useEffect(() => {
    const syncThreads = () => {
      if (typeof window === "undefined") return;
      const listRaw = localStorage.getItem("eve-threads-list");
      const activeId = localStorage.getItem("eve-active-thread-id");
      let currentList = [];
      let currentActiveId = "";

      if (listRaw) {
        try {
          currentList = JSON.parse(listRaw);
        } catch {}
      }

      if (activeId) {
        currentActiveId = activeId;
      }

      // If no threads exist, generate a default one
      if (currentList.length === 0) {
        const defaultId = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        const defaultThread = { id: defaultId, title: "New Chat", createdAt: Date.now() };
        currentList = [defaultThread];
        currentActiveId = defaultId;
        localStorage.setItem("eve-threads-list", JSON.stringify(currentList));
        localStorage.setItem("eve-active-thread-id", defaultId);
      }

      // Active id missing or pointing at a deleted thread: fall back to the first
      // thread. An empty id leaves <EveThread> unmounted, which silently drops
      // "somescript:attach-to-chat" events (no composer to receive them).
      if (!currentList.some((t: { id: string }) => t.id === currentActiveId)) {
        currentActiveId = currentList[0].id;
        localStorage.setItem("eve-active-thread-id", currentActiveId);
      }

      setThreads(currentList);
      setActiveThreadId(currentActiveId);
    };

    syncThreads();
    window.addEventListener("storage", syncThreads);
    return () => window.removeEventListener("storage", syncThreads);
  }, []);

  const handleNewChat = useCallback(() => {
    const newId = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const newThread = { id: newId, title: "New Chat", createdAt: Date.now() };
    const updatedList = [newThread, ...threads];
    localStorage.setItem("eve-threads-list", JSON.stringify(updatedList));
    localStorage.setItem("eve-active-thread-id", newId);
    setThreads(updatedList);
    setActiveThreadId(newId);
    setShowHistory(false);
  }, [threads]);

  const handleSwitchChat = useCallback((id: string) => {
    localStorage.setItem("eve-active-thread-id", id);
    setActiveThreadId(id);
    setShowHistory(false);
  }, []);

  const handleDeleteChat = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedList = threads.filter((t) => t.id !== id);
    localStorage.removeItem(`eve-thread-${id}`);

    let nextActiveId = activeThreadId;
    if (activeThreadId === id) {
      if (updatedList.length > 0) {
        nextActiveId = updatedList[0].id;
      } else {
        const newId = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        const newThread = { id: newId, title: "New Chat", createdAt: Date.now() };
        updatedList.push(newThread);
        nextActiveId = newId;
      }
    }

    localStorage.setItem("eve-threads-list", JSON.stringify(updatedList));
    localStorage.setItem("eve-active-thread-id", nextActiveId);
    setThreads(updatedList);
    setActiveThreadId(nextActiveId);
  }, [threads, activeThreadId]);

  // Resizable Panel Refs & States
  const codePanelRef = useRef<PanelImperativeHandle>(null);
  const pdfPanelRef = useRef<PanelImperativeHandle>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState<boolean>(false);
  const [isPdfCollapsed, setIsPdfCollapsed] = useState<boolean>(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState<boolean>(false);
  const [isAnimatingTerminal, setIsAnimatingTerminal] = useState<boolean>(false);
  const [isAnimatingPdf, setIsAnimatingPdf] = useState<boolean>(false);

  // CodeMirror instance & History States
  const editorViewRef = useRef<EditorView | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  // Comma-joined formats the caret sits inside (e.g. "bold,math"); a stable string
  // so React skips re-rendering the toolbar when the format context is unchanged.
  const [activeFormatKey, setActiveFormatKey] = useState<string>("");
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  const handleUpdate = useCallback((update: ViewUpdate) => {
    if (update.docChanged || update.selectionSet) {
      const view = editorViewRef.current;
      if (view) {
        setCanUndo(undoDepth(view.state) > 0);
        setCanRedo(redoDepth(view.state) > 0);
        setActiveFormatKey(activeFormats(view.state));
      }
    }
  }, []);

  // Double-click in the editor jumps the PDF to that line (forward SyncTeX).
  // The `nonce` lets the same line re-trigger a scroll on a repeat double-click.
  // `frac` = how far into the source line the click was — a wrapped paragraph is one
  // source line, so this picks the right typeset line within its y-range in the PDF.
  const handleSyncToPdf = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    try {
      const head = view.state.selection.main.head;
      const lineObj = view.state.doc.lineAt(head);
      const frac = lineObj.length > 0 ? (head - lineObj.from) / lineObj.length : 0;
      setPdfSyncRequest({ line: lineObj.number, frac, nonce: Date.now() });
    } catch (e) {
      // ignore
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (editorViewRef.current) {
      undo(editorViewRef.current);
      editorViewRef.current.focus();
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (editorViewRef.current) {
      redo(editorViewRef.current);
      editorViewRef.current.focus();
    }
  }, []);

  const handleInsertText = useCallback((text: string, cursorOffset = 0) => {
    const view = editorViewRef.current;
    if (!view) return;
    wrapInsert(view, text, cursorOffset);
  }, []);

  const handlePdfDoubleClick = useCallback(() => {
    const codePanel = codePanelRef.current;
    const pdfPanel = pdfPanelRef.current;
    if (!codePanel || !pdfPanel) return;

    setIsAnimatingPdf(true);
    const isCodeClosed = codePanel.isCollapsed();
    const isPdfClosed = pdfPanel.isCollapsed();

    if (!isCodeClosed && !isPdfClosed) {
      // Both open: collapse PDF (show code only)
      pdfPanel.collapse();
    } else if (!isCodeClosed && isPdfClosed) {
      // Code only: collapse code, expand PDF (show PDF only)
      pdfPanel.expand();
      codePanel.collapse();
    } else {
      // PDF only: expand code (show both)
      codePanel.expand();
    }
    setTimeout(() => setIsAnimatingPdf(false), 300);
  }, []);

  const handleTerminalDoubleClick = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    setIsAnimatingTerminal(true);
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
    setTimeout(() => setIsAnimatingTerminal(false), 300);
  }, []);

  // Right-click → "Add to chat". Attaches the selection (or the whole file when
  // nothing is selected) as a composer chip named "path:from-to", so the agent
  // gets the code *and* where it lives instead of having to grep for it.
  const [hasEditorSelection, setHasEditorSelection] = useState<boolean>(false);

  const handleSendCodeToChat = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !selectedPath) return;

    const { from, to } = view.state.selection.main;
    const rel = toProjectRelative(selectedPath);
    const text = from === to ? view.state.doc.toString() : view.state.sliceDoc(from, to);
    if (!text.trim()) return;

    // `to` sitting at column 0 belongs to the previous line, not the next one.
    const name =
      from === to
        ? rel
        : `${rel}:${view.state.doc.lineAt(from).number}-${view.state.doc.lineAt(Math.max(from, to - 1)).number}`;

    setIsLeftSidebarOpen(true);
    setActiveTab("chat");
    window.dispatchEvent(
      new CustomEvent("somescript:attach-to-chat", { detail: { name, text } })
    );
  }, [selectedPath, toProjectRelative]);

  // Right-click → "Create task". Unlike handleSendCodeToChat, hands the selection to the
  // tasks panel directly via ref — no event bus needed, TasksPanel is a direct child of
  // this component (unlike the chat composer, which lives inside <EveThread>).
  const handleCreateTask = useCallback((text: string, source?: Task["source"]) => {
    setIsLeftSidebarOpen(true);
    setActiveTab("tasks");
    tasksPanelRef.current?.addTask(text, source);
  }, []);

  const handleCreateTaskFromSelection = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !selectedPath) return;
    const { from, to } = view.state.selection.main;
    if (from === to) return;
    const text = view.state.sliceDoc(from, to);
    if (!text.trim()) return;
    handleCreateTask(text.trim(), {
      path: toProjectRelative(selectedPath),
      line: view.state.doc.lineAt(from).number,
      endLine: view.state.doc.lineAt(Math.max(from, to - 1)).number,
    });
  }, [selectedPath, toProjectRelative, handleCreateTask]);

  // The context menu replaces the browser's native one, so the clipboard basics
  // have to be re-served on top of the async Clipboard API.
  const handleClipboard = useCallback(async (cut: boolean) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    if (from === to) return;
    try {
      // Delete only once the text is safely on the clipboard: a rejected write
      // followed by an unconditional cut would destroy it with no copy anywhere.
      await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
      if (cut) {
        view.dispatch({ changes: { from, to, insert: "" }, userEvent: "delete.cut" });
      }
    } catch {
      // Clipboard blocked: nothing copied, so nothing cut either.
    }
    view.focus();
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    const view = editorViewRef.current;
    if (!view) return;
    view.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text) handleInsertText(text);
    } catch {
      // ponytail: readText needs the clipboard-read permission and Firefox never
      // grants it to page scripts. Focus is already back in the editor, so the
      // ⌘V the menu advertises still works. Revisit only if that trips people up.
    }
  }, [handleInsertText]);

  const handleSelectAll = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    selectAll(view);
    view.focus();
  }, []);

  const handleSendTerminalToChat = useCallback(() => {
    // ponytail: last 300 lines, ANSI stripped — full Tectonic logs are megabytes
    // of context. Bump/summarize if the agent starts missing earlier errors.
    const clean = terminalOutput.replace(/\u001B\[[0-9;]*m/g, "");
    const lines = clean.split("\n");
    const clipped =
      lines.length > 300 ? `…(truncated)\n${lines.slice(-300).join("\n")}` : clean;

    setIsLeftSidebarOpen(true);
    setActiveTab("chat");
    window.dispatchEvent(
      new CustomEvent("somescript:attach-to-chat", {
        detail: {
          name: `terminal-${new Date().toTimeString().slice(0, 8).replace(/:/g, "-")}.log`,
          text: clipped.trim(),
        },
      })
    );
  }, [terminalOutput]);

  const getLanguageFromPath = (filePath: string): string => {
    const ext = filePath.split(".").pop();
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      case "css":
        return "css";
      case "md":
        return "markdown";
      case "tex":
        return "latex";
      default:
        return "text";
    }
  };

  const getViewMode = (filePath: string): "code" | "image" | "pdf-standalone" => {
    const ext = filePath.includes(".") ? filePath.split(".").pop()!.toLowerCase() : "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
    if (imageExts.includes(ext)) return "image";
    if (ext === "pdf") return "pdf-standalone";
    return "code";
  };

  /**
   * The one place the editor buffer is written to disk. Returns false without
   * writing when there is nothing to save, or when the buffer does not belong
   * to the selected file yet — never write a buffer to a path it wasn't loaded
   * from, or the file gets truncated/clobbered.
   */
  const saveCurrentFile = useCallback(async (): Promise<boolean> => {
    const { selectedPath, editedCode, currentCode } = stateRef.current;
    if (!selectedPath) return false;
    if (loadedPathRef.current !== selectedPath) return false;
    if (editedCode === currentCode) return false;

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: editedCode }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveStatus("unsaved");
        return false;
      }
      setCurrentCode(editedCode);
      setSaveStatus("saved");
      return true;
    } catch (err) {
      console.error("Failed to save file content", err);
      setSaveStatus("unsaved");
      return false;
    }
  }, [projectId]);

  // Handle file selection
  const handleFileSelect = useCallback(async (path: string) => {
    path = toProjectRelative(path);
    // Already open: nothing to load. Re-selecting would reload the PDF (new t= URL),
    // which unloads/reloads the document — the preview "disappears" and scroll resets —
    // and the content re-fetch races the pendingLineJump cursor jump.
    if (path === selectedPath) return;
    await saveCurrentFile();

    setSelectedPath(path);
    selectingPathRef.current = path;
    localStorage.setItem(`somescript-last-file-${projectId}`, path);

    const mode = getViewMode(path);
    setViewMode(mode);

    if (mode === "image") {
      // Image files: no text to load, clear the PDF pane
      setPdfUrl(null);
      loadedPathRef.current = path;
      setCurrentCode("");
      setEditedCode("");
      return;
    }

    if (mode === "pdf-standalone") {
      // Show the PDF in the right PDF pane (same mechanism as compiled PDFs)
      const url = withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`);
      setPdfUrl(url);
      loadedPathRef.current = path;
      setCurrentCode("");
      setEditedCode("");
      // Expand PDF pane if it was collapsed
      if (pdfPanelRef.current?.isCollapsed()) {
        pdfPanelRef.current.expand();
      }
      return;
    }

    if (path.endsWith(".tex")) {
      const pdfPath = path.replace(/\.tex$/, ".pdf");
      const previewPath = `.preview-cache/${pdfPath}`;
      fetch(withProject(`/api/files?path=${encodeURIComponent(previewPath)}`))
        .then((res) => {
          if (res.ok) {
            setPdfUrl(withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(previewPath)}&t=${Date.now()}`));
          } else {
            setPdfUrl(null);
          }
        })
        .catch(() => setPdfUrl(null));
    } else {
      setPdfUrl(null);
    }

    try {
      const res = await fetch(withProject(`/api/files?path=${encodeURIComponent(path)}`));
      const data = await res.json();
      // Selection moved again while this was in flight (rapid A→B clicks) —
      // drop the stale body or B's editor would show A's content.
      if (stateRef.current.selectedPath !== path) return;
      if (data.unsupported) {
        loadedPathRef.current = path;
        setViewMode("unsupported");
        setCurrentCode("");
        setEditedCode("");
        setSaveStatus("saved");
        return;
      }
      if (data.content !== undefined) {
        loadedPathRef.current = path;
        setCurrentCode(data.content);
        setEditedCode(data.content);
        setCurrentLanguage(getLanguageFromPath(path));
        setSaveStatus("saved");
      }
    } catch (err) {
      console.error("Failed to read file", err);
    }
  }, [selectedPath, projectId, fileTree, withProject, toProjectRelative, saveCurrentFile]);

  // Load file tree
  const refreshWorkspace = useCallback(async () => {
    try {
      const res = await fetch(withProject("/api/files"));
      const data = await res.json();
      if (data.tree) {
        setFileTree(data.tree);
      }
    } catch (err) {
      console.error("Failed to load file tree", err);
    }
  }, [withProject]);

  // Reload current file content (defined before handleReplaceAll, which uses it)
  const refreshCurrentFile = useCallback(async () => {
    if (!selectedPath) return;
    // Skip binary files — PDFs and images are served as raw bytes, not JSON
    const mode = getViewMode(selectedPath);
    if (mode === "pdf-standalone" || mode === "image") return;
    try {
      const res = await fetch(withProject(`/api/files?path=${encodeURIComponent(selectedPath)}`));
      const data = await res.json();
      // Selection moved while this was in flight (e.g. Eve opened the file it
      // just wrote) — dropping the stale body keeps content matching the tab.
      if (stateRef.current.selectedPath !== selectedPath) return;
      if (data.content !== undefined) {
        loadedPathRef.current = selectedPath;
        setCurrentCode(data.content);
        setEditedCode(data.content);
        setCurrentLanguage(getLanguageFromPath(selectedPath));
        setSaveStatus("saved");
      }
    } catch (err) {
      console.error("Failed to reload file content", err);
    }
  }, [selectedPath, withProject]);

  const handleSelectMatch = useCallback((filePath: string, line: number) => {
    // Normalize here too so pendingLineJump.path always matches the (normalized) selectedPath;
    // a mismatch means the editor jump silently never fires.
    const rel = toProjectRelative(filePath);
    setPendingLineJump({ path: rel, line });
    handleFileSelect(rel);
  }, [handleFileSelect, toProjectRelative]);

  const handleSelectPdfPage = useCallback((page: number) => {
    if (pdfPanelRef.current?.isCollapsed()) pdfPanelRef.current.expand();
    setPdfSyncRequest({ page, nonce: Date.now() });
  }, []);

  const handleReplaceAll = useCallback(async (replaceText: string, searchState: { query: string; options: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean; scope: string } }) => {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          query: searchState.query,
          replaceText,
          matchCase: searchState.options.matchCase,
          matchWholeWord: searchState.options.matchWholeWord,
          useRegex: searchState.options.useRegex,
          scope: searchState.options.scope,
          selectedPath: selectedPath || "",
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Reload workspace tree
        refreshWorkspace();
        // If selected file was updated, reload its content in the editor
        // (handleFileSelect now no-ops on the already-open file, so reload directly)
        if (selectedPath && data.modifiedFiles.includes(selectedPath)) {
          refreshCurrentFile();
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [projectId, selectedPath, refreshWorkspace, refreshCurrentFile]);

  const handleSearchChange = useCallback((query: string, options: { matchCase: boolean; matchWholeWord: boolean; useRegex: boolean }) => {
    setSearchState({ query, options });
  }, []);

  const handleCreateResourceSubmit = useCallback(async (isDir: boolean) => {
    let targetPath = newItemName.trim();
    if (!targetPath) {
      const baseName = isDir ? "untitled-folder" : "untitled.tex";
      targetPath = baseName;
      
      const exists = (name: string, nodes: FileNode[]): boolean => {
        for (const n of nodes) {
          if (n.name === name) return true;
          if (n.children && exists(name, n.children)) return true;
        }
        return false;
      };
      
      let counter = 1;
      while (exists(targetPath, fileTree)) {
        if (isDir) {
          targetPath = `untitled-folder-${counter}`;
        } else {
          targetPath = `untitled-${counter}.tex`;
        }
        counter++;
      }
    }

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "create", path: targetPath, isDir }),
      });
      const data = await res.json();
      if (data.success) {
        setNewItemName("");
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to create resource", err);
    }
  }, [projectId, newItemName, fileTree, refreshWorkspace]);

  const handleFileMove = useCallback(async (oldPath: string, newPath: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "move", oldPath, newPath }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedPath === oldPath) {
          setSelectedPath(newPath);
        }
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to move file", err);
    }
  }, [projectId, selectedPath, refreshWorkspace]);

  const [deletePath, setDeletePath] = useState<string | null>(null);

  const handleFileDelete = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "delete", path }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedPath === path) {
          loadedPathRef.current = null;
          setSelectedPath("");
          setCurrentCode("// Select a file to view content");
          setEditedCode("");
        }
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to delete file", err);
    }
  }, [projectId, selectedPath, refreshWorkspace]);

  const handleFileDuplicate = useCallback(async (path: string) => {
    const exists = (candidate: string, nodes: FileNode[]): boolean => {
      for (const n of nodes) {
        if (n.path === candidate) return true;
        if (n.children && exists(candidate, n.children)) return true;
      }
      return false;
    };

    const findNode = (candidate: string, nodes: FileNode[]): FileNode | undefined => {
      for (const n of nodes) {
        if (n.path === candidate) return n;
        if (n.children) {
          const found = findNode(candidate, n.children);
          if (found) return found;
        }
      }
      return undefined;
    };

    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
    const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    const isDir = findNode(path, fileTree)?.isDir ?? false;
    const dotIdx = isDir ? -1 : name.lastIndexOf(".");
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
    if (isUploading) return;
    setIsUploading(true);

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
    } finally {
      setIsUploading(false);
    }
  }, [projectId, refreshWorkspace, isUploading]);

  // Autosave useEffect with debounce
  useEffect(() => {
    if (!selectedPath || loadedPathRef.current !== selectedPath || editedCode === currentCode) {
      return;
    }

    setSaveStatus("unsaved");

    const timer = setTimeout(saveCurrentFile, 1000);

    return () => clearTimeout(timer);
  }, [selectedPath, editedCode, currentCode, saveCurrentFile]);

  /**
   * Resolve the project's configured root document, in the same order
   * Overleaf's CLSI resolves one: the configured main file (if it still
   * exists) → a file literally named main.tex → the project's only .tex
   * file, if there's exactly one. Otherwise null. Used directly by Download,
   * and as Compile's fallback when the currently open file can't stand alone
   * (see handleCompileLatex below).
   */
  const resolveMainFile = useCallback((): string | null => {
    const texFiles = getTexFiles(fileTree);

    const configured = settings.mainFilePath && toProjectRelative(settings.mainFilePath);
    if (configured && texFiles.includes(configured)) return configured;

    if (texFiles.includes("main.tex")) return "main.tex";

    return texFiles.length === 1 ? texFiles[0] : null;
  }, [settings.mainFilePath, fileTree, getTexFiles, toProjectRelative]);

  // Content-based fallback for resolveMainFile, e.g. right after a zip import
  // with several .tex files and no main.tex: only the LaTeX root document
  // contains \documentclass, so the one file that has it is the root. Reuses
  // the existing search API (greps every project file server-side) instead of
  // fetching each candidate file. Persists a unique match so this only runs
  // once per project.
  // ponytail: plain substring match, doesn't strip comments — a commented-out
  // `%\documentclass{...}` in a chapter would false-positive; upgrade to a
  // comment-aware scan if that shows up in practice.
  const detectMainFile = useCallback(async (): Promise<string | null> => {
    const texFiles = getTexFiles(fileTree);
    if (texFiles.length < 2) return null;
    try {
      const res = await fetch(withProject(`/api/search?query=${encodeURIComponent("\\documentclass")}`));
      if (!res.ok) return null;
      const data = await res.json();
      const detected = pickDetectedMainFile(texFiles, Object.keys(data.resultsByFile ?? {}));
      if (!detected) return null;
      saveSettings({ ...settings, mainFilePath: detected });
      return detected;
    } catch {
      return null;
    }
  }, [fileTree, getTexFiles, withProject, settings, saveSettings]);

  // resolveMainFile with the detectMainFile fallback folded in, plus the
  // user-facing error when neither finds anything to compile.
  const resolveOrToastMainFile = useCallback(async (): Promise<string | null> => {
    const mainPath = resolveMainFile() ?? (await detectMainFile());
    if (!mainPath) {
      toast.error(
        "No main file specified. This project has multiple .tex files and none is named main.tex — set the Main Entry File in the Settings tab."
      );
    }
    return mainPath;
  }, [resolveMainFile, detectMainFile]);

  // Compiles one already-resolved path and streams its log into the terminal.
  // A pure "run this compile" primitive — callers own picking compilePath and
  // guarding re-entrancy (see handleCompileLatex/handleDownloadPdf), since
  // handleCompileLatex below may need to run this twice in one click (current
  // file, then the main-file fallback) without the button re-enabling in between.
  const runCompile = useCallback(async (compilePath: string): Promise<{ pdfPath: string; compilePath: string } | null> => {
    setTerminalOutput("");
    setIsTerminalStreaming(true);

    try {
      // First save the current file content to ensure it compiles current edits
      await saveCurrentFile();

      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path: compilePath }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) {
            setTerminalOutput(errData.error);
            return null;
          }
        }
        throw new Error("Failed to start compilation");
      }


      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream from compiler");
      }

      const decoder = new TextDecoder();
      let logBuffer = "";
      let pdfPath: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        logBuffer += text;
        setTerminalOutput(logBuffer);

        // Check if stream finished with success
        if (logBuffer.includes("[SUCCESS]") || logBuffer.includes("[CACHE HIT]")) {
          pdfPath = ".preview-cache/main.pdf";
          const match = logBuffer.match(/\[SUCCESS\]\s+(.*)/);
          if (match && match[1]) {
            // Normalize in case the compiler echoes an absolute container path.
            const rawPdfPath = toProjectRelative(match[1].trim());
            pdfPath = rawPdfPath.startsWith(".preview-cache/") ? rawPdfPath : `.preview-cache/${rawPdfPath}`;
          } else {
            // Derive PDF filename from the file we actually compiled.
            pdfPath = `.preview-cache/${compilePath.replace(/\.tex$/, ".pdf")}`;
          }
        }
      }

      return pdfPath ? { pdfPath, compilePath } : null;
    } catch (err) {
      console.error("Compilation error", err);
      const errMessage = err instanceof Error ? err.message : String(err);
      // Put compilation error into the terminal output
      setTerminalOutput((prev) => `${prev}\n\u001B[31mError compiling LaTeX:\u001B[0m ${errMessage}\n`);
      return null;
    } finally {
      setIsTerminalStreaming(false);
    }
  }, [projectId, toProjectRelative, saveCurrentFile]);

  // Single Compile action: try the currently open .tex file as its own root
  // document first (fast, precise — e.g. a self-contained chapter); only fall
  // back to the project's configured main file if that fails or nothing's
  // open. Skips the redundant re-run when the open file already *is* the main
  // file. isCompiling is owned here (not inside runCompile) so the button
  // stays disabled across both attempts, not just each one individually.
  const handleCompileLatex = useCallback(async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    try {
      const currentPath = selectedPath && selectedPath.endsWith(".tex") ? toProjectRelative(selectedPath) : null;

      let result = currentPath ? await runCompile(currentPath) : null;

      if (!result) {
        const mainPath = await resolveOrToastMainFile();
        if (mainPath && mainPath !== currentPath) {
          result = await runCompile(mainPath);
        }
      }

      if (!result) return;
      setPdfUrl(withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(result.pdfPath)}&t=${Date.now()}`));
      setCompiledPath(result.compilePath);
    } finally {
      setIsCompiling(false);
    }
  }, [isCompiling, selectedPath, toProjectRelative, runCompile, resolveOrToastMainFile, withProject]);

  // Always the project's main file, never "whatever's open" — a download is
  // the finished project, not whichever chapter happens to be open.
  const handleDownloadPdf = useCallback(async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    try {
      const mainPath = await resolveOrToastMainFile();
      if (!mainPath) return;
      const result = await runCompile(mainPath);
      if (!result) return;
      const url = withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(result.pdfPath)}&t=${Date.now()}`);
      const link = document.createElement("a");
      link.href = url;
      link.download = "document.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsCompiling(false);
    }
  }, [isCompiling, resolveOrToastMainFile, runCompile, withProject]);

  // Load tree on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load: fetches the workspace tree on mount
    refreshWorkspace();
  }, [refreshWorkspace]);

  // Reopen the file the user last had open in this project (persisted like the layout).
  const didRestoreFile = useRef(false);
  useEffect(() => {
    if (didRestoreFile.current) return;
    didRestoreFile.current = true;
    const last = localStorage.getItem(`somescript-last-file-${projectId}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount restore; ref-guarded, cannot cascade
    if (last) handleFileSelect(last);
  }, [projectId, handleFileSelect]);

  // Reload current file when selectedPath changes — but not when handleFileSelect
  // set it, since that already fetched the content. Renames (which set selectedPath
  // directly) still land here, and need to: they leave loadedPathRef on the old
  // name, which blocks autosave until the content is re-read under the new one.
  useEffect(() => {
    if (selectingPathRef.current === selectedPath) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load: fetches file content when the selection changes
    refreshCurrentFile();
  }, [selectedPath, refreshCurrentFile]);

  // Listen for custom events to coordinate real-time saves and refreshes with the AI agent
  useEffect(() => {
    const handleForceSave = (e: Event) => {
      const customEvent = e as CustomEvent<{ promises: Promise<unknown>[] }>;
      customEvent.detail.promises.push(saveCurrentFile());
    };

    const handleRefreshWorkspace = () => {
      refreshWorkspace();
      refreshCurrentFile();
    };

    // Eve wrote a file — show it. Already-open files no-op here and are picked
    // up by refreshCurrentFile above instead.
    const handleOpenFile = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) handleFileSelect(path);
    };

    window.addEventListener("somescript:force-save", handleForceSave);
    window.addEventListener("somescript:refresh-workspace", handleRefreshWorkspace);
    window.addEventListener("somescript:open-file", handleOpenFile);

    return () => {
      window.removeEventListener("somescript:force-save", handleForceSave);
      window.removeEventListener("somescript:refresh-workspace", handleRefreshWorkspace);
      window.removeEventListener("somescript:open-file", handleOpenFile);
    };
  }, [refreshWorkspace, refreshCurrentFile, handleFileSelect, projectId]);

  // Static boot banner. This used to be typed out a line at a time over 800ms, which
  // re-rendered the whole editor eight times during the slowest part of startup — for
  // text that is the same every session.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount banner
    setTerminalOutput(`${mockTerminalLines.join("\n")}\n`);
  }, []);

  const handleChatTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setChatText(e.target.value),
    []
  );



  const [dashboardUrl, setDashboardUrl] = useState<string>(
    process.env.NEXT_PUBLIC_WEB_URL ? `${process.env.NEXT_PUBLIC_WEB_URL}/dashboard` : "/dashboard"
  );
  const [projectName, setProjectName] = useState<string>("my-new-project");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dashboard URL: NEXT_PUBLIC_WEB_URL takes priority; fall back to the local-dev
    // port heuristic only when it's unset (e.g. running without .env.local configured).
    if (!process.env.NEXT_PUBLIC_WEB_URL) {
      const hostname = window.location.hostname;
      const port = window.location.port;
      /* eslint-disable react-hooks/set-state-in-effect -- client-only value derived from window.location */
      if (port === "3002" || port === "3001" || port === "3000") {
        setDashboardUrl(`http://${hostname}:3000/dashboard`);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }

    // Project Name
    fetch(withProject("/api/project/name"))
      .then((r) => r.json())
      .then((data) => {
        if (data.name) {
          setProjectName(data.name);
        } else {
          setProjectName(projectId);
        }
      })
      .catch(() => {
        setProjectName(projectId);
      });
  }, [withProject, projectId]);

  if (!mounted) return <EditorSkeleton />;

  return (
    <div className="relative flex flex-col h-screen w-screen bg-background overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b px-4 h-14 bg-background z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0" aria-label="SomeScript Editor">
            <Image
              src="/icon.svg"
              alt=""
              width={28}
              height={28}
              className="size-7"
              priority
            />
            <div className="hidden sm:flex items-baseline gap-1.5 leading-none">
              <span className="text-sm font-semibold tracking-tight text-foreground">SomeScript</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Editor</span>
            </div>
          </div>
          <div className="h-4 w-px bg-border" />
          <a
            href={dashboardUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-md border bg-muted/10 hover:bg-muted/30 transition-all cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Dashboard</span>
          </a>
          <div className="h-4 w-px bg-border" />
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="size-4 text-muted-foreground/80" />
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
            <span className="font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded text-xs">
              {projectName}
            </span>
            {selectedPath && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
                <span className="font-mono text-xs text-foreground bg-muted/10 px-2 py-0.5 rounded font-medium">
                  {selectedPath}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-0.5 rounded bg-muted/40 font-medium">
                  {saveStatus === "saving" && (
                    <>
                      <Loader2 className="size-3 animate-spin text-amber-500" />
                      <span className="text-amber-500">Saving...</span>
                    </>
                  )}
                  {saveStatus === "unsaved" && (
                    <>
                      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span>Unsaved</span>
                    </>
                  )}
                  {(saveStatus === "saved" || saveStatus === "idle") && (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span className="text-emerald-500">Saved</span>
                    </>
                  )}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Top Header Right Controls */}
        <div className="flex items-center gap-3">
          {/* Compile Button — current file first, falls back to the project's main file */}
          {getTexFiles(fileTree).length > 0 && (
            <button
              onClick={handleCompileLatex}
              disabled={isCompiling}
              title="Compiles the open file; falls back to the project's main file if it can't compile alone"
              className="rounded-md border bg-muted/20 hover:bg-muted text-muted-foreground/80 hover:text-foreground px-3 h-[36px] text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              {isCompiling ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  <span>Compiling...</span>
                </>
              ) : (
                <span>Compile</span>
              )}
            </button>
          )}

          {/* Download PDF Button */}
          {pdfUrl && (
            <button
              onClick={handleDownloadPdf}
              className="rounded-md border bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 px-3 h-[36px] text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
              title="Download compiled PDF"
            >
              <Download className="size-3.5" />
              <span>Download PDF</span>
            </button>
          )}

          {/* VS Code Style Layout Toggles */}
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/20">
            <button
              onClick={() => setIsLeftSidebarOpen((prev) => !prev)}
              className={cn(
                "p-1.5 rounded-sm hover:bg-muted cursor-pointer transition-colors",
                isLeftSidebarOpen ? "text-foreground bg-muted/50" : "text-muted-foreground/60 hover:text-foreground"
              )}
              title="Toggle Primary Side Bar (Left Sidebar)"
            >
              <LayoutIconLeft active={isLeftSidebarOpen} />
            </button>
             <button
              onClick={() => {
                const panel = terminalPanelRef.current;
                if (panel) {
                  setIsAnimatingTerminal(true);
                  if (panel.isCollapsed()) {
                    panel.expand();
                  } else {
                    panel.collapse();
                  }
                  setTimeout(() => setIsAnimatingTerminal(false), 300);
                }
              }}
              className={cn(
                "p-1.5 rounded-sm hover:bg-muted cursor-pointer transition-colors",
                !isTerminalCollapsed ? "text-foreground bg-muted/50" : "text-muted-foreground/60 hover:text-foreground"
              )}
              title="Toggle Panel (Bottom Terminal)"
            >
              <LayoutIconBottom active={!isTerminalCollapsed} />
            </button>
            <button
              onClick={() => {
                const panel = pdfPanelRef.current;
                if (panel) {
                  setIsAnimatingPdf(true);
                  if (panel.isCollapsed()) {
                    panel.expand();
                  } else {
                    panel.collapse();
                  }
                  setTimeout(() => setIsAnimatingPdf(false), 300);
                }
              }}
              className={cn(
                "p-1.5 rounded-sm hover:bg-muted cursor-pointer transition-colors",
                !isPdfCollapsed ? "text-foreground bg-muted/50" : "text-muted-foreground/60 hover:text-foreground"
              )}
              title="Toggle PDF Preview (Right Sidebar)"
            >
              <LayoutIconRight active={!isPdfCollapsed} />
            </button>
          </div>
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onInsert={handleInsertText}
      />

      {/* Main body wrapper */}
      <div className="relative flex flex-1 w-full overflow-hidden">
        {/* Backdrops for mobile view */}
        {isLeftSidebarOpen && (
        <div
          onClick={() => setIsLeftSidebarOpen(false)}
          className="lg:hidden absolute inset-0 z-10 bg-background/80 backdrop-blur-sm"
        />
      )}

      {/* Left Sidebar - File Tree & AI Chat Tabs */}
      <div
        className={cn(
          "flex flex-col border-r transition-all duration-300 ease-in-out overflow-hidden z-20 bg-background lg:static absolute top-0 bottom-0 left-0 shadow-lg lg:shadow-none",
          isLeftSidebarOpen ? "w-80" : "w-0 border-r-0"
        )}
      >
        {/* Tabs header — WAI-ARIA tabs: roving tabIndex, arrow-key navigation,
            and each panel below wired up via aria-controls/aria-labelledby. */}
        <div
          role="tablist"
          aria-label="Sidebar panels"
          aria-orientation="horizontal"
          onKeyDown={handleTabKeyDown}
          className="border-b px-2 bg-muted/10 flex items-center justify-around gap-1 h-11"
        >
          {SIDEBAR_TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                id={`sidebar-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls={`sidebar-panel-${id}`}
                aria-label={label}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
                  selected
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {selected && <span>{label}</span>}
              </button>
            );
          })}
        </div>

        <div
          id="sidebar-panel-files"
          role="tabpanel"
          aria-labelledby="sidebar-tab-files"
          className={cn("flex-1 flex flex-col overflow-hidden", activeTab !== "files" && "hidden")}
        >
          <div className="border-b px-3 py-2 bg-muted/10 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Project Files
            </span>
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
                disabled={isUploading}
                className={cn(
                  "p-1 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors",
                  isUploading && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
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
          </div>
          <div className="flex-1 overflow-auto p-1">
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
          </div>
        </div>

        <div
          id="sidebar-panel-search"
          role="tabpanel"
          aria-labelledby="sidebar-tab-search"
          className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "search" && "hidden")}
        >
          <SearchPanel
            ref={searchPanelRef}
            selectedPath={selectedPath}
            onSelectMatch={handleSelectMatch}
            onReplaceAll={handleReplaceAll}
            onSearchChange={handleSearchChange}
          />
        </div>

        <div
          id="sidebar-panel-chat"
          role="tabpanel"
          aria-labelledby="sidebar-tab-chat"
          className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "chat" && "hidden")}
        >
          {/* Header Bar */}
          <div className="border-b px-3 h-10 flex items-center justify-between bg-muted/5 select-none shrink-0">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-muted text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground transition-all duration-150 border border-transparent hover:border-border"
              title="Start a fresh conversation"
            >
              <Plus className="size-3.5 text-primary" />
              <span>New Chat</span>
            </button>

            <button
              onClick={() => setShowHistory((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150 border border-transparent",
                showHistory
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border"
              )}
              title="View saved conversations"
            >
              <Clock className="size-3.5" />
              <span>History</span>
            </button>
          </div>

          <div className="flex-1 relative flex flex-col overflow-hidden">
            {/* Sliding History Drawer */}
            <div
              className={cn(
                "absolute inset-x-0 top-0 z-30 bg-background/95 border-b backdrop-blur-md flex flex-col transition-all duration-200 ease-in-out overflow-hidden shadow-md max-h-[250px]",
                showHistory ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none max-h-0"
              )}
            >
              <div className="p-2 border-b bg-muted/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Saved Conversations</span>
                <span className="text-[10px] text-muted-foreground pr-1">{threads.length} chats</span>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {threads.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSwitchChat(t.id)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-2 rounded-md text-xs cursor-pointer transition-all duration-150 group border",
                      t.id === activeThreadId
                        ? "bg-primary/5 border-primary/20 text-primary font-medium"
                        : "border-transparent hover:bg-muted/40 hover:text-foreground text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <Sparkles className={cn("size-3.5 shrink-0", t.id === activeThreadId ? "text-primary" : "text-muted-foreground/50")} />
                      <span className="truncate">{t.title}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteChat(t.id, e)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-150 cursor-pointer"
                      title="Delete chat history"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat thread itself */}
            {activeThreadId && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <EveThread key={activeThreadId} threadId={activeThreadId} projectId={projectId} />
              </div>
            )}
          </div>
        </div>

        <div
          id="sidebar-panel-settings"
          role="tabpanel"
          aria-labelledby="sidebar-tab-settings"
          className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "settings" && "hidden")}
        >
          <div className="border-b px-3 h-10 flex items-center justify-between bg-muted/5 select-none shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Project Settings
            </span>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4.5">
            {/* Main File Selector */}
            <div className="space-y-1.5 flex flex-col">
              <label className="text-xs font-semibold text-muted-foreground">
                Main Entry File
              </label>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Choose the main LaTeX document to run when compiling.
              </div>
              <Select
                value={settings.mainFilePath}
                onValueChange={(val) => saveSettings({ ...settings, mainFilePath: val })}
              >
                <SelectTrigger className="w-full text-xs h-8 justify-between bg-background border border-border">
                  <SelectValue placeholder="Select main file" />
                </SelectTrigger>
                <SelectContent className="z-[999]">
                  {getTexFiles(fileTree).length === 0 ? (
                    <SelectItem value="none" disabled>No .tex files found</SelectItem>
                  ) : (
                    getTexFiles(fileTree).map((path) => (
                      <SelectItem key={path} value={path}>
                        {path}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <hr className="border-border/60" />

            {/* Compiler Engine */}
            <div className="space-y-1.5 flex flex-col">
              <label className="text-xs font-semibold text-muted-foreground">
                LaTeX Compiler Engine
              </label>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Select the build engine used to compile your documents.
              </div>
              <Select
                value={settings.compilerEngine}
                onValueChange={(val) => saveSettings({ ...settings, compilerEngine: val })}
              >
                <SelectTrigger className="w-full text-xs h-8 justify-between bg-background border border-border">
                  <SelectValue placeholder="Select compiler engine" />
                </SelectTrigger>
                <SelectContent className="z-[999]">
                  <SelectItem value="tectonic">Tectonic (Auto-selects Engine)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <hr className="border-border/60" />

            {/* Tooltip feature toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Editor Tooltips
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Toggle hover assistance tooltips for LaTeX commands in the code editor.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.tooltipsEnabled}
                onChange={(e) => saveSettings({ ...settings, tooltipsEnabled: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <hr className="border-border/60" />

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label htmlFor="vim-mode-toggle" className="text-xs font-semibold text-muted-foreground">
                  Vim Keybindings
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Enable Vim keybindings and modal editing in the code editor.
                </div>
              </div>
              <input
                id="vim-mode-toggle"
                type="checkbox"
                checked={settings.vimModeEnabled}
                onChange={(e) => saveSettings({ ...settings, vimModeEnabled: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <hr className="border-border/60" />

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label htmlFor="folding-toggle" className="text-xs font-semibold text-muted-foreground">
                  Code Folding
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Enable code folding gutters to collapse sections and blocks.
                </div>
              </div>
              <input
                id="folding-toggle"
                type="checkbox"
                checked={settings.foldingEnabled}
                onChange={(e) => saveSettings({ ...settings, foldingEnabled: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <hr className="border-border/60" />

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label htmlFor="autocomplete-toggle" className="text-xs font-semibold text-muted-foreground">
                  Autocompletion
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Enable automatic code completion and suggestions.
                </div>
              </div>
              <input
                id="autocomplete-toggle"
                type="checkbox"
                checked={settings.autocompleteEnabled}
                onChange={(e) => saveSettings({ ...settings, autocompleteEnabled: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <hr className="border-border/60" />

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label htmlFor="bracket-matching-toggle" className="text-xs font-semibold text-muted-foreground">
                  Bracket Matching
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Enable highlighting of matching brackets, parentheses, and braces.
                </div>
              </div>
              <input
                id="bracket-matching-toggle"
                type="checkbox"
                checked={settings.bracketMatchingEnabled}
                onChange={(e) => saveSettings({ ...settings, bracketMatchingEnabled: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div
          id="sidebar-panel-tasks"
          role="tabpanel"
          aria-labelledby="sidebar-tab-tasks"
          className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "tasks" && "hidden")}
        >
          <TasksPanel
            ref={tasksPanelRef}
            projectId={projectId}
            onSelectMatch={handleSelectMatch}
            onSelectPdfPage={handleSelectPdfPage}
          />
        </div>
      </div>

      {/* Center Panel - Code + Terminal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ResizablePanelGroup
          orientation="vertical"
          defaultLayout={verticalLayout.defaultLayout}
          onLayoutChanged={verticalLayout.onLayoutChanged}
        >
          <ResizablePanel
            id="editor-main"
            defaultSize={75}
            minSize={30}
            className={cn(isAnimatingTerminal && "panel-transition")}
          >
            {/* Editor + PDF Split Pane */}
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={horizontalLayout.defaultLayout}
              onLayoutChanged={horizontalLayout.onLayoutChanged}
            >
              {/* Left: CodeMirror Editor */}
              <ResizablePanel
                id="code"
                panelRef={codePanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={50}
                minSize={25}
                onResize={(size) => {
                  setIsCodeCollapsed(size.asPercentage <= 1);
                }}
                className={cn(isAnimatingPdf && "panel-transition")}
              >
                <div className="h-full relative flex flex-col min-w-0">
                  {selectedPath && viewMode === "code" && (
                    <EditorToolbar
                      onInsert={handleInsertText}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      tooltipsEnabled={true}
                      active={activeFormatKey}
                      onOpenPalette={() => setPaletteOpen(true)}
                    />
                  )}
                  <div className="flex-1 relative overflow-auto">
                    {selectedPath && viewMode === "image" ? (
                      <ImageViewer path={selectedPath} />
                    ) : selectedPath && viewMode === "pdf-standalone" ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
                        <span className="opacity-60">PDF displayed in preview pane →</span>
                      </div>
                    ) : selectedPath && viewMode === "unsupported" ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
                        <span className="opacity-60">Preview is not available for this file type</span>
                      </div>
                    ) : selectedPath && viewMode === "code" ? (
                      <ContextMenu
                        onOpenChange={(open) => {
                          if (open) {
                            setHasEditorSelection(
                              !editorViewRef.current?.state.selection.main.empty
                            );
                          }
                        }}
                      >
                        {/* `select-text` undoes the trigger's default select-none,
                            which would otherwise make the editor unselectable. */}
                        <ContextMenuTrigger asChild className="select-text">
                          <div className="absolute inset-0" onDoubleClick={handleSyncToPdf}>
                            <CodeMirror
                              value={editedCode}
                              height="100%"
                              theme="dark"
                              extensions={extensions}
                              basicSetup={{
                                foldGutter: false,
                                bracketMatching: false,
                                autocompletion: false,
                              }}
                              onChange={(value) => setEditedCode(value)}
                              onCreateEditor={(view) => {
                                // eslint-disable-next-line react-hooks/immutability -- storing the imperative CodeMirror EditorView handle in a ref
                                editorViewRef.current = view;
                              }}
                              onUpdate={handleUpdate}
                              className="absolute inset-0 w-full h-full text-sm font-mono border-none focus:outline-none"
                            />
                          </div>
                        </ContextMenuTrigger>
                        {/* Focus is handed back to CodeMirror by each action, so
                            don't let the menu pull it onto the trigger on close. */}
                        <ContextMenuContent
                          className="w-56"
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <ContextMenuItem onClick={handleSendCodeToChat}>
                            <Sparkles className="size-3.5" />
                            {hasEditorSelection ? "Add selection to chat" : "Add file to chat"}
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={!hasEditorSelection}
                            onClick={handleCreateTaskFromSelection}
                          >
                            <ListTodoIcon className="size-3.5" />
                            Create task from selection
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handleSyncToPdf}>
                            <FileText className="size-3.5" />
                            Show in PDF
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            disabled={!hasEditorSelection}
                            onClick={() => handleClipboard(true)}
                          >
                            <Scissors className="size-3.5" />
                            Cut
                            <ContextMenuShortcut>⌘X</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={!hasEditorSelection}
                            onClick={() => handleClipboard(false)}
                          >
                            <Copy className="size-3.5" />
                            Copy
                            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handlePasteFromClipboard}>
                            <ClipboardPaste className="size-3.5" />
                            Paste
                            <ContextMenuShortcut>⌘V</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem onClick={handleSelectAll}>
                            <TextCursor className="size-3.5" />
                            Select all
                            <ContextMenuShortcut>⌘A</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled={!canUndo} onClick={handleUndo}>
                            <Undo2 className="size-3.5" />
                            Undo
                            <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem disabled={!canRedo} onClick={handleRedo}>
                            <Redo2 className="size-3.5" />
                            Redo
                            <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
                        {"// Select a file from the sidebar to edit"}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle
                onDoubleClick={handlePdfDoubleClick}
                className={cn(
                  (isPdfCollapsed || isCodeCollapsed) && "cursor-pointer"
                )}
              />

              {/* Right: PDF Preview */}
              <ResizablePanel
                id="pdf"
                panelRef={pdfPanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={50}
                minSize={25}
                onResize={(size) => {
                  setIsPdfCollapsed(size.asPercentage <= 1);
                }}
                className={cn(isAnimatingPdf && "panel-transition")}
              >
                <div className="h-full flex flex-col bg-muted/5 min-w-0 pdf-viewer-workspace">

                  <div className="flex-1 relative overflow-hidden">
                    {pdfUrl ? (
                      <PdfPreview
                        pdfUrl={pdfUrl}
                        synctexQuery={synctexQuery}
                        selectedPath={toProjectRelative(selectedPath)}
                        pdfSyncRequest={pdfSyncRequest}
                        onSelectLine={handleSelectMatch}
                        onDownload={handleDownloadPdf}
                        onCreateTask={(text, page) => handleCreateTask(text, { page })}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
                        {isCompiling ? "Compiling document..." : "Click Compile to generate PDF"}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle
            onDoubleClick={handleTerminalDoubleClick}
            className={cn(
              isTerminalCollapsed && "cursor-pointer"
            )}
          />

          <ResizablePanel
            id="terminal"
            panelRef={terminalPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={25}
            minSize={10}
            onResize={(size) => {
              setIsTerminalCollapsed(size.asPercentage <= 2);
            }}
            className={cn(isAnimatingTerminal && "panel-transition")}
          >
            <div className="relative h-full">
              {terminalOutput && (
                <button
                  onClick={handleSendTerminalToChat}
                  title="Send terminal output to Eve"
                  className="absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/90 px-2 py-1 text-[11px] font-medium text-zinc-300 cursor-pointer transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Send to chat
                </button>
              )}
              <Terminal
                className="h-full rounded-none border-0"
                isStreaming={isTerminalStreaming}
                output={terminalOutput}
              >
                <TerminalContent className="max-h-full" />
              </Terminal>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      </div>

      <AlertDialog open={deletePath !== null} onOpenChange={(open) => !open && setDeletePath(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletePath}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletePath) handleFileDelete(deletePath);
                setDeletePath(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Example;
