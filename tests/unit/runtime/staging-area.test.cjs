"use strict";

/*
 * A place of this run's own in the output folder.
 *
 * Made rather than found. mkdir either creates the directory or fails, and it
 * fails for anything already at that name -- measured against a file, a
 * folder, a link and a named pipe. Taking a name by opening it is not the
 * same: the shell's noclobber redirection accepted a link pointing at
 * /dev/null without creating anything, so the run recorded a name it did not
 * own, and on a named pipe it waited for a reader that never came.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    stagingArea,
    openStaging,
    closeStaging
} = require("../../../src/runtime/staging-area.js");
const { createFakeHost } = require("./fake-host.cjs");

test("the place is hidden, beside the destination, and named for this run", () => {
    const area = stagingArea("/a/holiday.pdf");

    assert.match(area.directory, /^\/a\/\.ImageFilesToPDF-[\d-]+$/u);
    assert.equal(area.file, `${area.directory}/ready.pdf`);
});

test("making it is one operation that either creates it or fails", () => {
    const host = createFakeHost({ files: [] });
    const area = stagingArea("/a/out.pdf");

    openStaging(host, area);

    assert.equal(host.commands.at(-1), `'/bin/mkdir' '${area.directory}'`);
});

test("anything already at that name refuses it, whatever kind of thing it is", () => {
    const area = stagingArea("/a/out.pdf");

    for (const settings of [
        { files: [area.directory] },
        { directories: [area.directory] },
        { danglingLinks: [area.directory] }
    ]) {
        assert.throws(
            () => openStaging(createFakeHost(settings), area),
            /File exists/u,
            JSON.stringify(settings)
        );
    }
});

test("clearing it away takes what is in it and then the place itself", () => {
    const host = createFakeHost({ files: [] });
    const area = stagingArea("/a/out.pdf");

    openStaging(host, area);
    host.files.add(area.file);
    closeStaging(host, area);

    assert.ok(!host.files.has(area.file));
    assert.deepEqual(
        host.commands.slice(-2),
        [`'/bin/rm' '-f' '${area.file}'`, `'/bin/rmdir' '${area.directory}'`]
    );
});

test("a place something else has written into is left standing", () => {
    // rmdir removes an empty directory and refuses one that is not, so
    // clearing away can never take something with it.
    const host = createFakeHost({ files: [] });
    const area = stagingArea("/a/out.pdf");

    openStaging(host, area);
    host.files.add(`${area.directory}/theirs.pdf`);

    assert.doesNotThrow(() => closeStaging(host, area));
    assert.ok(
        host.files.has(`${area.directory}/theirs.pdf`),
        "what somebody else put there survives"
    );
});
