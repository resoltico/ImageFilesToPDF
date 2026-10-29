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
vips icc_transform "$WORK/photo.jpg" "$WORK/tagged.jpg" "$P3_PROFILE" --input-profile "$SRGB_PROFILE"
node "$ROOT/tests/integration/cli-contract.cjs" "$ROOT/dist/Image-Files-to-PDF.jxa" "$WORK"
