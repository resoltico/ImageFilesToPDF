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

# A pre-schema configuration must block normal pdfcpu use, but never the action.
# Keep this isolated from the user's actual configuration.
export PDFCPU_CONFIG_ROOT="$WORK/config-root"
mkdir -p "$PDFCPU_CONFIG_ROOT/pdfcpu"
printf 'validationMode: relaxed\n' >"$WORK/config-before.yml"
cp "$WORK/config-before.yml" "$PDFCPU_CONFIG_ROOT/pdfcpu/config.yml"
if pdfcpu validate --mode=strict "$WORK/absent.pdf" >"$WORK/config.err" 2>&1; then
    fail "the incompatible configuration negative control unexpectedly passed"
fi
grep -q "configuration reset required" "$WORK/config.err" ||
    fail "the negative control did not reach the configuration schema check"

# run_headless <config> <image>...
# osascript forwards "--" into run(); --headless must still be recognized.
run_headless() {
    osascript -l JavaScript "$SCRIPT" -- --headless "$@" >/dev/null
}

# ---------------------------------------------------------------------------
# Combined PDF, A4 portrait, white background, natural page order
# ---------------------------------------------------------------------------

write_config "$WORK/combined.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_010203
run_headless "$WORK/combined.json" \
    "$WORK/page 10 'quoted'.jpg" "$WORK/page 2.png"

# Reject a previously supported release even when it reports a normal version.
cat >"$WORK/pdfcpu-old" <<'SH'
#!/bin/sh
printf 'version: v0.16.0\n'
SH
chmod +x "$WORK/pdfcpu-old"
if IMAGE_FILES_TO_PDF_PDFCPU="$WORK/pdfcpu-old" \
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/combined.json" \
    "$WORK/page 2.png" >"$WORK/old.out" 2>"$WORK/old.err"; then
    fail "an unsupported pdfcpu release was accepted"
fi
grep -q "Version 0.16.1 or later is required" "$WORK/old.err" ||
    fail "the release refusal did not explain the requirement"
test ! -e "$WORK/output_20260904_010203_2.pdf"

COMBINED="$WORK/output_20260904_010203.pdf"
assert_valid_pdf "$COMBINED"
test "$(pdfinfo "$COMBINED" | awk '/^Pages:/ {print $2}')" = 2
assert_page_size "$COMBINED" "595.28 x 841.89 pts (A4)" "combined PDF is not exactly A4"

pdftoppm -f 1 -singlefile -r 10 -png "$COMBINED" "$WORK/first" >/dev/null 2>&1
assert_pixel "$WORK/first.png" 30 42 223 41 53 28 \
    "natural order (page 2 must precede page 10, so page one is red)"

# ---------------------------------------------------------------------------
# Separate PDFs, Letter landscape, alpha flattening. What colour ends up on a
# page is background.sh; this is about the mode and the paper.
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
# A 64px source must cover only the middle of the page.
# ---------------------------------------------------------------------------

write_config "$WORK/tiny.json" A4 Portrait "Single PDF" "#FFFFFF" 20260904_040506
run_headless "$WORK/tiny.json" "$WORK/tiny.png"

TINY="$WORK/output_20260904_040506.pdf"
test -s "$TINY"
pdftoppm -f 1 -singlefile -r 72 -png "$TINY" "$WORK/tiny-page" >/dev/null 2>&1
assert_pixel "$WORK/tiny-page.png" 397 421 255 255 255 10 \
    "a 64px source must not be upscaled to fill the page"

# ---------------------------------------------------------------------------
# Accept iPhone HEIC; refuse multi-page TIFF instead of losing pages.
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

cmp "$WORK/config-before.yml" "$PDFCPU_CONFIG_ROOT/pdfcpu/config.yml"
printf 'macOS JXA integration passed\n'
