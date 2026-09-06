"use strict";

/*
 * The shape Shortcuts actually hands to run(), and what flattening it must
 * and must not change.
 *
 * Captured from a diagnostic run as a Finder Quick Action rather than assumed:
 * [[file, file, file, file], parameters].
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeInvocationInput } = require("../../../src/core/invocation.js");

test("the Shortcuts selection arrives nested and is flattened", () => {
    // Measured, not guessed: a Quick Action on four files reported
    // [[file, file, file, file], parameters] -- the selection one level down,
    // followed by an object that is not a file.
    const files = ["/a/1.jpg", "/a/2.jpg", "/a/3.jpg"];
    const parameters = { shortcuts: "metadata" };

    assert.deepEqual(
        normalizeInvocationInput([files, parameters]),
        [...files, parameters]
    );
});

test("one selected file is flattened the same way as several", () => {
    // The bug hid here: String(["/a/1.jpg"]) is "/a/1.jpg" with no comma to
    // join, so a single image worked while several did not.
    assert.deepEqual(
        normalizeInvocationInput([["/a/1.jpg"], {}]),
        ["/a/1.jpg", {}]
    );
});

test("a comma-joined selection is never produced by flattening", () => {
    // What went wrong before: the array stringified to one path-shaped
    // string that passed every check until the filesystem was asked.
    const joined = String(["/a/1.jpg", "/a/2.jpg"]);

    assert.equal(joined, "/a/1.jpg,/a/2.jpg");
    assert.equal(joined.charAt(0), "/", "which is why it looked like a path");

    for (const item of normalizeInvocationInput([["/a/1.jpg", "/a/2.jpg"]])) {
        assert.ok(!String(item).includes(","), `${item} must be one path`);
    }
});

test("nesting deeper than one level is still flattened", () => {
    assert.deepEqual(
        normalizeInvocationInput([[["/a/1.jpg"], ["/a/2.jpg"]]]),
        ["/a/1.jpg", "/a/2.jpg"]
    );
});

test("flattening does not disturb a flat headless argv", () => {
    assert.deepEqual(
        normalizeInvocationInput(["--headless", "/c.json", "/a/1.jpg"]),
        ["--headless", "/c.json", "/a/1.jpg"]
    );
});

test("a separator inside the nesting is still stripped", () => {
    // osascript's "--" arrives before the selection, and after flattening it
    // is once again the first item.
    assert.deepEqual(
        normalizeInvocationInput([["--", "/a/1.jpg"], {}]),
        ["/a/1.jpg", {}]
    );
});
