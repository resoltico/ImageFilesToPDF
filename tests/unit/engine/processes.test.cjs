"use strict";
const assert = require("node:assert/strict");
const { execPath } = require("node:process");
const test = require("node:test");
const { commandSession } = require("../../../src/engine/processes.js");

test("native tools receive invariant locale and timezone settings", async () => {
    const commands = commandSession();
    try {
        const result = await commands.request([execPath, "-p", "JSON.stringify([process.env.LC_ALL, process.env.TZ])"]);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), ["C", "UTC"]);
    } finally { commands.close(); }
});
