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

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
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

export const getLibraryPath = () =>
  call<{ libraryPath: string }>("/api/settings").then((r) => r.libraryPath);
export const setLibraryPath = (libraryPath: string) =>
  post<{ libraryPath: string }>("/api/settings", { libraryPath }).then((r) => r.libraryPath);

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
