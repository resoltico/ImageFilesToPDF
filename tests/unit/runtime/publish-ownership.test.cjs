"use strict";

/*
 * What a run may remove, and what it must keep.
 *
 * The finished PDF stays in the workspace until the output path has been
 * checked, and a run removes only what it made. Both halves were learned from
 * the same defect: the workspace copy used to be moved into the output folder,
 * so a failure afterwards had to work out where the bytes were -- and it
 * worked that out by asking whether files existed, through a check that
 * answers "no" when it cannot tell. A refused check deleted the finished PDF
 * and then reported it missing.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

function recovered(host) {
    return [...host.files].filter((file) => file.includes("recovered"));
}

test("a check that cannot answer never costs the finished PDF", () => {
    // Every existence check fails while every file it asks about is there.
    // Nothing may be deleted or disowned on the strength of that.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            ["/bin/ln", new Error(DENIED)],
            ["/bin/cp", new Error(DENIED)],
            ["/bin/test", new Error(DENIED)]
        ]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /The finished PDF has been kept here:/u);

        return true;
    });
    assert.equal(recovered(host).length, 1, "the PDF was set aside, not deleted");
    assert.ok(!host.files.has("/a/out.pdf"), "and nothing was published");
});

test("a failure after the copy leaves the workspace copy untouched", () => {
    // The copy is a second file, not a move: whatever happens to it, the PDF
    // this run built is still where it built it.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            [DIRECT_CLAIM, new Error(DENIED)],
            ["ln' '/a/.ImageFilesToPDF", new Error(DENIED)],
            ["/bin/sh", new Error(DENIED)],
            // And the check on the staging copy cannot answer either.
            ["test' '-e' '/a/.ImageFilesToPDF", new Error(DENIED)]
        ]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), /could not be published/u);
    assert.equal(recovered(host).length, 1, "the finished PDF survived");
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the copy this run made was cleared away"
    );
    assert.equal(job.unpublished.size, 0, "and the job stopped owning it");
});

test("a PDF that could not even be set aside keeps its workspace", () => {
    // Set aside is best effort. When it fails the file is still where it was
    // built, and the workspace it was built in has to outlive the run.
    const host = createFakeHost({
        files: ["/a/p.pdf", "/a/out.pdf"],
        failures: [["mktemp", new Error(DENIED)]]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /kept here:\n\n\/a\/p\.pdf/u);

        return true;
    });
    assert.deepEqual([...job.unpublished], ["/a/p.pdf"]);
});
