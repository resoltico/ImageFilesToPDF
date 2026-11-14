"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readdirSync, readFileSync } = require("node:fs");
const root = path.resolve(__dirname, "../..");

// A test of an adapter may use inner-layer values as fixtures. The outermost
// production layer it imports owns the test, including mixed-layer contracts.
const LAYERS = ["core", "backend", "application", "host"];

function testedLayer(source, file) {
    const imports = [...source.matchAll(/(?:require(?:\.resolve)?|import)\s*\(\s*["'](?<target>\.[^"']+)["']\s*\)/gu)];
    const layers = imports.map((match) => path.relative(path.join(root, "src"),
        path.resolve(path.dirname(file), match.groups.target)).split(path.sep)[0]);
    return LAYERS.findLast((layer) => layers.includes(layer));
}

test("unit tests belong to the outermost production layer they import", () => {
    const unit = path.join(root, "tests/unit");
    const misplaced = readdirSync(unit, { recursive: true }).filter((file) => file.endsWith(".test.cjs"))
        .filter((file) => {
            const absolute = path.join(unit, file);
            const layer = testedLayer(readFileSync(absolute, "utf8"), absolute);
            return layer && file.split(path.sep)[0] !== layer;
        });
    assert.deepEqual(misplaced, []);
});

test("test placement recognizes mixed contracts and misplaced adapters", () => {
    const file = path.join(root, "tests/unit/core/example.test.cjs");
    assert.equal(testedLayer('require("../../../src/core/settings.js")', file), "core");
    assert.equal(testedLayer('require("../../../src/core/settings.js"); require("../../../src/host/input.js")', file), "host");
    assert.equal(testedLayer('require("../../../src/backend/commands.js"); require("../../../src/core/settings.js")', file), "backend");
    assert.equal(testedLayer('require("../../../src/application/run.js"); require("../../../src/backend/commands.js")', file), "application");
    assert.equal(testedLayer('require("../../../src/core/settings.js"); await import("../../../src/host/input.js")', file), "host");
    assert.equal(testedLayer("import ( '../../../src/backend/commands.js' )", file), "backend");
    assert.equal(testedLayer('require("../../../src/core/errors.js"); require.resolve("../../../src/host/main.js")', file), "host");
    assert.equal(testedLayer('require("../../../tools/build.mjs")', file), undefined);
});
