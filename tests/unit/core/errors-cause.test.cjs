"use strict";

/*
 * The failing command is carried by the innermost error alone, and every
 * layer that adds context wraps it as a cause. Finding it means walking that
 * chain — and a chain is exactly the shape that can be a cycle.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    UserCancelled,
    commandOf,
    describeForLog
} = require("../../../src/core/errors.js");

function wrap(error, layers) {
    let wrapped = error;

    for (let depth = 0; depth < layers; depth += 1) {
        wrapped = new Error(`layer ${depth}`, { cause: wrapped });
    }

    return wrapped;
}

test("a cause that refers back to itself cannot spin", () => {
    // Bounded rather than trusted: a cycle here would hang the run while it
    // was trying to report a failure.
    const first = new Error("first");
    const second = new Error("second", { cause: first });

    first.cause = second;

    assert.equal(describeForLog(second), "second");
});

test("the command is found however deeply it is wrapped", () => {
    const root = Object.assign(new Error("root"), { command: "'/bin/mv'" });

    assert.equal(commandOf(wrap(root, 5)), "'/bin/mv'");
    assert.equal(commandOf(new Error("no command")), "");
});

test("the walk stops at the depth it says it stops at", () => {
    // The bound is what makes a cycle harmless, so it is asserted from both
    // sides: one layer inside it the command is still found, one layer past
    // it the log loses the command rather than the run losing its answer.
    const root = Object.assign(new Error("root"), { command: "'/bin/cp'" });

    assert.equal(commandOf(wrap(root, 7)), "'/bin/cp'", "the last layer within reach");
    assert.equal(commandOf(wrap(root, 8)), "", "one layer too far");
});

test("a cancellation says what it is in a log", () => {
    // It reaches stderr in headless runs, where "UserCancelled: User
    // cancelled." says which of the two it was and "Error:" does not.
    const cancelled = new UserCancelled();

    assert.equal(cancelled.name, "UserCancelled");
    assert.equal(String(cancelled), "UserCancelled: User cancelled.");
});
