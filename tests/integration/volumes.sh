#!/usr/bin/env bash
#
# Publishing to a volume of its own.
#
# The case a fake cannot reach: the finished PDF and the folder it belongs in
# are not on the same filesystem, so the claim cannot be made from the
# workspace and the PDF has to be taken to the destination first. What a
# card's format can and cannot do is cards.sh.
#
# Exercised against a real volume attached for the test, and skipped, loudly,
# where one cannot be attached: whether that is possible is the machine's
# decision rather than the code's.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/dist/Image-Files-to-PDF.jxa"
WORK=$(mktemp -d -t ImageFilesToPDF-volumes)
VOLUME_NAME=ImageFilesToPDF-test-volume
VOLUME="$WORK/mount-APFS"

cleanup() {
    hdiutil detach -force -quiet "$VOLUME" 2>/dev/null || true
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

if attach_test_volume APFS "$VOLUME_NAME" "$VOLUME"; then
    cp "$WORK/photo.png" "$VOLUME/"
    run 20260907_020202 combined "$VOLUME/photo.png"

    CROSS="$VOLUME/output_20260907_020202.pdf"
    assert_valid_pdf "$CROSS"
    assert_nothing_left_behind "$VOLUME"
    test "$(stat -f%l "$CROSS")" = 1 ||
        fail "the published PDF still has a second name"
    run 20260907_020204 separate "$VOLUME/photo.png"
    assert_valid_pdf "$VOLUME/photo_20260907_020204.pdf"
    assert_nothing_left_behind "$VOLUME"
    detach_test_volume "$VOLUME"
else
    printf 'cross-volume publication skipped: no test volume could be attached\n'
fi

VOLUME="$WORK/mount-HFS"
if attach_test_volume "HFS+" "$VOLUME_NAME" "$VOLUME"; then
    cp "$WORK/photo.png" "$VOLUME/"
    run 20260907_020203 combined "$VOLUME/photo.png"
    assert_valid_pdf "$VOLUME/output_20260907_020203.pdf"
    assert_nothing_left_behind "$VOLUME"
    run 20260907_020204 separate "$VOLUME/photo.png"
    assert_valid_pdf "$VOLUME/photo_20260907_020204.pdf"
    assert_nothing_left_behind "$VOLUME"
    detach_test_volume "$VOLUME"
else
    printf 'HFS+ publication skipped: no test volume could be attached\n'
fi

printf 'macOS volume integration passed\n'
