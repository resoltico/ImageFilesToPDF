#!/usr/bin/env bash
#
# A damaged source must be refused rather than half-converted.
#
# libvips is permissive by default: a JPEG cut off inside its image data is
# salvaged into a partial picture, vips exits zero, and every check after it
# passes -- the file exists, the page is written, the PDF validates strictly.
# Half a photograph was published as a finished conversion, and nothing in the
# unit suite can see it because none of it reaches vips.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-damaged)
trap 'rm -rf "$WORK"' EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"

require_tools

# run_headless <config> <image>...
#
# Returns the exit status rather than failing the script: a refusal is the
# expected outcome here, so the status is the assertion.
run_headless() {
    osascript -l JavaScript "$SCRIPT" -- --headless "$@" >"$WORK/receipt" 2>"$WORK/stderr"
}

# truncate_file <source> <destination> <percent>
truncate_file() {
    local bytes
    bytes=$(stat -f%z "$1")
    dd if="$1" of="$2" bs=1 count=$((bytes * $3 / 100)) 2>/dev/null
}

solid_svg "$WORK/photo.svg" 900 600 "#235789"
vips copy "$WORK/photo.svg" "$WORK/whole.jpg[Q=90,keep=none]"
truncate_file "$WORK/whole.jpg" "$WORK/cut.jpg" 55

# A truncated JPEG must still look like a JPEG to everything that only reads
# the header, or this proves nothing about the decoding policy.
test "$(vipsheader -f width "$WORK/cut.jpg")" = 900

# ---------------------------------------------------------------------------
# Combined: one damaged image fails the run, and no PDF is published
# ---------------------------------------------------------------------------

write_config "$WORK/combined.json" A4 Portrait "Single PDF" "#FFFFFF" 20260912_010101
if run_headless "$WORK/combined.json" "$WORK/whole.jpg" "$WORK/cut.jpg"; then
    fail "a combined run published a PDF from a truncated image"
fi

test ! -e "$WORK/output_20260912_010101.pdf" ||
    fail "a PDF was published from a run that failed"

grep -q "premature end" "$WORK/stderr" ||
    fail "the failure does not say what was wrong with the file"

# ---------------------------------------------------------------------------
# Separate: the damaged image is reported, and its valid sibling still converts
# ---------------------------------------------------------------------------

write_config "$WORK/separate.json" A4 Portrait "Separate PDFs" "#FFFFFF" 20260912_020202
if run_headless "$WORK/separate.json" "$WORK/whole.jpg" "$WORK/cut.jpg"; then
    fail "a run that could not convert everything reported success"
fi

assert_valid_pdf "$WORK/whole_20260912_020202.pdf"
test ! -e "$WORK/cut_20260912_020202.pdf" ||
    fail "a PDF was published for the truncated image"

grep -q '"failures":\[{"name":"cut.jpg"' "$WORK/receipt" ||
    fail "the receipt does not name the damaged file: $(cat "$WORK/receipt")"

# The name belongs to the record, not to the message as well.
if grep -q '"message":"cut.jpg:' "$WORK/receipt"; then
    fail "the failure names the file twice: $(cat "$WORK/receipt")"
fi

# ---------------------------------------------------------------------------
# A timestamp that is not one is refused before anything is converted
# ---------------------------------------------------------------------------

# In a folder of its own, so what is there afterwards is only what this run
# put there.
mkdir "$WORK/stamped"
cp "$WORK/whole.jpg" "$WORK/stamped/only.jpg"

write_config "$WORK/escaping.json" A4 Portrait "Single PDF" "#FFFFFF" "../../elsewhere"
if run_headless "$WORK/escaping.json" "$WORK/stamped/only.jpg"; then
    fail "a timestamp that is a path was accepted"
fi

grep -q "YYYYMMDD_HHMMSS" "$WORK/stderr" ||
    fail "the refusal does not say what a timestamp must be"

if find "$WORK/stamped" -name '*.pdf' | grep -q .; then
    fail "a run refused for its timestamp still produced a PDF"
fi

test ! -e "$WORK/elsewhere.pdf" || fail "a PDF escaped the output folder"

echo "macOS damaged-source integration passed"
