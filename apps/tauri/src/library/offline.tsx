import { useCallback, useState } from "react";
import { CheckCircle2, WifiOff } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import * as api from "./api";

export type OfflineRun = { state: "running" | "done" | "failed"; log: string };

/**
 * The package warm-up compile (`POST /api/prepare-offline`): downloads the LaTeX packages most
 * documents need, once, so compiling works without a connection afterwards. `run` is null until
 * `start` is called.
 */
export function useOfflinePrep() {
  const [run, setRun] = useState<OfflineRun | null>(null);
  const start = useCallback(() => {
    setRun({ state: "running", log: "" });
    api
      .prepareOffline((log) => setRun({ state: "running", log }))
      .then((log) => setRun({ state: log.includes("[SUCCESS]") ? "done" : "failed", log }))
      .catch((e) => setRun({ state: "failed", log: String(e) }));
  }, []);
  return { run, start };
}

/** Progress, the outcome in words, and the tail of Tectonic's log while it hasn't succeeded. */
export function OfflineStatus({ run }: { run: OfflineRun }) {
  const offlineIssue = run.log.includes("[NETWORK]");
  const tail = run.log.trim().split("\n").slice(-6).join("\n");
  return (
    <>
      <div className="flex items-center gap-2 text-sm" role="status" data-testid="offline-status">
        {run.state === "running" && (
          <>
            <Spinner /> Downloading packages. The first run can take a minute or two.
          </>
        )}
        {run.state === "done" && (
          <>
            <CheckCircle2 className="size-4 text-emerald-600" /> All set. These packages now work
            offline.
          </>
        )}
        {run.state === "failed" && (
          <>
            <WifiOff className="size-4 text-destructive" />
            {offlineIssue
              ? "Couldn't reach the package server. Check your connection and try again."
              : "Preparing failed. See the log below."}
          </>
        )}
      </div>
      {tail && run.state !== "done" && (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {tail}
        </pre>
      )}
    </>
  );
}
