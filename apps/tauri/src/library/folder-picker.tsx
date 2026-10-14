import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "./api";

/** A path box with the system's folder picker beside it (only inside the desktop app). */
export function FolderPicker({
  value,
  onChange,
  disabled,
  testId = "folder-path-input",
  browseFrom,
}: {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  testId?: string;
  /**
   * Where the system picker opens. Defaults to what is in the box; pass null when that folder
   * doesn't exist yet (the proposed default before setup makes it), so the picker opens where the
   * system likes instead of on a path that isn't there.
   */
  browseFrom?: string | null;
}) {
  const browse = async () => {
    try {
      const start = browseFrom === undefined ? value : browseFrom;
      const chosen = await pickFolder({ directory: true, defaultPath: start || undefined });
      if (typeof chosen === "string") onChange(chosen);
    } catch (e) {
      toast.error(`Couldn't open the folder picker: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <div className="flex gap-2">
      <Input
        aria-label="Folder path"
        data-testid={testId}
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs"
      />
      {api.inTauri() && (
        <Button type="button" variant="outline" disabled={disabled} onClick={browse}>
          <FolderOpen /> Browse
        </Button>
      )}
    </div>
  );
}
