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
import { CheckCircle2Icon, ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ArrowLeft, Clock, Trash2, Plus, Settings } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useEveAgent } from "eve/react";
import { EveThread } from "@/components/chat/eve-thread";

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
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { latex } from "codemirror-lang-latex";
import dynamic from "next/dynamic";

const PDFViewer = dynamic(
  () => import("@embedpdf/react-pdf-viewer").then((mod) => mod.PDFViewer),
  { ssr: false }
);
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

const Example = () => {
  // File tree state
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [projectPathInput, setProjectPathInput] = useState<string>("./my-new-project");

  // Code editor state
  const [currentCode, setCurrentCode] = useState<string>("// Select a file to view content");
  const [currentLanguage, setCurrentLanguage] = useState<string>("typescript");
  const [editedCode, setEditedCode] = useState<string>("");
  const [newItemName, setNewItemName] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "idle">("idle");

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
  const [activeTab, setActiveTab] = useState<"files" | "chat" | "settings">("files");

  // Settings State
  const [settings, setSettings] = useState<{
    mainFilePath: string;
    compilerEngine: string;
    tooltipsEnabled: boolean;
    draftMode: boolean;
  }>({
    mainFilePath: "main.tex",
    compilerEngine: "tectonic",
    tooltipsEnabled: true,
    draftMode: true,
  });

  // Load Settings from LocalStorage when projectPathInput changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`somescript-settings-${projectPathInput}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({
          mainFilePath: parsed.mainFilePath ?? "main.tex",
          compilerEngine: parsed.compilerEngine ?? "tectonic",
          tooltipsEnabled: parsed.tooltipsEnabled ?? (typeof parsed.tooltipsEnabled === "boolean" ? parsed.tooltipsEnabled : true),
          draftMode: parsed.draftMode ?? true,
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
      });
    }
  }, [projectPathInput]);

  const saveSettings = useCallback((newSettings: typeof settings) => {
    setSettings(newSettings);
    if (typeof window !== "undefined") {
      localStorage.setItem(`somescript-settings-${projectPathInput}`, JSON.stringify(newSettings));
    }
  }, [projectPathInput]);

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

  const handleUpdate = useCallback((update: any) => {
    if (update.docChanged || update.selectionSet) {
      const view = editorViewRef.current;
      if (view) {
        setCanUndo(undoDepth(view.state) > 0);
        setCanRedo(redoDepth(view.state) > 0);
      }
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

  // Handle file selection
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
        fetch(`${window.location.origin}/api/files?path=${encodeURIComponent(pdfPath)}`)
          .then((r) => r.blob())
          .then((blob) => {
            setPdfUrl(URL.createObjectURL(blob));
          })
          .catch(() => setPdfUrl(null));
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

  // Load file tree
  const refreshWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (data.tree) {
        setFileTree(data.tree);
      }
      if (data.projectPath) {
        setProjectPathInput(data.projectPath);
      }
    } catch (err) {
      console.error("Failed to load file tree", err);
    }
  }, []);

  const handleUpdateProject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: projectPathInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedPath("");
        setCurrentCode("// Select a file to view content");
        setEditedCode("");
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to update project path", err);
    }
  }, [projectPathInput, refreshWorkspace]);

  const handleCreateResourceSubmit = useCallback(async (isDir: boolean) => {
    let targetPath = newItemName.trim();
    if (!targetPath) {
      const baseName = isDir ? "untitled-folder" : "untitled.tex";
      targetPath = baseName;
      
      const exists = (name: string, nodes: any[]): boolean => {
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
        body: JSON.stringify({ action: "create", path: targetPath, isDir }),
      });
      const data = await res.json();
      if (data.success) {
        setNewItemName("");
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to create resource", err);
    }
  }, [newItemName, fileTree, refreshWorkspace]);

  const handleFileMove = useCallback(async (oldPath: string, newPath: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", oldPath, newPath }),
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
  }, [selectedPath, refreshWorkspace]);

  const handleFileDelete = useCallback(async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", path }),
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
  }, [selectedPath, refreshWorkspace]);

  // Autosave useEffect with debounce
  useEffect(() => {
    if (!selectedPath || editedCode === currentCode) {
      return;
    }

    setSaveStatus("unsaved");

    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", path: selectedPath, content: editedCode }),
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
  }, [selectedPath, editedCode, currentCode]);

  const handleCompileLatex = useCallback(async () => {
    const compilePath = settings.mainFilePath || selectedPath;
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
          body: JSON.stringify({ action: "save", path: selectedPath, content: editedCode }),
        });
        setCurrentCode(editedCode);
      }

      // Trigger compilation using compilePath
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: compilePath, draftMode: settings.draftMode }),
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
        if (logBuffer.includes("[SUCCESS]")) {
          const match = logBuffer.match(/\[SUCCESS\]\s+(.*)/);
          if (match && match[1]) {
            const pdfPath = match[1].trim();
            fetch(`${window.location.origin}/api/files?path=${encodeURIComponent(pdfPath)}`)
              .then((r) => r.blob())
              .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                setPdfUrl(blobUrl);
              })
              .catch((err) => {
                console.error("Error loading PDF blob", err);
                setPdfUrl(`${window.location.origin}/api/files?path=${encodeURIComponent(pdfPath)}&t=${Date.now()}`);
              });
          }
        }
      }
    } catch (err: any) {
      console.error("Compilation error", err);
      // Put compilation error into the terminal output
      setTerminalOutput((prev) => `${prev}\n\u001B[31mError compiling LaTeX:\u001B[0m ${err.message}\n`);
    } finally {
      setIsCompiling(false);
      setIsTerminalStreaming(false);
    }
  }, [selectedPath, editedCode, settings]);

  // Reload current file content
  const refreshCurrentFile = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(selectedPath)}`);
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
  }, [selectedPath]);

  // Load tree on mount and handle ?projectId parameter
  useEffect(() => {
    const initWorkspace = async () => {
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("projectId");
      try {
        const targetPath = projectId ? `projects/${projectId}` : "./my-new-project";
        await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: targetPath }),
        });
      } catch (err) {
        console.error("Failed to initialize project path:", err);
      }
      refreshWorkspace();
    };

    initWorkspace();
  }, [refreshWorkspace]);

  // Reload current file when selectedPath changes
  useEffect(() => {
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
        const customEvent = e as CustomEvent<{ promises: Promise<any>[] }>;
        setSaveStatus("saving");
        const savePromise = (async () => {
          try {
            const res = await fetch("/api/files", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "save", path: selectedPath, content: editedCode }),
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
  }, [refreshWorkspace, refreshCurrentFile]);

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

  const handleRegistryReady = useCallback((registry: any) => {
    try {
      const ui = registry.getPlugin ? registry.getPlugin('ui') : registry.plugins?.ui;
      if (ui && typeof ui.getSchema === 'function') {
        const schema = ui.getSchema();
        if (schema && schema.toolbars) {
          let modified = false;
          let fullscreenItem: any = null;
          let downloadItem: any = null;

          const isFullscreenBtn = (item: any) => (
            item.commandId === 'fullscreen' || 
            item.commandId === 'document-fullscreen' || 
            item.id === 'fullscreen-btn' || 
            item.id === 'fullscreen' ||
            item.id === 'document-fullscreen' ||
            item.id === 'document-fullscreen-btn'
          );

          const isDownloadBtn = (item: any) => (
            item.commandId === 'download' || 
            item.commandId === 'export' || 
            item.commandId === 'document-export' || 
            item.id === 'download-btn' || 
            item.id === 'download' || 
            item.id === 'export-btn' || 
            item.id === 'export' || 
            item.id === 'document-export-btn' || 
            item.id === 'document-export'
          );

          // 1. Locate and extract any existing fullscreen & download/export buttons from toolbars
          for (const key of Object.keys(schema.toolbars)) {
            const tb = schema.toolbars[key];
            if (tb.items) {
              const originalLength = tb.items.length;
              tb.items = tb.items.filter((item: any) => {
                if (isFullscreenBtn(item)) {
                  fullscreenItem = item;
                  return false;
                }
                if (isDownloadBtn(item)) {
                  downloadItem = item;
                  return false;
                }
                return true;
              });
              if (tb.items.length !== originalLength) {
                modified = true;
              }
            }
          }

          // 2. Locate and extract fullscreen & download/export buttons from menus
          if (schema.menus) {
            for (const menuKey of Object.keys(schema.menus)) {
              const menu = schema.menus[menuKey];
              if (menu.items) {
                const originalLength = menu.items.length;
                menu.items = menu.items.filter((item: any) => {
                  if (isFullscreenBtn(item)) {
                    fullscreenItem = item;
                    return false;
                  }
                  if (isDownloadBtn(item)) {
                    downloadItem = item;
                    return false;
                  }
                  return true;
                });
                if (menu.items.length !== originalLength) {
                  modified = true;
                }
              }
            }
          }

          // Fallback/Search in menus: detect which commandIds are used in the application
          let detectedDownloadId = 'document-export';
          let detectedFullscreenId = 'fullscreen';

          if (schema.menus) {
            const findCommandIds = (items: any[]) => {
              if (!items) return;
              for (const item of items) {
                if (item.commandId === 'document-export' || item.commandId === 'export' || item.commandId === 'download') {
                  detectedDownloadId = item.commandId;
                }
                if (item.commandId === 'fullscreen' || item.commandId === 'document-fullscreen') {
                  detectedFullscreenId = item.commandId;
                }
                if (item.items) {
                  findCommandIds(item.items);
                }
              }
            };
            for (const menuKey of Object.keys(schema.menus)) {
              findCommandIds(schema.menus[menuKey].items);
            }
          }

          // Fallback: create fullscreen button if it wasn't defined
          if (!fullscreenItem) {
            fullscreenItem = {
              type: 'command-button',
              id: detectedFullscreenId + '-btn',
              commandId: detectedFullscreenId,
              variant: 'icon'
            };
          }

          // Fallback: create download button if it wasn't defined
          if (!downloadItem) {
            downloadItem = {
              type: 'command-button',
              id: detectedDownloadId + '-btn',
              commandId: detectedDownloadId,
              variant: 'icon'
            };
          }

          // 3. Find the main top toolbar that contains the search button
          const mainToolbarKey = Object.keys(schema.toolbars).find(key => {
            const tb = schema.toolbars[key];
            return tb.items && tb.items.some((item: any) => {
              const serialized = JSON.stringify(item).toLowerCase();
              return serialized.includes("search");
            });
          }) || Object.keys(schema.toolbars).find(key => {
            const tb = schema.toolbars[key];
            return tb.position && tb.position.placement === 'top';
          }) || Object.keys(schema.toolbars)[0];

          if (mainToolbarKey) {
            const mainTb = schema.toolbars[mainToolbarKey];
            if (!mainTb.items) {
              mainTb.items = [];
            }

            // Find index of the search button in the toolbar
            const searchIndex = mainTb.items.findIndex((item: any) => {
              const serialized = JSON.stringify(item).toLowerCase();
              return serialized.includes("search");
            });

            // Insert download button next to the search button
            const existsDownload = mainTb.items.some((item: any) => item.id === downloadItem.id || item.commandId === downloadItem.commandId);
            if (!existsDownload) {
              if (searchIndex !== -1) {
                mainTb.items.splice(searchIndex + 1, 0, downloadItem);
              } else {
                mainTb.items.push(downloadItem);
              }
              modified = true;
            }

            // Insert fullscreen button next to download button
            const existsFullscreen = mainTb.items.some((item: any) => item.id === fullscreenItem.id || item.commandId === fullscreenItem.commandId);
            if (!existsFullscreen) {
              if (searchIndex !== -1) {
                mainTb.items.splice(searchIndex + 2, 0, fullscreenItem);
              } else {
                mainTb.items.push(fullscreenItem);
              }
              modified = true;
            }
          }

          // 3. Prevent fullscreen & download buttons from being hidden by responsive rules in any toolbar
          const targetIds = [
            'fullscreen',
            'fullscreen-btn',
            'document-fullscreen',
            'document-fullscreen-btn',
            'download',
            'download-btn',
            'export',
            'export-btn',
            'document-export',
            'document-export-btn'
          ];
          for (const key of Object.keys(schema.toolbars)) {
            const tb = schema.toolbars[key];
            if (tb.responsive && tb.responsive.breakpoints) {
              for (const bpKey of Object.keys(tb.responsive.breakpoints)) {
                const bp = tb.responsive.breakpoints[bpKey];
                if (bp.hide) {
                  const originalHideLength = bp.hide.length;
                  bp.hide = bp.hide.filter((id: string) => !targetIds.includes(id));
                  if (bp.hide.length !== originalHideLength) {
                    modified = true;
                  }
                }
              }
            }
          }

          // 4. Filter out view-related buttons
          for (const key of Object.keys(schema.toolbars)) {
            const tb = schema.toolbars[key];
            if (tb.items) {
              const originalCount = tb.items.length;
              tb.items = tb.items.filter((item: any) => {
                const serialized = JSON.stringify(item).toLowerCase();
                const isViewRelated = 
                  serialized.includes("view") || 
                  serialized.includes("spread") || 
                  serialized.includes("layout") || 
                  serialized.includes("rotate");
                return !isViewRelated;
              });
              if (tb.items.length !== originalCount) {
                modified = true;
              }
            }
          }

          if (modified && typeof ui.mergeSchema === 'function') {
            ui.mergeSchema(schema);
          }
        }
      }
    } catch (err) {
      console.error("Error customizing PDFViewer UI schema:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dashboard URL
    const hostname = window.location.hostname;
    const port = window.location.port;
    if (port === "3002" || port === "3001" || port === "3000") {
      setDashboardUrl(`http://${hostname}:3000/dashboard`);
    } else {
      setDashboardUrl("/dashboard");
    }

    // Project Name
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId");
    if (projectId) {
      fetch(`/api/project/name?projectId=${projectId}`)
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
    } else if (projectPathInput) {
      const parts = projectPathInput.split("/");
      setProjectName(parts[parts.length - 1] || "my-new-project");
    }
  }, [projectPathInput]);

  // ponytail: dynamic style injection tailored for custom shadowRoot styling to avoid selector leaks
  useEffect(() => {
    if (!pdfUrl) return;
    
    const interval = setInterval(() => {
      const container = document.querySelector("embedpdf-container");
      if (container && container.shadowRoot) {
        let style = container.shadowRoot.querySelector("#custom-toolbar-height-style");
        if (!style) {
          style = document.createElement("style");
          style.id = "custom-toolbar-height-style";
          style.textContent = `
            div:has(> [data-epdf-i]),
            div:has(> [data-epdf-cat]),
            .epdf-toolbar,
            .pdf-toolbar {
              height: 44px !important;
              min-height: 44px !important;
              max-height: 44px !important;
            }
            div:has(> [data-epdf-i]) {
              background-color: var(--background) !important;
              border-bottom: 1px solid var(--border) !important;
              padding-left: 0.75rem !important;
              padding-right: 0.75rem !important;
            }
            div:has(> [data-epdf-i]) button {
              color: var(--muted-foreground) !important;
              border-radius: 6px !important;
              transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1) !important;
              cursor: pointer !important;
            }
            div:has(> [data-epdf-i]) button:hover {
              background-color: var(--muted) !important;
              color: var(--foreground) !important;
            }
          `;
          container.shadowRoot.appendChild(style);
        }
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [pdfUrl]);

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter((t) => t.status !== "completed");



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
            <span>AI Assistant</span>
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
              onDelete={handleFileDelete}
            />
          </div>
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
                <EveThread key={activeThreadId} threadId={activeThreadId} />
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
                  Toggle hover assistance tooltips in the editor toolbar.
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
          </div>
        </div>
      </div>

      {/* Center Panel - Code + Terminal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel
            defaultSize={75}
            minSize={30}
            className={cn(isAnimatingTerminal && "panel-transition")}
          >
            {/* Editor + PDF Split Pane */}
            <ResizablePanelGroup orientation="horizontal">
              {/* Left: CodeMirror Editor */}
              <ResizablePanel
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
                  {selectedPath && (
                    <EditorToolbar
                      onInsert={handleInsertText}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      tooltipsEnabled={settings.tooltipsEnabled}
                    />
                  )}
                  <div className="flex-1 relative overflow-auto">
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
                <div className="h-full flex flex-col bg-muted/5 min-w-0">
                  <div className="flex-1 bg-muted/10 flex items-center justify-center relative overflow-hidden">
                    {pdfUrl ? (
                      <div className="relative w-full h-full overflow-hidden">
                        <PDFViewer
                          key={pdfUrl}
                          config={{
                            src: pdfUrl,
                            theme: {
                              preference: "light",
                            },
                            disabledCategories: [
                              'document-open',
                              'document-close',
                              'page',
                              'annotation',
                              'redaction',
                              'form',
                              'tools',
                              'insert'
                            ],
                            export: {}
                          }}
                          onReady={handleRegistryReady}
                          style={{ position: 'absolute', inset: 0 }}
                        />
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-muted-foreground p-4 text-center">
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
    </div>
  );
};

export default Example;
