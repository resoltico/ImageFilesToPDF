"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const commandLengthOf = (argv) => argv.reduce((bytes, value) => bytes + Buffer.byteLength(value) + 1, 0);
const { buildHeaderArgv, buildFieldArgv, headerGroups: groupHeaders } = require("../../../src/backend/headers.js");

const headerGroups = (tool, paths, budget = 131072) => groupHeaders(tool, paths, (args) => commandLengthOf(args) <= budget);

test("header commands preserve complete paths and field requests", () => {
    assert.deepEqual(buildHeaderArgv("header", ["/a b.png", "/c.jpg"]), ["header", "-a", "/a b.png", "/c.jpg"]);
    assert.deepEqual(buildFieldArgv("header", "orientation", ["/a b.png"]), ["header", "-f", "orientation", "/a b.png"]);
});

test("ordinary paths share a batch, while newline/CR names are isolated", () => {
    assert.deepEqual(headerGroups("header", []), []);
    assert.deepEqual(headerGroups("header", ["/a.png", "/b.jpg"]), [["/a.png", "/b.jpg"]]);
    assert.deepEqual(headerGroups("header", ["/a.png", "/new\nline.png", "/new\rline.jpg", "/b.jpg"]), [["/a.png"], ["/new\nline.png"], ["/new\rline.jpg"], ["/b.jpg"]]);
    assert.deepEqual(headerGroups("header", ["/new\nline.png"]), [["/new\nline.png"]]);
});

test("header budgeting covers optional-field prefixes and refuses an oversized argument", () => {
    assert.throws(() => headerGroups("header", ["/a.png"], 1), /exceeds the command budget/u);
    // Include the longest optional-field prefix and the argument terminators.
    assert.deepEqual(headerGroups("header", ["/a.png", "/b.png"], 34), [["/a.png"], ["/b.png"]]);
});

test("a command exactly at the byte budget stays grouped and one oversized path is refused", () => {
    assert.deepEqual(headerGroups("header", ["/a.png", "/b.png"], 41), [["/a.png", "/b.png"]]);
    assert.throws(() => headerGroups("header", ["/long.png"], 34), /exceeds/u);
});
