// Dependency-audit gate that fails only on advisories that are NEW since the committed baseline.
//
// `bun audit` exits non-zero for any advisory, and this repo already has a backlog, so a plain
// gate would fail forever and teach everyone to ignore it. Instead:
//   - advisories listed in .github/audit-baseline.json are known and only reported;
//   - a new advisory at or above --fail-on (default: high) fails the build;
//   - advisories that were fixed are listed so the baseline can shrink (`--update`).
//
//   bun .github/scripts/audit-gate.mjs                  gate (CI)
//   bun .github/scripts/audit-gate.mjs --update         rewrite the baseline from the current audit
//   bun .github/scripts/audit-gate.mjs --fail-on critical
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RANK = { low: 1, moderate: 2, high: 3, critical: 4 };

/**
 * `bun audit --json` output (package -> advisories) -> { "<package>#GHSA-...": { advisory, package, severity, title } }
 * Keyed by package AND advisory: the same advisory reaching a new package must count as new.
 */
export function flatten(audit) {
  const out = {};
  for (const [pkg, advisories] of Object.entries(audit)) {
    for (const a of advisories) {
      const advisory = String(a.url ?? a.id)
        .split("/")
        .pop();
      out[`${pkg}#${advisory}`] = { advisory, package: pkg, severity: a.severity, title: a.title };
    }
  }
  return out;
}

export function compare(current, baseline, failOn = "high") {
  const threshold = RANK[failOn];
  if (!threshold) throw new Error(`--fail-on must be one of ${Object.keys(RANK).join(", ")}`);
  const added = Object.entries(current).filter(([id]) => !(id in baseline));
  const resolved = Object.entries(baseline).filter(([id]) => !(id in current));
  const failing = added.filter(([, a]) => (RANK[a.severity] ?? 0) >= threshold);
  return { added, resolved, failing };
}

function summarize(current, { added, resolved, failing }, failOn) {
  const counts = Object.values(current).reduce(
    (c, a) => ({ ...c, [a.severity]: (c[a.severity] ?? 0) + 1 }),
    {},
  );
  const row = ([, a]) =>
    `| ${a.advisory} | ${a.package} | ${a.severity} | ${a.title.replaceAll("|", "\\|")} |`;
  const table = (rows) =>
    `| Advisory | Package | Severity | Title |\n|---|---|---|---|\n${rows.map(row).join("\n")}\n`;
  return [
    "## Dependency audit",
    `${Object.keys(current).length} advisories (${
      Object.entries(counts)
        .map(([s, n]) => `${n} ${s}`)
        .join(", ") || "none"
    }); ` + `${added.length} new since the baseline, ${resolved.length} fixed.`,
    failing.length ? `\n### New at or above \`${failOn}\` (blocking)\n${table(failing)}` : "",
    added.length > failing.length
      ? `\n### New below the threshold\n${table(added.filter((x) => !failing.includes(x)))}`
      : "",
    resolved.length
      ? `\n### Fixed: run \`bun .github/scripts/audit-gate.mjs --update\` to drop them from the baseline\n${table(resolved)}`
      : "",
  ].join("\n");
}

if (import.meta.main) {
  const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "../audit-baseline.json");
  const args = process.argv.slice(2);
  const failOn = args.includes("--fail-on") ? args[args.indexOf("--fail-on") + 1] : "high";

  const run = Bun.spawnSync(["bun", "audit", "--json"], { stdout: "pipe", stderr: "pipe" });
  let audit;
  try {
    audit = JSON.parse(run.stdout.toString() || "{}");
  } catch {
    console.error(`could not parse \`bun audit --json\`:\n${run.stdout}\n${run.stderr}`);
    process.exit(2);
  }
  const current = flatten(audit);

  if (args.includes("--update")) {
    writeFileSync(baselinePath, `${JSON.stringify({ advisories: current }, null, 2)}\n`);
    console.log(`baseline updated: ${Object.keys(current).length} advisories`);
    process.exit(0);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).advisories;
  const result = compare(current, baseline, failOn);
  const report = summarize(current, result, failOn);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (result.failing.length) {
    console.error(`\n${result.failing.length} new advisory/advisories at or above "${failOn}".`);
    process.exit(1);
  }
}
