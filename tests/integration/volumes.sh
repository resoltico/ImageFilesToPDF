#!/usr/bin/env bash
#
# Publishing to a volume of its own.
#
# Two cases a fake cannot reach: one where the finished PDF and the folder it
# belongs in are not on the same filesystem, and one where the filesystem
# cannot make hard links at all -- which is what a camera card is. Both are
# exercised against real volumes attached for the test, and skipped, loudly,
# where a volume cannot be attached: whether that is possible is the
# machine's decision rather than the code's.
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
# implemented there. The name is taken empty and filled instead, which is the
# last resort, and it must still refuse a name that is already held.
# ---------------------------------------------------------------------------

if attach_test_volume "ExFAT" "$EXFAT_NAME"; then
    cp "$WORK/photo.png" "$EXFAT_VOLUME/"
    run 20260907_070707 "$EXFAT_VOLUME/photo.png"

    assert_valid_pdf "$EXFAT_VOLUME/output_20260907_070707.pdf"
    assert_nothing_left_behind "$EXFAT_VOLUME"

    printf 'someone elses document' > "$EXFAT_VOLUME/output_20260907_080808.pdf"
    run 20260907_080808 "$EXFAT_VOLUME/photo.png"

    test "$(cat "$EXFAT_VOLUME/output_20260907_080808.pdf")" = "someone elses document" ||
        fail "a file that was already there was overwritten"
    assert_valid_pdf "$EXFAT_VOLUME/output_20260907_080808_2.pdf"
    assert_nothing_left_behind "$EXFAT_VOLUME"
    hdiutil detach -quiet "$EXFAT_VOLUME"
else
    printf 'exFAT publication skipped: no exFAT volume could be attached\n'
fi

printf 'macOS volume integration passed\n'
