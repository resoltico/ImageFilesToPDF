#!/usr/bin/env bash
#
# Publication integration gate.
#
# How the finished PDF gets from the workspace to the name the user will see,
# against real filesystems: one that refuses to be written to, one that is not
# the volume the PDF was built on, and one that refuses the name for a reason
# that has nothing to do with what the disk can do. The second is the case a fake cannot
# reach at all -- across volumes Apple's mv copies to the pathname it is given,
# so the protection has to be that the pathname it is given is never the
# document's own.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-publication)

cleanup() {
    chmod -R u+rwx "$WORK" 2>/dev/null || true
    rm -rf "$WORK"
}
trap cleanup EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"

require_tools
solid_svg "$WORK/blue.svg" 64 64 "#3080c0"
vips copy "$WORK/blue.svg" "$WORK/photo.png"

# run <timestamp> <selected>...
run() {
    local stamp=$1
    shift
    write_config "$WORK/config.json" A4 Portrait "Single PDF" "#FFFFFF" "$stamp"
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/config.json" "$@" \
        2>"$WORK/error.txt" || true
}

# assert_nothing_left_behind <folder>
#
# The place a publication makes for itself is hidden and named for the attempt
# that made it, so a folder still holding one afterwards means a publication
# that did not finish tidying up after itself.
assert_nothing_left_behind() {
    test -z "$(find "$1" -maxdepth 1 -name '.ImageFilesToPDF-*')" ||
        fail "a staging place was left in $1: $(ls -a "$1")"
}

# ---------------------------------------------------------------------------
# The ordinary case, on one volume: the PDF is published and nothing of the
# machinery is left in the folder.
# ---------------------------------------------------------------------------

mkdir -p "$WORK/same-volume"
cp "$WORK/photo.png" "$WORK/same-volume/"
run 20260907_010101 "$WORK/same-volume/photo.png"

SAME="$WORK/same-volume/output_20260907_010101.pdf"
assert_valid_pdf "$SAME"
assert_nothing_left_behind "$WORK/same-volume"
test "$(stat -f%l "$SAME")" = 1 ||
    fail "the published PDF still has a second name: $(stat -f%l "$SAME") links"

# ---------------------------------------------------------------------------
# A link whose target is gone, standing at the name the PDF was going to have.
#
# -e follows the link and reports on the target, so the name reads as free
# while something is plainly there -- and a rename replaces it without
# complaint. The entry is what the output name is about.
# ---------------------------------------------------------------------------

mkdir -p "$WORK/link"
cp "$WORK/photo.png" "$WORK/link/"
ln -s /nowhere/gone.pdf "$WORK/link/output_20260907_040404.pdf"
run 20260907_040404 "$WORK/link/photo.png"

test -L "$WORK/link/output_20260907_040404.pdf" ||
    fail "the link was replaced instead of stepped around"
assert_valid_pdf "$WORK/link/output_20260907_040404_2.pdf"
assert_nothing_left_behind "$WORK/link"

# ---------------------------------------------------------------------------
# An output folder that cannot be written to. Every way of getting the PDF in
# there is refused, so the finished PDF is set aside -- and the message has to
# name somewhere it actually is.
# ---------------------------------------------------------------------------

mkdir -p "$WORK/readonly"
cp "$WORK/photo.png" "$WORK/readonly/"
chmod 555 "$WORK/readonly"
run 20260907_030303 "$WORK/readonly/photo.png"

KEPT=$(sed -n 's/^\(\/var\/folders\/.*ImageFilesToPDF-recovered[^ ]*\.pdf\).*/\1/p' \
    "$WORK/error.txt" | head -1)
test -n "$KEPT" || fail "no recovery path was named: $(cat "$WORK/error.txt")"
assert_valid_pdf "$KEPT"
rm -rf "$(dirname "$KEPT")"
assert_nothing_left_behind "$WORK/readonly"
test -z "$(find "$WORK/readonly" -name '*.pdf')" ||
    fail "something was left at the output path"

# ---------------------------------------------------------------------------
# A folder that refuses a new file on a disk that can do everything.
#
# The ACL denies add_file and allows add_subdirectory, so the place beside the
# destination is made and copied into, and both ways of creating the name are
# refused -- for a reason that is nothing to do with what the disk can do.
# This said "this drive cannot take the output name in one step" while quoting
# the system saying "Permission denied" two lines below it, on the boot disk,
# which does hard links and exclusive renames both.
# ---------------------------------------------------------------------------

mkdir -p "$WORK/denied"
cp "$WORK/photo.png" "$WORK/denied/"
chmod +a "$(id -un) deny add_file" "$WORK/denied"
run 20260907_090909 "$WORK/denied/photo.png"

grep -q 'Permission denied' "$WORK/error.txt" ||
    fail "the system's own words are missing: $(cat "$WORK/error.txt")"
grep -qiE 'drive|volume' "$WORK/error.txt" &&
    fail "a cause was named that was not established: $(cat "$WORK/error.txt")"
test -z "$(find "$WORK/denied" -name '*.pdf')" ||
    fail "something was left at the output path"
assert_nothing_left_behind "$WORK/denied"

DENIED_KEPT=$(sed -n 's/^\(\/var\/folders\/.*ImageFilesToPDF-recovered[^ ]*\.pdf\).*/\1/p' \
    "$WORK/error.txt" | head -1)
test -n "$DENIED_KEPT" || fail "no recovery path was named: $(cat "$WORK/error.txt")"
assert_valid_pdf "$DENIED_KEPT"
rm -rf "$(dirname "$DENIED_KEPT")"
chmod -a# 0 "$WORK/denied"

printf 'macOS publication integration passed\n'
