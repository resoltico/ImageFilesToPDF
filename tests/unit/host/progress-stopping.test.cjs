"use strict";

/*
 * A surface can report two different things by throwing, and only one of them
 * is about the surface.
 *
 * "I could not show this" is not news and is discarded. "The person asked you
 * to stop" is not about the display at all -- the display is merely where it
 * arrived -- and it used to be discarded along with it.
 *
 * Where it then takes effect is one rule: a report of what is about to happen
 * may stop the run, and a report of what has happened may not. The two lists
 * were always the same list, because a report made before the work is made
 * before anything has been produced.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { UserCanceled, isUserCanceled } = require("../../../src/core/errors.js");
const { createProgress } = require("../../../src/host/progress.js");

function hostCancellation() {
    const error = new Error("User canceled.");

    error.errorNumber = -128;

    return error;
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

function willing(said) {
    return {
        start: () => said.push("start"),
        report: (done, description) => said.push(description),
        pause: () => undefined,
        close: () => undefined
    };
}

// A surface that asks to stop once, at the first report it is given.
function stoppingOnce() {
    let asked = false;

    return {
        start: () => undefined,
        report() {
            if (asked) {
                return;
            }

            asked = true;

            throw hostCancellation();
        },
        pause: () => undefined,
        close: () => undefined
    };
}

test("a surface that cannot show a report is still not news", () => {
    const said = [];
    const progress = createProgress([throwing(new Error("no bar here")), willing(said)]);

    assert.doesNotThrow(() => progress.phase("Preparing"));
    assert.deepEqual(said, ["Preparing"], "and the other surface still heard it");
});

test("the report that discovers a stop is the one that acts on it", () => {
    // A host raises at the assignment after the button, so checking before
    // saying would miss it and carry on into the work being announced.
    const progress = createProgress([stoppingOnce()]);

    assert.throws(() => progress.phase("Creating PDF"), isUserCanceled);
});

test("every way of saying what is about to happen stops the run", () => {
    for (const say of [
        (progress) => progress.phase("Saving PDF"),
        (progress) => progress.about("2 images prepared"),
        (progress) => progress.beginning(1, "x.png")
    ]) {
        const progress = createProgress([stoppingOnce()]);

        assert.throws(() => say(progress), isUserCanceled, String(say));
    }
});

test("saying what has happened does not, whatever has been recorded", () => {
    // The work is finished. Unwinding past it would throw away the account of
    // it, and every one of these is followed by the end of the run or by a
    // report that does stop.
    const progress = createProgress([stoppingOnce()]);

    assert.doesNotThrow(() => progress.finished("Saved"));
    assert.doesNotThrow(() => progress.finished("Saved"), "and still does not");
    assert.throws(() => progress.phase("Creating PDF"), isUserCanceled);
});

test("the lifecycle calls never stop the run", () => {
    // close() is called from a finally, where an escape would mask the error
    // already on its way out.
    const progress = createProgress([stoppingOnce()]);

    progress.finished("Saved");
    assert.doesNotThrow(() => {
        progress.expect({ units: 1, images: 1 });
        progress.pause();
        progress.close();
    });
});

test("our own cancellation is recognized as well as the host's", () => {
    const progress = createProgress([throwing(new UserCanceled())]);

    assert.throws(() => progress.phase("Preparing"), isUserCanceled);
});

test("a stop wrapped in context is still a stop", () => {
    const wrapped = new Error("while drawing", { cause: hostCancellation() });
    const progress = createProgress([throwing(wrapped)]);

    assert.throws(() => progress.phase("Preparing"), isUserCanceled);
});

test("nothing to report to is nothing to be stopped by", () => {
    const silent = createProgress([]);

    assert.doesNotThrow(() => {
        silent.phase("Preparing");
        silent.about("1 image prepared");
        silent.beginning(1, "x.png");
    });
});


test("required Stop control runs after announcement and is never treated as an optional observer", () => {
    const events = [];
    let stopped = false;
    const progress = createProgress([{ report: () => events.push("report") }], () => { events.push("poll"); return stopped; });
    progress.phase("Checking");
    assert.deepEqual(events, ["report", "poll"]);
    stopped = true;
    assert.doesNotThrow(() => progress.finished("Finished safely"));
    assert.deepEqual(events, ["report", "poll", "report"]);
    assert.throws(() => progress.phase("Before more work"), UserCanceled);
    stopped = false;
    assert.throws(() => progress.phase("Stop stays latched"), UserCanceled);
    for (const fault of [new TypeError("required controller bug"), new Error("required controller unavailable")]) {
        const broken = createProgress([], () => { throw fault; });
        assert.throws(() => broken.phase("Before work"), (error) => error === fault);
        assert.deepEqual(broken.diagnostics, []);
    }
});
