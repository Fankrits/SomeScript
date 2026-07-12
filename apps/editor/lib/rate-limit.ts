import { auth } from "@clerk/nextjs/server";
import { ApiError } from "./authz";

// ponytail: in-memory, per-instance token bucket — move to Redis if the editor ever runs >1 instance
const buckets = new Map<string, { tokens: number; last: number }>();
const MAX_BUCKETS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  b.tokens = Math.min(limit, b.tokens + ((now - b.last) / windowMs) * limit);
  b.last = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  return allowed;
}

/** Per-user limiter for route handlers. Throws ApiError(429) when exhausted. */
export async function checkRate(bucket: string, limit: number, windowMs: number): Promise<void> {
  const { userId } = await auth();
  if (!rateLimit(`${bucket}:${userId ?? "anon"}`, limit, windowMs)) {
    throw new ApiError(429, "Too many requests — slow down");
  }
}
