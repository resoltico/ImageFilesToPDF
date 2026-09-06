"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { VERSION } = require("../../../src/core/version.js");

test("the version is a plain semantic version", () => {
    // It is shown to the user and compared against package.json by the gate,
    // so it must be exactly the version and nothing else.
    assert.match(VERSION, /^\d+\.\d+\.\d+$/u);
});
