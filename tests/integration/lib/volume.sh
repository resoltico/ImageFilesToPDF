#!/usr/bin/env bash
#
# Borrowing a volume for a test, and giving it back.
#
# The two halves live together because they are one loan: a test that attaches
# a volume has to detach it before the next one attaches its own, and what
# detaching costs is not obvious from the attach.

# attach_test_volume <format> <name> <owned-mountpoint>
#
# A volume of its own, so the publication can be exercised where the finished
# PDF and the output folder are not on one filesystem -- and, for MS-DOS,
# where hard links cannot be made at all. Prints nothing and fails quietly
# when a volume cannot be attached: whether that is possible is the machine's
# decision rather than the code's.
attach_test_volume() {
    local format=$1 name=$2 mountpoint=$3 image
    image="$WORK/$name.dmg"
    mkdir "$mountpoint" || return 1

    hdiutil create -size 40m -fs "$format" -volname "$name" -quiet -ov "$image" &&
        hdiutil attach -quiet -mountpoint "$mountpoint" "$image"
}

# detach_test_volume <volume> <image>
#
# Detach only the image created by this test. Native consumers can keep a
# volume busy after the conversion process exits; bounded retries allow them
# to finish. Persistent failure remains a test failure, with the final native
# error and image facts visible. EXIT cleanup preserves WORK if still attached.
detach_test_volume() {
    local volume=$1 image=$2 device detach_status=0

    # Five ordinary attempts, two seconds apart, before one forced attempt.
    for _ in 1 2 3 4 5; do
        device=$(node "$ROOT/tests/integration/lib/volume-device.cjs" "$image") || return 1
        [ -n "$device" ] || return 0
        hdiutil detach -quiet "$device" 2>/dev/null || true
        device=$(node "$ROOT/tests/integration/lib/volume-device.cjs" "$image") || return 1
        [ -n "$device" ] || return 0
        sleep 2
    done

    device=$(node "$ROOT/tests/integration/lib/volume-device.cjs" "$image") || return 1
    [ -n "$device" ] || return 0
    hdiutil detach -force "$device" || detach_status=$?
    device=$(node "$ROOT/tests/integration/lib/volume-device.cjs" "$image") || return 1
    [ -n "$device" ] || return 0
    printf 'Could not detach test image %s at %s (exit %s)\n' "$image" "$volume" "$detach_status" >&2
    hdiutil info >&2 || true
    return 1
}
