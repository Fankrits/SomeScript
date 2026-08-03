FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Standalone install (same pattern as apps/compiler/Dockerfile): this package.json
# carries no "workspaces" field, so bun puts every dependency straight into
# /app/node_modules with no hoisting ambiguity. That's required for
# apps/editor/lib/storage.ts (copied below) to resolve its own npm imports —
# a root-manifest workspace install here previously nested deps under
# apps/collaboration/node_modules instead, which Node/Bun's directory-walk
# resolution from apps/editor/lib/ can never see (it only walks upward).
COPY apps/collaboration/package.json ./package.json
RUN bun install

# Collaboration's own source, kept at its real repo-relative path so its
# "../editor/lib/storage" import resolves exactly as it does outside Docker.
COPY apps/collaboration/server.ts ./apps/collaboration/server.ts
COPY apps/collaboration/splice.ts ./apps/collaboration/splice.ts

# server.ts imports apps/editor/lib/storage.ts directly (reuses the editor's
# storage abstraction instead of reimplementing S3/FS logic — see CLAUDE.md's
# "reuse before rewrite" policy). storage.ts has no imports beyond the npm
# packages installed above, so copying this one file is sufficient; it does
# not pull in the rest of apps/editor.
COPY apps/editor/lib/storage.ts ./apps/editor/lib/storage.ts

EXPOSE 1234

ENV PORT=1234
CMD ["bun", "run", "apps/collaboration/server.ts"]
