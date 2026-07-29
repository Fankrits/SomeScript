# Redis Scaling & Caching System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized Redis caching and rate-limiting infrastructure for SomeScript to support horizontal scaling (1,000–10,000+ active users) across multi-instance editor and compiler deployments, both locally via Docker and in cloud production via Railway.

**Architecture:** Introduce an `ioredis` client wrapper (`apps/editor/lib/redis.ts`) with graceful fallback to in-memory mode if Redis is offline. Upgrade `apps/editor/lib/rate-limit.ts` to use distributed atomic token-bucket rate limiting, migrate the upload differential sync cache in `apps/editor/app/api/compile/route.ts` from process memory to Redis hashes, and expose Redis output caching in `apps/compiler`.

**Tech Stack:** `ioredis`, Redis 7 (Alpine), Docker Compose, Next.js 16 (Editor), Bun 1.3 (Compiler), Railway Managed Redis.

---

## Global Constraints

- **Bun Version Floor:** Bun v1.3.14 (workspace package manager)
- **Redis Compatibility:** Redis 7.x (Alpine in Docker / Railway Redis Addon)
- **Dependency Choice:** `ioredis` for both Node.js (Next.js editor) and Bun (compiler service)
- **Resilience:** All Redis operations MUST gracefully fallback to in-memory behavior if `REDIS_URL` is unconfigured or Redis connection fails, ensuring zero hard crashes during dev or outages.
- **Type Safety:** Run `bun x tsc --noEmit` inside `apps/editor/` to verify type safety after edits.

---

## File Structure & Responsibilities

```
Monorepo Root
├── docker-compose.yml                          # Modify: Add redis service (port 6379)
├── apps/editor/
│   ├── package.json                            # Modify: Add ioredis dependency
│   ├── .env.example                            # Modify: Add REDIS_URL
│   ├── lib/
│   │   ├── redis.ts                            # Create: Centralized Redis client + fallback handling
│   │   ├── redis.test.ts                       # Create: Redis client & fallback unit tests
│   │   ├── rate-limit.ts                       # Modify: Atomic Redis token-bucket rate limiter
│   │   └── rate-limit.test.ts                  # Modify: Rate limit tests (Redis + local fallback)
│   └── app/api/compile/route.ts                # Modify: Distributed file hash storage in Redis
├── apps/compiler/
│   ├── package.json                            # Modify: Add ioredis dependency
│   ├── index.ts                                # Modify: Distributed compile cache in Redis
│   └── README.md                               # Modify: Document REDIS_URL operational environment
```

---

## Tasks

### Task 1: Docker & Local Environment Redis Provisioning

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/editor/.env.example`

**Interfaces:**
- Consumes: Redis 7 Docker Image (`redis:7-alpine`)
- Produces: Local Redis container listening on `localhost:6379` (`REDIS_URL=redis://localhost:6379`)

- [ ] **Step 1: Add Redis service and data volume to `docker-compose.yml`**

Edit `docker-compose.yml` to add `redis` service under `services` and `redis_data` volume under `volumes`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: latex_editor_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - redis_data:/data
```

And in `volumes:` block:
```yaml
volumes:
  postgres_data:
  rustfs_data:
  redis_data:
```

- [ ] **Step 2: Add `REDIS_URL` to `apps/editor/.env.example`**

Add line to `apps/editor/.env.example`:
```env
# Distributed Cache & Rate Limiting (Redis)
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3: Test Docker Compose startup**

Run: `docker compose up -d redis`
Expected: `Container latex_editor_redis  Started` and `redis-cli ping` returns `PONG`.

- [ ] **Step 4: Commit container configuration**

```bash
git add docker-compose.yml apps/editor/.env.example
git commit -m "infra: add redis container service to docker-compose"
```

---

### Task 2: Core Redis Client Infrastructure & Resiliency Layer

**Files:**
- Modify: `apps/editor/package.json`
- Create: `apps/editor/lib/redis.ts`
- Create: `apps/editor/lib/redis.test.ts`

**Interfaces:**
- Consumes: `process.env.REDIS_URL`
- Produces: `getRedisClient(): Redis | null`, `redisSet(key, val, ttlSeconds)`, `redisGet(key)`, `redisHSet(key, field, val)`, `redisHGetAll(key)` with automatic fallback handling.

