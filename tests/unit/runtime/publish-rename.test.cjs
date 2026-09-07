"use strict";

/*
 * The rename that stands in where hard links are unsupported -- FAT-formatted
 * drives, some network shares.
 *
 * It is reached only for a name just found free, because mv replaces what it
 * finds: it checks and then renames, and a link whose target is gone reads as
 * nothing at all to that check. And it concludes nothing itself. It used to
 * be asked whether the staging copy was still there, to tell a rename that
 * happened from one that declined -- a question that answers "gone" when it
 * cannot be put at all, so a refused inspection read as a publication.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";

test("a name that could not be taken says which name it was", () => {
    // Two names are taken in a publication that goes the long way round, and
    // a message naming neither leaves the person reading it no better off.
    // The name is free when publication starts and taken by the time the
    // reservation is made, which is the only way this step is reached.
    const host = createFakeHost({
        files: ["/a/p.pdf", "/a/out.pdf"],
        failures: [
            ["/bin/ln", new Error("ln: unsupported")],
            ["test' '-e' '/a/out.pdf' '-o'", new Error("test failed")]
        ]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /taking the output name/u);
        assert.match(error.message, /cannot overwrite existing file/u);

        return true;
    });
    assert.ok(host.files.has("/a/out.pdf"), "and their file is still there");
    // The copy this run made is cleared away, and nothing else is: the
    // output name was never taken, so there is nothing of ours there.
    const removed = host.commands.filter((command) => command.includes("/bin/rm"));

    assert.equal(removed.length, 1, removed.join("\n"));
    assert.match(removed[0], /\.ImageFilesToPDF-[^']+\.part/u);
});

test("a rename that was refused says which step it was", () => {
    // Two operations can fail while taking the name, and they fail for
    // different reasons: the link because the filesystem cannot make one, the
    // rename because the host refused it. A message naming neither leaves the
    // person reading it no better off.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/ln", new Error("ln: unsupported")], ["/bin/mv", new Error(DENIED)]]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /claiming the output name/u);
        assert.match(error.message, /putting the PDF in place/u);

        return true;
    });
    assert.ok(!host.files.has("/a/out.pdf"), "and the name was never taken");
});

test("a rename that quietly did nothing is not a publication", () => {
    // Where hard links are unsupported the rename is the best that can be
    // done, and mv -n exits zero when it declines. What settles it is which
    // file the output path holds afterwards -- asking whether the staging
    // copy was still there answered "gone" when the question could not be put
    // at all, and a refused inspection read as a publication.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            ["/bin/ln", new Error(DENIED)],
            ["mv' '/a/.ImageFilesToPDF", ""]
        ]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /does not hold the PDF this run published/u);

        return true;
    });
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "and the finished PDF is kept"
    );
});
