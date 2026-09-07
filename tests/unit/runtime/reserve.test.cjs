"use strict";

/*
 * Taking a name before anything is written to it.
 *
 * This is where the promise not to overwrite anything comes from, and it is
 * the only ownership fact the publication has. Checking that a name looked
 * free is not the same thing: what was under it then had to be inferred from
 * how the next command turned out, and a copy refused because another program
 * had taken the name in the meantime was read as this run having made it --
 * so cleanup deleted their file.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { reserveName } = require("../../../src/runtime/reserve.js");
const { createFakeHost } = require("./fake-host.cjs");

test("a free name is taken, as an empty file", () => {
    const host = createFakeHost({ files: [] });

    reserveName(host, "/a/out.pdf", "taking the output name");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.equal(host.sizes.get("/a/out.pdf"), 0);
});

test("the shell is asked for an exclusive create, with the path as an argument", () => {
    // noclobber is O_CREAT|O_EXCL, which is the one exclusive create reachable
    // from here. The script is a constant and the path is an argument to it,
    // so nothing is assembled by concatenation.
    const host = createFakeHost({ files: [] });

    reserveName(host, "/a/out.pdf", "taking the output name");

    assert.equal(
        host.commands.at(-1),
        "'/bin/sh' '-c' 'set -C; : > \"$0\"' '/a/out.pdf'"
    );
});

test("a name that is not free is refused, and says which step it was", () => {
    // Measured against the real thing: a file, a folder and a link whose
    // target is gone are all refused, on APFS and on a FAT-formatted volume
    // alike.
    const host = createFakeHost({
        files: ["/a/theirs.pdf"],
        directories: ["/a/folder"],
        danglingLinks: ["/a/link.pdf"]
    });

    for (const path of ["/a/theirs.pdf", "/a/folder", "/a/link.pdf"]) {
        assert.throws(
            () => reserveName(host, path, "taking the output name"),
            /taking the output name/u,
            path
        );
    }
});

test("a host that refuses the shell is a refusal, not a name taken", () => {
    const host = createFakeHost({
        files: [],
        failures: [["/bin/sh", new Error("Operation not permitted")]]
    });

    assert.throws(
        () => reserveName(host, "/a/out.pdf", "taking the output name"),
        /Operation not permitted/u
    );
    assert.ok(!host.files.has("/a/out.pdf"));
});
