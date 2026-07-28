import { describe, it, expect } from "bun:test";
import { rateLimit } from "./rate-limit";

describe("Rate Limiter (Redis + In-Memory Fallback)", () => {
  it("should allow requests up to limit and block subsequent requests", async () => {
    const key = `unit-test-bucket-${Date.now()}`;
    const limit = 3;
    const windowMs = 60_000;

    const r1 = await rateLimit(key, limit, windowMs);
    const r2 = await rateLimit(key, limit, windowMs);
    const r3 = await rateLimit(key, limit, windowMs);
    const r4 = await rateLimit(key, limit, windowMs);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(r4).toBe(false);
  });

  it("keys should be independent", async () => {
    const key1 = `test-indep-1-${Date.now()}`;
    const key2 = `test-indep-2-${Date.now()}`;
    const limit = 1;
    const windowMs = 60_000;

    expect(await rateLimit(key1, limit, windowMs)).toBe(true);
    expect(await rateLimit(key2, limit, windowMs)).toBe(true);
    expect(await rateLimit(key1, limit, windowMs)).toBe(false);
    expect(await rateLimit(key2, limit, windowMs)).toBe(false);
  });

  it("should refill over time", async () => {
    const key = `test-refill-${Date.now()}`;
    const limit = 1;
    const windowMs = 100;

    expect(await rateLimit(key, limit, windowMs)).toBe(true);
    expect(await rateLimit(key, limit, windowMs)).toBe(false);

    await Bun.sleep(150);

    expect(await rateLimit(key, limit, windowMs)).toBe(true);
  });
});
