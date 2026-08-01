"use client"

import {
  ChevronDown,
  type LucideIcon,
  MoreHorizontal,
  Redo2,
  Search,
  Undo2,
} from "lucide-react"
import { createContext, Fragment, memo, useContext, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import { GROUPS, type ToolGroup, type ToolItem } from "./toolbar-config"

const ToolbarContext = createContext({ tooltipsEnabled: true })

type Insert = (text: string, cursorOffset?: number) => void

interface EditorToolbarProps {
  onInsert: Insert
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  tooltipsEnabled?: boolean
  /** Comma-joined active formats at the caret (see activeFormats), e.g. "bold,math". */
  active?: string
  /** Opens the ⌘K command palette. */
  onOpenPalette?: () => void
  collaborators?: Array<{
    clientId: number
    user: {
      name: string
      color?: string
      avatar?: string
    }
    activeFile?: string
  }>
}

const ToolDivider = () => <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />

// A single icon button. Always renders through Tooltip so there's one code path
// (the old toolbar duplicated every button for the tooltips-on/off cases).
const ToolButton = memo(
  ({
    icon: Icon,
    label,
    shortcut,
    disabled,
    active,
    onClick,
  }: {
    icon: LucideIcon
    label: string
    shortcut?: string
    disabled?: boolean
    active?: boolean
    onClick?: () => void
  }) => {
    const { tooltipsEnabled } = useContext(ToolbarContext)
    const button = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "p-1.5 rounded-md transition-colors shrink-0 cursor-pointer",
          active
            ? "bg-primary/15 text-primary"
            : disabled
              ? "text-muted-foreground/30 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <Icon className="size-3.5" />
      </button>
    )
    if (!tooltipsEnabled) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" align="center" className="text-xs">
          {shortcut ? `${label} (${shortcut})` : label}
        </TooltipContent>
      </Tooltip>
    )
  },
)
ToolButton.displayName = "ToolButton"

// Renders one dropdown's items. Reused by both the per-group caret menu and the
// "More" overflow menu.
const MenuItems = ({ items, onInsert }: { items: ToolItem[]; onInsert: Insert }) => (
  <>
    {items.map((item) => {
      const Icon = item.icon
      return (
        <DropdownMenuItem key={item.label} onClick={() => onInsert(item.text, item.cursorOffset)}>
          {Icon ? <Icon className="size-3.5" /> : <span className="size-3.5" />}
          <span>{item.label}</span>
          {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
        </DropdownMenuItem>
      )
    })}
  </>
)

// One group: its primary icon buttons plus (optionally) a caret dropdown.
const ToolGroupView = ({
  group,
  onInsert,
  activeSet,
}: {
  group: ToolGroup
  onInsert: Insert
  activeSet: Set<string>
}) => {
  const { tooltipsEnabled } = useContext(ToolbarContext)
  const TriggerIcon = group.menuTriggerIcon
  return (
    <div className="flex items-center">
      {group.primary?.map((item) => (
        <ToolButton
          key={item.label}
          icon={item.icon as LucideIcon}
          label={item.label}
          shortcut={item.shortcut}
          active={item.activeId ? activeSet.has(item.activeId) : false}
          onClick={() => onInsert(item.text, item.cursorOffset)}
        />
      ))}
      {group.menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={tooltipsEnabled ? group.menuLabel : undefined}
              aria-label={group.menuLabel}
              className={cn(
                "flex items-center gap-0.5 p-1.5 rounded-md transition-colors cursor-pointer text-xs font-medium shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=open]:bg-muted data-[state=open]:text-foreground",
                group.menuTriggerLabel && "px-2 gap-1",
              )}
            >
              {TriggerIcon && <TriggerIcon className="size-3.5" />}
              {group.menuTriggerLabel && <span>{group.menuTriggerLabel}</span>}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <MenuItems items={group.menu} onInsert={onInsert} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// Collapses the low-priority groups into a single overflow menu when the bar is
// too narrow — replaces the old silent `overflow-x-auto scrollbar-hide` where
// trailing tools just scrolled off-screen with no affordance.
const MoreMenu = ({ groups, onInsert }: { groups: ToolGroup[]; onInsert: Insert }) => {
  const { tooltipsEnabled } = useContext(ToolbarContext)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={tooltipsEnabled ? "More tools" : undefined}
          aria-label="More tools"
          className="flex items-center p-1.5 rounded-md transition-colors cursor-pointer shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {group.menuLabel ?? group.title}
            </DropdownMenuLabel>
            {group.primary && <MenuItems items={group.primary} onInsert={onInsert} />}
            {group.menu && <MenuItems items={group.menu} onInsert={onInsert} />}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const EditorToolbar = memo(
  ({
    onInsert,
    onUndo,
    onRedo,
    canUndo = true,
    canRedo = true,
    tooltipsEnabled = true,
    active = "",
    onOpenPalette,
    collaborators = [],
  }: EditorToolbarProps) => {
    const barRef = useRef<HTMLDivElement>(null)
    const [compact, setCompact] = useState(false)
    const activeSet = useMemo(() => new Set(active ? active.split(",") : []), [active])

    // Track the toolbar's own width (not the viewport) so the fold reacts to the
    // editor pane shrinking under the PDF split, which Tailwind breakpoints miss.
    useEffect(() => {
      const el = barRef.current
      if (!el) return
      const ro = new ResizeObserver(([entry]) => {
        // ponytail: single threshold, not per-pixel group measuring. 620px keeps
        // the full bar until the split pane is genuinely cramped; revisit if the
        // fold trips too early on some layout.
        setCompact(entry.contentRect.width < 620)
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    const inlineGroups = compact ? GROUPS.filter((g) => !g.low) : GROUPS
    const foldedGroups = compact ? GROUPS.filter((g) => g.low) : []

    return (
      <ToolbarContext.Provider value={{ tooltipsEnabled }}>
        <div
          ref={barRef}
          className="relative z-20 flex flex-nowrap items-center gap-0.5 px-2 border-b bg-muted/10 h-11 w-full select-none overflow-x-auto"
        >
          {/* History */}
          <div className="flex items-center">
            <ToolButton icon={Undo2} label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={onUndo} />
            <ToolButton icon={Redo2} label="Redo" shortcut="⌘⇧Z" disabled={!canRedo} onClick={onRedo} />
          </div>

          {inlineGroups.map((group) => (
            <Fragment key={group.id}>
              <ToolDivider />
              <ToolGroupView group={group} onInsert={onInsert} activeSet={activeSet} />
            </Fragment>
          ))}

          {foldedGroups.length > 0 && (
            <>
              <ToolDivider />
              <MoreMenu groups={foldedGroups} onInsert={onInsert} />
            </>
          )}

          {onOpenPalette && (
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Search commands"
              title={tooltipsEnabled ? "Search commands and symbols (⌘K)" : undefined}
              className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0 cursor-pointer"
            >
              <Search className="size-3.5" />
              <Kbd className="text-[10px]">⌘K</Kbd>
            </button>
          )}
        </div>
      </ToolbarContext.Provider>
    )
  },
)

EditorToolbar.displayName = "EditorToolbar"
