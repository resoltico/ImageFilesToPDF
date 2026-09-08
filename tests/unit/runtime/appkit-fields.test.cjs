"use strict";

/*
 * The controls a person types into.
 *
 * A fake proves what is built and how it is configured. That AppKit renders
 * any of it, and that a combo box in an alert's accessory view can be typed
 * into inside the Shortcuts helper, is not something anything headless can
 * establish -- QA.md says how it is checked instead.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    makeField,
    makeColourCombo
} = require("../../../src/runtime/appkit-fields.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const RECT = { left: 10, bottom: 20, width: 100, height: 24 };

const COLOUR_ROW = {
    key: "background",
    kind: "colour",
    label: "Page background:",
    tooltip: "Choose a preset or type six hex digits, for example #C7DAE8.",
    value: "White (#FFFFFF)",
    options: [{ label: "White (#FFFFFF)" }, { label: "Black (#000000)" }]
};

function bridge() {
    return createFakeObjC();
}

test("a field keeps its value and its place", () => {
    const field = makeField(bridge().ns, "300", RECT);

    assert.equal(field.stringValue, "300");
    assert.deepEqual(field.rect, RECT);
    assert.notEqual(field.editable, false, "a field must stay editable");
});

test("the colour control offers the presets and takes a typed value", () => {
    const combo = makeColourCombo(bridge().ns, COLOUR_ROW, RECT);

    assert.deepEqual(combo.items, ["White (#FFFFFF)", "Black (#000000)"]);
    assert.equal(combo.stringValue, "White (#FFFFFF)");
    assert.equal(combo.editable, true, "or it is a pop-up with extra steps");
    assert.deepEqual(combo.rect, RECT);
});

test("completion is off, so what the field holds is what was typed", () => {
    // With it on, typing over a selected preset offers to finish the word,
    // and the value submitted is one the user did not write.
    const combo = makeColourCombo(bridge().ns, COLOUR_ROW, RECT);

    assert.equal(combo.completes, false);
    assert.equal(combo.usesDataSource, false, "four static items need no source");
});

test("the list is as long as it has presets, and says what it is", () => {
    const combo = makeColourCombo(bridge().ns, COLOUR_ROW, RECT);

    assert.equal(combo.numberOfVisibleItems, COLOUR_ROW.options.length);
    assert.match(combo.toolTip, /six hex digits/u);
    assert.equal(
        combo.accessibilityLabel,
        "Page background:",
        "the label beside it is not announced by the control itself"
    );
});
