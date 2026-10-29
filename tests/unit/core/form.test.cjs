"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    CREATE_BUTTON,
    CANCEL_BUTTON,
    defaultAnswers,
    formSpec
} = require("../../../src/host/settings-model.js");
const { BACKGROUND, PAPER_SIZE } = require("../../../src/host/settings-model.js");
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
        ["background", "mode", "orientation", "paperSize", "quality", "resolutionLimit"]
    );
    assert.equal(new Set(keys).size, keys.length, "no key may appear twice");
});

test("the form offers the same choices as the stepwise dialogs", () => {
    // Two front ends that disagree about what may be chosen would be two
    // different tools wearing the same name. They present them differently --
    // the form's list holds the colours, the dialog's holds their names --
    // but they are the same four.
    assert.deepEqual(
        rowFor("background").options.map((option) => option.label),
        BACKGROUND.choices.map((choice) => choice.label)
    );
    assert.deepEqual(
        rowFor("paperSize").options.map((option) => option.label),
        PAPER_SIZE.choices.map((choice) => choice.label)
    );
});

test("everything in the background control is a colour", () => {
    // The list held a menu's wording, "White (#FFFFFF)", which is what made a
    // control you can type into look like one you cannot -- and made editing
    // what it put there a mistake, since a person replacing the code inside
    // those brackets has written a perfectly good colour.
    const row = rowFor("background");

    assert.equal(row.kind, "colour");
    assert.deepEqual(
        row.options.map((option) => option.label),
        ["White (#FFFFFF)", "Black (#000000)", "Purple (#8E79E0)", "Dark blue (#204486)"]
    );
    assert.equal(row.value, "#FFFFFF");
    assert.equal(
        row.hint,
        "or type #RRGGBB",
        "stated beside the row, where the numbers state their range"
    );
});

test("grouping comes first, followed by page appearance and encoding", () => {
    assert.deepEqual(
        formSpec().rows.map((row) => row.key),
        ["mode", "paperSize", "orientation", "background", "resolutionLimit", "quality"]
    );
});

test("the defaults are the ones the dialogs would have offered first", () => {
    assert.deepEqual(defaultAnswers(), {
        paperSize: "A4",
        orientation: "Portrait",
        mode: "combined",
        background: "#FFFFFF",
        resolutionLimit: "300",
        quality: "92"
    });
});

test("the number rows carry the range that validates them", () => {
    assert.equal(rowFor("resolutionLimit").kind, "number");
    assert.equal(rowFor("resolutionLimit").minimum, 72);
    assert.equal(rowFor("resolutionLimit").maximum, 1017);
    assert.equal(rowFor("quality").minimum, 1);
    assert.equal(rowFor("quality").maximum, 100);
});

test("previous answers are carried back into a redisplayed form", () => {
    // The point of showing every problem at once is lost if correcting one
    // field discards the other five.
    const spec = formSpec(
        { ...defaultAnswers(), paperSize: "Letter", resolutionLimit: "600" },
        [{ key: "resolutionLimit", message: "Resolution: enter a whole number from 72 to 1017." }]
    );

    assert.equal(rowFor("paperSize", spec).value, "Letter");
    assert.equal(rowFor("resolutionLimit", spec).value, "600");
    assert.match(spec.detail, /enter a whole number from 72 to 1017/u);
});

test("several problems stay on separate lines", () => {
    // Run together they read as one sentence about a field that does not
    // exist, which is worse than reporting only the first.
    const spec = formSpec(defaultAnswers(), [
        { key: "resolutionLimit", message: "first problem" },
        { key: "quality", message: "second problem" }
    ]);

    assert.deepEqual(spec.detail.split("\n").slice(0, 2), ["first problem", "second problem"]);
});

test("with nothing wrong the form explains itself instead", () => {
    const spec = formSpec();

    assert.equal(spec.title, APP_NAME);
    assert.match(spec.fullDetail, /Choose the PDF settings/u);
    assert.deepEqual(spec.buttons, [CREATE_BUTTON, CANCEL_BUTTON]);
    assert.equal(spec.buttons[0], "Create", "the first button is the action");
});
