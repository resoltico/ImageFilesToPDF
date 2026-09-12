"use strict";

/*
 * A cancellation a caller caught for itself, rather than one a surface raised.
 *
 * Publication catches its own: by the time anything there runs, the PDF is
 * built and validated and one operation from the person's folder, and
 * unwinding to honour a button would throw that away. So it is recorded and
 * the run stops at the next image instead.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const { createProgress } = require("../../../src/runtime/progress.js");

function hostCancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

function willing() {
    return {
        start: () => undefined,
        report: () => undefined,
        pause: () => undefined,
        close: () => undefined
    };
}

function throwing(error) {
    return {
        start: () => undefined,
        report() {
            throw error;
        },
        pause: () => undefined,
        close: () => undefined
    };
}

test("a cancellation a caller caught for itself is recorded", () => {
    // Publication catches its own and must not unwind, so it says so instead.
    const progress = createProgress([willing()]);

    progress.interrupted(new Error("while copying", { cause: hostCancellation() }));

    assert.throws(() => progress.phase("Preparing"), isUserCancelled);
});

test("an ordinary failure a caller caught is not a stop", () => {
    const progress = createProgress([willing()]);

    progress.interrupted(new Error("the disk is full"));

    assert.doesNotThrow(() => progress.phase("Preparing"));
});

test("recording an interruption never raises", () => {
    // It is called from inside a catch that is about to return an ordinary
    // failure. Raising there would replace that failure with an unrelated one
    // in the middle of a publication.
    const progress = createProgress([throwing(hostCancellation())]);

    for (const value of [hostCancellation(), new Error("x"), null, undefined]) {
        assert.doesNotThrow(() => progress.interrupted(value), String(value));
    }
});
