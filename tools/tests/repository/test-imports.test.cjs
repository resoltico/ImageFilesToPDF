"use strict";
const assert = require("node:assert/strict");
const { mkdirSync, mkdtempDisposableSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("the product test tree cannot import an adapter copy or use tests/support", async () => {
    const { checkTestImports } = await import("../../lint/test-imports.mjs");
    using fixture = mkdtempDisposableSync(path.join(tmpdir(), "iftp-test-imports-"));
    const tests = path.join(fixture.path, "tests");
    mkdirSync(tests);
    mkdirSync(path.join(fixture.path, "src"));
    writeFileSync(path.join(fixture.path, "package.json"), '{"devDependencies":{"ajv":"1"}}');
    writeFileSync(path.join(fixture.path, "src", "current.js"), 'module.exports = { current: true };');
    const testFile = path.join(tests, "sample.cjs");
    writeFileSync(testFile, 'require("node:assert"); require("ajv"); require("../src/current.js");');
    await assert.doesNotReject(checkTestImports(fixture.path));

    writeFileSync(path.join(tests, "adapter.cjs"), 'module.exports = { retired: true };');
    writeFileSync(testFile, "require ( './adapter.cjs' );");
    await assert.rejects(checkTestImports(fixture.path), /forbidden test import .*adapter/u);
    writeFileSync(testFile, 'require("./" + "adapter.cjs");');
    await assert.rejects(checkTestImports(fixture.path), /imports must use literal paths/u);
    mkdirSync(path.join(tests, "support"));
    await assert.rejects(checkTestImports(fixture.path), /tests\/support must be absent/u);
});
