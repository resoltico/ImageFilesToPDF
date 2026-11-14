#!/usr/bin/env bash
# Production-artifact CLI, admission, naming, ownership and embedding contracts.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d -t ImageFilesToPDF-cli)
trap 'chmod -R u+rwX "$WORK"; rm -rf "$WORK"' EXIT
# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"
require_tools
solid_svg "$WORK/source.svg" 400 200 '#235789'
vips copy "$WORK/source.svg" "$WORK/photo.jpg[Q=92,keep=none]"
vips copy "$WORK/source.svg" "$WORK/photo.png"
vips copy "$WORK/source.svg" "$WORK/first.tif"
vips invert "$WORK/first.tif" "$WORK/second.tif"
tiffcp "$WORK/first.tif" "$WORK/second.tif" "$WORK/multi.tif"
vips webpsave "$WORK/multi.tif[n=-1]" "$WORK/animated.webp" --page-height 200
test "$(vipsheader -f n-pages "$WORK/animated.webp")" = 2
# A real HEIF decoder signature, independent of the .heic suffix.
vips copy "$WORK/photo.png" "$WORK/whole.heic"
head -c 64 "$WORK/whole.heic" >"$WORK/cut.heic"
printf 'not an image' >"$WORK/text.heic"
# A WebP cut short is damaged: its loader is known, yet its header cannot be parsed.
vips gaussnoise "$WORK/noise.v" 400 200
vips copy "$WORK/noise.v" "$WORK/whole.webp"
head -c "$(( $(wc -c <"$WORK/whole.webp") * 6 / 10 ))" "$WORK/whole.webp" >"$WORK/cut.webp"
vips icc_transform "$WORK/photo.jpg" "$WORK/tagged.jpg" "$P3_PROFILE" --input-profile "$SRGB_PROFILE"
# The caller's locale must not change any backend parser or capability probe.
mkdir "$WORK/german"
cp "$WORK/photo.jpg" "$WORK/german/photo.jpg"
write_config "$WORK/german/settings.json" A4 Portrait separate "#FFFFFF" 20261029_010203
LANG=de_DE.UTF-8 LC_ALL=de_DE.UTF-8 osascript -l JavaScript \
    "$ROOT/dist/Image-Files-to-PDF.jxa" -- --headless "$WORK/german/settings.json" \
    "$WORK/german/photo.jpg" >"$WORK/german/receipt" 2>"$WORK/german/stderr"
node - "$WORK/german/receipt" <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const receipt = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(receipt.state, 'complete');
assert.equal(receipt.documents[0].state, 'saved');
JS
assert_valid_pdf "$WORK/german/photo.pdf"
node "$ROOT/tests/integration/cli-contract.cjs" "$ROOT/dist/Image-Files-to-PDF.jxa" "$WORK"
