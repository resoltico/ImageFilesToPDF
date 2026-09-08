"use strict";

/*
 * What the form says before the questions. Selecting a folder can mean a
 * great many images, and this is the only place between the selection and the
 * work where the run can be called off.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    formSpec,
    defaultAnswers,
    BACKGROUND_NOTE
} = require("../../../src/core/form.js");

test("the form says how many images were found", () => {
    // Selecting a folder can mean a great many, and this is the only place
    // between the selection and the work where the run can be called off.
    assert.equal(
        formSpec(defaultAnswers(), [], 231).detail,
        `231 images. Choose how the pages are built, then create the PDF.\n${BACKGROUND_NOTE}`
    );
    assert.equal(
        formSpec(defaultAnswers(), [], 1).detail,
        `1 image. Choose how the pages are built, then create the PDF.\n${BACKGROUND_NOTE}`
    );
});

test("what the background takes is on the screen, not in a tooltip", () => {
    // The one instruction that separates a control holding four colours from
    // a control that takes any colour was hidden in a tooltip, and a person
    // looking at the form could not tell the second from the first. The
    // presets are named here because the list itself no longer names them.
    const { detail } = formSpec(defaultAnswers(), [], 3);

    assert.match(detail, /any six hex digits/u);
    assert.match(detail, /#FFFFFF white/u);
    assert.match(detail, /#8E79E0 purple/u);
    assert.match(detail, /#204486 dark blue/u);
});

test("a problem to correct replaces the invitation, count or no count", () => {
    // The reason the form came back is what it has to say first.
    assert.equal(
        formSpec(defaultAnswers(), [{ key: "dpi", message: "DPI: not a number" }], 231).detail,
        "DPI: not a number"
    );
});

test("with no count the wording is exactly what it always was", () => {
    assert.equal(
        formSpec(defaultAnswers()).detail,
        `Choose how the pages are built, then create the PDF.\n${BACKGROUND_NOTE}`
    );
});
