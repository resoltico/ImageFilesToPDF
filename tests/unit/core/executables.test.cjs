"use strict";

/*
 * The list is the boundary. A binary that is exported but missing from it is
 * one the repository check will not know to look for, and the check reports
 * agreement either way — so the list is asserted against the module itself
 * rather than against a copy of what it is supposed to say.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const executables = require("../../../src/core/executables.js");

const { EXECUTABLES, ...tools } = executables;

test("every executable the module names is in the list", () => {
    assert.deepEqual(
        [...EXECUTABLES].sort(),
        Object.values(tools).sort(),
        "an executable exported but not listed is outside the boundary"
    );
});

test("the list names executables and nothing else", () => {
    assert.notEqual(EXECUTABLES.length, 0, "an empty surface is not a surface");

    for (const path of EXECUTABLES) {
        assert.match(path, /^\/(?:bin|usr\/bin)\/[a-z]+$/u, path);
    }
});

test("nothing is named twice", () => {
    assert.equal(new Set(EXECUTABLES).size, EXECUTABLES.length);
});
