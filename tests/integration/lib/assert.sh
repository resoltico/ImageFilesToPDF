#!/usr/bin/env bash
#
# Assertions shared by the macOS integration scenarios.

fail() {
    echo "$*" >&2
    exit 1
}

# Reads one pixel of a rendered page as "R G B".
#
# vips getpoint prints the channels space separated on a single line, so the
# separators must be normalised rather than deleted.
getpoint() {
    vips getpoint "$1" "$2" "$3" | tr -d '[],' | tr -s ' ' ' '
}

# assert_pixel <png> <x> <y> <r> <g> <b> <tolerance> <label>
#
# Compares against expected values with an explicit tolerance rather than
# matching a formatted string, so a check cannot silently stop discriminating.
assert_pixel() {
    local png=$1 x=$2 y=$3 want_r=$4 want_g=$5 want_b=$6 tol=$7 label=$8
    local got
    got=$(getpoint "$png" "$x" "$y")
    awk -v got="$got" -v wr="$want_r" -v wg="$want_g" -v wb="$want_b" \
        -v tol="$tol" -v label="$label" -v x="$x" -v y="$y" 'BEGIN {
        n = split(got, c, /[ \t]+/)
        if (n < 3) { printf "%s: could not read pixel (%s)\n", label, got; exit 1 }
        if ((c[1]-wr) > tol || (wr-c[1]) > tol ||
            (c[2]-wg) > tol || (wg-c[2]) > tol ||
            (c[3]-wb) > tol || (wb-c[3]) > tol) {
            printf "%s: pixel (%d,%d) is %d,%d,%d; expected %d,%d,%d +/- %d\n",
                label, x, y, c[1], c[2], c[3], wr, wg, wb, tol
            exit 1
        }
    }' || exit 1
}

# assert_page_size <pdf> <needle> <label>
assert_page_size() {
    pdfinfo "$1" | grep -q "$2" ||
        fail "$3: $(pdfinfo "$1" | grep '^Page size:')"
}

# assert_valid_pdf <pdf>
#
# Two validators, for two different reasons.
#
# pdfcpu runs here on the published file. The pipeline validates the staged
# file before publishing it, so this is the only check that what came out the
# other side of publication is still the PDF that was validated.
#
# qpdf is a second, independent implementation. pdfcpu wrote the file, so
# pdfcpu calling it well formed is not evidence about pdfcpu. Poppler cannot
# stand in for it: measured against a wrong stream length, a truncated trailer
# and a bad xref entry, pdfinfo and pdftoppm accept all three and repair them
# silently, which is also why the pixel assertions say nothing about structure.
assert_valid_pdf() {
    local report
    test -s "$1"
    pdfcpu validate --mode=strict "$1"

    # Kept rather than discarded: a bare non-zero exit aborts the run with
    # nothing to read, and qpdf's whole value here is what it says.
    if ! report=$(qpdf --check "$1" 2>&1); then
        printf 'qpdf rejected %s:\n%s\n' "$1" "$report" >&2
        exit 1
    fi
}
