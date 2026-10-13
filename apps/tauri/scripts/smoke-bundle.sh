#!/bin/sh
# Smoke test of a built desktop bundle. Starts it headless in a clean environment (no PATH to
# Homebrew, no TECTONIC_BIN) and drives its HTTP surface, so it only passes if the bundled
# sidecars and templates are really found.
#
#   sh scripts/smoke-bundle.sh path/to/SomeScript.app            auth, SPA, project creation, files
#   sh scripts/smoke-bundle.sh path/to/SomeScript.app --compile  ...plus a real Tectonic compile
set -eu

app="${1:?usage: smoke-bundle.sh path/to/SomeScript.app [--compile]}"
compile="${2:-}"
exe="$app/Contents/MacOS/somescript-desktop"
[ -x "$exe" ] || { echo "no executable at $exe" >&2; exit 1; }

work="$(mktemp -d)"
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
token="$(openssl rand -hex 16)"
base="http://127.0.0.1:$port"
jar="$work/cookies"
pid=""
cleanup() {
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true # reap it so the shell prints no "Terminated" job notice
  fi
  rm -rf "$work"
}
trap cleanup EXIT

env -i HOME="$HOME" PATH=/usr/bin:/bin SOMESCRIPT_HEADLESS=1 SOMESCRIPT_PORT="$port" \
  SOMESCRIPT_TOKEN="$token" SOMESCRIPT_LIBRARY="$work/library" "$exe" >"$work/app.log" 2>&1 &
pid=$!

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1" >&2
  echo "--- app log ---" >&2
  cat "$work/app.log" >&2
  exit 1
}
# status <description> <expected code> <curl args...>
status() {
  desc="$1"
  want="$2"
  shift 2
  got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  if [ "$got" = "$want" ]; then ok "$desc ($got)"; else fail "$desc: expected $want, got $got"; fi
}
# contains <description> <needle> <curl args...>
contains() {
  desc="$1"
  needle="$2"
  shift 2
  if curl -s "$@" | grep -qF -- "$needle"; then ok "$desc"; else fail "$desc: response lacks $needle"; fi
}

up=""
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "$base/"; then up=1; break; fi
  kill -0 "$pid" 2>/dev/null || fail "the app exited before it started listening"
  sleep 0.5
done
[ -n "$up" ] || fail "the app never started listening on $base"
ok "listening on 127.0.0.1:$port"

status "no cookie is refused" 403 "$base/api/health"
status "wrong token is refused" 403 "$base/?t=0000000000000000"
status "foreign Host header is refused" 403 -H "Host: evil.example" "$base/api/health"
status "token is exchanged for a cookie" 303 -c "$jar" "$base/?t=$token"
grep -q "ss_token" "$jar" || fail "no ss_token cookie was set"
ok "cookie stored"

status "API answers with the cookie" 200 -b "$jar" "$base/api/health"
contains "SPA is served from the binary" 'id="root"' -b "$jar" "$base/dashboard"
contains "creating a project uses the bundled template" '"id":"Smoke"' -b "$jar" \
  -H 'content-type: application/json' -d '{"name":"Smoke","template":"blank"}' "$base/api/projects"
contains "the new project's files are served" '"main.tex"' -b "$jar" "$base/api/files?projectId=Smoke"
contains "the project is in the library listing" '"Smoke"' -b "$jar" "$base/api/projects"

if [ "$compile" = "--compile" ]; then
  contains "real Tectonic compile succeeds" '[SUCCESS] main.pdf' -b "$jar" --max-time 300 \
    -H 'content-type: application/json' -d '{"projectId":"Smoke","path":"main.tex"}' "$base/api/compile"
  magic="$(curl -s -b "$jar" "$base/api/files?projectId=Smoke&path=.preview-cache/main.pdf" | head -c 4)"
  if [ "$magic" = "%PDF" ]; then ok "the compiled PDF is served"; else fail "PDF is not a PDF (starts with '$magic')"; fi
fi
echo "smoke test passed"
