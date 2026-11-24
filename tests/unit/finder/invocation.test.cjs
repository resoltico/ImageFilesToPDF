"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeInvocationInput } = require("../../../src/finder/invocation-syntax.js");

test("the envelope preserves literal filenames while flattening without editing the input", () => {
    assert.deepEqual(normalizeInvocationInput(undefined), []);
    assert.deepEqual(normalizeInvocationInput(null), []);
    assert.deepEqual(normalizeInvocationInput("/a.png"), ["/a.png"]);
    const original = [["--", "/a/x.png"], {}];
    assert.deepEqual(normalizeInvocationInput(original), ["--", "/a/x.png", {}]);
    assert.deepEqual(original, [["--", "/a/x.png"], {}]);
});
