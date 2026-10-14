/** What this system calls its file manager, for sentences like "open it in Finder". */
export function fileManagerName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(ua)) return "File Explorer";
  if (/Macintosh|Mac OS/i.test(ua)) return "Finder";
  return "your file manager";
}
