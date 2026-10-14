import { useCallback, useEffect, useState, type ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Download,
  FileDown,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as api from "./api";
import { FolderDialog, ImportDialog, NewProjectDialog, RenameDialog } from "./dialogs";
import { daysLeft, timeAgo } from "./format";
import { useFolderCheck } from "./use-folder-check";
import { useAutoUpdate } from "../updater/use-auto-update";

type Dialog = "new" | "import" | "folder" | null;

const failed = (what: string, e: unknown) =>
  toast.error(`${what}: ${e instanceof Error ? e.message : String(e)}`);

export default function Library() {
  useAutoUpdate();
  const [projects, setProjects] = useState<api.Project[] | null>(null);
  const [trash, setTrash] = useState<api.TrashItem[]>([]);
  const [libraryPath, setLibraryPath] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tab, setTab] = useState<"projects" | "trash">("projects");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [renaming, setRenaming] = useState<api.Project | null>(null);
  const [purging, setPurging] = useState<api.TrashItem | null>(null);

  const refresh = useCallback(async () => {
    try {
      // The path comes from the settings, which never open the folder, so it is known (and shown)
      // even when the folder can't be read.
      setLibraryPath(await api.getLibraryPath());
      const [p, t] = await Promise.all([api.listProjects(), api.listTrash()]);
      setProjects(p);
      setTrash(t);
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const act = async (what: string, run: () => Promise<unknown>, done?: string) => {
    try {
      await run();
      if (done) toast.success(done);
      await refresh();
    } catch (e) {
      failed(what, e);
    }
  };

  const showFolder = () =>
    revealItemInDir(libraryPath).catch((e) => failed("Couldn't open the folder", e));

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col justify-between p-4 shrink-0 h-screen select-none">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 px-2 py-1">
            <img src="/icon.svg" alt="" className="size-7" />
            <span className="font-semibold text-base tracking-tight text-foreground">
              SomeScript
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setTab("projects")}
              aria-current={tab === "projects" ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === "projects"
                  ? "bg-primary/10 text-primary border border-primary/10 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
              }`}
            >
              <Folder className="size-4 shrink-0" />
              Projects{projects ? ` (${projects.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setTab("trash")}
              aria-current={tab === "trash" ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === "trash"
                  ? "bg-primary/10 text-primary border border-primary/10 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
              }`}
            >
              <Trash2 className="size-4 shrink-0" />
              Trash{trash.length ? ` (${trash.length})` : ""}
            </button>
          </nav>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => window.location.assign("/settings")}
            data-testid="open-settings"
          >
            <Settings className="size-4 shrink-0" />
            Settings
          </Button>
        </div>
      </aside>

      {/* Main Pane */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto px-8 py-8 gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight">
              {tab === "projects" ? "Projects" : "Trash"}
            </h1>
            {tab === "projects" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setDialog("import")}>
                  <Upload className="size-4" /> Import
                </Button>
                <Button onClick={() => setDialog("new")}>
                  <Plus className="size-4" /> New project
                </Button>
              </div>
            )}
          </div>

          {libraryPath && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Saved in</span>
              <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                {libraryPath}
              </code>
              {api.inTauri() && (
                <Button variant="ghost" size="xs" onClick={showFolder}>
                  <FolderOpen className="size-3.5" /> Show
                </Button>
              )}
            </div>
          )}
        </div>

        {loadError !== null ? (
          <LibraryProblem
            error={loadError}
            path={libraryPath}
            onChoose={() => setDialog("folder")}
            onRetry={() => void refresh()}
            onUse={(path) => act("Couldn't use that folder", () => api.setLibraryPath(path))}
          />
        ) : tab === "projects" ? (
          <ProjectList
            projects={projects}
            onNew={() => setDialog("new")}
            onRename={setRenaming}
            onTrash={(p) =>
              act(
                "Couldn't move to trash",
                () => api.trashProject(p.id),
                `Moved “${p.name}” to the trash`,
              )
            }
          />
        ) : (
          <TrashList
            items={trash}
            onRestore={(t) =>
              act("Couldn't restore", () => api.restoreProject(t.id), `Restored “${t.name}”`)
            }
            onPurge={setPurging}
          />
        )}
      </main>

      <NewProjectDialog open={dialog === "new"} onOpenChange={(o) => setDialog(o ? "new" : null)} />
      <ImportDialog
        open={dialog === "import"}
        onOpenChange={(o) => setDialog(o ? "import" : null)}
      />
      <FolderDialog
        open={dialog === "folder"}
        onOpenChange={(o) => setDialog(o ? "folder" : null)}
        current={libraryPath}
        onDone={() => void refresh()}
      />
      <RenameDialog
        project={renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        onDone={() => void refresh()}
      />

      <AlertDialog open={purging !== null} onOpenChange={(o) => !o && setPurging(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{purging?.name}” forever?</AlertDialogTitle>
            <AlertDialogDescription>
              Its files are removed from your computer and can't be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                purging &&
                act("Couldn't delete", () => api.purgeProject(purging.id), "Deleted forever")
              }
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The library folder can't be read: say why, and offer folders that would work. */
function LibraryProblem({
  error,
  path,
  onChoose,
  onRetry,
  onUse,
}: {
  error: unknown;
  path: string;
  onChoose: () => void;
  onRetry: () => void;
  onUse: (path: string) => void;
}) {
  const { check } = useFolderCheck(path);
  const hint = error instanceof api.ApiFailure ? error.hint : null;
  return (
    <Empty className="border" data-testid="library-error">
      <EmptyHeader>
        <EmptyTitle>Couldn't read your library</EmptyTitle>
        <EmptyDescription>
          {error instanceof Error ? error.message : String(error)}
          {hint && (
            <>
              <br />
              {hint}
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {check && check.alternatives.length > 0 && (
          <div className="grid w-full gap-1.5">
            <p className="text-xs font-medium">Use a folder that works:</p>
            {check.alternatives.map((alt) => (
              <Button
                key={alt}
                variant="outline"
                size="sm"
                className="h-auto justify-start py-1.5 font-mono text-xs break-all whitespace-normal"
                onClick={() => onUse(alt)}
              >
                {alt}
              </Button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onChoose}>
            Choose another folder
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

function ProjectList({
  projects,
  onNew,
  onRename,
  onTrash,
}: {
  projects: api.Project[] | null;
  onNew: () => void;
  onRename: (p: api.Project) => void;
  onTrash: (p: api.Project) => void;
}) {
  const [sortConfig, setSortConfig] = useState<{
    key: "name" | "updatedAt";
    direction: "asc" | "desc";
  }>({ key: "updatedAt", direction: "desc" });
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const handleDownloadPdf = async (p: api.Project) => {
    setPdfBusy(p.id);
    try {
      const safeName = await api.downloadPdf(p.id, p.name);
      toast.success(`Downloaded ${safeName}.pdf`);
    } catch (e) {
      failed("Couldn't make the PDF", e);
    } finally {
      setPdfBusy(null);
    }
  };

  const requestSort = (key: "name" | "updatedAt") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: "name" | "updatedAt") => {
    if (sortConfig.key !== key) {
      return (
        <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
      );
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    ) : (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    );
  };

  if (projects === null) {
    return (
      <div
        className="border border-border rounded-xl bg-card overflow-hidden shadow-xs"
        aria-busy="true"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:bg-transparent select-none">
              <TableHead className="px-6 py-4">Project Name</TableHead>
              <TableHead className="px-6 py-4">Last Modified</TableHead>
              <TableHead className="px-6 py-4 text-right w-[240px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <TableRow key={i}>
                <TableCell className="px-6 py-4">
                  <Skeleton className="h-6 w-48" />
                </TableCell>
                <TableCell className="px-6 py-4">
                  <Skeleton className="h-6 w-24" />
                </TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <Skeleton className="h-8 w-16 ml-auto" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Create one from a template, or import a ZIP you already have.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onNew}>
            <Plus /> New project
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const sortedProjects = [...projects].sort((a, b) => {
    if (sortConfig.key === "name") {
      const aStr = a.name.toLowerCase();
      const bStr = b.name.toLowerCase();
      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    } else {
      const aTime = a.updatedAt;
      const bTime = b.updatedAt;
      if (aTime < bTime) return sortConfig.direction === "asc" ? -1 : 1;
      if (aTime > bTime) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    }
  });

  return (
    <TooltipProvider>
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:bg-transparent select-none">
              <TableHead className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => requestSort("name")}
                  className="flex items-center hover:text-foreground transition-colors font-semibold text-left text-xs uppercase tracking-wider group"
                >
                  Project Name {getSortIcon("name")}
                </button>
              </TableHead>
              <TableHead className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => requestSort("updatedAt")}
                  className="flex items-center hover:text-foreground transition-colors font-semibold text-left text-xs uppercase tracking-wider group"
                >
                  Last Modified {getSortIcon("updatedAt")}
                </button>
              </TableHead>
              <TableHead className="px-6 py-4 text-right w-[240px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border text-sm text-foreground">
            {sortedProjects.map((p) => (
              <TableRow
                key={p.id}
                onClick={() => api.openProject(p.id)}
                className="hover:bg-secondary/20 transition-colors group cursor-pointer"
              >
                <TableCell className="px-6 py-4 font-medium text-foreground">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-all shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        api.openProject(p.id);
                      }}
                      className="truncate font-medium text-left hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    >
                      {p.name}
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 text-muted-foreground font-light">
                  <span title={new Date(p.updatedAt).toLocaleString()}>
                    {timeAgo(p.updatedAt) || "a while ago"}
                  </span>
                </TableCell>
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  className="px-6 py-4 text-right w-[240px]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary transition-colors bg-secondary/50 rounded-lg border border-border"
                          onClick={() => api.openProject(p.id)}
                          aria-label={`Open ${p.name}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open Project</TooltipContent>
                    </Tooltip>
                    <RowAction label="Rename" aria={`Rename ${p.name}`} onClick={() => onRename(p)}>
                      <Pencil className="h-4 w-4" />
                    </RowAction>
                    <RowAction
                      label={pdfBusy === p.id ? "Preparing PDF…" : "Download PDF"}
                      aria={`Download PDF of ${p.name}`}
                      disabled={pdfBusy === p.id}
                      onClick={() => void handleDownloadPdf(p)}
                    >
                      {pdfBusy === p.id ? <Spinner /> : <FileDown className="h-4 w-4" />}
                    </RowAction>
                    <RowAction
                      label="Export as ZIP"
                      aria={`Export ${p.name} as ZIP`}
                      href={api.exportUrl(p.id)}
                    >
                      <Download className="h-4 w-4" />
                    </RowAction>
                    <RowAction
                      label="Move to trash"
                      aria={`Move ${p.name} to trash`}
                      destructive
                      onClick={() => onTrash(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </RowAction>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

/** One icon button of a project row: a tooltip names it, `aria` is its accessible name. */
function RowAction({
  label,
  aria,
  children,
  onClick,
  href,
  disabled,
  destructive,
}: {
  label: string;
  aria: string;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const className = destructive
    ? "h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
    : "h-8 w-8";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Button variant="outline" size="icon" className={className} asChild>
            <a href={href} download aria-label={aria}>
              {children}
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className={className}
            aria-label={aria}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TrashList({
  items,
  onRestore,
  onPurge,
}: {
  items: api.TrashItem[];
  onRestore: (t: api.TrashItem) => void;
  onPurge: (t: api.TrashItem) => void;
}) {
  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trash2 />
          </EmptyMedia>
          <EmptyTitle>Trash is empty</EmptyTitle>
          <EmptyDescription>
            Deleted projects stay here for 7 days before they're removed for good.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:bg-transparent select-none">
            <TableHead className="px-6 py-4">Name</TableHead>
            <TableHead className="px-6 py-4">Deleted</TableHead>
            <TableHead className="px-6 py-4">Removed in</TableHead>
            <TableHead className="px-6 py-4 text-right w-[240px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border text-sm text-foreground">
          {items.map((t) => (
            <TableRow key={t.id} className="hover:bg-secondary/20 transition-colors">
              <TableCell className="px-6 py-4 font-medium text-foreground">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="truncate font-medium">{t.name}</span>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4 text-muted-foreground font-light">
                {timeAgo(t.deletedAt)}
              </TableCell>
              <TableCell className="px-6 py-4 text-muted-foreground font-light">
                removed for good in {daysLeft(t.purgeAt)} day{daysLeft(t.purgeAt) === 1 ? "" : "s"}
              </TableCell>
              <TableCell className="px-6 py-4 text-right w-[240px]">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onRestore(t)}>
                    <RotateCcw className="size-3.5" /> Restore
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onPurge(t)}>
                    Delete forever
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
