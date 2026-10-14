import { lazy, Suspense } from "react";
import { FirstRunGate } from "./onboarding/first-run-gate";

// apps/editor's page, untouched: it reads ?projectId= from the URL itself.
const Editor = lazy(() => import("@/app/page"));
const Library = lazy(() => import("./library/library"));
const Settings = lazy(() => import("./settings/settings"));
const Welcome = lazy(() => import("./onboarding/welcome"));

/**
 * `/dashboard` is where the editor's Home link points when NEXT_PUBLIC_WEB_URL is unset
 * (apps/editor/app/page.tsx), so the project library lives there. No editor changes needed.
 * `/settings` is the app-wide settings screen (AI providers and keys, library folder).
 * `/welcome` is first-run setup; the dashboard sends a first run there (see FirstRunGate).
 */
export function Root() {
  const { pathname, search } = window.location;

  if (pathname.startsWith("/welcome")) {
    return (
      <Suspense fallback={null}>
        <Welcome />
      </Suspense>
    );
  }
  if (pathname.startsWith("/dashboard")) {
    return (
      <FirstRunGate>
        <Suspense fallback={null}>
          <Library />
        </Suspense>
      </FirstRunGate>
    );
  }
  if (pathname.startsWith("/settings")) {
    return (
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    );
  }
  if (!new URLSearchParams(search).get("projectId")) {
    window.location.replace("/dashboard");
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}
