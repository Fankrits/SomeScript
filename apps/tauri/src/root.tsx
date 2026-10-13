import { lazy, Suspense } from "react";

// apps/editor's page, untouched: it reads ?projectId= from the URL itself.
const Editor = lazy(() => import("@/app/page"));
const Library = lazy(() => import("./library/library"));

/**
 * `/dashboard` is where the editor's Home link points when NEXT_PUBLIC_WEB_URL is unset
 * (apps/editor/app/page.tsx), so the project library lives there. No editor changes needed.
 */
export function Root() {
  const { pathname, search } = window.location;

  if (pathname.startsWith("/dashboard")) {
    return (
      <Suspense fallback={null}>
        <Library />
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
