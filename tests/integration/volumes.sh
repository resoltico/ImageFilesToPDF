#!/usr/bin/env bash
#
# Publishing to a volume of its own.
#
# Three cases a fake cannot reach: one where the finished PDF and the folder
# it belongs in are not on the same filesystem, one where the filesystem
# cannot make hard links at all -- which is what a camera card is -- and one
# where it can neither link nor rename exclusively, where publication stops
# and has to stop well. All three are exercised against real volumes attached
# for the test, and skipped, loudly, where a volume cannot be attached:
# whether that is possible is the machine's decision rather than the code's.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-volumes)
VOLUME_NAME=ImageFilesToPDF-test-volume
VOLUME="/Volumes/$VOLUME_NAME"
# A FAT label is eleven characters at most; a longer one is dropped and
# the volume mounts as NO NAME.
FAT_NAME=IMGPDFTEST
FAT_VOLUME="/Volumes/$FAT_NAME"
EXFAT_NAME=IMGPDFEXF
EXFAT_VOLUME="/Volumes/$EXFAT_NAME"

cleanup() {
    hdiutil detach -quiet "$VOLUME" 2>/dev/null || true
    hdiutil detach -quiet "$FAT_VOLUME" 2>/dev/null || true
    hdiutil detach -quiet "$EXFAT_VOLUME" 2>/dev/null || true
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

run() {
    local stamp=$1
    shift
    write_config "$WORK/config.json" A4 Portrait "Single PDF" "#FFFFFF" "$stamp"
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/config.json" "$@" \
        2>"$WORK/error.txt" || true
}

# The place a publication makes for itself is hidden and named for the attempt
# that made it, so a folder still holding one afterwards means a publication
# that did not finish tidying up after itself.
assert_nothing_left_behind() {
    test -z "$(find "$1" -maxdepth 1 -name '.ImageFilesToPDF-*')" ||
        fail "a staging place was left in $1: $(ls -a "$1")"
}

# ---------------------------------------------------------------------------
# Across volumes, where mv copies rather than renames.
#
# Skipped rather than failed where a test volume cannot be attached: the
# machine, not the code, decides whether that is possible.
# ---------------------------------------------------------------------------

if attach_test_volume APFS "$VOLUME_NAME"; then
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
# A volume that cannot make hard links.
#
# Which is what a camera card is. MS-DOS cannot link, but it can rename
# exclusively -- one operation that moves the PDF onto the name and refuses a
# name that is taken -- so that is what publishes there.
# ---------------------------------------------------------------------------

if attach_test_volume "MS-DOS FAT32" "$FAT_NAME"; then
    cp "$WORK/photo.png" "$FAT_VOLUME/"
    run 20260907_050505 "$FAT_VOLUME/photo.png"

    FLAT="$FAT_VOLUME/output_20260907_050505.pdf"
    assert_valid_pdf "$FLAT"
    assert_nothing_left_behind "$FAT_VOLUME"

    # A name already held by something else is stepped around, not taken --
    # and neither is one held by a link with nothing at the end of it, which
    # is the shape that reads as free to everything except the taking.
    printf 'someone elses document' > "$FAT_VOLUME/output_20260907_060606.pdf"
    run 20260907_060606 "$FAT_VOLUME/photo.png"

    test "$(cat "$FAT_VOLUME/output_20260907_060606.pdf")" = "someone elses document" ||
        fail "a file that was already there was overwritten"
    assert_valid_pdf "$FAT_VOLUME/output_20260907_060606_2.pdf"
    assert_nothing_left_behind "$FAT_VOLUME"
    hdiutil detach -quiet "$FAT_VOLUME"
else
    printf 'link-free publication skipped: no MS-DOS volume could be attached\n'
fi

# ---------------------------------------------------------------------------
# And a volume that can do neither.
#
# exFAT, measurably: no hard links, and the exclusive rename is not
# implemented there. There is no operation left that takes a name and carries
# contents, so publication stops -- and stopping has to be worth as much as
# publishing. Nothing of the run may reach the card, the message has to say
# why, and the finished PDF has to be somewhere the message names.
# ---------------------------------------------------------------------------

if attach_test_volume "ExFAT" "$EXFAT_NAME"; then
    cp "$WORK/photo.png" "$EXFAT_VOLUME/"
    run 20260907_070707 "$EXFAT_VOLUME/photo.png"

    test ! -e "$EXFAT_VOLUME/output_20260907_070707.pdf" ||
        fail "a name was created on a volume that cannot take one whole"
    test -z "$(find "$EXFAT_VOLUME" -maxdepth 1 -name '*.pdf')" ||
        fail "something of the run reached the card: $(ls -a "$EXFAT_VOLUME")"
    assert_nothing_left_behind "$EXFAT_VOLUME"

    grep -q 'cannot take the output name in one step' "$WORK/error.txt" ||
        fail "the message does not say why: $(cat "$WORK/error.txt")"
    grep -q 'so the PDF was not put on it' "$WORK/error.txt" ||
        fail "the message does not say what became of the PDF"

    # The whole point of stopping is that the work survives it.
    KEPT=$(sed -n 's/^\(\/var\/folders\/.*ImageFilesToPDF-recovered[^ ]*\.pdf\).*/\1/p' \
        "$WORK/error.txt" | head -1)
    test -n "$KEPT" || fail "no recovery path was named: $(cat "$WORK/error.txt")"
    assert_valid_pdf "$KEPT"
    rm -rf "$(dirname "$KEPT")"

    hdiutil detach -quiet "$EXFAT_VOLUME"
else
    printf 'exFAT publication skipped: no exFAT volume could be attached\n'
fi

printf 'macOS volume integration passed\n'
