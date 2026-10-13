import { describe, expect, test } from "bun:test";
import { checkVersions } from "./check-version.mjs";

const cargoToml = (v: string) =>
  `[package]\nname = "x"\nversion = "${v}"\n\n[dependencies]\nserde = { version = "1" }\n`;
const inputs = (over: Record<string, unknown> = {}) => ({
  tag: "desktop-v1.2.3",
  cargoToml: cargoToml("1.2.3"),
  tauriConf: { version: "1.2.3" },
  packageJson: { version: "1.2.3" },
  ...over,
});

describe("checkVersions", () => {
  test("agrees when the tag and all three manifests match", () => {
    expect(checkVersions(inputs())).toEqual([]);
    expect(
      checkVersions(
        inputs({
          tag: "desktop-v1.2.3-rc.1",
          cargoToml: cargoToml("1.2.3-rc.1"),
          tauriConf: { version: "1.2.3-rc.1" },
          packageJson: { version: "1.2.3-rc.1" },
        }),
      ),
    ).toEqual([]);
  });

  test("names every file that disagrees with the tag", () => {
    const problems = checkVersions(
      inputs({ cargoToml: cargoToml("1.2.2"), packageJson: { version: "9.9.9" } }),
    );
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("src-tauri/Cargo.toml is 1.2.2");
    expect(problems.join("\n")).toContain("package.json is 9.9.9");
  });

  test("rejects tags that are not desktop-vX.Y.Z", () => {
    for (const tag of ["v1.2.3", "desktop-1.2.3", "desktop-v1.2", "desktop-v1.2.3.4", ""]) {
      expect(checkVersions(inputs({ tag })).join("\n")).toContain("is not of the form");
    }
  });

  test("a dependency's version line is never mistaken for the package version", () => {
    const toml = `[dependencies]\nserde = { version = "1" }\n\n[package]\nname = "x"\nversion = "1.2.3"\n`;
    expect(checkVersions(inputs({ cargoToml: toml }))).toEqual([]);
  });

  test("reports a missing version", () => {
    expect(checkVersions(inputs({ tauriConf: {} })).join("\n")).toContain(
      "tauri.conf.json has no version",
    );
  });
});
