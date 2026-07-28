# Compiler Service (`apps/compiler`)

Standalone Bun microservice that runs Tectonic to compile LaTeX projects into PDF documents and SyncTeX files.

## Endpoints

- `POST /compile` — Compiles LaTeX project.
  - **Modes**:
    - `local`: Compiles directly from a local filesystem path (for local development).
    - `upload`: Accepts base64 encoded project files in the request body, executes compilation inside a workspace directory, and returns the PDF in base64 format.
  - **Output Caching**: When `projectHash` is sent, results are cached in-memory and in Redis (if `REDIS_URL` is set) under `compile:cache:{projectHash}` with a 24-hour TTL.
- `POST /synctex` — Forward and reverse SyncTeX mapping between source line numbers and PDF coordinates.
- `GET /health` — Returns `200 OK` health status.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port on which the HTTP server listens | `3001` |
| `COMPILER_SECRET` | Bearer token for authenticating compiler requests | Unset (warns in logs) |
| `ALLOW_LOCAL_COMPILE` | Set to `"true"` to enable `mode: "local"` in production | `"true"` in non-prod |
| `SYNCTEX_BIN` | Path to `synctex` binary | `bin/synctex` or system PATH |
| `REDIS_URL` | Redis connection URL for distributed compilation output caching (`compile:cache:{projectHash}`, 24-hour TTL) | Unset (uses in-memory cache only) |
