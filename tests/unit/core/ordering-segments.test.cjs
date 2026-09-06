"use strict";

/*
 * How a name is cut into segments, and what each segment is taken to be. The
 * comparison is only as good as this: a run split in the wrong place is
 * compared against the wrong thing.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { naturalCompare } = require("../../../src/core/ordering.js");

test("a segment counts as numeric only when it is entirely digits", () => {
    // An unanchored test would treat "a1" or "1a" as a number and compare by
    // value rather than lexically.
    assert.ok(naturalCompare("a1", "b1") < 0, "leading letter decides");
    assert.ok(naturalCompare("2x", "10x") < 0, "digits then letters still sort naturally");
    assert.ok(naturalCompare("x2", "x10") < 0);
});

test("numeric comparison needs both segments to be numeric", () => {
    // With `||` instead of `&&`, one numeric side would force a numeric
    // comparison and Number("abc") would poison the result.
    assert.ok(naturalCompare("1", "a") < 0);
    assert.ok(naturalCompare("a", "1") > 0);
    assert.equal(naturalCompare("9", "a") < 0, true);
});

test("a run of letters is one segment, not a segment per letter", () => {
    // Per letter, the comparison reaches the digit in "photo1" against the
    // space in "photo " and orders them by character; whole, it compares
    // "photo" against "photo " and the shorter name comes first, which is
    // what Finder shows.
    assert.ok(naturalCompare("photo1.jpg", "photo .jpg") < 0);
    assert.ok(naturalCompare("photo .jpg", "photo1.jpg") > 0);
});
