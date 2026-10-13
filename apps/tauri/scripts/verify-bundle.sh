#!/bin/sh
# Static checks of a built desktop bundle. Prints every problem and exits 1 if any.
#
#   sh scripts/verify-bundle.sh path/to/SomeScript.app [expected-version]   macOS
#   sh scripts/verify-bundle.sh path/to/root           [expected-version]   Linux: a `dpkg -x` (or
#                                                                           AppImage) tree, or /
#                                                                           Windows: the install dir
#   REQUIRE_SIGNED=1 sh scripts/verify-bundle.sh ...     also enforce code signing + Gatekeeper (macOS)
#   EXPECT_UNIVERSAL=1 sh scripts/verify-bundle.sh ...   require both arm64 and x86_64 slices (macOS)
set -u

app="${1:?usage: verify-bundle.sh path/to/bundle [expected-version]}"
want_version="${2:-}"
failed=0
bad() { echo "FAIL: $*" >&2; failed=1; }

ext=""
if [ -d "$app/Contents/MacOS" ]; then
  kind=macos
  bindir="$app/Contents/MacOS"
  toolsdir="$bindir"
  resdir="$app/Contents/Resources"
elif [ -f "$app/somescript-desktop.exe" ]; then
  kind=windows
  ext=".exe"
  bindir="$app"
  toolsdir="$bindir"
  resdir="$app"
elif [ -x "$app/usr/bin/somescript-desktop" ]; then
  kind=linux
  bindir="$app/usr/bin"
  resdir="$app/usr/lib/SomeScript"
  toolsdir="$resdir/bin" # not /usr/bin: that would collide with TeX Live's synctex package
else
  echo "unrecognised bundle layout: $app" >&2
  exit 1
fi

if [ "$kind" = linux ]; then
  for exe in tectonic synctex; do
    [ ! -e "$bindir/$exe" ] || bad "$exe is installed in /usr/bin, where it would collide with TeX Live's package"
  done
fi

for exe in somescript-desktop tectonic synctex; do
  dir="$toolsdir"
  [ "$exe" != somescript-desktop ] || dir="$bindir"
  path="$dir/$exe$ext"
  if [ ! -x "$path" ]; then
    bad "missing executable $exe$ext in $dir"
    continue
  fi
  case "$kind" in
    macos)
      # Only OS-provided libraries: a Homebrew dylib works on the build machine and nowhere else.
      # (Library lines are indented; a universal binary also prints an unindented header per architecture.)
      extra="$(otool -L "$path" | awk '/^[[:space:]]/ {print $1}' | grep -v '^/System/' | grep -v '^/usr/lib/' || true)"
      [ -z "$extra" ] || bad "$exe links non-system libraries: $(echo "$extra" | tr '\n' ' ')"
      if [ "${EXPECT_UNIVERSAL:-0}" = "1" ]; then
        archs="$(lipo -archs "$path" 2>/dev/null || true)"
        case " $archs " in
          *" arm64 "*|*" aarch64 "*)
            case " $archs " in
              *" x86_64 "*) ;;
              *) bad "$exe is not universal: architectures are '$archs' (missing x86_64)" ;;
            esac
            ;;
          *) bad "$exe is not universal: architectures are '$archs'" ;;
        esac
      fi
      ;;
    linux)
      libs="$(ldd "$path" 2>&1)"
      echo "$libs" | grep -q 'not found' && bad "$exe has unresolved libraries: $(echo "$libs" | grep 'not found' | tr -s ' \t\n' ' ')"
      if [ "$exe" != somescript-desktop ]; then
        # The sidecars may only need what the .deb declares as dependencies: libc, libstdc++ and
        # libgraphite2 (Tectonic's official build; see the dependencies in tauri.bundle.conf.json).
        extra="$(echo "$libs" | awk '/=>/ {print $1}' | grep -v -E '^(libc|libm|libgcc_s|libstdc\+\+|libgraphite2|libz|libdl|libpthread|librt)\.so' || true)"
        [ -z "$extra" ] || bad "$exe links unexpected libraries: $(echo "$extra" | tr '\n' ' ')"
      fi
      ;;
  esac
done

for f in templates/blank/main.tex templates/starter/main.tex templates/starter/Fonts/NOTICE.md \
  THIRD_PARTY_LICENSES.md SOURCES.txt; do
  [ -n "$(find "$resdir" -path "*/$f" -print -quit 2>/dev/null)" ] || bad "missing resource $f under $resdir"
done

if [ "$kind" = macos ]; then
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
fi

if [ "$failed" -eq 0 ]; then
  echo "bundle ok ($kind): $app"
fi
exit "$failed"
