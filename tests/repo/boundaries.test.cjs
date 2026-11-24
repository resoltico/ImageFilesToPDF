"use strict";
const test = require("node:test");
test("actual production dependency graph satisfies the enforced boundaries", async () => {
    const { checkBoundaries } = await import("../../tools/lint/boundaries.mjs");
    await checkBoundaries();
});

test("the Finder, CLI and serve boundaries reject dependencies on peer adapters", async () => {
    const assert = require("node:assert/strict");
    const { checkBoundary } = await import("../../tools/lint/boundaries.mjs");
    for (const [source, required] of [
        ["src/host/client.js", "../application/workflow.js"],
        ["src/host/client.js", "../backend/commands.js"],
        ["src/host/client.js", "../engine/convert.js"],
        ["src/host/client.js", "../cli/entry.js"],
        ["src/host/client.js", "../serve/entry.js"],
        ["src/cli/request.js", "../serve/serve.js"],
        ["src/serve/serve.js", "../cli/transport.js"],
        ["src/core/protocol.js", "../serve/serve.js"]
    ]) { assert.throws(() => checkBoundary(source, `require("${required}");`), /forbidden dependency/u); }
});
