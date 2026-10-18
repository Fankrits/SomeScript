import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeLatestJson } from "./make-latest-json.mjs";

describe("makeLatestJson", () => {
  let tempDir: string;
  const version = "0.1.2";
  const repo = "Fankrits/SomeScript";
  const tag = "desktop-v0.1.2";

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `somescript-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("does nothing and returns false when there are no .sig files", () => {
    // Only standard unsigned installers exist
    writeFileSync(join(tempDir, `SomeScript-${version}-macos-universal.dmg`), "dmg");
    writeFileSync(join(tempDir, `SomeScript-${version}-windows-x64-setup.exe`), "exe");
    writeFileSync(join(tempDir, `SomeScript-${version}-linux-x64.AppImage`), "appimage");

    const result = makeLatestJson(version, repo, tag, tempDir);
    expect(result).toBe(false);
    expect(existsSync(join(tempDir, "latest.json"))).toBe(false);
  });

  test("throws when only a partial set of signatures/artifacts exists", () => {
    // macOS sig exists, but Windows and Linux are missing
    writeFileSync(join(tempDir, `SomeScript-${version}-macos-universal.app.tar.gz`), "tar");
    writeFileSync(join(tempDir, `SomeScript-${version}-macos-universal.app.tar.gz.sig`), "mac-sig");

    expect(() => makeLatestJson(version, repo, tag, tempDir)).toThrow(
      /Partial artifact\/signature set/,
    );
    expect(existsSync(join(tempDir, "latest.json"))).toBe(false);
  });

  test("generates valid latest.json when all signatures and payloads exist", () => {
    const macSig = "untrusted comment: mac sig\nRWS...";
    const winSig = "untrusted comment: win sig\nRWS...";
    const linuxSig = "untrusted comment: linux sig\nRWS...";

    writeFileSync(join(tempDir, `SomeScript-${version}-macos-universal.app.tar.gz`), "mac-payload");
    writeFileSync(join(tempDir, `SomeScript-${version}-macos-universal.app.tar.gz.sig`), macSig);

    writeFileSync(join(tempDir, `SomeScript-${version}-windows-x64-setup.exe`), "win-payload");
    writeFileSync(join(tempDir, `SomeScript-${version}-windows-x64-setup.exe.sig`), winSig);

    writeFileSync(join(tempDir, `SomeScript-${version}-linux-x64.AppImage`), "linux-payload");
    writeFileSync(join(tempDir, `SomeScript-${version}-linux-x64.AppImage.sig`), linuxSig);

    const pubDate = "2026-10-14T12:00:00.000Z";
    const result = makeLatestJson(version, repo, tag, tempDir, { pubDate });
    expect(result).toBe(true);

    const latestJsonPath = join(tempDir, "latest.json");
    expect(existsSync(latestJsonPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(latestJsonPath, "utf8"));
    expect(manifest.version).toBe(version);
    expect(manifest.notes).toBe(`SomeScript ${version}`);
    expect(manifest.pub_date).toBe(pubDate);

    const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;
    expect(manifest.platforms["darwin-aarch64"]).toEqual({
      signature: macSig,
      url: `${baseUrl}/SomeScript-${version}-macos-universal.app.tar.gz`,
    });
    expect(manifest.platforms["darwin-x86_64"]).toEqual({
      signature: macSig,
      url: `${baseUrl}/SomeScript-${version}-macos-universal.app.tar.gz`,
    });
    expect(manifest.platforms["windows-x86_64"]).toEqual({
      signature: winSig,
      url: `${baseUrl}/SomeScript-${version}-windows-x64-setup.exe`,
    });
    expect(manifest.platforms["linux-x86_64"]).toEqual({
      signature: linuxSig,
      url: `${baseUrl}/SomeScript-${version}-linux-x64.AppImage`,
    });
  });

  test("CLI works via subprocess", () => {
    const scriptPath = join(import.meta.dir, "make-latest-json.mjs");
    // Unsigned case: exit code 0, no output
    const resUnsigned = Bun.spawnSync(["bun", scriptPath, version, repo, tag, tempDir]);
    expect(resUnsigned.exitCode).toBe(0);
    expect(resUnsigned.stdout.toString()).toBe("");

    // Partial case: exit code 1
    writeFileSync(join(tempDir, `SomeScript-${version}-linux-x64.AppImage.sig`), "partial-sig");
    const resPartial = Bun.spawnSync(["bun", scriptPath, version, repo, tag, tempDir]);
    expect(resPartial.exitCode).toBe(1);
    expect(resPartial.stderr.toString()).toContain("Partial artifact/signature set");
  });
});
