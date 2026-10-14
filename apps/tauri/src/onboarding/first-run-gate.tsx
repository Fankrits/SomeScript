import { useEffect, useState, type ReactNode } from "react";
import { getSettings } from "../library/api";

/**
 * Sends a first run to `/welcome` before the dashboard shows. It asks only for the settings, which
 * the server works out from the config and environment without opening the library folder, so
 * nothing the OS protects is touched before the setup screen has explained why.
 *
 * If the settings can't be read it lets the dashboard through: that screen reports problems with
 * the library and how to fix them, and setup must never be a wall the user can't get past.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let current = true;
    getSettings()
      .then((s) => {
        if (!s.onboarded) window.location.replace("/welcome");
        else if (current) setReady(true);
      })
      .catch(() => current && setReady(true));
    return () => {
      current = false;
    };
  }, []);
  return ready ? <>{children}</> : null;
}
