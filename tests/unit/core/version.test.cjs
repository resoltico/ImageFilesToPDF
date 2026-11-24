"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { VERSION } = require("../../../src/core/version.js");

test("the version is a plain semantic version", () => {
    // It is shown to the user and compared against package.json by the gate,
    // so it must be exactly the version and nothing else.
    assert.match(VERSION, /^\d+\.\d+\.\d+$/u);
});


test("the runtime floor checks the complete stable release tuple", () => {
    const { supportsNode } = require("../../../src/core/version.js");
    for (const version of ["26.13.1", "v26.13.1", "26.13.2", "26.14.0", "27.0.0"]) { assert.equal(supportsNode(version), true); }
    for (const version of ["20.0.0", "25.15.1", "26.0.0", "26.12.999", "26.13.0", "26.0", "26.13.1-pre", "invalid"]) { assert.equal(supportsNode(version), false); }
});

test("runtime discovery presents each examined executable and leaves absent versions absent", () => {
    const { runtimeUnavailableIssue } = require("../../../src/core/version.js");
    const found = [{ path: "/one/node", version: "24.21.0" }, { path: "/two/node" }];
    const checked = runtimeUnavailableIssue(found);
    assert.deepEqual(checked.params, { minimum: "26.13.1", found });
    assert.match(checked.message, /Found \/one\/node \(Node\.js 24\.21\.0\) and \/two\/node\. See the installation guide .*#macos/u);
    const missing = runtimeUnavailableIssue([]);
    assert.deepEqual(missing.params, { minimum: "26.13.1", found: [] });
    assert.match(missing.message, /^Node\.js 26\.13\.1 or later is required\. See the installation guide .*#macos/u);
});
