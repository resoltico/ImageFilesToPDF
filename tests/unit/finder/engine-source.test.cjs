"use strict";

/*
 * The Finder build puts the engine into the action as a global; the engine
 * source is that value, read when the action loads.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

test("the embedded engine is the one the build put in place", () => {
    const source = require.resolve("../../../src/finder/quick-action/engine-source.js");
    const embedded = { filename: "engine-test.cjs", source: "" };
    delete require.cache[source];
    globalThis.iftpEmbeddedEngine = embedded;
    try { assert.equal(require("../../../src/finder/quick-action/engine-source.js").engineBundle, embedded); }
    finally {
        delete globalThis.iftpEmbeddedEngine;
        delete require.cache[source];
    }
});
