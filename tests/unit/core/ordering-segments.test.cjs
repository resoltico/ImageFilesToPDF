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
    // With `||` instead of `&&`, one numeric side would force the numeric
    // comparison on a word -- and that one counts digits before it reads
    // them, so a two-digit run would sort after a single letter.
    assert.ok(naturalCompare("1", "a") < 0);
    assert.ok(naturalCompare("a", "1") > 0);
    assert.ok(naturalCompare("12.png", "a.png") < 0, "digits before letters");
    assert.ok(naturalCompare("a.png", "12.png") > 0);
});

test("a run of letters is one segment, not a segment per letter", () => {
    // Per letter, the comparison reaches the digit in "photo1" against the
    // space in "photo " and orders them by character; whole, it compares
    // "photo" against "photo " and the shorter name comes first, which is
    // what Finder shows.
    assert.ok(naturalCompare("photo1.jpg", "photo .jpg") < 0);
    assert.ok(naturalCompare("photo .jpg", "photo1.jpg") > 0);
});

test("two long identifiers that differ past 2^53 still have an order", () => {
    // Number() is exact only to 2^53. Subtracting two larger identifiers said
    // they were equal, so their page order was whatever order they arrived
    // in -- and nineteen digits is an ordinary nanosecond timestamp.
    const pairs = [
        ["9007199254740992.jpg", "9007199254740993.jpg"],
        ["1788753646530000001.jpg", "1788753646530000002.jpg"]
    ];

    for (const [smaller, larger] of pairs) {
        assert.ok(naturalCompare(smaller, larger) < 0, `${smaller} first`);
        assert.ok(naturalCompare(larger, smaller) > 0, `${larger} second`);
    }
});

test("only the zeros at the front come off, and all of them do", () => {
    // The zeros inside a number are part of it. Taking those out turned 1002
    // into 12, which sorts before 13; taking only the first of a run left
    // 0002 longer than 03, which reads as larger.
    assert.ok(naturalCompare("page1002.png", "page13.png") > 0, "interior zeros stay");
    assert.ok(naturalCompare("page13.png", "page1002.png") < 0);
    assert.ok(naturalCompare("page00002.png", "page003.png") < 0, "every leading zero goes");
    assert.ok(naturalCompare("page003.png", "page00002.png") > 0);
});

test("a run of letters is compared as a word, not by its length", () => {
    // Numbers are compared by how many digits they have first, which is
    // meaningless for letters: alphabetically is what a person expects.
    assert.ok(naturalCompare("abc.png", "z.png") < 0);
    assert.ok(naturalCompare("z.png", "abc.png") > 0);
});

test("leading zeros are not part of the value, and still break the tie", () => {
    // The digits are compared as they are written, so the zeros have to come
    // off before the lengths mean anything -- and once the values are equal,
    // the narrower spelling is the one that sorts first.
    assert.ok(naturalCompare("007.png", "10.png") < 0, "seven before ten");
    assert.ok(naturalCompare("02.png", "2.png") > 0, "padded after bare");
    assert.ok(naturalCompare("2.png", "02.png") < 0);
    assert.equal(naturalCompare("000.png", "000.png"), 0);
});
