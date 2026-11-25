"use strict";

/*
 * Natural ordering, so that page2 sorts before page10.
 */

const EQUAL = 0;
const LEFT_FIRST = -1;
const RIGHT_FIRST = 1;

// A name splits into runs of digits and runs of anything else.
const PART = /(?<digits>\d+)|\D+/gu;

function naturalParts(value) {
    return [...String(value).toLowerCase().matchAll(PART)]
        .map((match) => ({ text: match[0], numeric: match.groups.digits !== undefined }));
}

/** Ordinal order of two strings (or numbers): -1, 0 or 1. */
function compareText(left, right) {
    if (left < right) { return LEFT_FIRST; }
    if (left > right) { return RIGHT_FIRST; }
    return EQUAL;
}

/*
 * Two runs of digits, compared as decimal numbers written out rather than as
 * JavaScript numbers.
 *
 * Number() is exact only to 2^53. Past that, two different filenames become
 * the same value -- 9007199254740992.jpg and ...93.jpg did -- and subtracting
 * them says they are equal, which leaves their order to the order they
 * happened to arrive in. Nineteen digits is a nanosecond timestamp, which is
 * an ordinary way for a camera or an export to name a file.
 *
 * Leading zeros are not part of the value, so they come off first: what is
 * left is longer when it is larger, and among equal lengths the larger is the
 * one that reads later. Equal values with different zero padding put the
 * narrower one first.
 */
const LEADING_ZEROS = /^0+(?=\d)/u;

function compareNumeric(leftPart, rightPart) {
    const left = leftPart.replace(LEADING_ZEROS, "");
    const right = rightPart.replace(LEADING_ZEROS, "");
    return compareText(left.length, right.length) || compareText(left, right) ||
        compareText(leftPart.length, rightPart.length);
}

// A missing part is a name that ended first, and a shorter name sorts first.
function comparePart(leftPart, rightPart) {
    if (leftPart === undefined) { return LEFT_FIRST; }
    if (rightPart === undefined) { return RIGHT_FIRST; }
    return leftPart.numeric && rightPart.numeric
        ? compareNumeric(leftPart.text, rightPart.text)
        : compareText(leftPart.text, rightPart.text);
}

function naturalCompare(left, right) {
    const leftParts = naturalParts(left);
    const rightParts = naturalParts(right);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
        const comparison = comparePart(leftParts[index], rightParts[index]);

        if (comparison !== EQUAL) {
            return comparison;
        }
    }

    return EQUAL;
}

/*
 * Sorts by full path, which within one folder is the same as sorting by name
 * and across several is what a folder tree reads as: everything in one place
 * together, in order, before the next place.
 *
 * Sorting by name first put a photograph from one folder between two from
 * another whenever the names happened to interleave -- which is what names in
 * numbered folders do.
 */
function sortImageRecords(records) {
    return records.slice().sort(
        (left, right) => naturalCompare(left.path, right.path)
    );
}

module.exports = { compareText, sortImageRecords };
