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
        const difference = Number(leftPart) - Number(rightPart);

        // Equal value, different zero padding: the narrower one sorts first.
        return difference === EQUAL
            ? leftPart.length - rightPart.length
            : difference;
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