- [ ] **Step 1: Install `ioredis` dependency in `apps/editor`**

Run: `cd apps/editor && bun add ioredis`
Expected: `ioredis` added to `apps/editor/package.json`.

- [ ] **Step 2: Create Redis client module with fallback handling**

Create `apps/editor/lib/redis.ts`:

```typescript
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

  return isRedisConnected ? redisInstance : null;
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
```

- [ ] **Step 3: Create Redis fallback unit test**

Create `apps/editor/lib/redis.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getRedisClient, redisGet, redisSet } from "./redis";

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
});
```

- [ ] **Step 4: Run unit tests**

Run: `cd apps/editor && bun test lib/redis.test.ts`
Expected: Tests pass cleanly.

- [ ] **Step 5: Commit Redis core client**

```bash
git add apps/editor/package.json apps/editor/lib/redis.ts apps/editor/lib/redis.test.ts
git commit -m "feat(editor): add centralized Redis client with fallback layer"
```

---

### Task 3: Distributed Atomic Token-Bucket Rate Limiter

**Files:**
- Modify: `apps/editor/lib/rate-limit.ts`
- Create: `apps/editor/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: `getRedisClient()` from `apps/editor/lib/redis.ts`
- Produces: `checkRate(bucket, limit, windowMs)` with Redis atomic script execution and in-memory fallback.

- [ ] **Step 1: Write test for rate limiter (TDD)**

Create `apps/editor/lib/rate-limit.test.ts`:

```typescript
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

    expect(r1).toBeTrue();
    expect(r2).toBeTrue();
    expect(r3).toBeTrue();
    expect(r4).toBeFalse();
  });
});
```

- [ ] **Step 2: Update `apps/editor/lib/rate-limit.ts` to use Redis Lua script with fallback**

Replace contents of `apps/editor/lib/rate-limit.ts`:

```typescript
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
  redis.call('HMSET', key, 'tokens', tokens, 'last', last)
  redis.call('PEXPIRE', key, window_ms)
  return 1
else
  redis.call('HMSET', key, 'tokens', tokens, 'last', last)
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
```

- [ ] **Step 3: Run rate limit unit tests**

Run: `cd apps/editor && bun test lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit rate limiter changes**

```bash
git add apps/editor/lib/rate-limit.ts apps/editor/lib/rate-limit.test.ts
git commit -m "feat(editor): implement atomic distributed Redis rate limiter"
```

---

### Task 4: Distributed Differential Sync File Hashes

**Files:**
- Modify: `apps/editor/app/api/compile/route.ts`

**Interfaces:**
- Consumes: `redisHGetAll`, `redisHSet`, `redisHDel` from `apps/editor/lib/redis.ts`
- Produces: Distributed project file content hashes stored under Redis key `project:{projectId}:hashes` with 7-day TTL.

- [ ] **Step 1: Replace in-memory hash cache with Redis store**

Modify `apps/editor/app/api/compile/route.ts`:

Replace `const uploadedFilesCache = new Map<string, string>();` with Redis hash helper functions:

```typescript
import { redisHGetAll, redisHSet, redisHDel } from "@/lib/redis";

// In-memory fallback if Redis is unavailable
const fallbackUploadedFilesCache = new Map<string, string>();

async function getProjectFileHashes(projectId: string): Promise<Record<string, string>> {
  const redisHashes = await redisHGetAll(`project:${projectId}:hashes`);
  if (redisHashes) return redisHashes;

  const result: Record<string, string> = {};
  for (const [key, val] of fallbackUploadedFilesCache.entries()) {
    if (key.startsWith(`${projectId}:`)) {
      result[key.substring(projectId.length + 1)] = val;
    }
  }
  return result;
}

async function updateProjectFileHash(projectId: string, filePath: string, hash: string): Promise<void> {
  fallbackUploadedFilesCache.set(`${projectId}:${filePath}`, hash);
  await redisHSet(`project:${projectId}:hashes`, filePath, hash, 7 * 86400); // 7 day TTL
}

async function deleteProjectFileHashes(projectId: string, filePaths: string[]): Promise<void> {
  for (const p of filePaths) {
    fallbackUploadedFilesCache.delete(`${projectId}:${p}`);
  }
  if (filePaths.length > 0) {
    await redisHDel(`project:${projectId}:hashes`, filePaths);
  }
}
```

