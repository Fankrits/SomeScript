#!/bin/sh
# Builds the installers for this OS (pass tauri's flags through, e.g. --bundles deb,appimage).
#
# The bundle config is merged at build time only, so `cargo test` and `tauri dev` need no sidecars.
# Linux uses its own: /usr/bin/synctex belongs to TeX Live, and a .deb that installed one there
# would refuse to install next to texlive-binaries, so the sidecars ship under the app's own
# lib directory instead (tex.rs looks there).
set -eu
cd "$(dirname "$0")/.."
conf=src-tauri/tauri.bundle.conf.json
if [ "$(uname -s)" = Linux ]; then conf=src-tauri/tauri.bundle.linux.conf.json; fi
exec tauri build --config "$conf" "$@"
