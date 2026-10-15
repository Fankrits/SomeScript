import { expect, test } from "bun:test";
import { FALLBACK_RELEASE, parseRelease, RELEASES_URL } from "./release";

test("parses a normal release correctly", () => {
  const json = [
    {
      tag_name: "desktop-v0.1.3",
      draft: false,
      prerelease: false,
      published_at: "2026-04-14T10:00:00Z",
      html_url: "https://github.com/Fankrits/SomeScript/releases/tag/desktop-v0.1.3",
      assets: [
        {
          name: "SomeScript-0.1.3-macos-universal.dmg",
          browser_download_url: "https://example.com/download/macos.dmg",
        },
        {
          name: "SomeScript-0.1.3-windows-x64-setup.exe",
          browser_download_url: "https://example.com/download/windows-setup.exe",
        },
        {
          name: "SomeScript-0.1.3-linux-x64.AppImage",
          browser_download_url: "https://example.com/download/linux.AppImage",
        },
      ],
    },
  ];

  const result = parseRelease(json);
  expect(result.version).toBe("0.1.3");
  expect(result.publishedAt).toBe("2026-04-14T10:00:00Z");
  expect(result.html_url).toBe(
    "https://github.com/Fankrits/SomeScript/releases/tag/desktop-v0.1.3",
  );
  expect(result.downloads.macOS).toBe("https://example.com/download/macos.dmg");
  expect(result.downloads.Windows).toBe("https://example.com/download/windows-setup.exe");
  expect(result.downloads.Linux).toBe("https://example.com/download/linux.AppImage");
});

test("skips drafts, prereleases, and non-desktop releases", () => {
  const json = [
    {
      tag_name: "desktop-v0.2.0",
      draft: true,
      prerelease: false,
      assets: [],
    },
    {
      tag_name: "desktop-v0.2.0-beta.1",
      draft: false,
      prerelease: true,
      assets: [],
    },
    {
      tag_name: "v1.0.0",
      draft: false,
      prerelease: false,
      assets: [],
    },
    {
      tag_name: "desktop-v0.1.2",
      draft: false,
      prerelease: false,
      published_at: "2026-04-10T12:00:00Z",
      html_url: "https://github.com/Fankrits/SomeScript/releases/tag/desktop-v0.1.2",
      assets: [
        {
          name: "SomeScript-0.1.2-macos-universal.dmg",
          browser_download_url: "https://example.com/download/0.1.2.dmg",
        },
      ],
    },
  ];

  const result = parseRelease(json);
  expect(result.version).toBe("0.1.2");
  expect(result.publishedAt).toBe("2026-04-10T12:00:00Z");
  expect(result.downloads.macOS).toBe("https://example.com/download/0.1.2.dmg");
  expect(result.downloads.Windows).toBe(RELEASES_URL);
  expect(result.downloads.Linux).toBe(RELEASES_URL);
});

test("falls back to RELEASES_URL when OS assets are missing", () => {
  const json = [
    {
      tag_name: "desktop-v0.1.3",
      draft: false,
      prerelease: false,
      assets: [
        {
          name: "SomeScript-0.1.3-macos-universal.dmg",
          browser_download_url: "https://example.com/macos.dmg",
        },
      ],
    },
  ];

  const result = parseRelease(json);
  expect(result.version).toBe("0.1.3");
  expect(result.downloads.macOS).toBe("https://example.com/macos.dmg");
  expect(result.downloads.Windows).toBe(RELEASES_URL);
  expect(result.downloads.Linux).toBe(RELEASES_URL);
});

test("handles garbage and empty inputs safely", () => {
  expect(parseRelease(null)).toEqual(FALLBACK_RELEASE);
  expect(parseRelease(undefined)).toEqual(FALLBACK_RELEASE);
  expect(parseRelease({})).toEqual(FALLBACK_RELEASE);
  expect(parseRelease("not an array")).toEqual(FALLBACK_RELEASE);
  expect(parseRelease(12345)).toEqual(FALLBACK_RELEASE);
  expect(parseRelease([])).toEqual(FALLBACK_RELEASE);
  expect(parseRelease([null, {}])).toEqual(FALLBACK_RELEASE);
  expect(parseRelease([{ tag_name: 123 }])).toEqual(FALLBACK_RELEASE);
});
