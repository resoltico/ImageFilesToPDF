"use strict";

/*
 * Measuring a file, which is the whole basis for trusting a copy.
 *
 * A copy is not atomic, so a file at the staging name proves nothing about
 * whether it is complete. Comparing sizes is what settles it -- provided a
 * size that cannot be read is never mistaken for one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { fileSize, copyBeside } = require("../../../src/runtime/output-copy.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DIRECT_CLAIM = "ln' '/a/p.pdf'";
const STAGING_SIZE = "stat' '-f%z' '/a/.ImageFilesToPDF";
const INCOMING = "/a/.ImageFilesToPDF-test.part";

test("a size that cannot be read is not mistaken for a size", () => {
    // stat can succeed and still say something unusable. Treating that as a
    // number would let a nonsense size compare equal to another nonsense one.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", "not a number"]]
    });

    assert.equal(fileSize(host, "/a/p.pdf"), -1);
});

test("a size that could not be asked for at all is not a size either", () => {
    // stat can be refused outright. Returning nothing rather than "unknown"
    // would let two files neither of which could be measured compare equal.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });

    assert.equal(fileSize(host, "/a/p.pdf"), -1);
});

test("the size is asked for in the one format that yields bytes", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    fileSize(host, "/a/p.pdf");

    assert.match(
        host.commands.find((command) => command.includes("stat")),
        /'\/usr\/bin\/stat' '-f%z' '\/a\/p\.pdf'/u
    );
});

test("an unmeasurable source is never copied successfully", () => {
    // If the source size is unknown there is nothing to check the copy
    // against, so it cannot be treated as safely in the folder.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING);

    assert.equal(outcome.made, true, "the copy was made, so it is ours to remove");
    assert.match(outcome.reasons[0], /-1 were expected/u);
});

test("a truncated copy is a failure, not a publication", () => {
    // Only the copy measures short, as a half-written file would.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[DIRECT_CLAIM, new Error("Operation not permitted")], [STAGING_SIZE, "7"]]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /7 bytes where 1024 were expected/u
    );
    assert.ok(!host.files.has("/a/out.pdf"), "the output name is never reached");
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".part")),
        [],
        "and the half-written copy is gone"
    );
});

test("a copy that could not be made says so, and leaves nothing to remove", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/cp", new Error("cp: refused")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING);

    assert.equal(outcome.made, false);
    assert.match(outcome.reasons[0], /cp: refused/u);
});
