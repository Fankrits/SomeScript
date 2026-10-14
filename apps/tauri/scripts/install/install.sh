#!/bin/sh
set -eu

TMP_DIR=""
MOUNT_POINT=""

cleanup() {
  if [ -n "$MOUNT_POINT" ]; then
    hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1 || true
    MOUNT_POINT=""
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
    TMP_DIR=""
  fi
}

trap cleanup EXIT INT TERM HUP

verify_checksum() {
  file="$1"
  sums_file="$2"
  asset="$3"

  expected_hash="$(awk -v name="$asset" '
    $2 == name || $2 == "*"name { print $1; exit }
  ' "$sums_file")"

  if [ -z "$expected_hash" ]; then
    echo "Error: missing checksum for $asset in SHA256SUMS.txt" >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    actual_hash="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_hash="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    echo "Error: neither sha256sum nor shasum was found on PATH" >&2
    exit 1
  fi

  expected_lower="$(echo "$expected_hash" | tr '[:upper:]' '[:lower:]')"
  actual_lower="$(echo "$actual_hash" | tr '[:upper:]' '[:lower:]')"

  if [ "$expected_lower" != "$actual_lower" ]; then
    echo "Error: SHA-256 checksum mismatch for $asset" >&2
    echo "  Expected: $expected_lower" >&2
    echo "  Actual:   $actual_lower" >&2
    exit 1
  fi
}

is_app_running() {
  app_pattern="${1:-SomeScript.app}"
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "$app_pattern" >/dev/null 2>&1
  else
    ps aux | grep -v grep | grep -q "$app_pattern"
  fi
}

install_macos() {
  if [ -n "${SOMESCRIPT_INSTALL_DIR:-}" ]; then
    install_dir="$SOMESCRIPT_INSTALL_DIR"
  elif [ -w "/Applications" ]; then
    install_dir="/Applications"
  else
    install_dir="$HOME/Applications"
  fi
  mkdir -p "$install_dir"
  target_app="$install_dir/SomeScript.app"

  if is_app_running "$target_app" || is_app_running "SomeScript.app"; then
    echo "Error: SomeScript is currently running. Please close SomeScript before installing." >&2
    exit 1
  fi

  asset_name="SomeScript-macos-universal.dmg"
  dmg_path="$TMP_DIR/$asset_name"

  echo "Downloading $asset_name..."
  curl -fsSL "$BASE_URL/$asset_name" -o "$dmg_path"

  verify_checksum "$dmg_path" "$SUMS_PATH" "$asset_name"

  MOUNT_POINT="$TMP_DIR/mount"
  mkdir -p "$MOUNT_POINT"
  hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT_POINT" "$dmg_path" >/dev/null

  src_app="$MOUNT_POINT/SomeScript.app"
  if [ ! -d "$src_app" ]; then
    echo "Error: SomeScript.app not found inside DMG" >&2
    exit 1
  fi

  rm -rf "$target_app"

  # Files downloaded via curl do not carry the com.apple.quarantine extended attribute,
  # so macOS Gatekeeper does not block the unsigned application on launch.
  ditto "$src_app" "$target_app"

  hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  MOUNT_POINT=""

  echo "SomeScript installed successfully to $target_app"
  if [ -z "${SOMESCRIPT_NO_OPEN:-}" ]; then
    open -a SomeScript 2>/dev/null || open "$target_app" 2>/dev/null || true
  fi
}

install_linux() {
  arch="$(uname -m)"
  if [ "$arch" != "x86_64" ]; then
    echo "Error: SomeScript for Linux is only available for x86_64 architecture (detected: $arch)." >&2
    exit 1
  fi

  # Linux uses the AppImage instead of .deb because the built-in Tauri updater
  # can update an AppImage in place, whereas package manager formats cannot.
  asset_name="SomeScript-linux-x64.AppImage"
  appimage_path="$TMP_DIR/$asset_name"

  echo "Downloading $asset_name..."
  curl -fsSL "$BASE_URL/$asset_name" -o "$appimage_path"

  verify_checksum "$appimage_path" "$SUMS_PATH" "$asset_name"

  data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
  install_dir="${SOMESCRIPT_INSTALL_DIR:-$data_home/somescript}"
  target_appimage="$install_dir/SomeScript.AppImage"

  mkdir -p "$install_dir"
  cp "$appimage_path" "$target_appimage"
  chmod +x "$target_appimage"

  bin_dir="${SOMESCRIPT_BIN_DIR:-$HOME/.local/bin}"
  mkdir -p "$bin_dir"
  ln -sf "$target_appimage" "$bin_dir/somescript"

  apps_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$apps_dir"
  desktop_entry="$apps_dir/somescript.desktop"

  cat > "$desktop_entry" <<EOF
[Desktop Entry]
Type=Application
Name=SomeScript
Comment=Free, local LaTeX editor
Exec=$target_appimage %U
Icon=somescript
Terminal=false
Categories=Office;Publishing;Development;
EOF
  chmod 644 "$desktop_entry"

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
      echo "Warning: $bin_dir is not on your PATH." >&2
      echo "  Add it to your profile (e.g. ~/.bashrc or ~/.zshrc):" >&2
      echo "    export PATH=\"$bin_dir:\$PATH\"" >&2
      ;;
  esac

  if command -v ldd >/dev/null 2>&1; then
    glibc_ver="$(ldd --version 2>/dev/null | head -n 1 | grep -oE '[0-9]+\.[0-9]+' | tail -n 1 || true)"
    if [ -n "$glibc_ver" ]; then
      major="$(echo "$glibc_ver" | cut -d. -f1)"
      minor="$(echo "$glibc_ver" | cut -d. -f2)"
      if [ "$major" -lt 2 ] 2>/dev/null || { [ "$major" -eq 2 ] && [ "$minor" -lt 39 ]; } 2>/dev/null; then
        echo "Warning: SomeScript requires glibc 2.39 or newer (detected glibc $glibc_ver)." >&2
        echo "  Older distributions (e.g. Ubuntu 22.04) are not supported." >&2
      fi
    fi
  fi

  if [ ! -e /dev/fuse ] || ! command -v fusermount >/dev/null 2>&1; then
    echo "Note: FUSE (libfuse2) appears to be missing." >&2
    echo "  AppImages require FUSE to mount. If the application fails to start," >&2
    echo "  install libfuse2 or run with: APPIMAGE_EXTRACT_AND_RUN=1 $target_appimage" >&2
  fi

  echo "SomeScript installed successfully to $target_appimage"
  echo "Command symlinked to $bin_dir/somescript"
}

main() {
  BASE_URL="${SOMESCRIPT_BASE_URL:-https://github.com/Fankrits/SomeScript/releases/latest/download}"
  TMP_DIR="$(mktemp -d)"

  SUMS_PATH="$TMP_DIR/SHA256SUMS.txt"
  echo "Downloading SHA256SUMS.txt..."
  curl -fsSL "$BASE_URL/SHA256SUMS.txt" -o "$SUMS_PATH"

  os="$(uname -s)"
  case "$os" in
    Darwin)
      install_macos
      ;;
    Linux)
      install_linux
      ;;
    *)
      echo "Error: unsupported operating system: $os. For Windows, use install.ps1." >&2
      exit 1
      ;;
  esac
}

main "$@"
