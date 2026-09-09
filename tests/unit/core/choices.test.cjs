"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    labelsOf,
    defaultLabelOf,
    valueOfLabel
} = require("../../../src/core/choices.js");
const { normalizeSettings } = require("../../../src/core/settings.js");

const LISTS = [PAPER_SIZE, ORIENTATION, OUTPUT_MODE, BACKGROUND];

test("every prompt asks about its subject in plain words", () => {
    assert.equal(PAPER_SIZE.prompt, "Paper size:");
    assert.equal(ORIENTATION.prompt, "Orientation:");
    assert.equal(OUTPUT_MODE.prompt, "Output:");
    assert.equal(BACKGROUND.prompt, "Page background:");
});

test("no prompt restates the options listed beneath it", () => {
    // The mode prompt used to spell out both options in a 74-character
    // question, directly above the two options themselves.
    for (const control of LISTS) {
        for (const label of labelsOf(control)) {
            assert.ok(
                !control.prompt.includes(label),
                `${control.prompt} repeats ${label}`
            );
        }

        assert.ok(control.prompt.length <= 20, `${control.prompt} is terse`);
    }
});

test("the numeric prompts state the range they will accept", () => {
    // Otherwise a rejection is the first time anyone learns it.
    assert.match(RESOLUTION.prompt, /\(72–1041\)/u);
    assert.match(QUALITY.prompt, /\(1–100/u);
    assert.match(QUALITY.prompt, /90–95 is typical/u);
});

test("the stated range is the range that is actually enforced", () => {
    for (const control of [RESOLUTION, QUALITY]) {
        assert.ok(control.prompt.includes(String(control.minimum)));
        assert.ok(control.prompt.includes(String(control.maximum)));
    }
});

test("the default answer is within the range it offers", () => {
    for (const control of [RESOLUTION, QUALITY]) {
        const value = Number(control.defaultAnswer);

        assert.ok(value >= control.minimum && value <= control.maximum);
    }
});

test("Letter is labelled the way macOS labels it", () => {
    // "Letter" alone is an English word rather than an obviously named paper
    // size; macOS itself says "US Letter".
    assert.deepEqual(labelsOf(PAPER_SIZE), ["A4", "US Letter"]);
    assert.equal(valueOfLabel(PAPER_SIZE, "US Letter"), "Letter");
});

test("every background is labelled the same way: a name and its hex", () => {
    // A bare word beside a bare hex code is the inconsistency this replaced.
    assert.deepEqual(labelsOf(BACKGROUND), [
        "White (#FFFFFF)",
        "Black (#000000)",
        "Purple (#8E79E0)",
        "Dark blue (#204486)"
    ]);

    for (const label of labelsOf(BACKGROUND)) {
        assert.match(label, /^[A-Z][a-z ]+ \(#[0-9A-F]{6}\)$/u, label);
    }
});

test("each background label carries the value it selects", () => {
    // The hex a person reads is the hex the pipeline uses, so a label cannot
    // drift from the colour it actually produces.
    for (const { label, value } of BACKGROUND.choices) {
        assert.ok(label.includes(value), `${label  } should contain ${  value}`);
        assert.equal(valueOfLabel(BACKGROUND, label), value);
    }
});

test("the common case is offered first", () => {
    assert.equal(defaultLabelOf(OUTPUT_MODE), "One PDF with all images");
    assert.equal(defaultLabelOf(PAPER_SIZE), "A4");
    assert.equal(defaultLabelOf(ORIENTATION), "Portrait");
    assert.equal(defaultLabelOf(BACKGROUND), "White (#FFFFFF)");
});

test("an unknown label is refused rather than passed through", () => {
    assert.throws(() => valueOfLabel(PAPER_SIZE, "Legal"), /Unrecognised choice/u);
    assert.throws(() => valueOfLabel(BACKGROUND, "#000000"), /Unrecognised choice/u);
});

const BASELINE = {
    paperSize: "A4",
    orientation: "Portrait",
    dpi: Number(RESOLUTION.defaultAnswer),
    quality: Number(QUALITY.defaultAnswer),
    mode: "Single PDF",
    background: "#FFFFFF"
};

test("every offered value is one the validator accepts", () => {
    // A label that maps to a value settings would reject is a dialog that
    // cannot be answered correctly. Every option of every control is varied
    // in turn: checking only the first of each would leave Landscape and
    // three of the four backgrounds unproven.
    const controls = [
        ["paperSize", PAPER_SIZE],
        ["orientation", ORIENTATION],
        ["mode", OUTPUT_MODE],
        ["background", BACKGROUND]
    ];

    for (const [field, control] of controls) {
        for (const { label, value } of control.choices) {
            assert.doesNotThrow(
                () => normalizeSettings({ ...BASELINE, [field]: value }),
                `${label} selects ${field}=${JSON.stringify(value)}, which the `
                + "validator refuses"
            );
        }
    }
});
