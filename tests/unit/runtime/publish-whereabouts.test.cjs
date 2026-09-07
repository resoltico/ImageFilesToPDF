"use strict";

/*
 * Where the finished PDF is, when publication did not put it where it was
 * meant to go.
 *
 * Asked, not assumed. Publication moves the bytes twice, so the file the run
 * started with may be gone by the time something fails -- and naming a path
 * that is not there sends someone looking for a document that does not exist,
 * which is what naming the workspace used to do.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const CLAIM = "/bin/ln";

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

test("a PDF that only the staging file holds is kept, not removed", () => {
    // The rename into the output folder empties the workspace, so the staging
    // file is the only copy there is. Removing it because publication failed
    // would destroy a finished PDF; it is set aside instead, and the message
    // names where it went.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        emptyFiles: ["/a/out.pdf"]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /is not a file with anything in it/u);
        assert.match(error.message, /has been kept here:\n\n\S+recovered/u);

        return true;
    });
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "the finished PDF survived"
    );
    assert.equal(job.unpublished.size, 0);
});

test("a PDF pushed inside a folder is not published, and the run says where it is", () => {
    // A folder standing at the output path does not fail a rename: the file
    // goes inside it, under its own name. The staged file is gone by then, so
    // setting it aside succeeded at nothing and the message named a path in a
    // workspace that no longer held anything. The existence check is stubbed
    // away because the folder has to appear between that check and the move.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        directories: ["/a/out.pdf"],
        failures: [
            ["test' '-e' '/a/out.pdf'", new Error("test failed")],
            [CLAIM, new Error("ln: /a/out.pdf: File exists")]
        ]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /is not a file with anything in it/u);
        assert.match(error.message, /has been kept here:\n\n\S+recovered/u);

        return true;
    });
    assert.equal(job.unpublished.size, 0, "the job owns no path in the workspace");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "and the PDF is out of the folder it was pushed into"
    );
});

test("a PDF the run cannot find is not claimed to be anywhere", () => {
    // The bytes went to the output path and the check on the other side still
    // failed. There is nothing to set aside and nothing to promise: the
    // message says where it was headed rather than naming a file that is not
    // there.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        emptyFiles: ["/a/out.pdf"],
        failures: [[CLAIM, new Error(DENIED)]]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /is not a file with anything in it/u);
        assert.match(error.message, /last seen on its way here:\n\n\/a\/out\.pdf/u);

        return true;
    });
    assert.equal(job.unpublished.size, 0);
});
