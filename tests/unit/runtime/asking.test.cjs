"use strict";

/*
 * A question put to the filesystem, and what a "no" from one is worth.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    isRegularFile,
    isExecutable,
    pathIsTaken,
    verifyFileWritten
} = require("../../../src/runtime/asking.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

test("the file predicates report true when test succeeds", () => {
    const app = createFakeApp();

    assert.equal(isRegularFile(app, "/a.png"), true);
    assert.equal(isExecutable(app, "/bin/vips"), true);
    assert.deepEqual(
        app.commands.map((command) => command.split(" ")[1]),
        ["'-f'", "'-x'"]
    );
});

test("the file predicates report false rather than throwing", () => {
    const app = createFakeApp([["/bin/test", failing("1")]]);

    assert.equal(isRegularFile(app, "/missing"), false);
    assert.equal(isExecutable(app, "/missing"), false);
});

test("a name is taken by an entry, not by a readable target", () => {
    // -e follows a link and reports on its target, so a link whose target is
    // gone reads as nothing at all -- while ln still refuses the name.
    const app = createFakeApp();

    assert.equal(pathIsTaken(app, "/a/out.pdf"), true);
    assert.deepEqual(app.commands, [
        "'/bin/test' '-e' '/a/out.pdf' '-o' '-L' '/a/out.pdf'"
    ]);
});

test("verifyFileWritten names what was missing", () => {
    const app = createFakeApp([["/bin/test", failing("1")]]);

    assert.throws(
        () => verifyFileWritten(app, "/tmp/page.jpg", "prepared page image"),
        /prepared page image is not a file with anything in it/u
    );
});

test("a directory at the output path is not a written file", () => {
    // test -s alone passes a directory: it is how a PDF that mv moved inside
    // a directory at the output path was reported as published.
    const app = createFakeApp();
    const asked = [];

    app.doShellScript = (command) => {
        asked.push(command);

        return "";
    };

    verifyFileWritten(app, "/a/out.pdf", "output PDF");
    assert.deepEqual(asked, [
        "'/bin/test' '-f' '/a/out.pdf' '-a' '-s' '/a/out.pdf'"
    ]);
});
