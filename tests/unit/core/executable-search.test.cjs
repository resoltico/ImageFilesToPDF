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
    const tied = [["4-b", "/b"], ["04-b", "/duplicate-name-rank"], ["4-a", "/a"]];
    for (const entries of [tied, [...tied].reverse()]) {
        assert.deepEqual(searchDirectories({
            systemPaths: { defaults: "", fragments: Object.fromEntries(entries) },
            conventional: []
        }), ["/a", "/duplicate-name-rank", "/b"]);
    }
});

test("a remembered macOS location must be absolute and free of NUL", () => {
    assert.equal(absoluteMacPath("/With spaces/node"), true);
    for (const value of ["~/node", "relative", "", "/path\0invalid", null]) {
        assert.equal(absoluteMacPath(value), false);
    }
});

test("the system path files are macOS's own, and only a leading number orders them", () => {
    const { SYSTEM_PATHS, SYSTEM_FRAGMENTS } = require("../../../src/core/executable-search.js");
    assert.deepEqual([SYSTEM_PATHS, SYSTEM_FRAGMENTS], ["/etc/paths", "/etc/paths.d"]);
    const order = (names) => searchDirectories({ systemPaths: { defaults: "", fragments: Object.fromEntries(names.map((name) => [name, `/${name}`])) }, conventional: [] });
    assert.deepEqual(order(["b2", "a10"]), ["/a10", "/b2"]);
    assert.deepEqual(order(["x-10", "x-9"]), ["/x-10", "/x-9"]);
    // A number later in a name is not a prefix: "x1" sorts by text after "5y".
    assert.deepEqual(order(["x1", "5y"]), ["/5y", "/x1"]);
    assert.deepEqual(order(["5y", "x1"]), ["/5y", "/x1"]);
});
