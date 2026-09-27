"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { positiveIntegerFrom } = require("../../../src/core/numbers.js");
const { readPageCountFrom } = require("../../../src/core/pdfcpu.js");

test("tool integers must be whole, positive, decimal and exactly representable", () => {
    for (const [text, value] of [["1", 1], [" 2\n", 2], ["0012", 12],
        ["9007199254740991", Number.MAX_SAFE_INTEGER]]) {
        assert.equal(positiveIntegerFrom(text), value, text);
    }
    for (const text of ["", " ", "0", "-1", "+1", "1e3", "0x10", "1.0", "1.5",
        "2junk", "junk2", "1\n2", "NaN", "Infinity", "9007199254740992"]) {
        assert.equal(positiveIntegerFrom(text), 0, text);
    }
});

test("PDF page count requires one complete, unambiguous field", () => {
    for (const text of ["Page count: 1", "  Page count: 1\n", "Page count: 1\r\n",
        "File: out.pdf\nPage count: 1\nOther: metadata", "Page count:\t1  "]) {
        assert.equal(readPageCountFrom(text), 1, text);
    }
    for (const text of ["", "Pages: 1", "unrelated Page count: 1", "Page count: 1junk",
        "Page count: 1.5", "Page count: 0", "Page count: -1", "Page count:\n1",
        "Page count: 9007199254740992", "Page count: 1\nPage count: 1"]) {
        assert.equal(readPageCountFrom(text), 0, text);
    }
});
