"use strict";

/*
 * Measuring a file, which is the whole basis for trusting the staging step.
 *
 * A copy is not atomic, so a file at the staging name proves nothing about
 * whether it is complete. Comparing sizes is what settles it -- provided a
 * size that cannot be read is never mistaken for one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { fileSize, stageBeside } = require("../../../src/runtime/transfer.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const STAGED_MOVE = "mv' '-n' '/a/p.pdf'";
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

test("an unmeasurable source is never staged successfully", () => {
    // If the source size is unknown there is nothing to check the staged file
    // against, so it cannot be treated as safely in the folder.
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const outcome = stageBeside(host, "/a/p.pdf", INCOMING, -1);

    assert.equal(outcome.published, false);
    assert.match(outcome.reasons[0], /-1 were expected/u);
});

test("neither file being measurable is not a match", () => {
    // Two unknown sizes are equal to each other. Without the explicit check
    // for an unknown size, a staged file nobody could measure would pass.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });
    const outcome = stageBeside(host, "/a/p.pdf", INCOMING, -1);

    assert.equal(outcome.published, false);
});

test("a truncated staged file is a failure, not a publication", () => {
    // Only the staged copy measures short, as a half-written file would.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[STAGED_MOVE, new Error("Operation not permitted")], [STAGING_SIZE, "7"]]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /7 bytes where 1024 were expected/u
    );
    assert.ok(!host.files.has("/a/out.pdf"), "the output name is never reached");
});

test("a staging attempt that fails names each refusal once", () => {
    // The message goes in front of a person. Every refusal is worth having,
    // and nothing else is.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/mv", new Error("mv refused")], ["/bin/cp", new Error("cp refused")]]
    });
    const outcome = stageBeside(host, "/a/p.pdf", INCOMING, 1024);

    assert.equal(outcome.published, false);
    assert.equal(outcome.reasons.length, 2, outcome.reasons.join(" / "));
});

test("a rename that quietly did nothing says so", () => {
    // mv exiting zero while the staged file is still there is the only signal
    // that the name it was aimed at was taken.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            ["/bin/ln", new Error("ln: File exists")],
            ["mv' '-n' '/a/.ImageFilesToPDF", ""]
        ]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /the output path was taken/u);

        return true;
    });
});
