import {
  REPO,
  RELEASES_URL,
  INSTALL_SH_URL,
  INSTALL_PS1_URL,
  BREW_CMD,
  CURL_CMD,
  IRM_CMD,
} from "./desktop";

export { REPO, RELEASES_URL, INSTALL_SH_URL, INSTALL_PS1_URL, BREW_CMD, CURL_CMD, IRM_CMD };

export type Release = {
  version: string | null;
  publishedAt: string | null;
  html_url: string;
  downloads: {
    macOS: string;
    Windows: string;
    Linux: string;
    [key: string]: string;
  };
};

export const FALLBACK_RELEASE: Release = {
  version: null,
  publishedAt: null,
  html_url: RELEASES_URL,
  downloads: {
    macOS: RELEASES_URL,
    Windows: RELEASES_URL,
    Linux: RELEASES_URL,
  },
};

const OS_ASSET_PATTERNS: [string, RegExp][] = [
  ["macOS", /\.dmg$/],
  ["Windows", /-setup\.exe$/],
  ["Linux", /\.AppImage$/],
];

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubReleaseItem {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  html_url?: string;
  assets?: GitHubAsset[];
}

/** Pure parser for GitHub releases JSON array */
export function parseRelease(json: unknown): Release {
  if (!Array.isArray(json)) {
    return FALLBACK_RELEASE;
  }

  const match = json.find((item: unknown): item is GitHubReleaseItem =>
    Boolean(
      item &&
      typeof item === "object" &&
      !(item as GitHubReleaseItem).draft &&
      !(item as GitHubReleaseItem).prerelease &&
      typeof (item as GitHubReleaseItem).tag_name === "string" &&
      (item as GitHubReleaseItem).tag_name?.startsWith("desktop-v"),
    ),
  );

  if (!match || !match.tag_name) {
    return FALLBACK_RELEASE;
  }

  const version = match.tag_name.replace(/^desktop-v/, "");
  const assets = Array.isArray(match.assets) ? match.assets : [];

  const downloads: Record<string, string> = {};
  for (const [os, pattern] of OS_ASSET_PATTERNS) {
    const found = assets.find(
      (a) => typeof a?.name === "string" && pattern.test(a.name) && a.browser_download_url,
    );
    downloads[os] = found?.browser_download_url ?? RELEASES_URL;
  }

  return {
    version,
    publishedAt: typeof match.published_at === "string" ? match.published_at : null,
    html_url: typeof match.html_url === "string" ? match.html_url : RELEASES_URL,
    downloads: {
      macOS: downloads.macOS ?? RELEASES_URL,
      Windows: downloads.Windows ?? RELEASES_URL,
      Linux: downloads.Linux ?? RELEASES_URL,
    },
  };
}

/**
 * Fetch the latest desktop release from the GitHub API.
 * Revalidated hourly; falls back to the releases page on any failure.
 */
export async function getRelease(): Promise<Release> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      "https://api.github.com/repos/Fankrits/SomeScript/releases?per_page=10",
      {
        headers,
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!res.ok) {
      return FALLBACK_RELEASE;
    }

    const json = (await res.json()) as unknown;
    return parseRelease(json);
  } catch {
    return FALLBACK_RELEASE;
  }
}
