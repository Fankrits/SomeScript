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
sources="$tmp/synctex/synctex_main.c $tmp/synctex/synctex_parser.c $tmp/synctex/synctex_parser_utils.c"
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    # Windows has no system zlib: compile the official zlib release in, and link statically so the
    # result needs no DLLs. (zlib.net publishes this tarball's SHA-256.)
    zlib=1.3.1
    zlib_sha256=9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23
    curl -fsSL --retry 3 "https://github.com/madler/zlib/releases/download/v$zlib/zlib-$zlib.tar.gz" -o "$tmp/zlib.tgz"
    echo "$zlib_sha256  $tmp/zlib.tgz" | sha256sum -c - >&2
    tar -xzf "$tmp/zlib.tgz" -C "$tmp"
    z="$tmp/zlib-$zlib"
    for f in adler32 compress crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil; do
      sources="$sources $z/$f.c"
    done
    # shellcheck disable=SC2086 # $sources is a list of paths without spaces
    "${CC:-gcc}" -O2 -static -DSYNCTEX_STANDALONE -I"$tmp/synctex" -I"$z" -o "$dir/bin/synctex" $sources
    ;;
  *)
    # shellcheck disable=SC2086
    cc -O2 -DSYNCTEX_STANDALONE -I"$tmp/synctex" -o "$dir/bin/synctex" $sources -lz -lm
    ;;
esac
echo "Built $dir/bin/synctex (upstream commit $(git -C "$tmp/synctex" rev-parse HEAD))"
