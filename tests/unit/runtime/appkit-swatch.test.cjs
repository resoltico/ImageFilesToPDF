"use strict";

/*
 * The colour square beside a background option.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { SWATCH_SIZE, makeSwatch } = require("../../../src/runtime/appkit-swatch.js");
const { createFakeObjC } = require("./fake-objc.cjs");

function bridge() {
    return createFakeObjC();
}

test("a swatch is filled with the colour it was given", () => {
    const { ns, state } = bridge();
    const image = makeSwatch(ns, { red: 32, green: 68, blue: 134 });

    // Scaled to the 0-1 range AppKit wants, from the 0-255 a hex code gives.
    assert.deepEqual(state.colours[0], {
        red: 32 / 255,
        green: 68 / 255,
        blue: 134 / 255,
        alpha: 1
    });
    assert.equal(image.size.width, SWATCH_SIZE);
    assert.equal(image.size.height, SWATCH_SIZE);
});

test("a white swatch is outlined, or it would be invisible", () => {
    // White on a white menu is nothing at all, and white is the default.
    const { ns, state } = bridge();

    makeSwatch(ns, { red: 255, green: 255, blue: 255 });

    assert.deepEqual(state.colours[0], { red: 1, green: 1, blue: 1, alpha: 1 });
    assert.equal(state.strokes.length, 1, "the border must be drawn");
    assert.ok(
        state.colours[1].alpha > 0 && state.colours[1].alpha < 1,
        "the border is drawn in a translucent ink, not a hard black"
    );
});

test("the outline sits inside the square, on the pixel grid", () => {
    const { ns, state } = bridge();

    makeSwatch(ns, { red: 0, green: 0, blue: 0 });

    const [stroke] = state.strokes;

    assert.equal(stroke.left, 0.5);
    assert.equal(stroke.bottom, 0.5);
    assert.equal(stroke.width, SWATCH_SIZE - 1);
});

test("drawing leaves the image unlocked", () => {
    // An unbalanced lockFocus corrupts later drawing anywhere in the process.
    const { ns } = bridge();
    const image = makeSwatch(ns, { red: 255, green: 255, blue: 255 });

    assert.equal(image.focused, 0, "lockFocus and unlockFocus must balance");
});

test("the fill covers the whole swatch", () => {
    const { ns, state } = bridge();

    makeSwatch(ns, { red: 0, green: 0, blue: 0 });

    assert.deepEqual(state.fills, [
        { left: 0, bottom: 0, width: SWATCH_SIZE, height: SWATCH_SIZE }
    ]);
});


test("the outline is inset on both axes, not just one", () => {
    // A stroke wider than the image is clipped away at the edge, which is
    // the same as having no outline at all.
    const { ns, state } = bridge();

    makeSwatch(ns, { red: 255, green: 255, blue: 255 });

    const [stroke] = state.strokes;

    assert.equal(stroke.width, SWATCH_SIZE - 1);
    assert.equal(stroke.height, SWATCH_SIZE - 1);
    assert.ok(stroke.width < SWATCH_SIZE, "an outline must fit inside its square");
});