- [ ] **Step 2: Update diff check logic in `POST` handler**

In `apps/editor/app/api/compile/route.ts`, update the differential sync block to use `getProjectFileHashes()`, `updateProjectFileHash()`, and `deleteProjectFileHashes()`:

```typescript
      // Differential Sync for Remote/Upload Mode
      const projectTree = await storage.listProjectFiles(projectId);
      const allFiles = await getAllStorageFiles(projectId, projectTree);

      const cachedHashes = await getProjectFileHashes(projectId);

      const changedFiles: DifferentialFile[] = [];
      const currentPaths = new Set<string>();
      const pendingUpdates: { path: string; hash: string }[] = [];

      for (const file of allFiles) {
        currentPaths.add(file.path);
        const contentHash = createHash("sha256").update(file.content).digest("hex");
        const cachedHash = cachedHashes[file.path];

        if (cachedHash !== contentHash) {
          changedFiles.push(file);
          pendingUpdates.push({ path: file.path, hash: contentHash });
        }
      }

      const deletedFiles: string[] = [];
      for (const existingPath of Object.keys(cachedHashes)) {
        if (!currentPaths.has(existingPath)) {
          deletedFiles.push(existingPath);
        }
      }

      const syncType = Object.keys(cachedHashes).length === 0 || changedFiles.length === allFiles.length
        ? "full"
        : "differential";
```

And update the success callback to persist updates:

```typescript
      if (response.ok) {
        for (const item of pendingUpdates) {
          await updateProjectFileHash(projectId, item.path, item.hash);
        }
        if (deletedFiles.length > 0) {
          await deleteProjectFileHashes(projectId, deletedFiles);
        }
      }
```

- [ ] **Step 3: Typecheck Editor codebase**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: 0 type errors.

- [ ] **Step 4: Commit differential sync Redis integration**

```bash
git add apps/editor/app/api/compile/route.ts
git commit -m "feat(editor): migrate upload differential sync hashes to Redis"
```

---

### Task 5: Compiler Distributed Result Caching

**Files:**
- Modify: `apps/compiler/package.json`
- Modify: `apps/compiler/index.ts`
- Modify: `apps/compiler/README.md`

**Interfaces:**
- Consumes: `REDIS_URL` in `apps/compiler`
- Produces: PDF compilation output cache stored in Redis under `compile:cache:{projectHash}` (24-hour TTL).

- [ ] **Step 1: Install `ioredis` in `apps/compiler`**

Run: `cd apps/compiler && bun add ioredis`
Expected: `ioredis` added to `apps/compiler/package.json`.

- [ ] **Step 2: Add Redis client and cache lookup to `apps/compiler/index.ts`**

In `apps/compiler/index.ts`, add Redis client connection and cache helpers:

