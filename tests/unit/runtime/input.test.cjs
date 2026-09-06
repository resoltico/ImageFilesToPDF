"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { inputItemToPosixPath } = require("../../../src/runtime/input.js");

/*
 * Turning a selected item into a path, or deciding it is not one.
 */

test("a POSIX path is used as-is", () => {
    assert.equal(inputItemToPosixPath("/a/b.png"), "/a/b.png");
});

test("a file URL is decoded to a POSIX path", () => {
    assert.equal(inputItemToPosixPath("file:///a/b%20c.png"), "/a/b c.png");
});

test("an item that is not a path resolves to nothing", () => {
    // Not an error: Shortcuts appends a parameters object to every Quick
    // Action input, so this is the ordinary case, and one unrecognisable item
    // must not discard the images beside it.
    assert.equal(inputItemToPosixPath("not-a-path"), "");
    assert.equal(inputItemToPosixPath({}), "");
    assert.equal(inputItemToPosixPath(""), "");
});
