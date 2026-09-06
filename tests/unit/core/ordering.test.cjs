"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { naturalCompare, sortImageRecords } = require("../../../src/core/ordering.js");

test("naturalCompare orders numbers by value, not by digit", () => {
    assert.ok(naturalCompare("page2", "page10") < 0);
    assert.ok(naturalCompare("page10", "page2") > 0);
    assert.equal(naturalCompare("a", "a"), 0);
});

test("naturalCompare handles prefixes and equal-value widths", () => {
    assert.equal(naturalCompare("a", "a1"), -1);
    assert.equal(naturalCompare("a1", "a"), 1);
    // Equal numeric value, different zero padding: narrower sorts first.
    assert.ok(naturalCompare("1", "01") < 0);
    assert.ok(naturalCompare("01", "1") > 0);
});

test("naturalCompare orders alphabetic segments both ways", () => {
    // Names that differ in a non-numeric segment fall through to a plain
    // lexical comparison, which must be symmetric.
    assert.ok(naturalCompare("apple", "banana") < 0);
    assert.ok(naturalCompare("banana", "apple") > 0);
    assert.ok(naturalCompare("img_a2", "img_b1") < 0);
});

test("naturalCompare handles empty names", () => {
    // An empty string yields no segments at all, so the comparison has to
    // cope with an empty parts list rather than throwing.
    assert.equal(naturalCompare("", ""), 0);
    assert.ok(naturalCompare("", "a") < 0);
    assert.ok(naturalCompare("a", "") > 0);
});

test("naturalCompare is case insensitive", () => {
    assert.equal(naturalCompare("ABC", "abc"), 0);
});

test("sortImageRecords orders by name then path, without mutating", () => {
    const records = [
        { originalName: "page10.png", path: "/b/page10.png" },
        { originalName: "page2.png", path: "/b/page2.png" },
        { originalName: "page01.png", path: "/b/page01.png" },
        { originalName: "page1.png", path: "/z/page1.png" },
        { originalName: "page1.png", path: "/a/page1.png" }
    ];
    const original = records.slice();

    assert.deepEqual(
        sortImageRecords(records).map((record) => record.path),
        [
            "/a/page1.png",
            "/z/page1.png",
            "/b/page01.png",
            "/b/page2.png",
            "/b/page10.png"
        ]
    );
    assert.deepEqual(records, original, "input must not be mutated");
});

test("identical names compare equal at every segment", () => {
    assert.equal(naturalCompare("chapter01-part2", "chapter01-part2"), 0);
    assert.equal(naturalCompare("abc", "abc"), 0);
});

test("a name that is a prefix of another sorts before it, both ways round", () => {
    // "page" against "page2" runs out of segments on one side. Handling only
    // the left-hand exhaustion leaves the mirror case comparing equal, and
    // two files then hold an arbitrary order.
    assert.ok(naturalCompare("page", "page2") < 0);
    assert.ok(naturalCompare("page2", "page") > 0);
    assert.ok(naturalCompare("img", "img_a") < 0);
    assert.ok(naturalCompare("img_a", "img") > 0);
});

test("the comparator is antisymmetric across a spread of names", () => {
    const names = [
        "page", "page1", "page2", "page10", "page02",
        "IMG_3.png", "img_10.png", "a", "a1b", "ab1", ""
    ];

    for (const left of names) {
        assert.equal(naturalCompare(left, left), 0, `${left} equals itself`);

        for (const right of names.filter((name) => name !== left)) {
            assert.equal(
                Math.sign(naturalCompare(left, right)),
                -Math.sign(naturalCompare(right, left)),
                `${left} vs ${right} must reverse`
            );
        }
    }
});

test("ordering folds case downward, which is how Finder sorts", () => {
    // Not arbitrary: folding upward instead puts "_" after letters rather
    // than before them, because "_" sits between the two alphabets in ASCII.
    // Finder lists "_notes.png" first, and so should the pages.
    assert.ok(naturalCompare("_notes.png", "Album.png") < 0);
    assert.ok(naturalCompare("Album.png", "_notes.png") > 0);

    // And it stays case-insensitive either way round.
    assert.equal(naturalCompare("IMG_2.png", "img_2.png"), 0);
    assert.ok(naturalCompare("apple.png", "Banana.png") < 0);
    assert.ok(naturalCompare("Banana.png", "apple.png") > 0);
});

test("a name with nothing in it sorts before one with something", () => {
    // An empty string tokenizes to no parts at all, so it needs a stand-in
    // rather than being compared as though it were absent.
    assert.ok(naturalCompare("", "a.png") < 0);
    assert.ok(naturalCompare("a.png", "") > 0);
    assert.equal(naturalCompare("", ""), 0);
});

test("a name with nothing in it stands in as empty, not as a word", () => {
    // An empty string tokenizes to no parts, so it needs a stand-in. That
    // stand-in has to be empty: anything else would sort as though the file
    // were named after it.
    assert.ok(naturalCompare("", "1.png") < 0, "before a digit");
    assert.ok(naturalCompare("", "a.png") < 0, "and before a letter");
    assert.ok(naturalCompare("1.png", "") > 0);
});
