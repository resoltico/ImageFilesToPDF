"use strict";

/*
 * Counting and cutting text in bytes, checked against the platform's own
 * answer.
 *
 * A filename budget is in bytes and text is in characters, and the table that
 * converts one to the other is written out here rather than asked of anything.
 * A table can be wrong in one row and right in every example somebody thought
 * to write. Node knows the true answer, so it is the oracle: what is asserted
 * is agreement with it across generated text, including the astral characters
 * that arrive as surrogate pairs.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { Buffer } = require("node:buffer");
const fc = require("fast-check");
const { utf8Length, truncateToBytes } = require("../../../src/core/numbers.js");

// Every code point there is, in every width the table has a row for.
const TEXT = fc.string({ unit: "binary" });

function trueBytes(text) {
    return Buffer.byteLength(text, "utf8");
}

/*
 * Text and a budget for it, anywhere from nothing to the whole of it. Past
 * the whole text every budget keeps the whole text, so that end is the edge
 * of the range rather than more of it to search -- and drawn on its own, a
 * budget lands below a line of text too rarely to cut anything.
 */
const CUTTING = TEXT.chain((text) => fc.tuple(
    fc.constant(text),
    fc.nat({ max: trueBytes(text) })
));

test("a length in bytes is the length the platform measures", () => {
    fc.assert(fc.property(TEXT, (text) => {
        assert.equal(utf8Length(text), trueBytes(text), JSON.stringify(text));
    }));
});

test("what is kept is a beginning of what was given", () => {
    // Cut anywhere else and the name is not the name that was asked for.
    fc.assert(fc.property(CUTTING, ([text, budget]) => {
        assert.ok(
            text.startsWith(truncateToBytes(text, budget)),
            `${JSON.stringify(text)} at ${budget}`
        );
    }));
});

test("what is kept fits the budget it was given", () => {
    fc.assert(fc.property(CUTTING, ([text, budget]) => {
        assert.ok(
            trueBytes(truncateToBytes(text, budget)) <= budget,
            `${JSON.stringify(text)} at ${budget}`
        );
    }));
});

test("no character is cut in half", () => {
    // Asserted as whole characters taken from the front, not as a round trip
    // through a buffer: an invalid sequence comes back from one as U+FFFD
    // rather than as damage, so that assertion cannot see the fault it is
    // about. Measured -- against a version cutting on bytes, the round trip
    // passes and this fails.
    fc.assert(fc.property(CUTTING, ([text, budget]) => {
        const kept = truncateToBytes(text, budget);

        assert.equal(kept, [...text].slice(0, [...kept].length).join(""), JSON.stringify(kept));
    }));
});

test("as much is kept as the budget allows", () => {
    // A budget short of the whole text by at least a byte, so something is
    // always cut -- built that way rather than drawn and discarded.
    const SHORT = fc.string({ unit: "binary", minLength: 1 }).chain((text) => fc.tuple(
        fc.constant(text),
        fc.nat({ max: trueBytes(text) - 1 })
    ));

    fc.assert(fc.property(SHORT, ([text, budget]) => {
        const kept = truncateToBytes(text, budget);
        const next = [...text][[...kept].length];

        assert.ok(
            trueBytes(kept) + trueBytes(next) > budget,
            `${JSON.stringify(kept)} + ${JSON.stringify(next)} at ${budget}`
        );
    }));
});
