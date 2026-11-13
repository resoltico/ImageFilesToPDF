"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("host front ends cannot import each other and shared host imports neither", async () => {
    const { checkBoundary } = await import("../../../tools/lint/boundaries.mjs");
    for (const [file, source] of [
        ["src/host/quick-action/a.js", 'require("../command-line/cli.js");'],
        ["src/host/command-line/a.js", 'require("../quick-action/dialogs.js");'],
        ["src/host/a.js", 'require("./quick-action/dialogs.js");'],
        ["src/host/a.js", 'require("./command-line/cli.js");']
    ]) { assert.throws(() => checkBoundary(file, source), /forbidden host interface dependency/u); }
    assert.doesNotThrow(() => checkBoundary("src/host/quick-action/a.js", 'require("./dialogs.js");'));
    assert.doesNotThrow(() => checkBoundary("src/host/command-line/a.js", 'require("../shell.js");'));
});
