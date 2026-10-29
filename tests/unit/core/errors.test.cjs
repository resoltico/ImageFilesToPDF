"use strict";

const { hostError } = require("../../../src/runtime/cancellation.js");
const assert = require("node:assert/strict");
const test = require("node:test");
const {
    UserCancelled,
    errorMessage,
    isUserCancelled
} = require("../../../src/core/errors.js");

test("errorMessage extracts a message from anything", () => {
    assert.equal(errorMessage(null), "Unknown error");
    assert.equal(errorMessage(undefined), "Unknown error");
    assert.equal(errorMessage(new Error("boom")), "boom");
    assert.equal(errorMessage("plain"), "plain");
    assert.equal(errorMessage({ message: "object" }), "object");
});

test("cancellation is what the interface raised, or what the host reports", () => {
    assert.equal(isUserCancelled(new UserCancelled()), true);
    assert.equal(isUserCancelled(hostError({ errorNumber: -128 })), true, "osascript's own");
});

test("a file named for cancelling is not a cancellation", () => {
    // Every per-image failure carries the name of the image it happened to,
    // so reading the message meant a file called "User cancelled.jpg" that
    // genuinely failed ended the run silently, with no dialog at all.
    for (const message of [
        "User cancelled.jpg: vips: unable to load",
        "User canceled.png: pdfcpu: xref table is corrupt",
        "User cancelled."
    ]) {
        assert.equal(isUserCancelled(new Error(message)), false, message);
    }
});

test("isUserCancelled returns false, not a falsy operand", () => {
    // A leaked `null` here would still be falsy, but callers compare against
    // false and the value is reported in diagnostics.
    assert.equal(isUserCancelled(null), false);
    assert.equal(isUserCancelled(new Error("disk full")), false);
    assert.equal(isUserCancelled({ errorNumber: -1 }), false);
});
