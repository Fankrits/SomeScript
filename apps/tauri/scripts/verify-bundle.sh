#!/bin/sh
# Static checks of a built desktop bundle (macOS .app). Prints every problem and exits 1 if any.
#
#   sh scripts/verify-bundle.sh path/to/SomeScript.app [expected-version]
#   REQUIRE_SIGNED=1 sh scripts/verify-bundle.sh ...     also enforce code signing + Gatekeeper
set -u

app="${1:?usage: verify-bundle.sh path/to/SomeScript.app [expected-version]}"
want_version="${2:-}"
macos="$app/Contents/MacOS"
resources="$app/Contents/Resources"
failed=0
bad() { echo "FAIL: $*" >&2; failed=1; }

for exe in somescript-desktop tectonic synctex; do
  if [ ! -x "$macos/$exe" ]; then
    bad "missing executable $exe in Contents/MacOS"
    continue
  fi
  # Only OS-provided libraries: a Homebrew dylib works on the build machine and nowhere else.
  extra="$(otool -L "$macos/$exe" | tail -n +2 | awk '{print $1}' | grep -v '^/System/' | grep -v '^/usr/lib/' || true)"
  if [ -n "$extra" ]; then
    bad "$exe links non-system libraries: $(echo "$extra" | tr '\n' ' ')"
  fi
done

for f in templates/blank/main.tex templates/starter/main.tex templates/starter/Fonts/NOTICE.md \
  THIRD_PARTY_LICENSES.md binaries/SOURCES.txt; do
  [ -f "$resources/$f" ] || bad "missing resource $f"
done

plist="$app/Contents/Info.plist"
identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null || true)"
[ "$identifier" = "com.fankrits.somescript" ] || bad "bundle identifier is '$identifier'"
if [ -n "$want_version" ]; then
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" 2>/dev/null || true)"
  [ "$version" = "$want_version" ] || bad "bundle version is '$version', expected '$want_version'"
fi

if [ "${REQUIRE_SIGNED:-0}" = "1" ]; then
  codesign --verify --deep --strict "$app" 2>&1 || bad "code signature is invalid"
  spctl --assess --type execute "$app" 2>&1 || bad "Gatekeeper rejects the app (not notarized?)"
fi

if [ "$failed" -eq 0 ]; then
  echo "bundle ok: $app"
fi
exit "$failed"
