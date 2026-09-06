"use strict";

/*
 * Measuring a file, which is the whole basis for trusting a copy.
 *
 * A copy is not atomic, so the destination existing proves nothing about
 * whether it is complete, or even whether it is ours. Comparing sizes is what
 * settles both -- provided an unreadable size is never mistaken for one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    fileSize,
    copyInto,
    publishPdf
} = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");

test("a size that cannot be read is not mistaken for a size", () => {
    // stat can succeed and still say something unusable. Treating that as a
    // number would let a nonsense size compare equal to another nonsense one.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", "not a number"]]
    });

    assert.equal(fileSize(host, "/a/p.pdf"), -1);
});

test("an unmeasurable source is never published by copy", () => {
    // If the source size is unknown there is nothing to verify the copy
    // against, so the copy cannot be claimed as a publication.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["stat' '-f%z' '/a/p.pdf'", "not a number"]]
    });

    const outcome = copyInto(host, "/a/p.pdf", "/a/out.pdf");

    assert.equal(outcome.published, false);
    assert.match(outcome.reason, /-1 were expected/u);
});

test("a rename that quietly did nothing says so", () => {
    // mv exiting zero while the partial is still there is the only signal
    // that the destination was taken.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/mv", ""], ["/bin/cp", new Error("Operation not permitted")]]
    });

    assert.throws(() => publishPdf(host, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /the rename declined: the output path was taken/u);

        return true;
    });
});

test("neither file being measurable is not a match", () => {
    // Two unknown sizes are equal to each other. Without the explicit check
    // for an unknown size, a copy nobody could measure would be reported as
    // published.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });

    const outcome = copyInto(host, "/a/p.pdf", "/a/out.pdf");

    assert.equal(outcome.published, false);
});

test("the size is asked for in the one format that yields bytes", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    fileSize(host, "/a/p.pdf");

    assert.match(
        host.commands.find((command) => command.includes("stat")),
        /'\/usr\/bin\/stat' '-f%z' '\/a\/p\.pdf'/u
    );
});

test("the failure reads as paragraphs, not as one run-on line", () => {
    // It goes in front of a person in a dialog, under a heading sentence.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            ["/bin/mv", new Error("Operation not permitted")],
            ["/bin/cp", new Error("Operation not permitted")]
        ]
    });

    assert.throws(() => publishPdf(host, "/a/p.pdf", "/a/out.pdf"), (error) => {
        // The heading stands apart from the detail beneath it; run together
        // they read as one sentence about something else.
        assert.ok(error.message.startsWith(
            "The PDF could not be published without overwriting another file.\n\n"
        ), error.message);

        return true;
    });
});
