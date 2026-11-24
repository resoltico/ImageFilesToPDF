"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { exitCode } = require("../../../src/cli/exit-code.js");

test("the CLI refuses to attach an exit status to an undeclared outcome", () => {
    assert.throws(() => exitCode({ state: "future" }), /Unknown run outcome: future/u);
});
