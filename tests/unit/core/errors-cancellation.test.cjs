"use strict";

/*
 * Cancellation read through the chain rather than off the top.
 *
 * Every layer that adds context wraps the error it was given as a cause, so a
 * cancellation wrapped once stopped being one: the outermost error is a plain
 * Error about the stage that was running, and asking it alone turns a
 * deliberate stop into a photograph that failed to convert. commandOf has
 * always read the chain for exactly this reason.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    UserCancelled,
    isUserCancelled
} = require("../../../src/core/errors.js");

function wrap(error, depth) {
    let current = error;

    for (let at = 0; at < depth; at += 1) {
        current = new Error(`layer ${at}`, { cause: current });
    }

    return current;
}

function hostCancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

test("a cancellation is one however many layers are over it", () => {
    for (const depth of [0, 1, 2, 5]) {
        assert.equal(isUserCancelled(wrap(new UserCancelled(), depth)), true, `own, ${depth}`);
        assert.equal(isUserCancelled(wrap(hostCancellation(), depth)), true, `host, ${depth}`);
    }
});

test("an ordinary failure stays ordinary however deep it is", () => {
    for (const depth of [0, 1, 5]) {
        assert.equal(isUserCancelled(wrap(new Error("broke"), depth)), false, String(depth));
    }

    // A number that is not the one. Reading it loosely would end runs in
    // silence for failures that deserved a dialog.
    const nearly = new Error("nearly");

    nearly.errorNumber = 128;
    assert.equal(isUserCancelled(nearly), false);
});

test("nothing is not a cancellation", () => {
    for (const value of [null, undefined, 0, ""]) {
        assert.equal(isUserCancelled(value), false, String(value));
    }
});

test("the walk is bounded, and the bound is where it says it is", () => {
    // Buried beyond the depth this code wraps to, a cancellation is not found
    // -- which is the price of a bound, and the bound is what stops a cause
    // that refers back to itself from spinning forever. Both sides of it are
    // pinned, because a bound nothing stands on either edge of is a number
    // that can drift.
    const DEEPEST = 7;

    assert.equal(isUserCancelled(wrap(new UserCancelled(), DEEPEST)), true, "at the bound");
    assert.equal(
        isUserCancelled(wrap(new UserCancelled(), DEEPEST + 1)),
        false,
        "one link past it"
    );
    assert.equal(isUserCancelled(wrap(new UserCancelled(), 20)), false);

    const circular = new Error("round");

    circular.cause = circular;
    assert.equal(isUserCancelled(circular), false, "and it terminates");
});

test("a cancellation the runtime wraps the way it really wraps them", () => {
    // What runArgv and withImageName actually build, rather than a fixture
    // shaped to pass: a message about the stage, the original underneath.
    const inner = hostCancellation();
    const command = new Error("Command failed while preparing the image.", {
        cause: inner
    });
    const named = new Error(`photo.png: ${command.message}`, { cause: command });

    assert.equal(isUserCancelled(named), true);
});
