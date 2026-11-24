"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

test("a planted export fails even when another module uses the same spelling", async () => {
    const { checkProductionExports } = await import("../../lint/production-exports.mjs");
    const source = new Map([
        ["src/current.js", "module.exports = { live: 1 };"],
        ["src/consumer.js", 'const {live: renamed} = require("./current.js"); const dead = renamed;']
    ]);
    assert.doesNotThrow(() => checkProductionExports(source));
    source.set("src/current.js", "module.exports = { live: 1, dead: 2 };");
    assert.throws(() => checkProductionExports(source), /Unused production exports: src\/current\.js:dead/u);
    source.set("src/current.js", "module.exports = { live: 1 }; module.exports.planted = 2;");
    assert.throws(() => checkProductionExports(source), /Unused production exports: src\/current\.js:planted/u);
});
