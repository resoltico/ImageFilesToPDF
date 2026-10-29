#!/usr/bin/env bash
#
# Publishing to a camera card.
#
# A card is formatted FAT32 or exFAT, and the two differ in what they can do
# with a name. FAT32 has no hard links and takes an exclusive rename; exFAT
# takes neither, where publication stops and has to stop well. Neither path is
# hypothetical, and neither can be reached by a fake.
#
# Exercised against real volumes attached for the test, and skipped, loudly,
# where one cannot be attached: whether that is possible is the machine's
# decision rather than the code's.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-cards)
# A FAT label is eleven characters at most; a longer one is dropped and
# the volume mounts as NO NAME.
FAT_NAME=IMGPDFTEST
FAT_VOLUME="$WORK/mount-FAT32"
EXFAT_NAME=IMGPDFEXF
EXFAT_VOLUME="$WORK/mount-exFAT"

cleanup() {
    hdiutil detach -force -quiet "$FAT_VOLUME" 2>/dev/null || true
    hdiutil detach -force -quiet "$EXFAT_VOLUME" 2>/dev/null || true
    rm -rf "$WORK"
}
trap cleanup EXIT

# shellcheck source=tests/integration/lib/assert.sh
source "$ROOT/tests/integration/lib/assert.sh"
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"
# shellcheck source=tests/integration/lib/volume.sh
source "$ROOT/tests/integration/lib/volume.sh"

require_tools
solid_svg "$WORK/blue.svg" 64 64 "#3080c0"
vips copy "$WORK/blue.svg" "$WORK/photo.png"

run() {
    local stamp=$1 mode=$2
    shift 2
    write_config "$WORK/config.json" A4 Portrait "$mode" "#FFFFFF" "$stamp"
    osascript -l JavaScript "$SCRIPT" -- --headless "$WORK/config.json" "$@" \
        >"$WORK/receipt.json" 2>"$WORK/error.txt" || true
}

# The place a publication makes for itself is hidden and named for the attempt
# that made it, so a folder still holding one afterwards means a publication
# that did not finish tidying up after itself.
assert_nothing_left_behind() {
    test -z "$(find "$1" -maxdepth 1 -name '.ImageFilesToPDF-*')" ||
        fail "a staging place was left in $1: $(ls -a "$1")"
}

# ---------------------------------------------------------------------------
# A volume that cannot make hard links.
#
# Which is what a camera card is. MS-DOS cannot link, but it can rename
# exclusively -- one operation that moves the PDF onto the name and refuses a
# name that is taken -- so that is what publishes there.
# ---------------------------------------------------------------------------

if attach_test_volume "MS-DOS FAT32" "$FAT_NAME" "$FAT_VOLUME"; then
    cp "$WORK/photo.png" "$FAT_VOLUME/"
    run 20260907_050505 combined "$FAT_VOLUME/photo.png"

    FLAT="$FAT_VOLUME/Images 2026-09-07 at 05.05.05.pdf"
    assert_valid_pdf "$FLAT"
    assert_nothing_left_behind "$FAT_VOLUME"

    # A name already held by something else is stepped around, not taken --
    # and neither is one held by a link with nothing at the end of it, which
    # is the shape that reads as free to everything except the taking.
    printf 'someone elses document' > "$FAT_VOLUME/Images 2026-09-07 at 06.06.06.pdf"
    run 20260907_060606 combined "$FAT_VOLUME/photo.png"

    test "$(cat "$FAT_VOLUME/Images 2026-09-07 at 06.06.06.pdf")" = "someone elses document" ||
        fail "a file that was already there was overwritten"
    assert_valid_pdf "$FAT_VOLUME/Images 2026-09-07 at 06.06.06 2.pdf"
    assert_nothing_left_behind "$FAT_VOLUME"
    printf 'another document' > "$FAT_VOLUME/photo.pdf"
    run 20260907_060607 separate "$FAT_VOLUME/photo.png"
    test "$(cat "$FAT_VOLUME/photo.pdf")" = "another document" ||
        fail "separate publication replaced an occupied name"
    assert_valid_pdf "$FAT_VOLUME/photo 2.pdf"
    assert_nothing_left_behind "$FAT_VOLUME"
    detach_test_volume "$FAT_VOLUME"
else
    printf 'link-free publication skipped: no MS-DOS volume could be attached\n'
fi

# ---------------------------------------------------------------------------
# And a volume that can do neither.
#
# exFAT, measurably: no hard links, and the exclusive rename is not
# implemented there. There is no operation left that takes a name and carries
# contents, so publication stops -- and stopping has to be worth as much as
# publishing. Nothing of the run may reach the card, the message has to carry
# what the system said rather than a cause this code invented, and the
# finished PDF has to be somewhere the message names.
# ---------------------------------------------------------------------------

if attach_test_volume "ExFAT" "$EXFAT_NAME" "$EXFAT_VOLUME"; then
    cp "$WORK/photo.png" "$EXFAT_VOLUME/"
    run 20260907_070707 combined "$EXFAT_VOLUME/photo.png"

    test ! -e "$EXFAT_VOLUME/Images 2026-09-07 at 07.07.07.pdf" ||
        fail "a name was created on a volume that cannot take one whole"
    test -z "$(find "$EXFAT_VOLUME" -maxdepth 1 -name '*.pdf')" ||
        fail "something of the run reached the card: $(ls -a "$EXFAT_VOLUME")"
    assert_nothing_left_behind "$EXFAT_VOLUME"

    grep -q '"state":"unsupported"' "$WORK/receipt.json" ||
        fail "the message does not say what failed: $(cat "$WORK/error.txt")"
    # What the system said about the operation it actually refused. Measured
    # on exFAT: ln reports "Operation not supported" from beside the
    # destination, which is the capability statement, made by the kernel
    # rather than guessed at here.
    grep -q 'Operation not supported' "$WORK/receipt.json" ||
        fail "the system's own words are missing: $(cat "$WORK/error.txt")"

    # The whole point of stopping is that the work survives it.
    KEPT=$(receipt_recovery "$WORK/receipt.json")
    test -n "$KEPT" || fail "no recovery path was named: $(cat "$WORK/error.txt")"
    assert_valid_pdf "$KEPT"
    # Retain the validated recovery as failure evidence; its log spelling alone
    # is not sufficient authority to recursively delete the containing folder.
    run 20260907_070708 separate "$EXFAT_VOLUME/photo.png"
    test -z "$(find "$EXFAT_VOLUME" -maxdepth 1 -name '*.pdf')" ||
        fail "separate publication left a PDF on exFAT"
    assert_nothing_left_behind "$EXFAT_VOLUME"
    grep -q '"state":"unsupported"' "$WORK/receipt.json" || fail "separate exFAT was not classified"
    KEPT=$(receipt_recovery "$WORK/receipt.json")
    test -n "$KEPT" || fail "separate exFAT recovery was not named"
    assert_valid_pdf "$KEPT"

    detach_test_volume "$EXFAT_VOLUME"
else
    printf 'exFAT publication skipped: no exFAT volume could be attached\n'
fi

printf 'macOS camera card integration passed\n'
