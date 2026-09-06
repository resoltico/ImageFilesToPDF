"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    CREATE_BUTTON,
    CANCEL_BUTTON,
    swatchOf,
    defaultAnswers,
    formSpec
} = require("../../../src/core/form.js");
const { BACKGROUND, PAPER_SIZE } = require("../../../src/core/choices.js");
const { APP_NAME } = require("../../../src/core/version.js");

function rowFor(key, spec = formSpec()) {
    const row = spec.rows.find((candidate) => candidate.key === key);

    assert.ok(row, `the form must have a ${key} row`);

    return row;
}

test("every setting the pipeline needs has exactly one row", () => {
    const keys = formSpec().rows.map((row) => row.key);

    assert.deepEqual(
        [...keys].sort(),
        ["background", "dpi", "mode", "orientation", "paperSize", "quality"]
    );
    assert.equal(new Set(keys).size, keys.length, "no key may appear twice");
});

test("the form offers the same choices as the stepwise dialogs", () => {
    // Two front ends that disagree about what may be chosen would be two
    // different tools wearing the same name.
    assert.deepEqual(
        rowFor("background").options.map((option) => option.label),
        BACKGROUND.choices.map((choice) => choice.label)
    );
    assert.deepEqual(
        rowFor("paperSize").options.map((option) => option.label),
        PAPER_SIZE.choices.map((choice) => choice.label)
    );
});

test("a hex colour becomes a swatch, and anything else does not", () => {
    assert.deepEqual(swatchOf("#204486"), { red: 32, green: 68, blue: 134 });
    assert.deepEqual(swatchOf("#FFFFFF"), { red: 255, green: 255, blue: 255 });
    assert.deepEqual(swatchOf("#000000"), { red: 0, green: 0, blue: 0 });
    assert.equal(swatchOf("A4"), null);
    assert.equal(swatchOf("Portrait"), null);
    assert.equal(swatchOf("#20448"), null, "five digits is not a colour");
    assert.equal(swatchOf("#2044866"), null, "seven digits is not a colour");
    assert.equal(swatchOf("204486"), null, "a colour needs its hash");
    assert.equal(
        swatchOf("Purple #8E79E0"),
        null,
        "a hex code inside a label is not the value"
    );
});

test("only the colours carry swatches", () => {
    for (const option of rowFor("background").options) {
        assert.ok(option.swatch, `${option.label} should have a swatch`);
    }

    for (const key of ["paperSize", "orientation", "mode"]) {
        for (const option of rowFor(key).options) {
            assert.equal(option.swatch, null, `${option.label} needs no swatch`);
        }
    }
});

test("the defaults are the ones the dialogs would have offered first", () => {
    assert.deepEqual(defaultAnswers(), {
        paperSize: "A4",
        orientation: "Portrait",
        mode: "One PDF with all images",
        background: "White (#FFFFFF)",
        dpi: "300",
        quality: "92"
    });
});

test("the number rows carry the range that validates them", () => {
    assert.equal(rowFor("dpi").kind, "number");
    assert.equal(rowFor("dpi").minimum, 72);
    assert.equal(rowFor("dpi").maximum, 1041);
    assert.equal(rowFor("quality").minimum, 1);
    assert.equal(rowFor("quality").maximum, 100);
});

test("previous answers are carried back into a redisplayed form", () => {
    // The point of showing every problem at once is lost if correcting one
    // field discards the other five.
    const spec = formSpec(
        { ...defaultAnswers(), paperSize: "US Letter", dpi: "600" },
        [{ key: "dpi", message: "Resolution: enter a whole number from 72 to 1041." }]
    );

    assert.equal(rowFor("paperSize", spec).value, "US Letter");
    assert.equal(rowFor("dpi", spec).value, "600");
    assert.match(spec.detail, /enter a whole number from 72 to 1041/u);
});

test("several problems stay on separate lines", () => {
    // Run together they read as one sentence about a field that does not
    // exist, which is worse than reporting only the first.
    const spec = formSpec(defaultAnswers(), [
        { key: "dpi", message: "first problem" },
        { key: "quality", message: "second problem" }
    ]);

    assert.deepEqual(spec.detail.split("\n"), ["first problem", "second problem"]);
});

test("with nothing wrong the form explains itself instead", () => {
    const spec = formSpec();

    assert.equal(spec.title, APP_NAME);
    assert.match(spec.detail, /Choose how the pages are built/u);
    assert.deepEqual(spec.buttons, [CREATE_BUTTON, CANCEL_BUTTON]);
    assert.equal(spec.buttons[0], "Create PDF", "the first button is the action");
});
