const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "just now". Empty for an unknown (0) timestamp. */
export function timeAgo(ms: number, now = Date.now()): string {
  if (!ms) return "";
  const seconds = Math.round((ms - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function daysLeft(purgeAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((purgeAt - now) / 86_400_000));
}

/** "thesis.zip" -> "thesis" */
export const stripZip = (filename: string) => filename.replace(/\.zip$/i, "");
