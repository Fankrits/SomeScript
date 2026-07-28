import { auth } from "@clerk/nextjs/server";
import { ApiError } from "./authz";
import { getRedisClient } from "./redis";

// Fallback in-memory map
const inMemoryBuckets = new Map<string, { tokens: number; last: number }>();
const MAX_BUCKETS = 10_000;

function inMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  if (inMemoryBuckets.size > MAX_BUCKETS) inMemoryBuckets.clear();
  const now = Date.now();
  const b = inMemoryBuckets.get(key) ?? { tokens: limit, last: now };
  b.tokens = Math.min(limit, b.tokens + ((now - b.last) / windowMs) * limit);
  b.last = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  inMemoryBuckets.set(key, b);
  return allowed;
}

// Atomic Token Bucket Lua Script for Redis
const LUA_RATE_LIMIT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(data[1])
local last = tonumber(data[2])

if not tokens then
  tokens = limit
  last = now
else
  local delta = math.max(0, now - last)
  tokens = math.min(limit, tokens + (delta / window_ms) * limit)
  last = now
end

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HSET', key, 'tokens', tokens, 'last', last)
  redis.call('PEXPIRE', key, window_ms)
  return 1
else
  redis.call('HSET', key, 'tokens', tokens, 'last', last)
  redis.call('PEXPIRE', key, window_ms)
  return 0
end
`;

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return inMemoryRateLimit(key, limit, windowMs);
  }

  try {
    const now = Date.now();
    const result = await redis.eval(LUA_RATE_LIMIT, 1, `ratelimit:${key}`, limit, windowMs, now);
    return result === 1;
  } catch (err) {
    console.warn("[RATE_LIMIT] Redis evaluation error, falling back to in-memory:", err);
    return inMemoryRateLimit(key, limit, windowMs);
  }
}

/** Per-user limiter for route handlers. Throws ApiError(429) when exhausted. */
export async function checkRate(bucket: string, limit: number, windowMs: number): Promise<void> {
  const { userId } = await auth();
  const allowed = await rateLimit(`${bucket}:${userId ?? "anon"}`, limit, windowMs);
  if (!allowed) {
    throw new ApiError(429, "Too many requests — slow down");
  }
}
