/**
 * Where Settings' "Back" button goes. `from` is read from the page's own URL, so it is never
 * followed as given: the only places this app sends you back to are the dashboard and a project's
 * editor (`/?projectId=<id>`), so the target is rebuilt from the project id alone. Whatever else
 * `from` holds (`//host`, `/\host`, `https://host`, `javascript:`, a tab hidden inside `//`) can
 * only ever lead to the dashboard.
 */
export function backTarget(search: string): string {
  const dashboard = "/dashboard";
  const from = new URLSearchParams(search).get("from");
  if (!from) return dashboard;
  let url: URL;
  try {
    // The base is a placeholder: only the parsed path and query are read, never the host.
    url = new URL(from, "http://placeholder.invalid");
  } catch {
    return dashboard;
  }
  const projectId = url.searchParams.get("projectId");
  return url.pathname === "/" && projectId
    ? `/?projectId=${encodeURIComponent(projectId)}`
    : dashboard;
}
