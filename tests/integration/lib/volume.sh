#!/usr/bin/env bash
#
# Borrowing a volume for a test, and giving it back.
#
# The two halves live together because they are one loan: a test that attaches
# a volume has to detach it before the next one attaches its own, and what
# detaching costs is not obvious from the attach.

# attach_test_volume <format> <name>
#
# A volume of its own, so the publication can be exercised where the finished
# PDF and the output folder are not on one filesystem -- and, for MS-DOS,
# where hard links cannot be made at all. Prints nothing and fails quietly
# when a volume cannot be attached: whether that is possible is the machine's
# decision rather than the code's.
attach_test_volume() {
    local format=$1 name=$2 image
    image=$(mktemp -t "ImageFilesToPDF-$name").dmg

    hdiutil create -size 40m -fs "$format" -volname "$name" -quiet -ov "$image" &&
        hdiutil attach -quiet "$image"
}

# detach_test_volume <volume>
#
# A volume that was just written to is not always ready to go. macOS indexes
# what appears on it, and a detach arriving during that is refused as
# "Resource busy" -- which is the machine being busy, not the publication
# holding anything open: the run that wrote the PDF exited before this is
# called, and the test has already established that nothing was left behind.
#
# So waiting is the answer, and forcing is what is left when waiting has
# plainly not worked. A detach that fails after both still fails the test,
# because the next volume cannot be attached over one that is still there.
detach_test_volume() {
    local volume=$1

    # Five tries, two seconds apart. Indexing a forty-megabyte volume does not
    # take ten seconds, and a volume still busy after that is not busy waiting.
    for _ in 1 2 3 4 5; do
        hdiutil detach -quiet "$volume" 2>/dev/null && return 0
        sleep 2
    done

    hdiutil detach -force -quiet "$volume"
}
