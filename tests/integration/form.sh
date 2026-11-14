#!/usr/bin/env bash
# Real AppKit geometry, accessibility, actual auto-dismissed modal initialization
# and off-screen previews. Failure diagnostics use an owned-window screenshot only
# when already authorized; the native gate requires no screenshot permission.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d -t ImageFilesToPDF-form)
trap 'rm -rf "$WORK"' EXIT
PREVIEWS=${IFTP_FORM_PREVIEWS:-"$WORK/previews"}
mkdir -p "$PREVIEWS"
node "$ROOT/tools/build-probe.mjs" tests/integration/form-probe.js "$WORK/form.jxa"
DEEP="$WORK"
SEGMENT=$(printf 'd%.0s' {1..140})
for index in {1..5}; do
    DEEP="$DEEP/$SEGMENT-$index"
    mkdir "$DEEP"
done
osascript -l JavaScript "$WORK/form.jxa" "$PREVIEWS" "$DEEP"
