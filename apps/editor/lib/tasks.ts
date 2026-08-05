import { storage, type StorageProvider } from "./storage";

export const TASKS_PATH = ".somescript/tasks.json";

const MAX_TASKS = 500;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

export interface Task {
  id: string;
  name: string;
  description?: string;
  done: boolean;
  status?: "todo" | "ongoing" | "finished";
  createdAt: number;
  source?: {
    path?: string; // editor only; omitted for PDF (one PDF per project)
    line?: number; // editor: 1-based first line of the selection
    endLine?: number; // editor: 1-based last line — display only
    page?: number; // pdf: 1-based
  };
}

function sanitizeSource(input: unknown): Task["source"] {
  if (typeof input !== "object" || input === null) return undefined;
  const s = input as Record<string, unknown>;
  const source: Task["source"] = {};
  if (typeof s.path === "string") source.path = s.path;
  if (typeof s.line === "number" && Number.isFinite(s.line)) source.line = s.line;
  if (typeof s.endLine === "number" && Number.isFinite(s.endLine)) source.endLine = s.endLine;
  if (typeof s.page === "number" && Number.isFinite(s.page)) source.page = s.page;
  return Object.keys(source).length > 0 ? source : undefined;
}

/** Coerce untrusted JSON (request body, or a hand-edited file) into Task[]. */
export function sanitizeTasks(input: unknown): Task[] {
  if (!Array.isArray(input)) return [];
  const tasks: Task[] = [];
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.id !== "string" || typeof t.name !== "string") continue;
    const task: Task = {
      id: t.id,
      name: t.name.slice(0, MAX_NAME_LENGTH),
      done: Boolean(t.done),
      status: (["todo", "ongoing", "finished"].includes(t.status as string)
        ? t.status
        : t.done
          ? "finished"
          : "todo") as Task["status"],
      createdAt:
        typeof t.createdAt === "number" && Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
      source: sanitizeSource(t.source),
    };
    if (typeof t.description === "string" && t.description.length > 0) {
      task.description = t.description.slice(0, MAX_DESCRIPTION_LENGTH);
    }
    tasks.push(task);
    if (tasks.length >= MAX_TASKS) break;
  }
  return tasks;
}

/** Reads the project's tasks. Missing or unreadable file → []. */
export async function readTasks(
  projectId: string,
  s: Pick<StorageProvider, "readFile"> = storage,
): Promise<Task[]> {
  try {
    const content = await s.readFile(projectId, TASKS_PATH);
    return sanitizeTasks(JSON.parse(content));
  } catch {
    return [];
  }
}
