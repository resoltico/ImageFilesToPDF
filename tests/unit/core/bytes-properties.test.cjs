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

const RUNS = { seed: 20260916, numRuns: 50 };

// Every width the table has a row for, and the pairs above it.
const TEXT = fc.string({ unit: "binary", maxLength: 40 });
const BUDGET = fc.integer({ min: 0, max: 80 });

function trueBytes(text) {
    return Buffer.byteLength(text, "utf8");
}

test("a length in bytes is the length the platform measures", () => {
    fc.assert(fc.property(TEXT, (text) => {
        assert.equal(utf8Length(text), trueBytes(text), JSON.stringify(text));
    }), RUNS);
});

test("what is kept is a beginning of what was given", () => {
    // Cut anywhere else and the name is not the name that was asked for.
    fc.assert(fc.property(TEXT, BUDGET, (text, budget) => {
        assert.ok(
            text.startsWith(truncateToBytes(text, budget)),
            `${JSON.stringify(text)} at ${budget}`
        );
    }), RUNS);
});

test("what is kept fits the budget it was given", () => {
    fc.assert(fc.property(TEXT, BUDGET, (text, budget) => {
        assert.ok(
            trueBytes(truncateToBytes(text, budget)) <= budget,
            `${JSON.stringify(text)} at ${budget}`
        );
    }), RUNS);
});

test("no character is cut in half", () => {
    // Asserted as whole characters taken from the front, not as a round trip
    // through a buffer: an invalid sequence comes back from one as U+FFFD
    // rather than as damage, so that assertion cannot see the fault it is
    // about. Measured -- against a version cutting on bytes, the round trip
    // passes and this fails.
    fc.assert(fc.property(TEXT, BUDGET, (text, budget) => {
        const kept = truncateToBytes(text, budget);
        const characters = [...text].slice(0, [...kept].length).join("");

        assert.equal(kept, characters, JSON.stringify(kept));
    }), RUNS);
});

test("as much is kept as the budget allows", () => {
    // Anything shorter would be cutting a name for no reason.
    fc.assert(fc.property(TEXT, BUDGET, (text, budget) => {
        const kept = truncateToBytes(text, budget);

        fc.pre(kept !== text);

        const next = [...text][[...kept].length];

        assert.ok(
            trueBytes(kept) + trueBytes(next) > budget,
            `${JSON.stringify(kept)} + ${JSON.stringify(next)} at ${budget}`
        );
    }), RUNS);
});
