import { CircleAlert, CircleCheck, RotateCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import * as api from "./api";

/**
 * What the app found out about the folder in the box: ready, will be created, or a problem with
 * the reason, what to try, and other places that would work. Warnings (a cloud-synced folder, a
 * network share, a folder the OS protects) don't stop anything but are worth knowing first.
 */
export function FolderStatus({
  check,
  checking,
  error,
  onUse,
  onRecheck,
}: {
  check: api.FolderCheck | null;
  checking: boolean;
  error?: unknown;
  /** Called with one of `check.alternatives` the user picked. */
  onUse?: (path: string) => void;
  onRecheck?: () => void;
}) {
  if (error) {
    return (
      <Alert variant="destructive" data-testid="folder-status">
        <CircleAlert />
        <AlertTitle>Couldn't check this folder</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : String(error)}
        </AlertDescription>
      </Alert>
    );
  }
  if (checking || !check) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
        data-testid="folder-status"
        data-state="checking"
      >
        <Spinner /> Checking the folder…
      </p>
    );
  }

  return (
    <div
      className="grid gap-2"
      data-testid="folder-status"
      data-state={check.issue ? "issue" : "ok"}
    >
      {check.issue ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{check.issue.message}</AlertTitle>
          <AlertDescription>
            {check.issue.hint && <p>{check.issue.hint}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {onRecheck && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-foreground"
                  onClick={onRecheck}
                >
                  <RotateCw /> Check again
                </Button>
              )}
            </div>
            {check.alternatives.length > 0 && onUse && (
              <div className="mt-3 grid gap-1.5">
                <p className="text-xs font-medium text-foreground">Or use a folder that works:</p>
                {check.alternatives.map((alt) => (
                  <Button
                    key={alt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start py-1.5 font-mono text-xs break-all whitespace-normal text-foreground"
                    data-testid="folder-alternative"
                    onClick={() => onUse(alt)}
                  >
                    {alt}
                  </Button>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-start gap-2 text-sm" role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span>
            {check.exists
              ? check.projectCount > 0
                ? `Found ${check.projectCount} project${check.projectCount === 1 ? "" : "s"} here. Ready to use.`
                : "This folder is ready to use."
              : "This folder doesn't exist yet. SomeScript will create it."}
          </span>
        </p>
      )}
      {check.warnings.map((w) => (
        <Alert key={w.kind} data-testid="folder-warning">
          <TriangleAlert />
          <AlertDescription>{w.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
