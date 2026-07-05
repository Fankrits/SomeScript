"use client"

import {
  Bold,
  BookOpen,
  Braces,
  ChevronDown,
  Code,
  FileText,
  Hash,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  type LucideIcon,
  Pi,
  Quote,
  Redo2,
  Sigma,
  Table,
  Underline,
  Undo2,
} from "lucide-react"
import { memo, useEffect, useRef, useState, createContext, useContext } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const ToolbarContext = createContext({ tooltipsEnabled: true })

interface EditorToolbarProps {
  onInsert: (text: string, cursorOffset?: number) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  tooltipsEnabled?: boolean
}

interface ToolItem {
  icon?: LucideIcon
  label: string
  text?: string
  cursorOffset?: number
  shortcut?: string
}

// Dropdown component for grouped actions
const ToolDropdown = memo(
  ({
    icon: Icon,
    label,
    items,
    onInsert,
  }: {
    icon: LucideIcon
    label: string
    items: ToolItem[]
    onInsert: (text: string, cursorOffset?: number) => void
  }) => {
    const { tooltipsEnabled } = useContext(ToolbarContext)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const [position, setPosition] = useState({ top: 0, left: 0 })

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Calculate position when opening
    useEffect(() => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
        })
      }
    }, [isOpen])

    const button = (
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-0.5 p-1.5 rounded-md transition-colors cursor-pointer text-xs font-medium",
          isOpen
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <Icon className="size-3.5" />
        <ChevronDown className="size-3" />
      </button>
    )

    return (
      <div className="relative shrink-0">
        {tooltipsEnabled ? (
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom" align="center" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}

        {isOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{
                top: `${position.top + 4}px`,
                left: `${position.left}px`,
                position: "absolute",
              }}
              className="z-[9999] min-w-[180px] bg-popover border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95"
            >
              {items.map((item) => {
                const ItemIcon = item.icon
                return (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => {
                      if (item.text) {
                        onInsert(item.text, item.cursorOffset)
                      }
                      setIsOpen(false)
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {ItemIcon && <ItemIcon className="size-3.5" />}
                      <span>{item.label}</span>
                    </div>
                    {item.shortcut && (
                      <span className="text-[10px] opacity-40 group-hover:opacity-60 font-mono font-normal">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>,
            document.body,
          )}
      </div>
    )
  },
)
ToolDropdown.displayName = "ToolDropdown"

// Single tool button
const ToolButton = memo(
  ({
    icon: Icon,
    label,
    text,
    cursorOffset = 0,
    shortcut,
    onInsert,
  }: {
    icon: LucideIcon
    label: string
    text: string
    cursorOffset?: number
    shortcut?: string
    onInsert: (text: string, cursorOffset?: number) => void
  }) => {
    const { tooltipsEnabled } = useContext(ToolbarContext)
    const button = (
      <button
        type="button"
        onClick={() => onInsert(text, cursorOffset)}
        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors shrink-0 cursor-pointer"
      >
        <Icon className="size-3.5" />
      </button>
    )

    return tooltipsEnabled ? (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" align="center" className="text-xs">
          {shortcut ? `${label} (${shortcut})` : label}
        </TooltipContent>
      </Tooltip>
    ) : (
      button
    )
  },
)
ToolButton.displayName = "ToolButton"

// Divider
const ToolDivider = () => (
  <div className="w-px h-4 bg-border/60 mx-1 flex-shrink-0" />
)

// Helper for LaTeX commands
const cmd = (name: string) => `\\${name}`

export const EditorToolbar = memo(
  ({
    onInsert,
    onUndo,
    onRedo,
    canUndo = true,
    canRedo = true,
    tooltipsEnabled = true,
  }: EditorToolbarProps) => {
    const sectionItems: ToolItem[] = [
      { icon: BookOpen, label: "Part", text: cmd("part{}"), cursorOffset: -1 },
      {
        icon: Heading1,
        label: "Chapter",
        text: cmd("chapter{}"),
        cursorOffset: -1,
      },
      { label: "Paragraph", text: cmd("paragraph{}"), cursorOffset: -1 },
    ]

    const mathItems: ToolItem[] = [
      {
        label: "Display Math",
        text: "\\[\n  \n\\]",
        cursorOffset: -3,
        shortcut: "Ctrl+Shift+M",
      },
      {
        label: "Align",
        text: "\\begin{align}\n  \n\\end{align}",
        cursorOffset: -12,
      },
      { label: "Fraction", text: cmd("frac{}{}"), cursorOffset: -3 },
      { label: "Square Root", text: cmd("sqrt{}"), cursorOffset: -1 },
      { label: "Subscript", text: "_{}", cursorOffset: -1 },
      { label: "Superscript", text: "^{}", cursorOffset: -1 },
      { label: "Sum", text: cmd("sum_{i=1}^{n}"), cursorOffset: 0 },
      { label: "Integral", text: cmd("int_{a}^{b}"), cursorOffset: 0 },
      { label: "Limit", text: cmd("lim_{x \\to \\infty}"), cursorOffset: 0 },
    ]

    const refItems: ToolItem[] = [
      { icon: Hash, label: "Label", text: cmd("label{}"), cursorOffset: -1 },
      { label: "Page Reference", text: cmd("pageref{}"), cursorOffset: -1 },
      { label: "Equation Reference", text: cmd("eqref{}"), cursorOffset: -1 },
      { label: "Footnote", text: cmd("footnote{}"), cursorOffset: -1 },
    ]

    const envItems: ToolItem[] = [
      {
        label: "Description",
        text: "\\begin{description}\n  \\item[] \n\\end{description}",
        cursorOffset: -18,
      },
      {
        icon: Quote,
        label: "Quote",
        text: "\\begin{quote}\n\n\\end{quote}",
        cursorOffset: -12,
      },
      {
        icon: Code,
        label: "Verbatim",
        text: "\\begin{verbatim}\n\n\\end{verbatim}",
        cursorOffset: -14,
      },
      {
        label: "Center",
        text: "\\begin{center}\n\n\\end{center}",
        cursorOffset: -13,
      },
      {
        label: "Figure",
        text: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}",
        cursorOffset: -38,
      },
      {
        label: "Theorem",
        text: "\\begin{theorem}\n\n\\end{theorem}",
        cursorOffset: -14,
      },
      {
        label: "Proof",
        text: "\\begin{proof}\n\n\\end{proof}",
        cursorOffset: -12,
      },
      {
        label: "Abstract",
        text: "\\begin{abstract}\n\n\\end{abstract}",
        cursorOffset: -15,
      },
    ]

    const formatItems: ToolItem[] = [
      {
        icon: Underline,
        label: "Underline",
        text: cmd("underline{}"),
        cursorOffset: -1,
        shortcut: "Ctrl+U",
      },
      {
        icon: Code,
        label: "Typewriter",
        text: cmd("texttt{}"),
        cursorOffset: -1,
      },
      { label: "Small Caps", text: cmd("textsc{}"), cursorOffset: -1 },
      { label: "Emphasis", text: cmd("emph{}"), cursorOffset: -1 },
    ]

    const insertItems: ToolItem[] = [
      {
        icon: ImageIcon,
        label: "Image",
        text: "\\includegraphics[width=\\textwidth]{}",
        cursorOffset: -1,
      },
      {
        icon: Table,
        label: "Table",
        text: "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{|c|c|}\n    \\hline\n    Header 1 & Header 2 \\\\\n    \\hline\n    Cell 1 & Cell 2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}",
        cursorOffset: -15,
      },
      {
        icon: Link,
        label: "Hyperlink",
        text: cmd("href{url}{text}"),
        cursorOffset: -5,
      },
      {
        icon: FileText,
        label: "Input File",
        text: cmd("input{}"),
        cursorOffset: -1,
      },
    ]

    return (
      <ToolbarContext.Provider value={{ tooltipsEnabled }}>
        <div className="relative z-20 flex flex-nowrap overflow-x-auto scrollbar-hide items-center gap-0.5 px-2 border-b bg-muted/10 h-11 w-full select-none">
          {/* Undo/Redo */}
          <div className="flex items-center">
            {tooltipsEnabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={cn(
                      "p-1.5 rounded-md transition-colors cursor-pointer",
                      canUndo
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        : "text-muted-foreground/30 cursor-not-allowed",
                    )}
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="text-xs">
                  Undo (Ctrl+Z)
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className={cn(
                  "p-1.5 rounded-md transition-colors cursor-pointer",
                  canUndo
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    : "text-muted-foreground/30 cursor-not-allowed",
                )}
              >
                <Undo2 className="size-3.5" />
              </button>
            )}

            {tooltipsEnabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={cn(
                      "p-1.5 rounded-md transition-colors cursor-pointer",
                      canRedo
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        : "text-muted-foreground/30 cursor-not-allowed",
                    )}
                  >
                    <Redo2 className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="text-xs">
                  Redo (Ctrl+Y)
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className={cn(
                  "p-1.5 rounded-md transition-colors cursor-pointer",
                  canRedo
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    : "text-muted-foreground/30 cursor-not-allowed",
                )}
              >
                <Redo2 className="size-3.5" />
              </button>
            )}
        </div>

        <ToolDivider />

        {/* Basic Formatting */}
        <div className="flex items-center">
          <ToolButton
            icon={Bold}
            label="Bold"
            text={cmd("textbf{}")}
            cursorOffset={-1}
            shortcut="Ctrl+B"
            onInsert={onInsert}
          />
          <ToolButton
            icon={Italic}
            label="Italic"
            text={cmd("textit{}")}
            cursorOffset={-1}
            shortcut="Ctrl+I"
            onInsert={onInsert}
          />
          <ToolDropdown
            icon={ChevronDown}
            label="More Formatting"
            items={formatItems}
            onInsert={onInsert}
          />
        </div>

        <ToolDivider />

        {/* Document Structure */}
        <div className="flex items-center">
          <ToolButton
            icon={Heading1}
            label="Section"
            text={cmd("section{}")}
            cursorOffset={-1}
            onInsert={onInsert}
          />
          <ToolDropdown
            icon={ChevronDown}
            label="More Structure"
            items={[
              {
                icon: Heading2,
                label: "Subsection",
                text: "\\subsection{}",
                cursorOffset: -1,
              },
              ...sectionItems,
            ]}
            onInsert={onInsert}
          />
        </div>

        <ToolDivider />

        {/* Math */}
        <div className="flex items-center">
          <ToolButton
            icon={Sigma}
            label="Inline Math"
            text="$ $"
            cursorOffset={-1}
            shortcut="Ctrl+M"
            onInsert={onInsert}
          />
          <ToolDropdown
            icon={Pi}
            label="Math Environments"
            items={[
              {
                label: "Equation",
                text: "\\begin{equation}\n  \n\\end{equation}",
                cursorOffset: -15,
              },
              ...mathItems,
            ]}
            onInsert={onInsert}
          />
        </div>

        <ToolDivider />

        {/* Lists & Environments */}
        <div className="flex items-center">
          <ToolButton
            icon={List}
            label="Itemize"
            text="\\begin{itemize}\n  \\item \n\\end{itemize}"
            cursorOffset={-14}
            onInsert={onInsert}
          />
          <ToolDropdown
            icon={Braces}
            label="More Environments"
            items={[
              {
                icon: ListOrdered,
                label: "Enumerate",
                text: "\\begin{enumerate}\n  \\item \n\\end{enumerate}",
                cursorOffset: -16,
              },
              ...envItems,
            ]}
            onInsert={onInsert}
          />
        </div>

        <ToolDivider />

        {/* References & Citation */}
        <div className="flex items-center">
          <ToolButton
            icon={BookOpen}
            label="Citation"
            text="\\cite{}"
            cursorOffset={-1}
            onInsert={onInsert}
          />
          <ToolDropdown
            icon={Hash}
            label="References"
            items={[
              { label: "Reference", text: "\\ref{}", cursorOffset: -1 },
              ...refItems,
            ]}
            onInsert={onInsert}
          />
        </div>

        <ToolDivider />

        {/* General Insert */}
        <div className="flex items-center">
          <ToolDropdown
            icon={ImageIcon}
            label="Insert"
            items={insertItems}
            onInsert={onInsert}
          />
        </div>
      </div>
      </ToolbarContext.Provider>
    )
  },
)

EditorToolbar.displayName = "EditorToolbar"
