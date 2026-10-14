import { useCallback, useEffect, useState } from "react";
import * as api from "./api";

type Settled = { path: string; check?: api.FolderCheck; error?: unknown };

/**
 * Looks at `path` once the user stops typing (see `GET /api/library/check`). An answer for a path
 * that has since changed is dropped, so the status never describes a folder that is no longer
 * the one in the box.
 */
export function useFolderCheck(path: string, delayMs = 350) {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [round, setRound] = useState(0);
  const wanted = path.trim();

  useEffect(() => {
    if (!wanted) return;
    let current = true;
    const timer = setTimeout(() => {
      api
        .checkFolder(wanted)
        .then((check) => current && setSettled({ path: wanted, check }))
        .catch((error) => current && setSettled({ path: wanted, error }));
    }, delayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [wanted, delayMs, round]);

  const fresh = wanted !== "" && settled?.path === wanted ? settled : null;
  /** Looks again (after the user fixed something outside the app, e.g. allowed it in Windows Security). */
  const recheck = useCallback(() => {
    setSettled(null);
    setRound((r) => r + 1);
  }, []);
  return {
    check: fresh?.check ?? null,
    error: fresh?.error,
    checking: wanted !== "" && fresh === null,
    recheck,
  };
}
