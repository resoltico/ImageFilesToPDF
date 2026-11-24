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
    mkdirSync(path.join(fixture.path, "tools/tests"), { recursive: true });
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

test("only the declared build entry is available to native harnesses and moving tests cannot hide adapter copies", async () => {
    const { checkTestImports } = await import("../../lint/test-imports.mjs");
    using fixture = mkdtempDisposableSync(path.join(tmpdir(), "iftp-test-imports-"));
    const file = (relative) => path.join(fixture.path, relative);
    mkdirSync(file("tests/integration"), { recursive: true });
    mkdirSync(file("tools/tests"), { recursive: true });
    mkdirSync(file("tools/lint"), { recursive: true });
    writeFileSync(file("package.json"), '{"devDependencies":{}}');
    writeFileSync(file("tools/embedded-engine.mjs"), "export {};");
    writeFileSync(file("tools/adapter.mjs"), "export {};");
    writeFileSync(file("tools/lint/adapter.mjs"), "export {};");
    writeFileSync(file("tools/tests/adapter.cjs"), "module.exports = {};");
    const native = file("tests/integration/harness.cjs");
    writeFileSync(native, 'import("../../tools/embedded-engine.mjs");');
    await assert.doesNotReject(checkTestImports(fixture.path));
    writeFileSync(native, 'import("../../tools/adapter.mjs");');
    await assert.rejects(checkTestImports(fixture.path), /forbidden test import .*adapter\.mjs/u);
    writeFileSync(native, 'import("../../tools/embedded-engine.mjs");');
    writeFileSync(file("tools/tests/harness.cjs"), 'require("./adapter.cjs");');
    await assert.rejects(checkTestImports(fixture.path), /tools\/tests\/harness\.cjs: forbidden test import .*adapter\.cjs/u);
    writeFileSync(file("tools/tests/harness.cjs"), 'import("../lint/adapter.mjs");');
    await assert.rejects(checkTestImports(fixture.path), /tools\/tests\/harness\.cjs: forbidden test import .*adapter\.mjs/u);
});
