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
}: {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const browse = async () => {
    try {
      const chosen = await pickFolder({ directory: true, defaultPath: value || undefined });
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
