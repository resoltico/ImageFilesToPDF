"use strict";

/*
 * Choosing, the other way round.
 *
 * A remembered setting has to find the label it is offered under, or the form
 * cannot open on it. Every choice control's value is what normalizeSettings
 * produces, so this is a lookup and not a translation -- and a miss means the
 * two have drifted apart, which is worth an error rather than a guess.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    labelOfValue,
    valueOfLabel
} = require("../../../src/core/choices.js");

test("a value that is offered under no label is refused, not guessed at", () => {
    // The inverse of choosing: it is only ever asked about a value that came
    // out of validation, so a miss means the two have drifted apart and the
    // form would open on something nobody offered.
    assert.equal(labelOfValue(PAPER_SIZE, "A4"), "A4");
    assert.equal(labelOfValue(PAPER_SIZE, "Letter"), "US Letter");
    assert.throws(() => labelOfValue(PAPER_SIZE, "Legal"), /Unrecognised value: Legal/u);
});

test("every label and value are inverses of each other", () => {
    for (const control of [PAPER_SIZE, ORIENTATION, OUTPUT_MODE]) {
        for (const { label, value } of control.choices) {
            assert.equal(labelOfValue(control, value), label);
            assert.equal(valueOfLabel(control, label), value);
        }
    }
});

test("no two options of a control share a value", () => {
    // Two labels resolving to the same setting means one of them does
    // nothing, which a per-option check above would not notice.
    for (const control of [PAPER_SIZE, ORIENTATION, OUTPUT_MODE, BACKGROUND]) {
        const values = control.choices.map((choice) => choice.value);

        assert.equal(
            new Set(values).size,
            values.length,
            `${control.prompt} offers a duplicated value: ${values.join(", ")}`
        );
    }
});
