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
  FileTreeFile,
  FileTreeFolder,
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
import { CheckCircle2Icon, ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useEveAgent } from "eve/react";
import { EveThread } from "@/components/chat/eve-thread";
import CodeMirror from "@uiw/react-codemirror";
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
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
  const agent = useEveAgent();
  const [chatText, setChatText] = useState<string>("");

  // Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

  // Checkpoint state
  const [showCheckpoint, setShowCheckpoint] = useState<boolean>(false);

  // Sidebar states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"files" | "chat">("files");

  // Resizable Panel Refs & States
  const codePanelRef = useRef<PanelImperativeHandle>(null);
  const pdfPanelRef = useRef<PanelImperativeHandle>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState<boolean>(false);
  const [isPdfCollapsed, setIsPdfCollapsed] = useState<boolean>(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState<boolean>(false);

  const handlePdfDoubleClick = useCallback(() => {
    const codePanel = codePanelRef.current;
    const pdfPanel = pdfPanelRef.current;
    if (!codePanel || !pdfPanel) return;

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
  }, []);

  const handleTerminalDoubleClick = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
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
    if (!newItemName.trim()) return;
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", path: newItemName, isDir }),
      });
      const data = await res.json();
      if (data.success) {
        setNewItemName("");
        refreshWorkspace();
      }
    } catch (err) {
      console.error("Failed to create resource", err);
    }
  }, [newItemName, refreshWorkspace]);

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
    if (!selectedPath || !selectedPath.endsWith(".tex")) return;
    setIsCompiling(true);
    setTerminalOutput("");
    setIsTerminalStreaming(true);

    try {
      // First save the file content to ensure it compiles current edits
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", path: selectedPath, content: editedCode }),
      });
      setCurrentCode(editedCode);

      // Trigger compilation
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath }),
      });

      if (!res.ok) {
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
  }, [selectedPath, editedCode]);

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

  // Refresh workspace when agent finishes work (goes back to ready)
  useEffect(() => {
    if (agent.status === "ready") {
      refreshWorkspace();
      refreshCurrentFile();
    }
  }, [agent.status, refreshWorkspace, refreshCurrentFile]);

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

  // Handle chat submit
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim()) {
        return;
      }
      setChatText("");
      void agent.send({ message: message.text });
    },
    [agent]
  );

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter((t) => t.status !== "completed");

  const renderTreeNodes = (nodes: FileNode[]) => {
    return nodes.map((node) => {
      if (node.isDir) {
        return (
          <FileTreeFolder key={node.path} name={node.name} path={node.path}>
            {node.children && renderTreeNodes(node.children)}
          </FileTreeFolder>
        );
      }
      return (
        <FileTreeFile key={node.path} name={node.name} path={node.path} />
      );
    });
  };

  return (
    <div className="relative flex h-screen w-screen bg-background overflow-hidden">
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
        <div className="border-b p-2 bg-muted/10 flex items-center justify-around gap-1">
          <button
            onClick={() => setActiveTab("files")}
            className={cn(
              "flex-1 flex justify-center items-center gap-2 py-1.5 px-3 rounded text-xs font-semibold cursor-pointer transition-colors",
              activeTab === "files"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <FolderPlus className="size-4" />
            <span>Files</span>
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 flex justify-center items-center gap-2 py-1.5 px-3 rounded text-xs font-semibold cursor-pointer transition-colors",
              activeTab === "chat"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <Sparkles className="size-4" />
            <span>AI Assistant</span>
          </button>
        </div>

        {activeTab === "files" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b p-3 bg-muted/10 flex flex-col gap-2.5">
              <form onSubmit={handleUpdateProject} className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Project Path
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={projectPathInput}
                    onChange={(e) => setProjectPathInput(e.target.value)}
                    placeholder="./my-project"
                    className="flex-1 rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    className="rounded bg-primary text-primary-foreground px-2 py-1 text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    Set
                  </button>
                </div>
              </form>

              {/* Create Resource Form */}
              <div className="flex flex-col gap-1.5 pt-2 border-t">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Create Resource
                </label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="src/index.js"
                    className="flex-1 min-w-0 rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateResourceSubmit(false)}
                    className="p-1.5 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    title="New File"
                  >
                    <FilePlus className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateResourceSubmit(true)}
                    className="p-1.5 rounded border hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    title="New Folder"
                  >
                    <FolderPlus className="size-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-1">
              <FileTree
                className="border-none"
                expanded={expandedPaths}
                onExpandedChange={setExpandedPaths}
                onSelect={handleFileSelect}
                selectedPath={selectedPath}
              >
                {renderTreeNodes(fileTree)}
              </FileTree>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            <EveThread />
          </div>
        )}
      </div>

      {/* Center Panel - Code + Terminal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel
            defaultSize={75}
            minSize={30}
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
              >
                <div className="h-full relative flex flex-col min-w-0">
                  <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsLeftSidebarOpen((prev) => !prev)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Toggle Left Sidebar"
                      >
                        <PanelLeft className="size-4" />
                      </button>
                      <span className="text-xs font-mono font-medium text-foreground">
                        {selectedPath || "No file selected"}
                      </span>
                      {selectedPath && (
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
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      {selectedPath && selectedPath.endsWith(".tex") && (
                        <button
                          onClick={handleCompileLatex}
                          disabled={isCompiling}
                          className="rounded bg-emerald-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                        >
                          {isCompiling ? "Compiling..." : "Compile"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 relative overflow-auto">
                    {selectedPath ? (
                      <CodeMirror
                        value={editedCode}
                        height="100%"
                        theme="dark"
                        extensions={currentLanguage === "latex" ? [latex()] : []}
                        onChange={(value) => setEditedCode(value)}
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
                withHandle
                onDoubleClick={handlePdfDoubleClick}
                className={cn(
                  (isPdfCollapsed || isCodeCollapsed) && "bg-muted/80 w-3 hover:bg-muted cursor-pointer hover:after:w-10 after:w-8"
                )}
              />

              {/* Right: PDF Preview */}
              <ResizablePanel
                panelRef={pdfPanelRef}
                collapsible
                collapsedSize={2}
                defaultSize={50}
                minSize={20}
                onResize={(size) => {
                  setIsPdfCollapsed(size.asPercentage <= 2);
                }}
              >
                <div className="h-full flex flex-col bg-muted/5 min-w-0">
                  <div className="flex items-center border-b px-4 py-2 bg-muted/10">
                    <span className="text-xs font-semibold text-foreground">
                      PDF Preview
                    </span>
                  </div>
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
                            disabledCategories: ['document-open', 'document-close'],
                          }}
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
            withHandle
            onDoubleClick={handleTerminalDoubleClick}
            className={cn(
              isTerminalCollapsed && "bg-muted/80 h-3 hover:bg-muted cursor-pointer hover:after:h-10 after:h-8"
            )}
          />

          <ResizablePanel
            panelRef={terminalPanelRef}
            collapsible
            collapsedSize={2}
            defaultSize={25}
            minSize={10}
            onResize={(size) => {
              setIsTerminalCollapsed(size.asPercentage <= 2);
            }}
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
  );
};

export default Example;
