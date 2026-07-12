# Production Operations Checklist

## Before first deploy
- [ ] Set `COMPILER_SECRET` (long random string) on BOTH the editor and compiler services.
- [ ] Editor service: full env per `apps/editor/.env.railway.example`, including Clerk satellite vars.
- [ ] Compiler service: do NOT set `ALLOW_LOCAL_COMPILE`; ensure `NODE_ENV=production`.
- [ ] Clerk dashboard: add the editor domain as a satellite domain of the web app's domain.
- [ ] Run `bun run db:migrate` (apps/web) against the production database as a deploy step — never `push`.
- [ ] GitHub: require the CI check to pass before merging to main.

## Scaling constraints (revisit before adding instances)
- Editor and compiler are **single-instance** services: the editor's differential-upload
  cache and rate-limit buckets are in-memory (compiler self-heals via 409 full-sync,
  rate limits become per-instance), and compiler workspaces live on its local disk.
  Before scaling out: move rate limiting to Redis and pin compiles per project.

## Backups & recovery
- [ ] Railway Postgres: enable scheduled backups; test a restore once.
- [ ] Object storage: enable versioning if available; otherwise schedule a periodic
      bucket sync to a second bucket. Project files are the user data — the DB only
      holds names/ownership.
- Orphaned storage (rows deleted while editor was unreachable): list bucket prefixes
  under projects/ and compare against `SELECT id FROM projects`; delete unmatched.

## Monitoring
- [ ] Uptime checks: web `/api/health`, editor `/api/health`, compiler `/health`.
- [ ] Log-based alert on `[api]` errors (the generic-500 log line) and `[SECURITY]` warnings.
- [ ] Error tracking DSN set if using Sentry (see Task 18).

## Rollback
- Vercel (web): instant rollback to the previous deployment in the dashboard.
- Railway (editor/compiler): redeploy the previous build from the service's deploy list.
- DB: migrations are additive-only so far; for a destructive migration, take a manual
  backup immediately before deploying it.
