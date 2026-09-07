#!/usr/bin/env bash
#
# Publication integration gate.
#
# How the finished PDF gets from the workspace to the name the user will see,
# against real filesystems: one that refuses to be written to, and one that is
# not the volume the PDF was built on. The second is the case a fake cannot
# reach at all -- across volumes Apple's mv copies to the pathname it is given,
# so the protection has to be that the pathname it is given is never the
# document's own.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-publication)
VOLUME_NAME=ImageFilesToPDF-test-volume
VOLUME="/Volumes/$VOLUME_NAME"

cleanup() {
    hdiutil detach -quiet "$VOLUME" 2>/dev/null || true
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
# The staging file is hidden and named for the attempt that made it, so it is
# that attempt's to remove -- and a folder holding one afterwards means a
# publication that did not finish tidying up after itself.
assert_nothing_left_behind() {
    test -z "$(find "$1" -name '.ImageFilesToPDF-*' -maxdepth 1)" ||
        fail "a staging file was left in $1: $(ls -a "$1")"
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
# Across volumes, where mv copies rather than renames.
#
# Skipped rather than failed where a test volume cannot be attached: the
# machine, not the code, decides whether that is possible.
# ---------------------------------------------------------------------------

if hdiutil create -size 40m -fs APFS -volname "$VOLUME_NAME" -quiet \
        "$WORK/volume.dmg" && hdiutil attach -quiet "$WORK/volume.dmg"
then
    cp "$WORK/photo.png" "$VOLUME/"
    run 20260907_020202 "$VOLUME/photo.png"

    CROSS="$VOLUME/output_20260907_020202.pdf"
    assert_valid_pdf "$CROSS"
    assert_nothing_left_behind "$VOLUME"
    test "$(stat -f%l "$CROSS")" = 1 ||
        fail "the published PDF still has a second name"
    hdiutil detach -quiet "$VOLUME"
else
    printf 'cross-volume publication skipped: no test volume could be attached\n'
fi

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

printf 'macOS publication integration passed\n'
