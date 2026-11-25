"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/overrides.mjs");

test("exact, caret and tilde ranges are read as npm reads them", async () => {
    const { satisfies } = await load();
    assert.equal(satisfies("6.17.1", "6.15.1"), false);
    assert.equal(satisfies("6.15.1", "6.15.1"), true);
    assert.equal(satisfies("11.0.8", "~10.2.4"), false);
    assert.equal(satisfies("10.2.9", "~10.2.4"), true);
    assert.equal(satisfies("10.3.0", "~10.2.4"), false);
    assert.equal(satisfies("11.0.8", "^11.0.5"), true);
    assert.equal(satisfies("11.0.4", "^11.0.5"), false);
    assert.equal(satisfies("12.0.0", "^11.0.5"), false);
    assert.equal(satisfies("0.3.9", "^0.3.1"), true);
    assert.equal(satisfies("0.4.0", "^0.3.1"), false);
    assert.throws(() => satisfies("1.0.0", ">=1.0.0", "node_modules/x"), /node_modules\/x: unsupported range form >=1\.0\.0/u);
});

const lock = (ranges) => ({ packages: { "": {}, ...Object.fromEntries(ranges.map(([owner, range]) => [owner, { dependencies: { pkg: range } }])) } });

test("an override must be excluded by some dependent and documented", async () => {
    const { overrideProblems } = await load();
    const manifest = { overrides: { pkg: "2.0.0" } };
    const documented = "The `pkg` override addresses an advisory.";
    assert.deepEqual(overrideProblems(manifest, lock([["node_modules/a", "^1.0.0"], ["node_modules/b", "^2.0.0"]]), documented), []);
    assert.deepEqual(overrideProblems(manifest, lock([["node_modules/b", "^2.0.0"]]), documented),
        ["override pkg@2.0.0 is already accepted by every dependent; remove it"]);
    assert.deepEqual(overrideProblems(manifest, lock([]), documented), ["override pkg has no dependent"]);
    assert.deepEqual(overrideProblems(manifest, lock([["node_modules/a", "^1.0.0"]]), "nothing here"),
        ["override pkg is not documented in CONTRIBUTING.md"]);
});
