"use strict";

/*
 * What is said when the output name cannot be created.
 *
 * Only two things are known at that point: whether the name is taken, which
 * is an answer to a question actually put, and what the system said about the
 * operation it refused. A cause beyond those two is invention -- and the
 * invented one named the drive, which sent a reader looking at the disk when
 * the answer was a folder's permissions, or a bridge that had not loaded on a
 * disk that could have taken the name perfectly well.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

// A volume with no hard links at all, which is what FAT32 measurably is: no
// claim of ours can be a link, wherever it is made from.
function linkless(settings) {
    return createFakeHost({
        ...settings,
        failures: [["/bin/ln", new Error("Operation not supported")],
            ...settings.failures ?? []]
    });
}

test("a name that is taken is refused, and what is there is untouched", () => {
    // Both operations refuse it; what the refusal meant is decided by asking
    // whether the name is taken, because errno does not reach here.
    const host = linkless({
        files: ["/a/p.pdf", "/a/theirs.pdf"],
        failures: [["test' '-e' '/a/theirs.pdf' '-o'", new Error("test failed")]]
    });

    host.sizes.set("/a/theirs.pdf", 99);

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/theirs.pdf"),
        /could not be saved where it was meant to go/u
    );
    assert.equal(host.sizes.get("/a/theirs.pdf"), 99, "their file is intact");
});

test("a destination that can do neither is told about, not worked around", () => {
    // Taking the name empty and filling it is what this replaced. The name
    // existed before the PDF was in it, and the move and the cleanup that
    // followed acted on whatever was at that name by then -- which no guard
    // fixes, because proving an entry matches something measured a moment ago
    // is not proving it is the file that was created.
    const host = linkless({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    host.renamer = { rename: () => false };
    job.rename = host.renamer;

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(
            error.message,
            /the output name could not be created in one step, so the PDF was not put there/u
        );
        // What the system said about the operation that was actually
        // refused, which is the only evidence there is about why.
        assert.match(error.message, /Operation not supported/u);
        assert.ok(
            !error.message.includes("drive cannot"),
            "and no cause this run did not establish"
        );

        return true;
    });
    assert.ok(!host.files.has("/a/out.pdf"), "and the name was never created");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "the finished PDF is kept instead"
    );
});

test("a run with no bridge says so, rather than blaming the volume", () => {
    // Without the bridge there is one operation instead of two, and on a
    // volume with no links that is none. What this run can establish is that
    // it had nothing else to try -- not that the drive could not have taken
    // it, which it was told for three releases.
    const host = linkless({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    job.rename = null;

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(
            error.message,
            /the other way of creating it was not available to this run/u
        );

        return true;
    });
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the place it made is cleared away"
    );
});

test("a refusal that is not about the volume is not described as one", () => {
    // A folder that denies a new file, on a disk that does both operations
    // perfectly well: measured on APFS with an ACL denying add_file, where
    // this said the drive could not take the name while quoting the system
    // saying "Permission denied" two lines below it.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/ln", new Error("Permission denied")]]
    });
    const job = makeJob(host);

    job.rename = { rename: () => false };

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /Permission denied/u);
        assert.ok(
            !/drive|volume/u.test(error.message),
            `a cause was named that was not established: ${error.message}`
        );

        return true;
    });
});
