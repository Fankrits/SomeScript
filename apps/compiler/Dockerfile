# Stage 1: Download the official pre-compiled Tectonic release binary
FROM debian:stable-slim AS builder

RUN apt-get update && apt-get install -y curl xz-utils git gcc zlib1g-dev && rm -rf /var/lib/apt/lists/*

# The *-linux-gnu release, NOT *-linux-musl. Both are official Tectonic release
# artifacts, but the static musl build carries no usable ICU break data, so
# \XeTeXlinebreaklocale fails there for EVERY locale ("failed to create linebreak
# iterator, status=2") — which breaks line breaking for every script written
# without word spaces (Thai, Lao, Khmer, CJK). Upstream assembled that build by
# force-static-linking ICU/HarfBuzz/Graphite and lost functionality doing so
# (tectonic-typesetting/tectonic#185). The gnu build works; verified on this base.
# Consequence: no aarch64-linux-gnu artifact is published, so this image is
# pinned to linux/amd64 in docker-compose.yml (emulated on Apple Silicon).
RUN curl -Lo tectonic.tar.gz https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-unknown-linux-gnu.tar.gz \
    && tar -xzf tectonic.tar.gz \
    && mv tectonic /usr/local/bin/

# Build the official SyncTeX CLI (jlaurens/synctex) — Tectonic writes .synctex.gz
# but does not ship the query tool used by the /synctex endpoint. The sed fixes an
# upstream debug artifact: a hardcoded zlib include path behind SYNCTEX_STANDALONE.
RUN git clone --depth 1 https://github.com/jlaurens/synctex /tmp/synctex \
    && sed -i 's|#include "/usr/local/include/node/zlib.h"|#include <zlib.h>|' /tmp/synctex/synctex_parser.c \
    && gcc -O2 -DSYNCTEX_STANDALONE -I/tmp/synctex -o /usr/local/bin/synctex \
       /tmp/synctex/synctex_main.c /tmp/synctex/synctex_parser.c /tmp/synctex/synctex_parser_utils.c -lz -lm \
    && rm -rf /tmp/synctex

# Stage 2: Final runtime image
FROM oven/bun:1-slim

# Install system dependencies needed for Tectonic and downloading
RUN apt-get update && apt-get install -y \
    curl \
    libfontconfig1 \
    libgraphite2-3 \
    libharfbuzz0b \
    libicu-dev \
    zlib1g \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled Tectonic and SyncTeX CLI from builder stage
COPY --from=builder /usr/local/bin/tectonic /usr/local/bin/
COPY --from=builder /usr/local/bin/synctex /usr/local/bin/


# Warm up tectonic package cache with standard LaTeX packages during build time
RUN mkdir -p /tmp/warmup && \
    echo '\\documentclass{article}\\usepackage{amsmath,amssymb,graphicx,hyperref,geometry,booktabs,microtype}\\begin{document}warmup\\end{document}' > /tmp/warmup/warm.tex && \
    tectonic /tmp/warmup/warm.tex && \
    rm -rf /tmp/warmup

WORKDIR /app

# Copy application files
COPY package.json ./
RUN bun install --production

# Glob, not a file list: index.ts imports sibling modules (draft-mode.ts), and
# naming them one by one silently ships a broken image the next time one is added.
COPY *.ts ./

# Expose port
EXPOSE 3001

# Run server
CMD ["bun", "run", "start"]

