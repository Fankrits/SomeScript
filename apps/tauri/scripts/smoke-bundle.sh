#!/bin/sh
# Smoke test of a built desktop bundle. Starts it headless in a clean environment (no PATH to
# Homebrew/MSYS tools, no TECTONIC_BIN) and drives its HTTP surface, so it only passes if the
# bundled sidecars and templates are really found.
#
#   sh scripts/smoke-bundle.sh <SomeScript.app | path/to/somescript-desktop[.exe]>            auth, SPA, project creation, files, AI settings,
#                                                                                             and a first launch (nothing configured)
#   sh scripts/smoke-bundle.sh <...> --compile                                                ...plus a real Tectonic compile
#   sh scripts/smoke-bundle.sh <...> --real-documents                                         ...plus a first launch that uses the folder the
#                                                                                             OS names for Documents (on Windows the real one,
#                                                                                             so only on a machine you don't mind it on: CI)
#
# Needs sh, curl, awk, od, grep, sed. On Linux without a display it starts Xvfb (GTK needs one even
# though no window is shown). On Windows run it from Git Bash.
set -eu

app="${1:?usage: smoke-bundle.sh <SomeScript.app | path/to/somescript-desktop[.exe]> [--compile] [--real-documents]}"
shift
compile=""
real_documents=""
for option in "$@"; do
  case "$option" in
    --compile) compile=1 ;;
    --real-documents) real_documents=1 ;;
    *) echo "unknown option: $option" >&2; exit 1 ;;
  esac
done
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
  for log in "$work"/app*.log; do
    echo "--- $log ---" >&2
    cat "$log" >&2
  done
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
    # exec: always run in the background, where it replaces the subshell, so $! is the app itself and
    # stop_app really stops it (otherwise it would kill only the wrapper and leave the app running).
    clean_env() { exec env -i HOME="$HOME" PATH=/usr/bin:/bin DISPLAY="${DISPLAY:-}" "$@"; }
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

# wait_up <base url>: until the app answers, or it exits or takes too long
wait_up() {
  up=""
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$1/"; then up=1; break; fi
    kill -0 "$pid" 2>/dev/null || fail "the app exited before it started listening"
    sleep 0.5
  done
  [ -n "$up" ] || fail "the app never started listening on $1"
}

wait_up "$base"
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

# The AI assistant: settings are stored by the app and never echoed, and the HTTP/TLS stack of the
# release binary starts (a provider test against a closed port must say so, not crash).
contains "AI settings start empty" '"providers":[]' -b "$jar" "$base/api/ai/settings"
# Assembled here so the secret scanner sees no key-shaped literal in the repo.
fake_key="smoke-test-$port-key"
saved="$(curl -s -b "$jar" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke AI\",\"kind\":\"openai\",\"baseUrl\":\"https://127.0.0.1:9/v1\",\"apiKey\":\"$fake_key\"}" \
  "$base/api/ai/providers")"
echo "$saved" | grep -qF '"hasKey":true' || fail "the provider was not saved: $saved"
if echo "$saved" | grep -qF "$fake_key"; then fail "the API key was echoed back"; fi
if curl -s -b "$jar" "$base/api/ai/settings" | grep -qF "$fake_key"; then fail "the API key is readable from the settings"; fi
ok "a provider is saved and its key is never returned"
contains "the TLS/HTTP stack starts and reports an unreachable provider" "Couldn't reach" -b "$jar" \
  -H 'content-type: application/json' -d '{"name":"Smoke AI","kind":"openai","baseUrl":"https://127.0.0.1:9/v1","mode":"models"}' \
  "$base/api/ai/providers/test"
provider_id="$(echo "$saved" | sed -n 's/.*"provider":{"id":"\([^"]*\)".*/\1/p')"
[ -n "$provider_id" ] || fail "no provider id in $saved"
contains "the provider can be removed again" '"providers":[]' -b "$jar" \
  -H 'content-type: application/json' -d "{\"id\":\"$provider_id\"}" "$base/api/ai/providers/delete"

if [ -n "$compile" ]; then
  contains "real Tectonic compile succeeds" '[SUCCESS] main.pdf' -b "$jar" --max-time 300 \
    -H 'content-type: application/json' -d '{"projectId":"Smoke","path":"main.tex"}' "$base/api/compile"
  magic="$(curl -s -b "$jar" "$base/api/files?projectId=Smoke&path=.preview-cache/main.pdf" | head -c 4)"
  if [ "$magic" = "%PDF" ]; then ok "the compiled PDF is served"; else fail "PDF is not a PDF (starts with '$magic')"; fi
fi
# ---- First launch: nothing configured --------------------------------------------------------------
# Everything above starts the app with SOMESCRIPT_LIBRARY set, i.e. told where its library is, so where
# it puts one by default (Documents/SomeScript), and what it does when that can't be made, never ran
# on any platform: exactly the part a person's first launch uses, and where Windows broke. Here
# nothing is configured but a stand-in Documents folder, and a home and config folder of its own.
stop_app() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  pid=""
}
case "$os" in
  MINGW* | MSYS* | CYGWIN*)
    fresh_env() { clean_env USERPROFILE="$(winpath "$fr/home")" APPDATA="$(winpath "$fr/config")" LOCALAPPDATA="$(winpath "$fr/data")" "$@"; }
    ;;
  *)
    fresh_env() { clean_env HOME="$fr/home" XDG_CONFIG_HOME="$fr/config" XDG_DATA_HOME="$fr/data" "$@"; }
    ;;
