import { describe, expect, test } from "bun:test";
import { installRandomUUID } from "./random-uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("installRandomUUID", () => {
  test("adds a working randomUUID to a webview that lacks it", () => {
    const target: Partial<Crypto> = {};
    expect(installRandomUUID(target)).toBe(true);
    for (let i = 0; i < 200; i++) expect(target.randomUUID!()).toMatch(V4);
  });

  test("does not repeat", () => {
    const target: Partial<Crypto> = {};
    installRandomUUID(target);
    const seen = new Set(Array.from({ length: 5000 }, () => target.randomUUID!()));
    expect(seen.size).toBe(5000);
  });

  test("does not recurse when installed on the global crypto, which uuid consults itself", () => {
    const native = crypto.randomUUID;
    const define = (value: unknown) =>
      Object.defineProperty(crypto, "randomUUID", { value, configurable: true, writable: true });
    define(undefined);
    try {
      expect(installRandomUUID()).toBe(true);
      // Fail fast instead of overflowing the stack (or hanging) if the install ever calls itself.
      const installed = crypto.randomUUID;
      let depth = 0;
      define(() => {
        if (++depth > 10) throw new Error("randomUUID called itself");
        try {
          return installed.call(crypto);
        } finally {
          depth--;
        }
      });
      expect(crypto.randomUUID()).toMatch(V4);
      expect(crypto.randomUUID()).not.toBe(crypto.randomUUID());
    } finally {
      define(native);
    }
  });

  test("leaves a native randomUUID alone", () => {
    const native = () => "00000000-0000-4000-8000-000000000000" as const;
    const target: Partial<Crypto> = { randomUUID: native };
    expect(installRandomUUID(target)).toBe(false);
    expect(target.randomUUID).toBe(native);
  });

  test("does nothing when there is no crypto object at all", () => {
    expect(installRandomUUID(undefined)).toBe(false);
  });
});
