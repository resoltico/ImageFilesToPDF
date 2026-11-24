"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { absoluteMacPath, searchDirectories } = require("../../../src/core/executable-search.js");

test("Finder paths follow system file order, then unique conventional directories", () => {
    const systemPaths = {
        defaults: " /system/bin \n\nrelative\n~/.local/bin\n/usr/local/bin",
        fragments: {
            zebra: "/last\n/system/bin",
            "10-b": "/ten-b",
            "10-a": "/ten-a",
            "2-runtimes": "/first path",
            helpers: "/helper/bin\n/path\0invalid"
        }
    };
    assert.deepEqual(searchDirectories({ systemPaths }), [
        "/system/bin", "/usr/local/bin", "/first path", "/ten-a", "/ten-b", "/helper/bin", "/last",
        "/opt/homebrew/bin", "/opt/local/bin"
    ]);
    assert.deepEqual(searchDirectories({ systemPaths: { defaults: "", fragments: {} }, conventional: ["/custom"] }), ["/custom"]);
    assert.deepEqual(searchDirectories({
        systemPaths: { defaults: "", fragments: { "4-b": "/b", "04-b": "/duplicate-name-rank", "4-a": "/a" } },
        conventional: []
    }), ["/a", "/b", "/duplicate-name-rank"]);
});

test("a remembered macOS location must be absolute and free of NUL", () => {
    assert.equal(absoluteMacPath("/With spaces/node"), true);
    for (const value of ["~/node", "relative", "", "/path\0invalid", null]) {
        assert.equal(absoluteMacPath(value), false);
    }
});
