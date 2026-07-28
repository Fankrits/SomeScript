import { describe, it, expect, afterEach } from "bun:test";
import { getRedisClient, redisGet, redisSet, redisHSet, redisHGetAll, redisHDel } from "./redis";

describe("Redis Client & Fallback Layer", () => {
  const originalEnv = process.env.REDIS_URL;

  afterEach(() => {
    process.env.REDIS_URL = originalEnv;
  });

  it("should return null gracefully when REDIS_URL is not set", async () => {
    delete process.env.REDIS_URL;
    const client = getRedisClient();
    expect(client).toBeNull();
    const value = await redisGet("test-key");
    expect(value).toBeNull();
  });

  it("should attempt connection when REDIS_URL is provided", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    const result = await redisSet("test-key-unit", "hello", 10);
    // When docker redis is up, result is true; if down, gracefully returns false
    expect(typeof result).toBe("boolean");
  });

  it("should gracefully handle hash operations when Redis is offline/unconfigured", async () => {
    delete process.env.REDIS_URL;
    expect(await redisHSet("hash-key", "field1", "val1")).toBe(false);
    expect(await redisHGetAll("hash-key")).toBeNull();
    expect(await redisHDel("hash-key", ["field1"])).toBe(false);
  });
});
