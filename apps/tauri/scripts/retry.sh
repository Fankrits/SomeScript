#!/bin/sh
# retry.sh <attempts> <command...>: runs the command, retrying if it fails, and says so in the log.
#
# For flaky runner-side steps only. The macOS .dmg step mounts disk images and scripts Finder,
# and now and then dies with nothing wrong in the code (it passed on the same commit before).
# The compile is cached, so a retry costs seconds; a deterministic failure still fails after the last attempt.
set -u
attempts="${1:?usage: retry.sh <attempts> <command...>}"
shift
i=1
until "$@"; do
  if [ "$i" -ge "$attempts" ]; then
    echo "gave up after $i attempt(s): $*" >&2
    exit 1
  fi
  echo "::warning::attempt $i of $attempts failed, retrying: $*"
  # A half-finished .dmg build leaves its image mounted, and the next attempt would fail on it.
  if [ "$(uname -s)" = Darwin ]; then
    for vol in /Volumes/dmg.* /Volumes/SomeScript*; do
      [ -d "$vol" ] && hdiutil detach -force "$vol" >/dev/null 2>&1
    done
  fi
  i=$((i + 1))
  sleep 5
done
