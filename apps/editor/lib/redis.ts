import Redis from "ioredis";

let redisInstance: Redis | null = null;
let isRedisConnected = false;

export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisInstance) {
    try {
      redisInstance = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) {
            console.warn("[REDIS] Max connection retries reached. Falling back to in-memory mode.");
            return null;
          }
          return Math.min(times * 100, 1000);
        },
        lazyConnect: true,
      });

      redisInstance.on("connect", () => {
        isRedisConnected = true;
        console.log("[REDIS] Connected successfully.");
      });

      redisInstance.on("ready", () => {
        isRedisConnected = true;
      });

      redisInstance.on("error", (err) => {
        isRedisConnected = false;
        console.warn("[REDIS] Error:", err.message);
      });

      redisInstance.connect().catch((err) => {
        isRedisConnected = false;
        console.warn("[REDIS] Initial connection failed:", err.message);
      });
    } catch (err: any) {
      console.warn("[REDIS] Initialization error:", err.message);
      redisInstance = null;
    }
  }

  return isRedisConnected || redisInstance?.status === "ready" || redisInstance?.status === "connect"
    ? redisInstance
    : null;
}

export async function redisGet(key: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

export async function redisHSet(key: string, field: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.hset(key, field, value);
    if (ttlSeconds) {
      await client.expire(key, ttlSeconds);
    }
    return true;
  } catch {
    return false;
  }
}

export async function redisHGetAll(key: string): Promise<Record<string, string> | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    return await client.hgetall(key);
  } catch {
    return null;
  }
}

export async function redisHDel(key: string, fields: string[]): Promise<boolean> {
  const client = getRedisClient();
  if (!client || fields.length === 0) return false;
  try {
    await client.hdel(key, ...fields);
    return true;
  } catch {
    return false;
  }
}
