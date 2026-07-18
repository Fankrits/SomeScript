#!/bin/sh
# Builds the official SyncTeX CLI (https://github.com/jlaurens/synctex — the
# canonical upstream that TeX Live vendors) into apps/compiler/bin/synctex.
# Tectonic generates .synctex.gz files but does not ship the query tool.
# Requires: a C compiler, git, zlib headers.
set -e
dir="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 https://github.com/jlaurens/synctex "$tmp/synctex"
# Fix an upstream debug artifact: SYNCTEX_STANDALONE hardcodes a zlib include path.
sed -i.bak 's|#include "/usr/local/include/node/zlib.h"|#include <zlib.h>|' "$tmp/synctex/synctex_parser.c"
mkdir -p "$dir/bin"
cc -O2 -DSYNCTEX_STANDALONE -I"$tmp/synctex" -o "$dir/bin/synctex" \
  "$tmp/synctex/synctex_main.c" \
  "$tmp/synctex/synctex_parser.c" \
  "$tmp/synctex/synctex_parser_utils.c" \
  -lz -lm
echo "Built $dir/bin/synctex"