esac
# start_fresh <label> [VAR=value ...]: a new instance on the next port, with no library configured
start_fresh() {
  label="$1"
  shift
  fresh_count=$((fresh_count + 1)) # a port of its own, so an instance that outlives its kill is no obstacle
  fresh_port=$((port + fresh_count))
  fresh_base="http://127.0.0.1:$fresh_port"
  mkdir -p "$fr/home" "$fr/config" "$fr/data"
  fresh_env SOMESCRIPT_HEADLESS=1 SOMESCRIPT_PORT="$fresh_port" SOMESCRIPT_TOKEN="$token" "$@" \
    "$exe" >"$work/app-$label.log" 2>&1 &
  pid=$!
  wait_up "$fresh_base"
}
# post_json <cookie jar> <json body> <url>
post_json() { curl -s -b "$1" -H 'content-type: application/json' -d "$2" "$3"; }

fresh_count=0
stop_app
fr="$work/first-run"
docs="$fr/docs"
mkdir -p "$docs"
docs_native="$(winpath "$docs")"
jar2="$work/cookies-first-run"
start_fresh first-run SOMESCRIPT_DOCUMENTS_DIR="$docs_native"
status "first run: the token is exchanged for a cookie" 303 -c "$jar2" "$fresh_base/?t=$token"

settings="$(curl -s -b "$jar2" "$fresh_base/api/settings")"
case "$settings" in *'"onboarded":false'*) ok "first run: setup has not been done" ;; *) fail "first run: expected onboarded:false in $settings" ;; esac
case "$settings" in *'"source":"default"'*) ok "first run: the library is the default folder" ;; *) fail "first run: expected source:default in $settings" ;; esac
[ ! -e "$docs/SomeScript" ] || fail "first run: reading the settings created the library folder"
ok "first run: reading the settings did not touch the folder"

contains "first run: a folder that doesn't exist yet can be created" '"creatable":true' -b "$jar2" \
  "$fresh_base/api/library/check?path=$docs_native/SomeScript"
[ ! -e "$docs/SomeScript" ] || fail "first run: checking a folder created it"

# What setup's "Create folder & continue" does: make it, prove it can be written to, remember it.
saved="$(post_json "$jar2" "{\"libraryPath\":\"$docs_native/SomeScript\"}" "$fresh_base/api/settings")"
case "$saved" in *'"onboarded":true'*) ok "first run: setup makes and remembers the folder" ;; *) fail "first run: setup failed: $saved" ;; esac
[ -d "$docs/SomeScript" ] || fail "first run: setup did not create $docs/SomeScript"
contains "first run: a project can be created in it" '"id":"First"' -b "$jar2" \
  -H 'content-type: application/json' -d '{"name":"First","template":"blank"}' "$fresh_base/api/projects"
[ -f "$docs/SomeScript/First/main.tex" ] || fail "first run: the project's files are not in the new folder"

# A folder that can't be made (something that isn't a folder is in the way) must say which one,
# never the bare "File not found" that creating a project used to answer.
printf 'x' >"$fr/a-file"
broken="$(post_json "$jar2" "{\"libraryPath\":\"$(winpath "$fr")/a-file/Library\"}" "$fresh_base/api/settings")"
case "$broken" in *a-file*) ok "first run: an unusable folder is named in the error" ;; *) fail "first run: the error should name the folder: $broken" ;; esac
case "$broken" in *"File not found"*) fail "first run: a folder problem was reported as 'File not found': $broken" ;; *) ok "first run: ...and is not reported as 'File not found'" ;; esac
stop_app

# ---- First launch in the folder the OS names for Documents -------------------------------------------
if [ -n "$real_documents" ]; then
  fr="$work/real-documents"
  jar3="$work/cookies-real-documents"
  start_fresh real-documents
  status "real Documents: the token is exchanged for a cookie" 303 -c "$jar3" "$fresh_base/?t=$token"
  settings="$(curl -s -b "$jar3" "$fresh_base/api/settings")"
  # The path as JSON wrote it (backslashes escaped), so it can go back into a JSON body unchanged.
  default="$(printf '%s' "$settings" | grep -oE '"defaultLibraryPath":"([^"\\]|\\.)*"' | sed 's/^"defaultLibraryPath":"//; s/"$//')"
  [ -n "$default" ] || fail "real Documents: no defaultLibraryPath in $settings"
  case "$settings" in
    *'"source":"default"'* | *'"source":"fallback"'*) ok "real Documents: the OS chose $default" ;;
    *) fail "real Documents: expected a default folder in $settings" ;;
  esac
  saved="$(post_json "$jar3" "{\"libraryPath\":\"$default\"}" "$fresh_base/api/settings")"
  case "$saved" in *'"onboarded":true'*) ok "real Documents: setup works in the OS's own default folder" ;; *) fail "real Documents: setup failed: $saved" ;; esac
  contains "real Documents: a project can be created there" '"id":"Real"' -b "$jar3" \
    -H 'content-type: application/json' -d '{"name":"Real","template":"blank"}' "$fresh_base/api/projects"
  # Leave no project behind (the empty SomeScript folder stays; this runs on a throwaway machine).
  post_json "$jar3" '{"id":"Real"}' "$fresh_base/api/projects/delete" >/dev/null
  trashed="$(curl -s -b "$jar3" "$fresh_base/api/trash" | grep -oE '"id":"Real~[0-9]+"' | head -n 1 | sed 's/^"id":"//; s/"$//')"
  [ -z "$trashed" ] || post_json "$jar3" "{\"id\":\"$trashed\"}" "$fresh_base/api/trash/purge" >/dev/null
  stop_app
fi

echo "smoke test passed"
