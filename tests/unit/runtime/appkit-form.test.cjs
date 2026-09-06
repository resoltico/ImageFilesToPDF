"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    FORM_WIDTH,
    ROW_HEIGHT,
    NUMBER_WIDTH,
    PADDING,
    buildForm
} = require("../../../src/runtime/appkit-form.js");
const WIDGETS = require("../../../src/runtime/appkit-widgets.js");
const { formSpec, defaultAnswers } = require("../../../src/core/form.js");
const { createFakeObjC } = require("./fake-objc.cjs");

function build(spec = formSpec()) {
    const bridge = createFakeObjC();

    return { bridge, spec, ...buildForm(bridge, spec, WIDGETS) };
}

test("every row becomes a label, a control, and a hint where it has one", () => {
    const { spec, view, controls } = build();
    const withHints = spec.rows.filter((row) => row.hint).length;

    assert.equal(view.subviews.length, spec.rows.length * 2 + withHints);
    assert.equal(Object.keys(controls).length, spec.rows.length);
    assert.equal(withHints, 2, "the two numeric settings state their bounds");

    for (const row of spec.rows) {
        assert.ok(controls[row.key], `${row.key} has no control`);
    }
});

test("rows read top to bottom, which is upside down in AppKit", () => {
    // AppKit's origin is the bottom left, so the first row needs the highest
    // y. Laid out naively the form reads in reverse.
    const { spec, controls } = build();
    const tops = spec.rows.map((row) => controls[row.key].rect.bottom);

    for (let index = 1; index < tops.length; index += 1) {
        assert.ok(
            tops[index] < tops[index - 1],
            `row ${index} must sit below row ${index - 1}`
        );
    }

    assert.equal(tops[0], PADDING + (spec.rows.length - 1) * ROW_HEIGHT);
    assert.equal(
        tops.at(-1),
        PADDING,
        "the last row is inset, not flush against the buttons below"
    );
});

test("a choice row offers every option, in order", () => {
    const { controls } = build();
    const { background } = controls;

    assert.equal(background.kind, "popup");
    assert.deepEqual(
        background.items.map((item) => item.title),
        ["White (#FFFFFF)", "Black (#000000)", "Purple (#8E79E0)", "Dark blue (#204486)"]
    );
});

test("only the colour options carry an image", () => {
    const { controls } = build();

    for (const item of controls.background.items) {
        assert.ok(item.image, `${item.title} should show its colour`);
    }

    for (const item of controls.paperSize.items) {
        assert.equal(item.image, null, `${item.title} needs no image`);
    }
});

test("a number row becomes a narrow editable field holding its value", () => {
    // Only as wide as four digits need; the rest of the column is the hint.
    const { controls } = build(formSpec({ ...defaultAnswers(), dpi: "150" }));

    assert.equal(controls.dpi.kind, "field");
    assert.equal(controls.dpi.stringValue, "150");
    assert.equal(controls.dpi.rect.width, NUMBER_WIDTH);
    assert.ok(NUMBER_WIDTH < FORM_WIDTH / 2, "a number needs no half the form");
});

test("each numeric field is told the bounds it accepts", () => {
    const { view } = build();
    const hints = view.subviews
        .filter((child) => child.editable === false)
        .map((child) => child.stringValue);

    assert.ok(hints.includes("72–1041 DPI"), hints.join(" | "));
    assert.ok(hints.includes("1–100, 90–95 is typical"), hints.join(" | "));
});

test("the form is as tall as it has rows, plus its margins", () => {
    const { spec, view } = build();

    assert.equal(
        view.rect.height,
        spec.rows.length * ROW_HEIGHT + PADDING * 2
    );
    assert.equal(view.rect.width, FORM_WIDTH);
});
