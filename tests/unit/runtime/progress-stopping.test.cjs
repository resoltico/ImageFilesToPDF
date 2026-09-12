"use strict";

/*
 * A surface can report two different things by throwing, and only one of them
 * is about the surface.
 *
 * "I could not show this" is not news and is discarded. "The person asked you
 * to stop" is not about the display at all -- the display is merely where it
 * arrived -- and it used to be discarded along with it.
 *
 * Recorded rather than thrown on. Letting it out of the broadcast would
 * unwind the run from wherever the report happened to be made, and one of
 * those places is the middle of a publication, which owns a finished PDF and
 * a name it has claimed.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { UserCancelled } = require("../../../src/core/errors.js");
const {
    createProgress,
    SILENT
} = require("../../../src/runtime/progress.js");

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

function willing(said) {
    return {
        start: () => said.push("start"),
        report: () => said.push("report"),
        pause: () => undefined,
        close: () => undefined
    };
}

function hostCancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

test("a surface that cannot show a report is still not news", () => {
    const said = [];
    const progress = createProgress([throwing(new Error("no bar here")), willing(said)]);

    progress.phase("Preparing");

    assert.equal(progress.stopped(), false);
    assert.deepEqual(said, ["report"], "and the other surface still heard it");
});

test("a stop arriving through a surface is recorded, not thrown on", () => {
    const said = [];
    const progress = createProgress([throwing(hostCancellation()), willing(said)]);

    assert.doesNotThrow(() => progress.phase("Preparing"));
    assert.equal(progress.stopped(), true);
    assert.deepEqual(said, ["report"], "the run carries on to the next boundary");
});

test("our own cancellation is recognised as well as the host's", () => {
    const progress = createProgress([throwing(new UserCancelled())]);

    progress.phase("Preparing");

    assert.equal(progress.stopped(), true);
});

test("a stop wrapped in context is still a stop", () => {
    const wrapped = new Error("while drawing", { cause: hostCancellation() });
    const progress = createProgress([throwing(wrapped)]);

    progress.phase("Preparing");

    assert.equal(progress.stopped(), true);
});

test("once asked to stop, a run stays asked", () => {
    // One report raises it and the next does not; the answer must not go back.
    const progress = createProgress([{
        start: () => undefined,
        report(done) {
            if (done === 0) {
                throw hostCancellation();
            }
        },
        pause: () => undefined,
        close: () => undefined
    }]);

    progress.phase("Preparing");
    assert.equal(progress.stopped(), true);

    progress.finished("Saved");
    assert.equal(progress.stopped(), true, "still stopped");
});

test("nothing to report to is nothing to be stopped by", () => {
    assert.equal(SILENT.stopped(), false);
    assert.equal(createProgress([]).stopped(), false);
});
