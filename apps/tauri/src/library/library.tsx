import { useCallback, useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Download,
  FileText,
  FolderOpen,
  FolderSync,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as api from "./api";
import {
  FolderDialog,
  ImportDialog,
  NewProjectDialog,
  OfflineDialog,
  RenameDialog,
} from "./dialogs";
import { daysLeft, timeAgo } from "./format";

type Dialog = "new" | "import" | "folder" | "offline" | null;

const failed = (what: string, e: unknown) =>
  toast.error(`${what}: ${e instanceof Error ? e.message : String(e)}`);

export default function Library() {
  const [projects, setProjects] = useState<api.Project[] | null>(null);
  const [trash, setTrash] = useState<api.TrashItem[]>([]);
  const [libraryPath, setLibraryPath] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"projects" | "trash">("projects");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [renaming, setRenaming] = useState<api.Project | null>(null);
  const [purging, setPurging] = useState<api.TrashItem | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, t, path] = await Promise.all([
        api.listProjects(),
        api.listTrash(),
        api.getLibraryPath(),
      ]);
      setProjects(p);
      setTrash(t);
      setLibraryPath(path);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-9" />
        <div className="grid">
          <h1 className="text-lg font-semibold tracking-tight">SomeScript</h1>
          <p className="text-sm text-muted-foreground">
            Your LaTeX projects, stored on this computer.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => setDialog("import")}>
            <Upload /> Import
          </Button>
          <Button onClick={() => setDialog("new")}>
            <Plus /> New project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialog("folder")}>
                <FolderSync /> Change library folder…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("offline")}>
                <WifiOff /> Prepare for offline use…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {libraryPath && (
        <div className="-mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <span className="shrink-0">Saved in</span>
          <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono">
            {libraryPath}
          </code>
          {api.inTauri() && (
            <Button variant="ghost" size="xs" onClick={showFolder}>
              <FolderOpen /> Show
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="projects">
            Projects{projects ? ` (${projects.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="trash">Trash{trash.length ? ` (${trash.length})` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      {loadError ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Couldn't read your library</EmptyTitle>
            <EmptyDescription>{loadError}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog("folder")}>
                Choose another folder
              </Button>
              <Button onClick={() => void refresh()}>Try again</Button>
            </div>
          </EmptyContent>
        </Empty>
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

      <NewProjectDialog open={dialog === "new"} onOpenChange={(o) => setDialog(o ? "new" : null)} />
      <ImportDialog
        open={dialog === "import"}
        onOpenChange={(o) => setDialog(o ? "import" : null)}
      />
      <OfflineDialog
        open={dialog === "offline"}
        onOpenChange={(o) => setDialog(o ? "offline" : null)}
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
    </main>
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
  if (projects === null) {
    return (
      <div className="grid gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
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
  return (
    <ul className="grid gap-2">
      {projects.map((p) => (
        <li
          key={p.id}
          className="group flex items-center rounded-lg border bg-card transition-colors hover:bg-muted/40"
        >
          <button
            type="button"
            onClick={() => api.openProject(p.id)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <FileText className="size-5 shrink-0 text-primary" />
            <span className="grid min-w-0">
              <span className="truncate font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                Edited {timeAgo(p.updatedAt) || "a while ago"}
              </span>
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mr-2"
                aria-label={`Actions for ${p.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => api.openProject(p.id)}>
                <FileText /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(p)}>
                <Pencil /> Rename…
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={api.exportUrl(p.id)} download>
                  <Download /> Export as ZIP
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onTrash(p)}>
                <Trash2 /> Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
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
    <ul className="grid gap-2">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">
              Deleted {timeAgo(t.deletedAt)} · removed for good in {daysLeft(t.purgeAt)} day
              {daysLeft(t.purgeAt) === 1 ? "" : "s"}
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={() => onRestore(t)}>
            <RotateCcw /> Restore
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onPurge(t)}>
            Delete forever
          </Button>
        </li>
      ))}
    </ul>
  );
}
