import { describe, expect, test } from "bun:test";
import { TWELVE_HOURS_MS, shouldCheckForUpdate } from "./updater";

describe("updater throttle logic", () => {
  describe("shouldCheckForUpdate", () => {
    const now = 1710050000000;

    test("returns true if no previous check occurred", () => {
      expect(shouldCheckForUpdate(null, now)).toBe(true);
    });

    test("returns false if last check was less than 12 hours ago", () => {
      const recent = now - (TWELVE_HOURS_MS - 1000);
      expect(shouldCheckForUpdate(recent, now)).toBe(false);
    });

    test("returns false if checked exactly at the boundary or slightly before", () => {
      const exactly12h = now - TWELVE_HOURS_MS;
      expect(shouldCheckForUpdate(exactly12h, now)).toBe(false);
    });

    test("returns true if last check was more than 12 hours ago", () => {
      const oldCheck = now - (TWELVE_HOURS_MS + 1000);
      expect(shouldCheckForUpdate(oldCheck, now)).toBe(true);
    });

    test("supports custom interval", () => {
      const oneHour = 60 * 60 * 1000;
      const fortyMinutesAgo = now - 40 * 60 * 1000;
      const seventyMinutesAgo = now - 70 * 60 * 1000;

      expect(shouldCheckForUpdate(fortyMinutesAgo, now, oneHour)).toBe(false);
      expect(shouldCheckForUpdate(seventyMinutesAgo, now, oneHour)).toBe(true);
    });
  });
});
