// The webview shows no download UI of its own, so the Rust side (src-tauri/src/lib.rs
// `on_download`) emits an event when a file lands in ~/Downloads and we say so here.
// Lives in the host entry, so it covers the editor's "Download PDF/file" buttons too.
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { inTauri } from "./library/api";

interface DownloadEvent {
  path: string | null;
  success: boolean;
}

export function announceDownloads() {
  if (!inTauri()) return; // a plain browser tab shows its own download UI
  void listen<DownloadEvent>("somescript-download", ({ payload }) => {
    const { path, success } = payload;
    const name = path?.split(/[\\/]/).pop() ?? "file";
    if (!success) {
      toast.error(`Couldn't save “${name}”`);
      return;
    }
    toast.success(`Saved “${name}” to Downloads`, {
      action: path ? { label: "Show", onClick: () => void revealItemInDir(path) } : undefined,
    });
  });
}
