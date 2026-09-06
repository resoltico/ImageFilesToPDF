"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY
} = require("../../../src/core/choices.js");

/*
 * What each control is called, in each of the two places it appears.
 *
 * A dialog prompt is the whole question, because it is the only text on
 * screen. A form label sits beside its control, where a question is too long:
 * the quality prompt renders 230 points against a 175 point column and was
 * clipped to "JPEG quality (1-100, 90-95".
 */

test("every control has a form label as well as a dialog prompt", () => {
    // The two front ends name the same setting differently on purpose: a
    // prompt is a whole question, a label sits beside its control. Neither
    // may be empty, and a label may not quietly become the prompt again.
    const controls = [
        [PAPER_SIZE, "Paper size:"],
        [ORIENTATION, "Orientation:"],
        [OUTPUT_MODE, "Output:"],
        [BACKGROUND, "Page background:"],
        [RESOLUTION, "Resolution:"],
        [QUALITY, "JPEG quality:"]
    ];

    for (const [control, label] of controls) {
        assert.equal(control.label, label);
        assert.ok(control.prompt.length > 0, `${label} has no prompt`);
    }
});

test("the numeric controls state their bounds beside the field, not in the name", () => {
    assert.equal(RESOLUTION.hint, "72–1041 DPI");
    assert.equal(QUALITY.hint, "1–100, 90–95 is typical");

    for (const control of [RESOLUTION, QUALITY]) {
        assert.ok(
            !control.label.includes("–"),
            `${control.label} carries a range that belongs in the hint`
        );
    }
});
