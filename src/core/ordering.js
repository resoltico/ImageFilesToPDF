"use strict";

/*
 * Natural ordering, so that page2 sorts before page10.
 */

const EQUAL = 0;
const LEFT_FIRST = -1;
const RIGHT_FIRST = 1;

function naturalParts(value) {
    return String(value).toLowerCase().match(/\d+|\D+/gu) || [""];
}

function isNumeric(part) {
    return /^\d+$/u.test(part);
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
 * one that reads later.
 */
const LEADING_ZEROS = /^0+(?=\d)/u;

function compareNumeric(leftPart, rightPart) {
    const left = leftPart.replace(LEADING_ZEROS, "");
    const right = rightPart.replace(LEADING_ZEROS, "");

    if (left.length !== right.length) {
        return left.length - right.length;
    }

    if (left !== right) {
        return left < right ? LEFT_FIRST : RIGHT_FIRST;
    }

    // Equal value, different zero padding: the narrower one sorts first.
    return leftPart.length - rightPart.length;
}

/*
 * Compares one segment pair. Returns EQUAL when the caller should move on to
 * the next segment.
 */
function comparePart(leftPart, rightPart) {
    if (leftPart === undefined) {
        return LEFT_FIRST;
    }

    if (rightPart === undefined) {
        return RIGHT_FIRST;
    }

    if (leftPart === rightPart) {
        return EQUAL;
    }

    if (isNumeric(leftPart) && isNumeric(rightPart)) {
        return compareNumeric(leftPart, rightPart);
    }

    return leftPart < rightPart ? LEFT_FIRST : RIGHT_FIRST;
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

module.exports = { naturalCompare, sortImageRecords };
