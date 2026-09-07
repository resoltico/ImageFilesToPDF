"use strict";

/*
 * What the form says before the questions. Selecting a folder can mean a
 * great many images, and this is the only place between the selection and the
 * work where the run can be called off.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { formSpec, defaultAnswers } = require("../../../src/core/form.js");

test("the form says how many images were found", () => {
    // Selecting a folder can mean a great many, and this is the only place
    // between the selection and the work where the run can be called off.
    assert.equal(
        formSpec(defaultAnswers(), [], 231).detail,
        "231 images. Choose how the pages are built, then create the PDF."
    );
    assert.equal(
        formSpec(defaultAnswers(), [], 1).detail,
        "1 image. Choose how the pages are built, then create the PDF."
    );
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
        "Choose how the pages are built, then create the PDF."
    );
});
