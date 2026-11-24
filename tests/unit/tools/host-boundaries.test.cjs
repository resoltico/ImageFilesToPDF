"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("the native entry points cannot import one another", async () => {
    const { checkBoundary } = await import("../../../tools/lint/boundaries.mjs");
    for (const [file, source] of [
        ["src/finder/quick-action/a.js", 'require("../../node/entry.js");'],
        ["src/cli/entry.js", 'require("../host/main.js");'],
        ["src/finder/a.js", 'require("./quick-action/dialogs.js");'],
        ["src/application/a.js", 'require("../node/convert.js");']
    ]) { assert.throws(() => checkBoundary(file, source), /forbidden .*dependency/u); }
    assert.throws(() => checkBoundary("src/engine/a.js", 'require("shelljs");'), /external dependency/u);
    assert.doesNotThrow(() => checkBoundary("src/engine/a.js", 'require("node:fs");'));
});
