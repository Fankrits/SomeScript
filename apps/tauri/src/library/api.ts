// Client for the library endpoints in src-tauri/src/api/projects.rs.

export interface Project {
  id: string;
  name: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}
export interface TrashItem {
  id: string;
  name: string;
  deletedAt: number;
  purgeAt: number;
}
export interface Template {
  id: string;
  name: string;
  description: string;
}

/** A failed request: the server's message, plus what the user can try (folder problems carry one). */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiFailure(body.error ?? `Request failed (${res.status})`, res.status, body.hint);
  }
  return body as T;
}

const post = <T>(url: string, body: unknown) =>
  call<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const listProjects = () =>
  call<{ projects: Project[] }>("/api/projects").then((r) => r.projects);
export const listTemplates = () =>
  call<{ templates: Template[] }>("/api/templates").then((r) => r.templates);
export const listTrash = () => call<{ items: TrashItem[] }>("/api/trash").then((r) => r.items);

export const createProject = (name: string, template: string) =>
  post<{ id: string }>("/api/projects", { name, template }).then((r) => r.id);
export const renameProject = (id: string, name: string) =>
  post<{ id: string }>("/api/projects/rename", { id, name }).then((r) => r.id);
export const trashProject = (id: string) => post<unknown>("/api/projects/delete", { id });
export const restoreProject = (id: string) =>
  post<{ id: string }>("/api/trash/restore", { id }).then((r) => r.id);
export const purgeProject = (id: string) => post<unknown>("/api/trash/purge", { id });

export function importZip(file: File, name: string) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  return call<{ id: string }>("/api/projects/import", { method: "POST", body: form }).then(
    (r) => r.id,
  );
}

/** Why the library is where it is (src-tauri/src/library.rs `RootSource`). */
export type RootSource = "env" | "saved" | "default" | "fallback";
export interface LibrarySettings {
  libraryPath: string;
  source: RootSource;
  /** First-run setup is done (or has nothing left to ask). */
  onboarded: boolean;
  /** Where the library would be with nothing chosen: what setup proposes. */
  defaultLibraryPath: string;
  /** Where somescript.log is, if the app could work that out. */
  logFile: string | null;
}

/** What setup and Settings learn about a folder before choosing it (src-tauri/src/library.rs). */
export interface FolderIssue {
  kind: "not_absolute" | "not_a_folder" | "permission" | "unavailable" | "other";
  message: string;
  hint: string | null;
}
export interface FolderWarning {
  kind: "cloud_synced" | "network_share" | "install_folder";
  message: string;
}
export interface FolderCheck {
  /** The path as the user should see it. */
  path: string;
  exists: boolean;
  isDir: boolean;
  /** Proven by writing a file there and removing it again. */
  writable: boolean;
  /** Doesn't exist yet, but can be made. */
  creatable: boolean;
  /** Subfolders that would show up as projects. */
  projectCount: number;
  issue: FolderIssue | null;
  warnings: FolderWarning[];
  /** Other places that work; only sent when this one has an issue. */
  alternatives: string[];
}

/** Looks at a folder without creating it (it may write and remove one small probe file). */
export const checkFolder = (path: string) =>
  call<FolderCheck>(`/api/library/check?path=${encodeURIComponent(path)}`);
/** The folder name a typed project name will get: illegal characters swapped, a number added if taken. */
export const folderName = (name: string) =>
  call<{ id: string; changed: boolean }>(
    `/api/projects/folder-name?name=${encodeURIComponent(name)}`,
  );
/** A plain-text report (versions, folders, tool paths, log tail) to paste into a bug report. */
export async function diagnostics(): Promise<string> {
  const res = await fetch("/api/diagnostics");
  if (!res.ok) throw new ApiFailure(`Request failed (${res.status})`, res.status);
  return res.text();
}

/** Read from the config and environment only: it never touches the library folder. */
export const getSettings = () => call<LibrarySettings>("/api/settings");
export const getLibraryPath = () => getSettings().then((r) => r.libraryPath);
/** Creates the folder if needed, proves it can be written to, and remembers it. */
export const setLibraryPath = (libraryPath: string) =>
  post<LibrarySettings>("/api/settings", { libraryPath }).then((r) => r.libraryPath);
export const finishSetup = () => post<LibrarySettings>("/api/settings", { onboarded: true });

/** The editor reads ?projectId= from its own URL, so opening a project is a plain navigation. */
export const openProject = (id: string) =>
  window.location.assign(`/?projectId=${encodeURIComponent(id)}`);
export const exportUrl = (id: string) => `/api/projects/export?id=${encodeURIComponent(id)}`;

/** Streams the package warm-up compile; resolves with the full log. */
export async function prepareOffline(onLog: (log: string) => void): Promise<string> {
  const res = await fetch("/api/prepare-offline", { method: "POST" });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let log = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return log;
    log += decoder.decode(value, { stream: true });
    onLog(log);
  }
}

/** Tauri injects this global into every webview; it is absent in a plain browser tab. */
export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
