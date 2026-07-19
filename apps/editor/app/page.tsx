"use client";

import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import {
  FileTree,
} from "@/components/ai-elements/file-tree";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import {
  Task,
  TaskContent,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
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
import { CheckCircle2Icon, ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ChevronLeft, ArrowLeft, Clock, Trash2, Plus, Minus, Hand, MousePointer, Settings, Search, Download } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useDefaultLayout } from "react-resizable-panels";
import { useEveAgent } from "eve/react";
import { EveThread } from "@/components/chat/eve-thread";
import { SearchPanel, SearchPanelHandle } from "@/components/editor/search-panel";
import { search as searchExtension, SearchQuery, setSearchQuery } from "@codemirror/search";

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
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { ImageViewer } from "@/components/editor/image-viewer";
import { latex } from "codemirror-lang-latex";
import { useCodeMirrorExtensions } from "@/hooks/use-codemirror-extensions";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { SelectionPluginPackage, SelectionLayer } from "@embedpdf/plugin-selection/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";

import { Viewport } from "@embedpdf/plugin-viewport/react";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import { GlobalPointerProvider, PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";

import { useDocumentManagerCapability, useActiveDocument } from "@embedpdf/plugin-document-manager/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { usePan } from "@embedpdf/plugin-pan/react";
import { useSearch } from "@embedpdf/plugin-search/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
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

interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
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

// Mock tasks
const initialTasks: TaskItem[] = [
  { id: "1", status: "completed", title: "Refactor Button component" },
  { id: "2", status: "in_progress", title: "Add form validation" },
  { id: "3", status: "pending", title: "Write unit tests" },
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

const pdfPlugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: 1 }),
  createPluginRegistration(PanPluginPackage),
  createPluginRegistration(SearchPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
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

const Example = () => {
  const { engine: pdfEngine, isLoading: isPdfEngineLoading, error: pdfEngineError } = usePdfiumEngine();

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
  const [newItemName, setNewItemName] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Project-relative path of the last successfully compiled root .tex — SyncTeX
  // queries resolve the PDF/.synctex.gz from it. null until the first compile.
  const [compiledPath, setCompiledPath] = useState<string | null>(null);
  // Set only on an explicit editor double-click — the PDF scrolls to this line then, not on cursor moves.
  const [pdfSyncRequest, setPdfSyncRequest] = useState<{ line: number; frac: number; nonce: number } | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "idle">("idle");
  // View mode: "code" for text | "image" for images | "pdf-standalone" for PDFs opened from tree
  const [viewMode, setViewMode] = useState<"code" | "image" | "pdf-standalone">("code");

  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string>("");
  const [isTerminalStreaming, setIsTerminalStreaming] =
    useState<boolean>(false);

  // Chat state
  const [chatText, setChatText] = useState<string>("");

  // Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

  // Checkpoint state
  const [showCheckpoint, setShowCheckpoint] = useState<boolean>(false);

  // Sidebar states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"files" | "search" | "chat" | "settings">("files");

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
    draftMode: boolean;
    vimModeEnabled: boolean;
    foldingEnabled: boolean;
    autocompleteEnabled: boolean;
    bracketMatchingEnabled: boolean;
  }>({
    mainFilePath: "main.tex",
    compilerEngine: "tectonic",
    tooltipsEnabled: true,
    draftMode: true,
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
          draftMode: parsed.draftMode ?? true,
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
        draftMode: true,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reveal real UI once client-only layout is restored
    setMounted(true);
  }, []);

  // Persist sidebar open state whenever it changes (post-mount to avoid clobbering the stored value).
  useEffect(() => {
    if (mounted) localStorage.setItem("somescript-sidebar-open", String(isLeftSidebarOpen));
  }, [isLeftSidebarOpen, mounted]);

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
  const synctexQuery = useCallback(async (query: Record<string, unknown>): Promise<any | null> => {
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

  const handleUpdate = useCallback((update: ViewUpdate) => {
    if (update.docChanged || update.selectionSet) {
      const view = editorViewRef.current;
      if (view) {
        setCanUndo(undoDepth(view.state) > 0);
        setCanRedo(redoDepth(view.state) > 0);
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

    const { state } = view;
    const range = state.selection.main;
    
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length + cursorOffset },
      userEvent: "input",
    });
    
    view.focus();
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

  // Handle file selection
  const handleFileSelect = useCallback(async (path: string) => {
    path = toProjectRelative(path);
    // Already open: nothing to load. Re-selecting would reload the PDF (new t= URL),
    // which unloads/reloads the document — the preview "disappears" and scroll resets —
    // and the content re-fetch races the pendingLineJump cursor jump.
    if (path === selectedPath) return;
    if (selectedPath && editedCode !== currentCode) {
      try {
        await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: editedCode }),
        });
      } catch (err) {
        console.error("Failed to save changes before file switch", err);
      }
    }

    setSelectedPath(path);
    localStorage.setItem(`somescript-last-file-${projectId}`, path);

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
      const url = withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`);
      setPdfUrl(url);
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
      if (data.content !== undefined) {
        setCurrentCode(data.content);
        setEditedCode(data.content);
        setCurrentLanguage(getLanguageFromPath(path));
        setSaveStatus("saved");
      }
    } catch (err) {
      console.error("Failed to read file", err);
    }
  }, [selectedPath, editedCode, currentCode, fileTree, toProjectRelative]);

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
      if (data.content !== undefined) {
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

  // Autosave useEffect with debounce
  useEffect(() => {
    if (!selectedPath || editedCode === currentCode) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives the debounced autosave status machine
    setSaveStatus("unsaved");

    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: editedCode }),
        });
        const data = await res.json();
        if (data.success) {
          setCurrentCode(editedCode);
          setSaveStatus("saved");
        } else {
          setSaveStatus("unsaved");
        }
      } catch (err) {
        console.error("Failed to autosave file content", err);
        setSaveStatus("unsaved");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [projectId, selectedPath, editedCode, currentCode]);

  const handleDownloadPdf = useCallback(() => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl]);

  const handleCompileLatex = useCallback(async () => {
    const compilePath = toProjectRelative(settings.mainFilePath || selectedPath);
    if (!compilePath || !compilePath.endsWith(".tex")) {
      alert("Please select a main .tex file to compile (or open a .tex file). You can set the main file in the settings tab.");
      return;
    }
    setIsCompiling(true);
    setTerminalOutput("");
    setIsTerminalStreaming(true);

    try {
      // First save the current file content to ensure it compiles current edits
      if (selectedPath) {
        await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: editedCode }),
        });
        setCurrentCode(editedCode);
      }

      // Trigger compilation using compilePath
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path: compilePath, draftMode: settings.draftMode }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error) {
            setTerminalOutput(errData.error);
            return;
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        logBuffer += text;
        setTerminalOutput(logBuffer);

        // Check if stream finished with success
        if (logBuffer.includes("[SUCCESS]") || logBuffer.includes("[CACHE HIT]")) {
          let pdfPath = ".preview-cache/main.pdf";
          const match = logBuffer.match(/\[SUCCESS\]\s+(.*)/);
          if (match && match[1]) {
            // Normalize in case the compiler echoes an absolute container path.
            const rawPdfPath = toProjectRelative(match[1].trim());
            pdfPath = rawPdfPath.startsWith(".preview-cache/") ? rawPdfPath : `.preview-cache/${rawPdfPath}`;
          } else if (selectedPath) {
            // Derive PDF filename from current selected .tex file path
            const derivedPdf = toProjectRelative(selectedPath).replace(/\.tex$/, ".pdf");
            pdfPath = `.preview-cache/${derivedPdf}`;
          }
          setPdfUrl(withProject(`${window.location.origin}/api/files?path=${encodeURIComponent(pdfPath)}&t=${Date.now()}`));
          setCompiledPath(compilePath);
        }
      }
    } catch (err) {
      console.error("Compilation error", err);
      const errMessage = err instanceof Error ? err.message : String(err);
      // Put compilation error into the terminal output
      setTerminalOutput((prev) => `${prev}\n\u001B[31mError compiling LaTeX:\u001B[0m ${errMessage}\n`);
    } finally {
      setIsCompiling(false);
      setIsTerminalStreaming(false);
    }
  }, [projectId, selectedPath, editedCode, settings, withProject, toProjectRelative]);

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
    if (last) handleFileSelect(last);
  }, [projectId, handleFileSelect]);

  // Reload current file when selectedPath changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load: fetches file content when the selection changes
    refreshCurrentFile();
  }, [selectedPath, refreshCurrentFile]);

  const stateRef = useRef({ selectedPath, editedCode, currentCode });
  useEffect(() => {
    stateRef.current = { selectedPath, editedCode, currentCode };
  }, [selectedPath, editedCode, currentCode]);

  // Listen for custom events to coordinate real-time saves and refreshes with the AI agent
  useEffect(() => {
    const handleForceSave = (e: Event) => {
      const { selectedPath, editedCode, currentCode } = stateRef.current;
      if (!selectedPath) return;

      // If there are unsaved edits, save them immediately
      if (editedCode !== currentCode) {
        const customEvent = e as CustomEvent<{ promises: Promise<unknown>[] }>;
        setSaveStatus("saving");
        const savePromise = (async () => {
          try {
            const res = await fetch("/api/files", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId, action: "save", path: selectedPath, content: editedCode }),
            });
            const data = await res.json();
            if (data.success) {
              setCurrentCode(editedCode);
              setSaveStatus("saved");
            } else {
              setSaveStatus("unsaved");
            }
          } catch (err) {
            console.error("Failed to force save file content", err);
            setSaveStatus("unsaved");
          }
        })();
        customEvent.detail.promises.push(savePromise);
      }
    };

    const handleRefreshWorkspace = () => {
      refreshWorkspace();
      refreshCurrentFile();
    };

    window.addEventListener("somescript:force-save", handleForceSave);
    window.addEventListener("somescript:refresh-workspace", handleRefreshWorkspace);

    return () => {
      window.removeEventListener("somescript:force-save", handleForceSave);
      window.removeEventListener("somescript:refresh-workspace", handleRefreshWorkspace);
    };
  }, [refreshWorkspace, refreshCurrentFile, projectId]);

  // Stream terminal output line by line
  const streamTerminal = useCallback(async () => {
    setIsTerminalStreaming(true);
    let output = "";

    for (const line of mockTerminalLines) {
      output += `${line}\n`;
      setTerminalOutput(output);
      // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    setIsTerminalStreaming(false);
  }, []);

  // Animation sequence on mount
  useEffect(() => {
    const runAnimation = async () => {
      // Stream terminal output
      await streamTerminal();
      setShowCheckpoint(true);
    };

    runAnimation();
  }, [streamTerminal]);

  const handleChatTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setChatText(e.target.value),
    []
  );



  const [dashboardUrl, setDashboardUrl] = useState<string>("/dashboard");
  const [projectName, setProjectName] = useState<string>("my-new-project");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dashboard URL
    const hostname = window.location.hostname;
    const port = window.location.port;
    /* eslint-disable react-hooks/set-state-in-effect -- client-only value derived from window.location */
    if (port === "3002" || port === "3001" || port === "3000") {
      setDashboardUrl(`http://${hostname}:3000/dashboard`);
    } else {
      setDashboardUrl("/dashboard");
    }
    /* eslint-enable react-hooks/set-state-in-effect */

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

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter((t) => t.status !== "completed");

  if (!mounted) return <EditorSkeleton />;

  return (
    <div className="relative flex flex-col h-screen w-screen bg-background overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b px-4 h-14 bg-background z-30">
        <div className="flex items-center gap-3">
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
          {/* Compile Button */}
          {selectedPath && selectedPath.endsWith(".tex") && (
            <button
              onClick={handleCompileLatex}
              disabled={isCompiling}
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

      {/* Main body wrapper */}
      <div className="relative flex flex-1 w-full overflow-hidden">
        {/* Backdrops for mobile view */}
        {isLeftSidebarOpen && (
        <div
          onClick={() => setIsLeftSidebarOpen(false)}
          className="lg:hidden fixed inset-0 z-10 bg-background/80 backdrop-blur-sm"
        />
      )}

      {/* Left Sidebar - File Tree & AI Chat Tabs */}
      <div
        className={cn(
          "flex flex-col border-r transition-all duration-300 ease-in-out overflow-hidden z-20 bg-background lg:static absolute top-0 bottom-0 left-0 shadow-lg lg:shadow-none",
          isLeftSidebarOpen ? "w-80" : "w-0 border-r-0"
        )}
      >
        {/* Tabs header */}
        <div className="border-b px-2 bg-muted/10 flex items-center justify-around gap-1 h-11">
          <button
            onClick={() => setActiveTab("files")}
            className={cn(
              "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
              activeTab === "files"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <FolderPlus className="size-3.5" />
            <span>Files</span>
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
              activeTab === "chat"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5" />
            <span>Agent</span>
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={cn(
              "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
              activeTab === "search"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <Search className="size-3.5" />
            <span>Search</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
              activeTab === "settings"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <Settings className="size-3.5" />
            <span>Settings</span>
          </button>
        </div>

        <div className={cn("flex-1 flex flex-col overflow-hidden", activeTab !== "files" && "hidden")}>
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
            />
          </div>
        </div>

        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "search" && "hidden")}>
          <SearchPanel
            ref={searchPanelRef}
            selectedPath={selectedPath}
            onSelectMatch={handleSelectMatch}
            onReplaceAll={handleReplaceAll}
            onSearchChange={handleSearchChange}
          />
        </div>

        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "chat" && "hidden")}>
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

        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "settings" && "hidden")}>
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
                <label htmlFor="draft-mode-toggle" className="text-xs font-semibold text-muted-foreground">
                  Draft Mode (Fast Compile)
                </label>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Bypass auxiliary reruns. Speeds up compilation by ~40% for draft reviews.
                </div>
              </div>
              <input
                id="draft-mode-toggle"
                type="checkbox"
                checked={settings.draftMode ?? true}
                onChange={(e) => saveSettings({ ...settings, draftMode: e.target.checked })}
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
                collapsedSize={2}
                defaultSize={50}
                minSize={20}
                onResize={(size) => {
                  setIsCodeCollapsed(size.asPercentage <= 2);
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
                    />
                  )}
                  <div className="flex-1 relative overflow-auto">
                    {selectedPath && viewMode === "image" ? (
                      <ImageViewer path={selectedPath} />
                    ) : selectedPath && viewMode === "pdf-standalone" ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono bg-background">
                        <span className="opacity-60">PDF displayed in preview pane →</span>
                      </div>
                    ) : selectedPath && viewMode === "code" ? (
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
                minSize={20}
                onResize={(size) => {
                  setIsPdfCollapsed(size.asPercentage <= 2);
                }}
                className={cn(isAnimatingPdf && "panel-transition")}
              >
                <div className="h-full flex flex-col bg-muted/5 min-w-0 pdf-viewer-workspace">

                  <div className="flex-1 relative overflow-hidden">
                    {pdfUrl ? (
                      pdfEngine ? (
                        <div className="absolute inset-0">
                          <EmbedPDF
                            plugins={pdfPlugins}
                            engine={pdfEngine}
                            config={{}}
                          >
                            <HeadlessPdfViewer
                              pdfUrl={pdfUrl}
                              synctexQuery={synctexQuery}
                              selectedPath={toProjectRelative(selectedPath)}
                              pdfSyncRequest={pdfSyncRequest}
                              onSelectLine={handleSelectMatch}
                            />
                          </EmbedPDF>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
                          {isPdfEngineLoading ? "Loading PDF Engine..." : "Failed to load PDF Engine"}
                        </div>
                      )
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
            <Terminal
              className="h-full rounded-none border-0"
              isStreaming={isTerminalStreaming}
              output={terminalOutput}
            >
              <TerminalContent className="max-h-full" />
            </Terminal>
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

// One `synctex view` result box, in PDF points from the page's top-left:
// (x, y) visual box origin, (h, v) box left edge / baseline, W x H box size.
interface SynctexViewRecord {
  page: number;
  x: number;
  y: number;
  h: number;
  v: number;
  W: number;
  H: number;
}
type SynctexQuery = (query: Record<string, unknown>) => Promise<any | null>;

interface HeadlessPdfViewerProps {
  pdfUrl: string | null;
  synctexQuery: SynctexQuery;
  selectedPath: string;
  pdfSyncRequest: { line: number; frac: number; nonce: number } | null;
  onSelectLine: (filePath: string, line: number) => void;
}

const HeadlessPdfViewer = ({
  pdfUrl,
  synctexQuery,
  selectedPath,
  pdfSyncRequest,
  onSelectLine,
}: HeadlessPdfViewerProps) => {
  const docManagerCap = useDocumentManagerCapability();
  const { activeDocumentId, activeDocument } = useActiveDocument();
  const lastLoadedUrlRef = useRef<string | null>(null);
  const currentDocIdRef = useRef<string>("");
  const [currentDocId, setCurrentDocId] = useState<string>("");

  // Load document once pdfUrl is available
  useEffect(() => {
    if (pdfUrl && docManagerCap && docManagerCap.provides && lastLoadedUrlRef.current !== pdfUrl) {
      lastLoadedUrlRef.current = pdfUrl;
      const newDocId = `doc-${Date.now()}`;
      
      currentDocIdRef.current = newDocId;
      setCurrentDocId(newDocId);
      docManagerCap.provides.openDocumentUrl({
        url: pdfUrl,
        autoActivate: true,
        documentId: newDocId,
      });
    }
  }, [pdfUrl, docManagerCap]);

  if (!pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground p-4 text-center">
        Click Compile to generate PDF
      </div>
    );
  }

  if (!activeDocumentId || activeDocumentId !== currentDocId || !activeDocument || activeDocument.status !== "loaded") {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground p-4 text-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Loading document...</span>
      </div>
    );
  }

  return (
    <HeadlessPdfViewerInner
      pdfUrl={pdfUrl}
      documentId={activeDocumentId}
      synctexQuery={synctexQuery}
      selectedPath={selectedPath}
      pdfSyncRequest={pdfSyncRequest}
      onSelectLine={onSelectLine}
    />
  );
};

interface HeadlessPdfViewerInnerProps {
  pdfUrl: string;
  documentId: string;
  synctexQuery: SynctexQuery;
  selectedPath: string;
  pdfSyncRequest: { line: number; frac: number; nonce: number } | null;
  onSelectLine: (filePath: string, line: number) => void;
}

const HeadlessPdfViewerInner = ({
  pdfUrl,
  documentId,
  synctexQuery,
  selectedPath,
  pdfSyncRequest,
  onSelectLine,
}: HeadlessPdfViewerInnerProps) => {
  const scrollHook = useScroll(documentId);
  const zoomHook = useZoom(documentId);
  const panHook = usePan(documentId);
  const searchHook = useSearch(documentId);
  const selectionCap = useSelectionCapability();

  // Highlight box (PDF points from page top-left) flashed on the target line after a forward sync.
  // nonce keys the flash element so a re-sync remounts it and the CSS animation restarts —
  // otherwise re-syncing the same line renders an identical element whose finished
  // animation (forwards => opacity 0) never replays, and the highlight seems to "not show".
  const [syncHighlight, setSyncHighlight] = useState<{ page: number; y: number; h: number; nonce: number } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forward SyncTeX (`synctex view`): scroll the PDF to the editor line ONLY on an
  // explicit double-click (pdfSyncRequest), never on plain cursor movement.
  const lastSyncNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pdfSyncRequest || !selectedPath || !scrollHook?.provides) return;
    // One-shot per double-click. scrollHook.provides changes identity on every manual
    // scroll, which re-runs this effect; without the nonce guard it would re-scroll to
    // the sync target each time and the preview would feel stuck.
    if (pdfSyncRequest.nonce === lastSyncNonceRef.current) return;
    lastSyncNonceRef.current = pdfSyncRequest.nonce;
    const scroll = scrollHook.provides;

    let cancelled = false;
    (async () => {
      const data = await synctexQuery({ type: "view", texRelativePath: selectedPath, line: pdfSyncRequest.line });
      const records: SynctexViewRecord[] = data?.records ?? [];
      if (cancelled || records.length === 0) return;

      // A wrapped paragraph is one source line typeset across several PDF lines (one
      // record per box); interpolate by the click's fraction within the source line
      // across the records' baseline range to land on the right typeset line.
      const page = records[0].page;
      const baselines = records.filter((r) => r.page === page).map((r) => r.v);
      const minV = Math.min(...baselines);
      const maxV = Math.max(...baselines);
      const targetY = minV + (maxV - minV) * Math.min(1, Math.max(0, pdfSyncRequest.frac ?? 0));
      try {
        // Coordinates are already PDF points from the top-left, as pageCoordinates expects.
        // behavior "instant": the plugin's default smooth scroll is silently cancelled by
        // Chromium on any competing scroll/input, leaving the viewport unmoved on long
        // jumps — the highlight then lands off-screen. Instant is deterministic (and what
        // Overleaf does for sync jumps).
        scroll.scrollToPage({
          pageNumber: page,
          pageCoordinates: { x: records[0].h, y: targetY },
          alignY: 50,
          behavior: "instant",
        });
      } catch (e) {
        console.warn("Failed to scroll to page:", e);
      }
      // Flash a highlight on the synced line, then fade it out.
      setSyncHighlight({ page, y: targetY, h: records[0].H, nonce: pdfSyncRequest.nonce });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setSyncHighlight(null), 2200);
    })();
    return () => { cancelled = true; };
  }, [pdfSyncRequest, selectedPath, synctexQuery, scrollHook?.provides]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Initialize zoom to 100% when a new document ID is loaded to trigger layout calculation
  useEffect(() => {
    const provides = zoomHook?.provides;
    if (provides) {
      const t = setTimeout(() => {
        try {
          provides.requestZoom(1);
        } catch (e) {
          console.warn("Failed to initialize zoom level:", e);
        }
      }, 80);
      return () => clearTimeout(t);
    }
  }, [documentId, zoomHook?.provides]);

  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!selectionCap.provides) return;
    selectionCap.provides.getSelectedText(documentId).wait((textArray) => {
      if (textArray && textArray.length > 0) {
        navigator.clipboard.writeText(textArray.join("\n"))
          .then(() => {
            setIsCopied(true);
            setTimeout(() => {
              selectionCap.provides?.clear(documentId);
              setIsCopied(false);
            }, 1200);
          })
          .catch((err) => {
            console.error("Failed to copy PDF selection to clipboard:", err);
            selectionCap.provides?.clear(documentId);
          });
      } else {
        selectionCap.provides?.clear(documentId);
      }
    }, () => {
      selectionCap.provides?.clear(documentId);
    });
    setContextMenu(null);
  }, [selectionCap.provides, documentId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCopy = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c";
      if (isCopy) {
        const state = selectionCap.provides?.getState(documentId);
        const hasSelection = state?.selection !== null && state?.selection !== undefined;
        if (hasSelection) {
          const activeEl = document.activeElement;
          const isEditing = activeEl && (
            activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.closest(".cm-editor") !== null
          );
          if (!isEditing) {
            e.preventDefault();
            handleCopy();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, selectionCap.provides, documentId]);

  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  const currentPage = scrollHook?.state?.currentPage ?? 1;
  const totalPages = scrollHook?.state?.totalPages ?? 1;

  const currentZoom = Math.round((zoomHook?.state?.currentZoomLevel ?? 1) * 100);
  const isPanning = panHook?.isPanning ?? false;

  const searchState = searchHook?.state;
  const activeSearchResultIndex = searchState?.activeResultIndex ?? 0;
  const totalSearchResults = searchState?.total ?? 0;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearchQuery(val);
    if (searchHook?.provides) {
      if (val.trim()) {
        searchHook.provides.searchAllPages(val);
      } else {
        searchHook.provides.stopSearch();
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchHook?.provides && totalSearchResults > 0) {
      if (e.shiftKey) {
        searchHook.provides.previousResult();
      } else {
        searchHook.provides.nextResult();
      }
    }
  };



  return (
    <div className="w-full h-full flex flex-col min-w-0 bg-muted/5 relative overflow-hidden select-none">
      {/* Aligned Branded Custom Toolbar */}
      <div className="flex items-center justify-between px-3 border-b bg-muted/10 h-11 w-full shrink-0 gap-2">
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          {/* Pointer Tool */}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("h-7 w-7 rounded-md transition-all duration-150", !isPanning ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => {
              if (isPanning) panHook?.provides?.disablePan();
            }}
            title="Text Select Pointer"
          >
            <MousePointer className="size-3.5" />
          </Button>

          {/* Pan Tool */}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("h-7 w-7 rounded-md transition-all duration-150", isPanning ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => {
              if (!isPanning) panHook?.provides?.enablePan();
            }}
            title="Pan Hand Tool"
          >
            <Hand className="size-3.5" />
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomHook?.provides?.zoomOut()}
            disabled={!zoomHook?.provides}
            title="Zoom Out"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            className="h-7 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-md transition-all whitespace-nowrap"
            onClick={() => zoomHook?.provides?.requestZoom(ZoomMode.FitWidth)}
            title="Fit to Width"
          >
            {currentZoom}%
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomHook?.provides?.zoomIn()}
            disabled={!zoomHook?.provides}
            title="Zoom In"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {/* Search controls (moved to the right) */}
        <div className="flex items-center gap-1.5 max-w-[200px] sm:max-w-[280px] justify-end">
          {showSearchInput ? (
            <div className="flex items-center border rounded-md bg-background px-2 h-7 gap-1">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find in document..."
                value={localSearchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                className="text-[11px] outline-none border-none bg-transparent w-24 sm:w-36 font-sans"
                autoFocus
              />
              {totalSearchResults > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground shrink-0 select-none">
                  {activeSearchResultIndex + 1}/{totalSearchResults}
                </span>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowSearchInput(true)}
              title="Search document"
            >
              <Search className="size-3.5 text-muted-foreground" />
            </Button>
          )}
          {showSearchInput && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setShowSearchInput(false);
                setLocalSearchQuery("");
                searchHook?.provides?.stopSearch();
              }}
              title="Close search"
            >
              <Plus className="size-3.5 rotate-45 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Headless Rendering Container */}
      <div
        className="flex-1 bg-muted/15 relative overflow-hidden"
        onContextMenu={(e) => {
          const state = selectionCap.provides?.getState(documentId);
          const hasSelection = state?.selection !== null && state?.selection !== undefined;
          if (!isPanning && hasSelection) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }
        }}
        onClick={() => setContextMenu(null)}
      >
        {/* Floating Page Navigation */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-1 bg-background/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-border/80 shadow-lg select-none">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => scrollHook?.provides?.scrollToPage({ pageNumber: currentPage - 1 })}
            disabled={currentPage <= 1}
            title="Previous Page"
            className="h-6 w-6 rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-[10px] font-semibold text-foreground px-2 whitespace-nowrap min-w-[36px] text-center font-mono">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => scrollHook?.provides?.scrollToPage({ pageNumber: currentPage + 1 })}
            disabled={currentPage >= totalPages}
            title="Next Page"
            className="h-6 w-6 rounded-full hover:bg-muted"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* Right-click copy context menu */}
        {contextMenu && (
          <div
            className="fixed z-[9999] min-w-[120px] bg-popover border border-border rounded-md shadow-lg py-1 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              onPointerDown={(e) => {
                e.preventDefault();
                handleCopy();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
              Copy
              <kbd className="ml-auto text-[9px] text-muted-foreground font-mono">⌘C</kbd>
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors text-muted-foreground"
              onPointerDown={(e) => {
                e.preventDefault();
                selectionCap.provides?.clear(documentId);
                setContextMenu(null);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              Deselect
            </button>
          </div>
        )}
        <Viewport
          documentId={documentId}
          className="w-full h-full overflow-auto"
        >
          <GlobalPointerProvider documentId={documentId} className="w-full h-full">
            <ZoomGestureWrapper documentId={documentId} className="w-full min-h-full">
              <Scroller
                documentId={documentId}
                renderPage={({ pageIndex, width, height }) => {
                  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    // Reverse SyncTeX (`synctex edit`) wants PDF points from the page's
                    // top-left. The page renders at `zoom` css px per pt, so divide it out.
                    const zoom = zoomHook?.state?.currentZoomLevel ?? 1;
                    const data = await synctexQuery({
                      type: "edit",
                      page: pageIndex + 1,
                      x: (e.clientX - rect.left) / zoom,
                      y: (e.clientY - rect.top) / zoom,
                    });
                    if (data?.input && data.line) {
                      onSelectLine(data.input, data.line);
                    }
                  };

                  return (
                    <div
                      key={pageIndex}
                      style={{ width: "100%", display: "flex", justifyContent: "center", paddingTop: pageIndex === 0 ? "16px" : "8px", paddingBottom: "8px" }}
                    >
                      <div
                        style={{ width, height, position: "relative", display: "block", flexShrink: 0 }}
                        className="shadow-md bg-background border border-border/40 rounded-sm overflow-hidden"
                        onDoubleClick={handleDoubleClick}
                      >
                        {syncHighlight && syncHighlight.page === pageIndex + 1 && (() => {
                          // SyncTeX is line-granular: a record boxes some fragment of the source
                          // line, not the clicked word, so a box-accurate highlight often lands on
                          // the wrong word. Highlight the full-width line band instead (à la
                          // Overleaf): vertical position from the record, horizontal spans the page.
                          const zoom = zoomHook?.state?.currentZoomLevel ?? 1; // pt -> css px
                          // Band spans ~3 text lines, centered on the target line, to absorb
                          // SyncTeX's line-level (not word-level) imprecision.
                          const lineH = Math.max(syncHighlight.h * zoom, zoom * 11);
                          return (
                            <div
                              key={syncHighlight.nonce}
                              className="synctex-flash"
                              style={{
                                position: "absolute",
                                left: 6,
                                right: 6,
                                top: Math.max(0, (syncHighlight.y - syncHighlight.h) * zoom - lineH),
                                height: lineH * 3,
                                pointerEvents: "none",
                                zIndex: 30,
                              }}
                            />
                          );
                        })()}
                        <PagePointerProvider
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ width: "100%", height: "100%", position: "relative", display: "block", flexShrink: 0 }}
                        >
                          <RenderLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
                          draggable={false}
                        />
                        <SearchLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                        />
                        {!isPanning && (
                          <SelectionLayer
                            documentId={documentId}
                            pageIndex={pageIndex}
                            textStyle={{ background: "rgba(59, 130, 246, 0.35)" }}
                            selectionMenu={(({ menuWrapperProps, placement }) => {
                              return (
                                <div
                                  {...menuWrapperProps}
                                  className="z-50"
                                  style={{
                                    ...menuWrapperProps.style,
                                    pointerEvents: "auto",
                                  }}
                                >
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center shrink-0"
                                    style={{
                                      ...(placement.suggestTop
                                        ? { bottom: "100%", marginBottom: "6px" }
                                        : { top: "100%", marginTop: "6px" }),
                                    }}
                                  >
                                    <button
                                      className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-popover text-popover-foreground border border-border rounded-md shadow-md hover:bg-accent transition-colors",
                                        isCopied && "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                      )}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!isCopied) handleCopy();
                                      }}
                                    >
                                      {isCopied ? (
                                        <>
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="11"
                                            height="11"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="size-3 text-green-500"
                                          >
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                          Copied!
                                        </>
                                      ) : (
                                        <>
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="11"
                                            height="11"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="size-3"
                                          >
                                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                          </svg>
                                          Copy
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          />
                        )}
                      </PagePointerProvider>
                      </div>
                    </div>
                  );
                }}
              />
            </ZoomGestureWrapper>
          </GlobalPointerProvider>
        </Viewport>
      </div>
    </div>
  );
};

export default Example;
