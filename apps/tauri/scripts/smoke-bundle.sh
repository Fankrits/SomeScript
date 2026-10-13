#!/bin/sh
# Smoke test of a built desktop bundle. Starts it headless in a clean environment (no PATH to
# Homebrew/MSYS tools, no TECTONIC_BIN) and drives its HTTP surface, so it only passes if the
# bundled sidecars and templates are really found.
#
#   sh scripts/smoke-bundle.sh <SomeScript.app | path/to/somescript-desktop[.exe]>            auth, SPA, project creation, files
#   sh scripts/smoke-bundle.sh <...> --compile                                                ...plus a real Tectonic compile
#
# Needs sh, curl, awk, od, grep. On Linux without a display it starts Xvfb (GTK needs one even though
# no window is shown). On Windows run it from Git Bash.
set -eu

app="${1:?usage: smoke-bundle.sh <SomeScript.app | path/to/somescript-desktop[.exe]> [--compile]}"
compile="${2:-}"
case "$app" in
  *.app) exe="$app/Contents/MacOS/somescript-desktop" ;;
  *) exe="$app" ;;
esac
[ -x "$exe" ] || { echo "no executable at $exe" >&2; exit 1; }

os="$(uname -s)"
work="$(mktemp -d)"
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
port="$(awk 'BEGIN { srand(); print int(20000 + rand() * 20000) }')"
token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
base="http://127.0.0.1:$port"
jar="$work/cookies"
pid=""
xvfb=""
cleanup() {
  for p in $pid $xvfb; do
    kill "$p" 2>/dev/null || true
    wait "$p" 2>/dev/null || true # reap it so the shell prints no "Terminated" job notice
  done
  rm -rf "$work"
}
trap cleanup EXIT

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1" >&2
  echo "--- app log ---" >&2
  cat "$work/app.log" >&2
  exit 1
}

case "$os" in
  MINGW* | MSYS* | CYGWIN*)
    # Windows needs a few variables to work at all (temp dir, Schannel, profile) and nothing from the
    # developer PATH. SOMESCRIPT_LIBRARY must be a native path, not an MSYS one.
    clean_env() {
      env -i SystemRoot="$SYSTEMROOT" PATH="$SYSTEMROOT\\System32" TEMP="$(winpath "$TEMP")" TMP="$(winpath "$TEMP")" \
        USERPROFILE="$USERPROFILE" APPDATA="$APPDATA" LOCALAPPDATA="$LOCALAPPDATA" "$@"
    }
    library="$(winpath "$work")/library"
    ;;
  *)
    if [ "$os" = Linux ] && [ -z "${DISPLAY:-}" ]; then
      command -v Xvfb >/dev/null 2>&1 || { echo "no DISPLAY and no Xvfb (apt-get install xvfb)" >&2; exit 1; }
      Xvfb :99 -screen 0 1280x720x24 >"$work/xvfb.log" 2>&1 &
      xvfb=$!
      DISPLAY=:99
      for _ in $(seq 1 40); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.25; done
    fi
    clean_env() { env -i HOME="$HOME" PATH=/usr/bin:/bin DISPLAY="${DISPLAY:-}" "$@"; }
    library="$work/library"
    ;;
esac

clean_env SOMESCRIPT_HEADLESS=1 SOMESCRIPT_PORT="$port" SOMESCRIPT_TOKEN="$token" \
  SOMESCRIPT_LIBRARY="$library" "$exe" >"$work/app.log" 2>&1 &
pid=$!

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
