"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Clarity from "@microsoft/clarity";

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

/** No-ops when NEXT_PUBLIC_CLARITY_PROJECT_ID isn't set, so call sites never need to guard. */
export function trackEvent(name: string) {
  if (!CLARITY_PROJECT_ID) return;
  Clarity.event(name);
}

/** Flags the current session for priority review/recording (e.g. after an error). */
export function upgradeSession(reason: string) {
  if (!CLARITY_PROJECT_ID) return;
  Clarity.upgrade(reason);
}

/**
 * Microsoft Clarity: session recordings, heatmaps, and behavioral analytics.
 * Mounted once near the root, inside ClerkProvider. Re-runs identify on every
 * route change per Clarity's own guidance (see @microsoft/clarity README).
 */
export function ClarityAnalytics() {
  const { user } = useUser();
  const pathname = usePathname();

  useEffect(() => {
    if (!CLARITY_PROJECT_ID) return;
    Clarity.init(CLARITY_PROJECT_ID);
    Clarity.setTag("app", "web");
    if (user) {
      Clarity.identify(
        user.id,
        undefined,
        undefined,
        user.fullName ?? user.primaryEmailAddress?.emailAddress ?? undefined,
      );
    }
  }, [user, pathname]);

  return null;
}
