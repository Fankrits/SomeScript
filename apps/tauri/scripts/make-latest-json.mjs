// Official source: https://v2.tauri.app/plugin/updater/#static-json-file
// Generates the static `latest.json` manifest for the Tauri v2 updater from signed build artifacts in dist/.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Builds the latest.json updater manifest from artifacts in distDir.
 * Returns true if latest.json was generated, false if no .sig files were present.
 * Throws if only a partial set of signatures exists.
 */
export function makeLatestJson(version, repo, tag, distDir, options = {}) {
  const dist = resolve(distDir);
  if (!existsSync(dist)) {
    throw new Error(`Distribution directory not found: ${dist}`);
  }

  const files = readdirSync(dist);
  const sigFiles = files.filter((f) => f.endsWith(".sig"));

  // If there are no .sig files (unsigned release), do nothing and exit cleanly.
  if (sigFiles.length === 0) {
    return false;
  }

  const expectedArtifacts = [
    {
      platformKey: "darwin",
      payload: `SomeScript-${version}-macos-universal.app.tar.gz`,
      sig: `SomeScript-${version}-macos-universal.app.tar.gz.sig`,
    },
    {
      platformKey: "windows-x86_64",
      payload: `SomeScript-${version}-windows-x64-setup.exe`,
      sig: `SomeScript-${version}-windows-x64-setup.exe.sig`,
    },
    {
      platformKey: "linux-x86_64",
      payload: `SomeScript-${version}-linux-x64.AppImage`,
      sig: `SomeScript-${version}-linux-x64.AppImage.sig`,
    },
  ];

  const missing = [];
  for (const { payload, sig } of expectedArtifacts) {
    if (!files.includes(sig)) {
      missing.push(sig);
    }
    if (!files.includes(payload)) {
      missing.push(payload);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Partial artifact/signature set for update feed. Missing:\n${missing.map((m) => `  - ${m}`).join("\n")}`,
    );
  }

  const macSig = readFileSync(
    resolve(dist, `SomeScript-${version}-macos-universal.app.tar.gz.sig`),
    "utf8",
  ).trim();
  const winSig = readFileSync(
    resolve(dist, `SomeScript-${version}-windows-x64-setup.exe.sig`),
    "utf8",
  ).trim();
  const linuxSig = readFileSync(
    resolve(dist, `SomeScript-${version}-linux-x64.AppImage.sig`),
    "utf8",
  ).trim();

  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;
  const pubDate = options.pubDate ?? new Date().toISOString();

  const manifest = {
    version,
    notes: options.notes ?? `SomeScript ${version}`,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64": {
        signature: macSig,
        url: `${baseUrl}/SomeScript-${version}-macos-universal.app.tar.gz`,
      },
      "darwin-x86_64": {
        signature: macSig,
        url: `${baseUrl}/SomeScript-${version}-macos-universal.app.tar.gz`,
      },
      "linux-x86_64": {
        signature: linuxSig,
        url: `${baseUrl}/SomeScript-${version}-linux-x64.AppImage`,
      },
      "windows-x86_64": {
        signature: winSig,
        url: `${baseUrl}/SomeScript-${version}-windows-x64-setup.exe`,
      },
    },
  };

  const targetPath = resolve(dist, "latest.json");
  writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return true;
}

if (import.meta.main || process.argv[1]?.endsWith("make-latest-json.mjs")) {
  const [version, repo, tag, distDir] = process.argv.slice(2);
  if (!version || !repo || !tag || !distDir) {
    console.error("Usage: node scripts/make-latest-json.mjs <version> <repo> <tag> <dist-dir>");
    process.exit(1);
  }

  try {
    const generated = makeLatestJson(version, repo, tag, distDir);
    if (generated) {
      console.log(`Generated ${resolve(distDir, "latest.json")}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
