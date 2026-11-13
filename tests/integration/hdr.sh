#!/usr/bin/env bash
# Synthetic Ultra HDR admission, SDR output, ICC and orientation contracts.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d -t ImageFilesToPDF-hdr)
trap 'rm -rf "$WORK"' EXIT
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"
require_tools
ultra_hdr_jpeg "$WORK/photo.jpg"
cp "$WORK/photo.jpg" "$WORK/no-icc.jpg"
exiftool -overwrite_original -icc_profile= "$WORK/no-icc.jpg"
cp "$WORK/photo.jpg" "$WORK/p3.jpg"
exiftool -overwrite_original "-icc_profile<=$P3_PROFILE" "$WORK/p3.jpg"
for orientation in 6 8; do
    cp "$WORK/p3.jpg" "$WORK/rotated-$orientation.jpg"
    exiftool -overwrite_original "-Orientation#=$orientation" "$WORK/rotated-$orientation.jpg"
done
for image in no-icc p3 rotated-6 rotated-8; do
    test "$(vipsheader -f vips-loader "$WORK/$image.jpg")" = uhdrload
    vipsheader -f gainmap-data "$WORK/$image.jpg" >/dev/null
done
if vipsheader -f icc-profile-data "$WORK/no-icc.jpg" >/dev/null 2>&1; then
    echo 'ICC-less HDR fixture still has a profile' >&2
    exit 1
fi
head -c 400 "$WORK/photo.jpg" > "$WORK/damaged.jpg"
vips icc_transform "$WORK/p3.jpg" "$WORK/reference.v" srgb --embedded
vips copy "$WORK/photo.jpg" "$WORK/unmapped.gif"
cp "$WORK/unmapped.gif" "$WORK/unmapped.png"
node "$ROOT/tests/integration/hdr-contract.cjs" "$ROOT/dist/Image-Files-to-PDF.jxa" "$WORK"
