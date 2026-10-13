// Release gate: the git tag, Cargo.toml, tauri.conf.json and package.json must all name the
// same version, so a published bundle can't be labelled differently from what it contains.
//
//   bun scripts/check-version.mjs desktop-v0.2.0     (CI passes the tag; defaults to $GITHUB_REF_NAME)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TAG = /^desktop-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/** Returns a list of problems; empty means the versions agree. */
export function checkVersions({ tag, cargoToml, tauriConf, packageJson }) {
  const problems = [];
  const fromTag = TAG.exec(tag)?.[1];
  if (!fromTag) {
    problems.push(`tag "${tag}" is not of the form desktop-vMAJOR.MINOR.PATCH[-prerelease]`);
  }
  const cargo = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
  const found = {
    "src-tauri/Cargo.toml": cargo,
    "tauri.conf.json": tauriConf.version,
    "package.json": packageJson.version,
  };
  for (const [file, version] of Object.entries(found)) {
    if (!version) problems.push(`${file} has no version`);
    else if (fromTag && version !== fromTag)
      problems.push(`${file} is ${version}, but the tag says ${fromTag}`);
  }
  return problems;
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const problems = checkVersions({
    tag: process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "",
    cargoToml: read("src-tauri/Cargo.toml"),
    tauriConf: JSON.parse(read("src-tauri/tauri.conf.json")),
    packageJson: JSON.parse(read("package.json")),
  });
  if (problems.length) {
    console.error(`Version check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("Tag, Cargo.toml, tauri.conf.json and package.json agree.");
}
