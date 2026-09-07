"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    utf8Length,
    truncateToBytes,
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

test("a string is measured in the bytes a command line is measured in", () => {
    // String length counts UTF-16 code units: an accented letter is one unit
    // and two bytes, and anything above the basic plane is two units and four
    // bytes. A budget named in bytes and spent in units is about nothing.
    for (const [text, bytes] of [
        ["", 0],
        ["plain.jpg", 9],
        ["wörk", 5],
        ["日本語", 9],
        ["📁", 4],
        ["/tmp/wörk shop 📁/page_000001.jpg", 36],
        // The first character of each width, where a table that compared one
        // step wrong would under-count by a byte.
        ["\u0080", 2],
        ["\u0800", 3],
        ["\u{10000}", 4]
    ]) {
        assert.equal(utf8Length(text), bytes, JSON.stringify(text));
    }
});

test("a text that exactly fills its budget is kept whole", () => {
    // The bound is "fits", not "nearly fits": cutting a character off a name
    // that was exactly long enough is a name nobody asked for.
    assert.equal(truncateToBytes("abcde", 5), "abcde");
    assert.equal(truncateToBytes("abcde", 4), "abcd");
    assert.equal(truncateToBytes("wörk", 5), "wörk", "counted in bytes");
    assert.equal(truncateToBytes("wörk", 4), "wör", "four bytes is w, ö and r");
    assert.equal(truncateToBytes("wörk", 2), "w", "and never half a letter");
    assert.equal(truncateToBytes("📁📁", 4), "📁");
    assert.equal(truncateToBytes("abc", 0), "");
});
