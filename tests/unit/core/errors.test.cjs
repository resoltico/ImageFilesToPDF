"use strict";

const { hostError } = require("../../../src/host/cancellation.js");
const assert = require("node:assert/strict");
const test = require("node:test");
const {
    UserCanceled,
    errorMessage,
    isUserCanceled
} = require("../../../src/core/errors.js");

test("errorMessage extracts a message from anything", () => {
    assert.equal(errorMessage(null), "Unknown error");
    assert.equal(errorMessage(undefined), "Unknown error");
    assert.equal(errorMessage(new Error("boom")), "boom");
    assert.equal(errorMessage("plain"), "plain");
    assert.equal(errorMessage({ message: "object" }), "object");
});

test("cancellation is what the interface raised, or what the host reports", () => {
    assert.equal(isUserCanceled(new UserCanceled()), true);
    assert.equal(isUserCanceled(hostError({ errorNumber: -128 })), true, "osascript's own");
});

test("a file named for canceling is not a cancellation", () => {
    // Every per-image failure carries the name of the image it happened to,
    // so reading the message meant a file called "User canceled.jpg" that
    // genuinely failed ended the run silently, with no dialog at all.
    for (const message of [
        "User canceled.jpg: vips: unable to load",
        "User canceled.png: pdfcpu: xref table is corrupt",
        "User canceled."
    ]) {
        assert.equal(isUserCanceled(new Error(message)), false, message);
    }
});

test("isUserCanceled returns false, not a falsy operand", () => {
    // A leaked `null` here would still be falsy, but callers compare against
    // false and the value is reported in diagnostics.
    assert.equal(isUserCanceled(null), false);
    assert.equal(isUserCanceled(new Error("disk full")), false);
    assert.equal(isUserCanceled({ errorNumber: -1 }), false);
});
