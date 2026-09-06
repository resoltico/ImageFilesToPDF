"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    parseInteger,
    plural,
    fixed2,
    zeroPad,
    formatDuration
} = require("../../../src/core/numbers.js");

test("parseInteger accepts whole numbers inside the range", () => {
    assert.equal(parseInteger(72, 72, 1200, "DPI"), 72);
    assert.equal(parseInteger(1200, 72, 1200, "DPI"), 1200);
    assert.equal(parseInteger("300", 72, 1200, "DPI"), 300);
});

test("parseInteger rejects anything else", () => {
    for (const invalid of [71, 1201, 72.5, "x", Infinity, NaN, null]) {
        assert.throws(
            () => parseInteger(invalid, 72, 1200, "DPI"),
            /DPI must be a whole number from 72 to 1200/u,
            `expected ${String(invalid)} to be rejected`
        );
    }
});

test("fixed2 trims insignificant trailing zeros only", () => {
    assert.equal(fixed2(595.2756), "595.28");
    assert.equal(fixed2(841.8898), "841.89");
    assert.equal(fixed2(595.4), "595.4");
    assert.equal(fixed2(612), "612");
    assert.equal(fixed2(792), "792");
    assert.equal(fixed2(0), "0");
    assert.equal(fixed2(100), "100", "the decimal point must guard the integer part");
});

test("zeroPad pads to width and never truncates", () => {
    assert.equal(zeroPad(1, 6), "000001");
    assert.equal(zeroPad(123456, 6), "123456");
    assert.equal(zeroPad(1234567, 6), "1234567");
});

test("formatDuration reads naturally at each scale", () => {
    assert.equal(formatDuration(-1), "0 second(s)");
    assert.equal(formatDuration(0), "0 second(s)");
    assert.equal(formatDuration(1499), "1 second(s)");
    assert.equal(formatDuration(61000), "1 minute(s), 1 second(s)");
    assert.equal(formatDuration(3600000), "60 minute(s), 0 second(s)");
});

test("plural says one thing in the singular", () => {
    // "1 PDFs" is exactly the sloppiness the "(s)" placeholder was replaced to
    // avoid, so the singular case has to be pinned.
    assert.equal(plural(1, "PDF"), "1 PDF");
    assert.equal(plural(1, "image"), "1 image");
    assert.equal(plural(0, "PDF"), "0 PDFs");
    assert.equal(plural(2, "PDF"), "2 PDFs");
});

test("plural accepts an irregular plural", () => {
    assert.equal(plural(1, "entry", "entries"), "1 entry");
    assert.equal(plural(3, "entry", "entries"), "3 entries");
});
