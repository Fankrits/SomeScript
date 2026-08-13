// Shared by the browser-side `-client.ts` modules (editor-prefs-client.ts,
// eve-threads-client.ts). No server imports — safe for the browser bundle.

/** Parses a fetch Response as JSON, throwing with the status/body on failure. */
export async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}
