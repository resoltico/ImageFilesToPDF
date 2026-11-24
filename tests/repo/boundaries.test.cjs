"use strict";
const test = require("node:test");
test("actual production dependency graph satisfies the enforced boundaries", async () => {
    const { checkBoundaries } = await import("../../tools/lint/boundaries.mjs");
    await checkBoundaries();
});

test("the Finder, CLI and serve boundaries reject dependencies on peer adapters", async () => {
    const assert = require("node:assert/strict");
    const { checkBoundary } = await import("../../tools/lint/boundaries.mjs");
    const { checkCompiledDependencies } = await import("../../tools/dependency-rules.mjs");
    for (const [source, required] of [
        ["src/finder/client.js", "../application/workflow.js"],
        ["src/finder/client.js", "../backend/commands.js"],
        ["src/finder/client.js", "../engine/convert.js"],
        ["src/finder/client.js", "../cli/entry.js"],
        ["src/finder/client.js", "../serve/entry.js"],
        ["src/cli/request.js", "../serve/serve.js"],
        ["src/serve/serve.js", "../cli/transport.js"],
        ["src/core/protocol.js", "../serve/serve.js"]
    ]) {
        const path = require("node:path").posix;
        assert.throws(() => checkBoundary(source, `require("${required}");`), /forbidden dependency/u);
        const to = path.normalize(path.join(path.dirname(source), required));
        assert.throws(() => checkCompiledDependencies([{ from: source, to }]), /forbidden dependency/u);
    }
});
