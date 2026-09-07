#!/usr/bin/env bash
#
# Selection integration gate.
#
# What the action decides to convert, against a real filesystem rather than a
# fake one: a folder walked through Foundation, a folder nobody can open, a
# package that the shell calls a directory, and an output folder that refuses
# to be written to. Every one of these was wrong at some point in a way the
# unit tests could not see, because each turns on what macOS itself answers.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-selection)
# The locked folder has to be openable again before it can be removed.
trap 'chmod -R u+rwx "$WORK" 2>/dev/null; rm -rf "$WORK"' EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"

require_tools

create_selection_fixtures "$WORK"

# run <timestamp> <selected>...
#
# Prints the receipt on standard output and the failure on standard error,
# and never fails the script: what each scenario asserts is the content.
run() {
    local stamp=$1
    shift
    write_config "$WORK/config.json" A4 Portrait "Single PDF" "#FFFFFF" "$stamp"
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/config.json" "$@" \
        2>"$WORK/error.txt" || true
}

pages() {
    pdfinfo "$1" | awk '/^Pages:/ {print $2}'
}

# ---------------------------------------------------------------------------
# A selected folder is walked, and a subfolder that cannot be read is named.
#
# Its result used to be discarded: the photographs nobody had permission to
# reach were left out of the PDF and out of the report, and the run said it
# had succeeded.
# ---------------------------------------------------------------------------

chmod 000 "$WORK/album/locked"
RECEIPT=$(run 20260907_010101 "$WORK/album")

WALKED="$WORK/album/output_20260907_010101.pdf"
assert_valid_pdf "$WALKED"
test "$(pages "$WALKED")" = 2 ||
    fail "the walk took $(pages "$WALKED") pages: hidden, notes or locked leaked in"
grep -q '"reason":"could not be read"' <<<"$RECEIPT" ||
    fail "the unreadable subfolder was passed over silently: $RECEIPT"
grep -q '"name":"locked"' <<<"$RECEIPT" ||
    fail "the report did not say which folder was closed: $RECEIPT"
chmod 755 "$WORK/album/locked"

# ---------------------------------------------------------------------------
# A folder and a photo inside it are one selection, whichever order they
# arrive in. One order used to convert that photo twice; the other reported
# that the folder held nothing to convert.
# ---------------------------------------------------------------------------

BOTH=$(run 20260907_020202 "$WORK/album" "$WORK/album/a.png")
test "$(pages "$WORK/album/output_20260907_020202.pdf")" = 3 ||
    fail "folder then file did not convert each photograph once: $BOTH"
grep -q '"rejected":\[\]' <<<"$BOTH" || fail "nothing should be refused: $BOTH"

REVERSED=$(run 20260907_030303 "$WORK/album/a.png" "$WORK/album")
test "$(pages "$WORK/album/output_20260907_030303.pdf")" = 3 ||
    fail "file then folder did not convert each photograph once: $REVERSED"
grep -q '"rejected":\[\]' <<<"$REVERSED" ||
    fail "the answer must not depend on the order: $REVERSED"

# ---------------------------------------------------------------------------
# A photograph selected by hand is converted even when its folder is selected
# too, and even when the walk would pass over it.
#
# The walk skips hidden entries, so assuming a selected folder covered every
# explicit request removed that request from the run without a word: the
# photograph did not appear in the PDF and did not appear in the report.
# ---------------------------------------------------------------------------

HIDDEN=$(run 20260907_035353 "$WORK/album" "$WORK/album/.hidden.png")
test "$(pages "$WORK/album/output_20260907_035353.pdf")" = 4 ||
    fail "the hidden photograph that was asked for is missing: $HIDDEN"
grep -q '"rejected":\[\]' <<<"$HIDDEN" || fail "nothing should be refused: $HIDDEN"

# ---------------------------------------------------------------------------
# Two spellings of one file.
#
# A Mac is case-insensitive as formatted, so album/a.png names the same
# photograph as album/A.png. Comparing the spellings put it in the PDF twice.
# ---------------------------------------------------------------------------

SPELLINGS=$(run 20260907_060606 "$WORK/case" "$WORK/case/a.png")

test "$(pages "$WORK/case/output_20260907_060606.pdf")" = 1 ||
    fail "one photograph became $(pages "$WORK/case/output_20260907_060606.pdf") pages: $SPELLINGS"
grep -q '"rejected":\[\]' <<<"$SPELLINGS" || fail "nothing should be refused: $SPELLINGS"

# ---------------------------------------------------------------------------
# More than one name for one file.
#
# A hard link is another name with no mark on it, and a symbolic link is one
# the walk deliberately does not follow. Keyed by the file rather than by the
# request, a name this action cannot convert silenced one it could; validated
# through the shell, a symbolic link was followed and its target converted
# twice.
# ---------------------------------------------------------------------------

NAMES=$(run 20260907_070707 "$WORK/names/image.backup" "$WORK/names/image.png" \
    "$WORK/names/alias.png" "$WORK/names/extra.png")

test "$(pages "$WORK/names/output_20260907_070707.pdf")" = 2 ||
    fail "each photograph once: $NAMES"
grep -q "not a supported format" <<<"$NAMES" ||
    fail "the unsupported name must be answered, not swallowed: $NAMES"
grep -q "a link; select the file it points to" <<<"$NAMES" ||
    fail "the symbolic link must be refused: $NAMES"

# ---------------------------------------------------------------------------
# A package is an .app or a .photoslibrary: a folder as far as the shell is
# concerned. Asking the shell sent the walk inside the bundle and wrote the
# PDFs in there.
# ---------------------------------------------------------------------------

run 20260907_040404 "$WORK/Photos.app" >/dev/null
grep -q "a package, not a folder of images" "$WORK/error.txt" ||
    fail "the package was not refused: $(cat "$WORK/error.txt")"
test -z "$(find "$WORK/Photos.app" -name '*.pdf')" ||
    fail "a PDF was written inside the bundle"

printf 'macOS selection integration passed\n'
