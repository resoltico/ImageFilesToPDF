#!/usr/bin/env bash
#
# What colour ends up on the page.
#
# The four named colours are presets now rather than the list of colours the
# program permits, so what is checked here is that an arbitrary one arrives
# whole: on the margins, and behind transparency, through the real pipeline
# and out of a rendered PDF. Command construction is a unit test; this is the
# only place that says what the page actually looks like.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-background)

cleanup() {
    rm -rf "$WORK"
}
trap cleanup EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"

require_tools
solid_svg "$WORK/tiny.svg" 64 64 "#3080c0"
vips copy "$WORK/tiny.svg" "$WORK/tiny.png"

# render <stamp> <background> <image> <name>
render() {
    write_config "$WORK/config.json" A4 Portrait "Single PDF" "$2" "$1"
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/config.json" "$3" \
        >/dev/null 2>&1
    assert_valid_pdf "$WORK/output_$1.pdf"
    pdftoppm -f 1 -singlefile -r 10 -png "$WORK/output_$1.pdf" "$WORK/$4" \
        >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# A grey, which vips is given as one number, and a colour, which it is given
# as three. The colour is not one of the presets, and is written in lower case
# without its hash, as a person or a script may supply it.
# ---------------------------------------------------------------------------

render 20260904_060708 "#000000" "$WORK/tiny.png" black
assert_pixel "$WORK/black.png" 0 0 0 0 0 6 "black page background"

render 20260904_070809 "c7dae8" "$WORK/tiny.png" custom
assert_pixel "$WORK/custom.png" 0 0 199 218 232 6 \
    "a background that is not one of the presets"

# ---------------------------------------------------------------------------
# A greyscale source with an alpha channel, which is two bands rather than
# four. A two-band image takes only the first number of a background triple,
# so the colour would arrive as its red alone -- were it not that the resize
# stage converts to sRGB before anything is flattened onto it. Measured:
# thumbnail --export-profile=srgb turns this fixture from 2 bands to 4.
#
# Nothing else in the suite is greyscale: the alpha fixture is a rendered SVG,
# which is always RGBA, so this path went unexercised while being the one the
# comments warn about.
# ---------------------------------------------------------------------------

grey_alpha_png "$WORK/grey alpha.png"
BANDS=$(vipsheader -f bands "$WORK/grey alpha.png")
test "$BANDS" = "2" ||
    fail "the fixture is $BANDS bands, so it tests nothing it was built for"

render 20260904_080910 "#204486" "$WORK/grey alpha.png" grey

# The margin and the transparent half of the image are both background and
# must both be the colour asked for. The opaque half is asserted as well, and
# is what makes the other two mean anything: two points that were meant to be
# inside the image and were in fact margin would agree with each other
# perfectly.
assert_pixel "$WORK/grey.png" 2 2 32 68 134 6 \
    "a colour on the margin of a greyscale page"
assert_pixel "$WORK/grey.png" 55 52 32 68 134 6 \
    "a colour behind greyscale transparency"
assert_pixel "$WORK/grey.png" 25 52 200 200 200 6 \
    "the opaque half of the image, which fixes where the other two are"

printf 'macOS background integration passed\n'
