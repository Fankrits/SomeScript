// Browser-side counterpart to lib/editor-prefs-storage.ts. Types only via
// `import type` so this file never pulls lib/storage.ts's Node/S3 imports
// into the client bundle — same reasoning as lib/eve-threads-client.ts.
import type { EditorPrefs } from "./editor-prefs-storage";

export type { EditorPrefs };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

export async function fetchEditorPrefs(projectId: string): Promise<EditorPrefs | null> {
  try {
    const { prefs } = await json<{ prefs: EditorPrefs }>(
      await fetch(`/api/editor-prefs?projectId=${encodeURIComponent(projectId)}`),
    );
    return prefs;
  } catch (e) {
    console.error("Failed to fetch editor prefs", e);
    return null;
  }
}

/** Partial update — the server merges this into the existing stored prefs. */
export async function saveEditorPrefs(
  projectId: string,
  prefs: Partial<EditorPrefs>,
): Promise<boolean> {
  try {
    await json(
      await fetch("/api/editor-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prefs }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to save editor prefs", e);
    return false;
  }
}
