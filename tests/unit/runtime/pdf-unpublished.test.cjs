"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createCombinedPdf,
    createSeparatePdfs
} = require("../../../src/runtime/pdf.js");
const { failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const images = [imageOf("/a/x.png")];

test("a PDF that was built but could not be published is kept", () => {
    // The whole point of tracking whether it was validated. Deleting it here
    // destroys finished work over a failure that has nothing to do with its
    // contents, and the workspace is removed as soon as the run ends.
    const denied = new Error("Operation not permitted");
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["/bin/mv", denied], ["/bin/cp", denied]]
    });

    assert.throws(
        () => createCombinedPdf(makeJob(app), images),
        /could not be published/u
    );

    const kept = [...app.files].filter((file) => file.includes("staged"));

    assert.equal(kept.length, 1, `the finished PDF must survive: ${[...app.files]}`);
});

test("a PDF that was never finished is still cleaned up", () => {
    // Only a validated file is precious. One abandoned mid-build is not.
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", failing("pdfcpu died")]]
    });

    assert.throws(() => createCombinedPdf(makeJob(app), images));
    assert.ok(
        ![...app.files].some((file) => file.includes("staged")),
        "an unfinished file must not be kept"
    );
});

test("separate mode keeps a finished PDF it could not publish", () => {
    const denied = new Error("Operation not permitted");
    const app = createFakeHost({
        files: ["/a/good.png"],
        failures: [["/bin/mv", denied], ["/bin/cp", denied]]
    });
    const result = createSeparatePdfs(makeJob(app), [
        imageOf("/a/good.png")
    ]);

    assert.equal(result.outputs.length, 0);
    assert.match(result.failures[0], /The finished PDF has been kept here/u);
    assert.equal(
        [...app.files].filter((file) => file.includes("staged")).length,
        1,
        "the finished PDF must survive"
    );
});

/*
 * The two tests above fail before pdfcpu writes anything, so nothing is left
 * to clean up and the cleanup cannot be observed. These fail after the import
 * has produced a file and before it is validated — the one window where a
 * staged file exists and is still disposable.
 */
test("a file rejected by validation is removed, not left in the workspace", () => {
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'validate'", failing("pdfcpu: xref table is corrupt")]]
    });

    assert.throws(() => createCombinedPdf(makeJob(app), images));

    const staged = [...app.files].filter((file) => file.includes("staged"));

    assert.deepEqual(staged, [], "the rejected file must not survive the run");
});

test("separate mode removes a file rejected by validation too", () => {
    const app = createFakeHost({
        files: ["/a/good.png"],
        failures: [["'validate'", failing("pdfcpu: xref table is corrupt")]]
    });
    const result = createSeparatePdfs(makeJob(app), [
        imageOf("/a/good.png")
    ]);

    assert.match(result.failures[0], /xref table is corrupt/u);
    assert.deepEqual(
        [...app.files].filter((file) => file.includes("staged")),
        [],
        "the rejected file must not survive the run"
    );
});
