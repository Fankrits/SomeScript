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

# Install Tectonic
RUN curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh \
    && mv tectonic /usr/local/bin/

# Warm up tectonic package cache with standard LaTeX packages during build time
RUN mkdir -p /tmp/warmup && \
    echo '\\documentclass{article}\\usepackage{amsmath,amssymb,graphicx,hyperref,geometry,booktabs,microtype}\\begin{document}warmup\\end{document}' > /tmp/warmup/warm.tex && \
    tectonic /tmp/warmup/warm.tex && \
    rm -rf /tmp/warmup

WORKDIR /app

# Copy application files
COPY package.json ./
RUN bun install --production

COPY index.ts ./

# Expose port
EXPOSE 3001

# Run server
CMD ["bun", "run", "start"]
