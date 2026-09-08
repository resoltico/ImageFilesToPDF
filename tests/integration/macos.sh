#!/usr/bin/env bash
#
# macOS integration gate.
#
# Runs the generated JXA artifact through osascript exactly as a caller would,
# then checks the produced PDFs with pdfcpu, qpdf and Poppler.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-integration)
trap 'rm -rf "$WORK"' EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"

require_tools
create_fixtures "$WORK"

# run_headless <config> <image>...
#
# Invoked with osascript's "--" separator, which osascript forwards into
# run(). The runtime must still recognise --headless, or this blocks on a GUI
# dialog instead of running.
run_headless() {
    osascript -l JavaScript "$SCRIPT" -- --headless "$@" >/dev/null
}

# ---------------------------------------------------------------------------
# Combined PDF, A4 portrait, white background, natural page order
# ---------------------------------------------------------------------------

write_config "$WORK/combined.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_010203
run_headless "$WORK/combined.json" \
    "$WORK/page 10 'quoted'.jpg" "$WORK/page 2.png"

COMBINED="$WORK/output_20260904_010203.pdf"
assert_valid_pdf "$COMBINED"
test "$(pdfinfo "$COMBINED" | awk '/^Pages:/ {print $2}')" = 2
assert_page_size "$COMBINED" "595.28 x 841.89 pts (A4)" "combined PDF is not exactly A4"

pdftoppm -f 1 -singlefile -r 10 -png "$COMBINED" "$WORK/first" >/dev/null 2>&1
assert_pixel "$WORK/first.png" 30 42 223 41 53 28 \
    "natural order (page 2 must precede page 10, so page one is red)"

# ---------------------------------------------------------------------------
# Separate PDFs, Letter landscape, alpha flattening, and a background that is
# not one of the four presets -- typed in lower case and without its hash, as
# a person or a script may supply it. What the presets had written down for
# them is worked out for whatever arrives, so this is the same path they take.
# ---------------------------------------------------------------------------

write_config "$WORK/separate.json" Letter Landscape "Separate PDFs" "c7dae8" 20260904_020304
run_headless "$WORK/separate.json" "$WORK/alpha image.png"

SEPARATE="$WORK/alpha image_20260904_020304.pdf"
assert_valid_pdf "$SEPARATE"
assert_page_size "$SEPARATE" "792 x 612 pts" "separate PDF is not Letter landscape"

pdftoppm -f 1 -singlefile -r 10 -png "$SEPARATE" "$WORK/custom" >/dev/null 2>&1
assert_pixel "$WORK/custom.png" 0 0 199 218 232 6 \
    "a typed page background, with alpha flattening"

# No-clobber: a second run must not overwrite the first.
run_headless "$WORK/separate.json" "$WORK/alpha image.png"
test -s "$WORK/alpha image_20260904_020304_2.pdf"

# ---------------------------------------------------------------------------
# A black background, which vips is given as one number rather than three.
# Getting that wrong would silently produce the wrong colour.
# ---------------------------------------------------------------------------

write_config "$WORK/black.json" A4 Portrait "Single PDF" "#000000" 20260904_060708
run_headless "$WORK/black.json" "$WORK/tiny.png"

BLACK="$WORK/output_20260904_060708.pdf"
assert_valid_pdf "$BLACK"
pdftoppm -f 1 -singlefile -r 10 -png "$BLACK" "$WORK/black" >/dev/null 2>&1
assert_pixel "$WORK/black.png" 0 0 0 0 0 6 \
    "black page background"

# ---------------------------------------------------------------------------
# Colour management: a Display P3 source must be ICC-converted, not passed
# through. The source encodes sRGB #E01010 (224,16,16); ignoring the profile
# renders it around (206,48,36), so green and blue are the discriminators.
# ---------------------------------------------------------------------------

write_config "$WORK/colour.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_030405
run_headless "$WORK/colour.json" "$WORK/wide gamut.png"

COLOUR="$WORK/output_20260904_030405.pdf"
test -s "$COLOUR"
pdftoppm -f 1 -singlefile -r 72 -png "$COLOUR" "$WORK/colour" >/dev/null 2>&1
assert_pixel "$WORK/colour.png" 297 421 224 16 16 18 \
    "Display P3 source must be ICC-converted, not passed through"

# ---------------------------------------------------------------------------
# A 64x64 source centred on a 595x842 page covers only the middle. If the
# thumbnail stage upscales, it would span the full page width instead.
# ---------------------------------------------------------------------------

write_config "$WORK/tiny.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_040506
run_headless "$WORK/tiny.json" "$WORK/tiny.png"

TINY="$WORK/output_20260904_040506.pdf"
test -s "$TINY"
pdftoppm -f 1 -singlefile -r 72 -png "$TINY" "$WORK/tiny-page" >/dev/null 2>&1
assert_pixel "$WORK/tiny-page.png" 397 421 255 255 255 10 \
    "a 64px source must not be upscaled to fill the page"

# ---------------------------------------------------------------------------
# A HEIC, the format an iPhone actually produces, and a multi-page TIFF, which
# vips would otherwise read the first page of without saying so.
# ---------------------------------------------------------------------------

write_config "$WORK/heic.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_070809
run_headless "$WORK/heic.json" "$WORK/from iphone.heic"
assert_valid_pdf "$WORK/output_20260904_070809.pdf"

if osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/heic.json" \
    "$WORK/two page scan.tif" >/dev/null 2>"$WORK/multipage.err"
then
    fail "a two-page TIFF was accepted; page two would have been lost silently"
fi
grep -q "contains 2 pages" "$WORK/multipage.err" ||
    fail "the refusal did not say how many pages: $(cat "$WORK/multipage.err")"

# ---------------------------------------------------------------------------
# The runtime must accept the invocation without osascript's "--" as well
# ---------------------------------------------------------------------------

write_config "$WORK/plain.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_050607
osascript -l JavaScript "$SCRIPT" \
    --headless "$WORK/plain.json" "$WORK/page 2.png" >/dev/null
test -s "$WORK/output_20260904_050607.pdf"

# The source images must be untouched.
test "$(vipsheader -f width "$WORK/tiny.png")" = 64
test "$(vipsheader -f width "$WORK/page 2.png")" = 900

printf 'macOS JXA integration passed\n'
