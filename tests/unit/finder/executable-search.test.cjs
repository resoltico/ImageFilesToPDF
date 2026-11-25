"use strict";

/*
 * The Finder reads macOS's path files through Foundation, as regular files
 * only, before the core decides the search order.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { finderDirectories } = require("../../../src/finder/quick-action/executable-search.js");

test("system path files are read, and anything but a regular file counts as empty", () => {
    const foundation = createFoundation({ directories: ["/etc/paths.d"], files: {
        "/etc/paths": "/usr/local/bin\n/usr/bin\n",
        "/etc/paths.d/10-tools": "/opt/tools/bin\n",
        "/etc/paths.d/20-link": { content: "/linked/bin\n", type: "NSFileTypeSymbolicLink" }
    } });
    const found = withFoundation(foundation, () => finderDirectories());
    assert.deepEqual(found, ["/usr/local/bin", "/usr/bin", "/opt/tools/bin", "/opt/homebrew/bin", "/opt/local/bin"]);
    assert.ok(foundation.state.imports.includes("Foundation"));
});

test("missing path files leave only the conventional directories", () => {
    const found = withFoundation(createFoundation(), () => finderDirectories());
    assert.deepEqual(found, ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]);
});

test("a path file that cannot be read as text counts as empty", () => {
    const foundation = createFoundation({ files: { "/etc/paths": { content: "/hidden/bin\n", unreadable: true } } });
    assert.deepEqual(withFoundation(foundation, () => finderDirectories()), ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]);
});