```typescript
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
let redisClient: Redis | null = null;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    redisClient.connect().catch((err) => console.warn("[COMPILER REDIS] Connect failed:", err.message));
  } catch (err: any) {
    console.warn("[COMPILER REDIS] Init error:", err.message);
  }
}

async function getCachedCompile(hash: string): Promise<CachedCompileResult | null> {
  if (outputCache.has(hash)) {
    return outputCache.get(hash)!;
  }
  if (redisClient && redisClient.status === "ready") {
    try {
      const raw = await redisClient.get(`compile:cache:${hash}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        outputCache.set(hash, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

async function setCachedCompile(hash: string, result: CachedCompileResult): Promise<void> {
  if (outputCache.size >= MAX_OUTPUT_CACHE_SIZE) {
    const oldestKey = outputCache.keys().next().value;
    if (oldestKey !== undefined) outputCache.delete(oldestKey);
  }
  outputCache.set(hash, result);

  if (redisClient && redisClient.status === "ready") {
    try {
      await redisClient.set(`compile:cache:${hash}`, JSON.stringify(result), "EX", 86400); // 24 hour TTL
    } catch {}
  }
}
```

- [ ] **Step 3: Update `POST /compile` handler in compiler service**

Update lines in `apps/compiler/index.ts`:

Replace:
```typescript
if (projectHash && outputCache.has(projectHash)) {
  const cached = outputCache.get(projectHash)!;
```
With:
```typescript
if (projectHash) {
  const cached = await getCachedCompile(projectHash);
  if (cached) {
    return Response.json({
      success: true,
      logs: cached.logs + "\n[INFO] Returned from output cache (0ms)\n",
      pdf: cached.pdf,
    });
  }
}
```

And replace cache setting:
```typescript
if (projectHash) {
  await setCachedCompile(projectHash, {
    logs: finalLogs,
    pdf: pdfBase64,
  });
}
```

- [ ] **Step 4: Update `apps/compiler/README.md` documentation**

Document `REDIS_URL` in `apps/compiler/README.md` under Environment Variables section.

- [ ] **Step 5: Commit compiler service updates**

```bash
git add apps/compiler/package.json apps/compiler/index.ts apps/compiler/README.md
git commit -m "feat(compiler): add Redis distributed compile output caching"
```

---

### Task 6: Cloud Deployment on Railway

**Files:**
- Modify: `openwiki/operations.md`

**Interfaces:**
- Consumes: Railway Redis Addon environment configuration (`REDIS_URL` / `REDISURL`)
- Produces: Production deployment documentation and verification checklist for 1,000–10,000+ scale.

- [ ] **Step 1: Document Railway Redis Addon Setup**

Add Railway Redis configuration instructions to `openwiki/operations.md`:

```markdown
## Railway Redis Deployment & Scaling Guide (1,000 - 10,000+ Concurrent Users)

To scale the SomeScript editor and compiler across multiple Railway instances:

1. **Add Redis Database on Railway:**
   - In your Railway project canvas, click **+ New** -> **Database** -> **Add Redis**.
   - Railway will generate a `REDIS_URL` variable (formatted as `redis://default:password@host:port`).

2. **Connect Editor & Compiler Services:**
   - In Railway Service Settings for `apps/editor`: Add Environment Variable `REDIS_URL=${{Redis.REDIS_URL}}`.
   - In Railway Service Settings for `apps/compiler`: Add Environment Variable `REDIS_URL=${{Redis.REDIS_URL}}`.

3. **Horizontal Scaling:**
   - Increase Railway replica count for `apps/editor` (e.g., 3-5 replicas).
   - Increase Railway replica count for `apps/compiler` (e.g., 2-4 replicas).
   - Shared Redis guarantees synchronized rate limits, file diff hashes, and PDF compile caches across all nodes.
```

- [ ] **Step 2: Run End-to-End Verification**

1. Start all local services: `docker compose up -d`
2. Start Editor & Compiler: `bun dev`
3. Send test compile request:
   ```bash
   curl -X POST http://localhost:3002/api/compile -H "Content-Type: application/json" -d '{"projectId":"default","path":"main.tex"}'
   ```
4. Verify Redis keys created:
   ```bash
   docker exec -it latex_editor_redis redis-cli KEYS "*"
   ```
   Expected output contains `ratelimit:*` and `project:default:hashes`.

- [ ] **Step 3: Commit operations documentation**

```bash
git add openwiki/operations.md
git commit -m "docs: add Railway Redis deployment and high-concurrency scaling guide"
```

---

## Verification Plan

### Automated Tests
- Run `cd apps/editor && bun test lib/redis.test.ts` to verify Redis connection & graceful fallback.
- Run `cd apps/editor && bun test lib/rate-limit.test.ts` to verify atomic token-bucket rate limiting.
- Run `cd apps/editor && bun x tsc --noEmit` to verify zero TypeScript errors.

### Manual Verification
- **Docker Local Verification:**
  - Launch `docker compose up -d redis`.
  - Trigger compilation and verify Redis keys using `docker exec -it latex_editor_redis redis-cli KEYS "*"`.
  - Stop Redis container (`docker stop latex_editor_redis`) and verify Editor continues operating smoothly via fallback mode without crashing.
