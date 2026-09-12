"use strict";

/*
 * A cancellation that arrives while the finished PDF is being published.
 *
 * By then it is built, validated, and one operation from the person's folder.
 * Unwinding to honour a button would throw finished work away -- the same
 * reason there is no checkpoint inside a publication -- so the cancellation
 * is recorded rather than let out, and the run stops at the next image.
 *
 * An audit asked for the opposite: that a cancellation before publication
 * should not start the ordinary fallback. That would discard a PDF for an
 * image that was fully converted, which is what the design's own rule exists
 * to prevent.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createProgress } = require("../../../src/runtime/progress.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];
const SECOND_OUTPUT = "/a/2_20260904_010203.pdf";

function cancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

function shellSaying(decide) {
    const host = createFakeHost({ files: THREE, failures: [["", decide]] });
    const job = makeJob(host);
    const said = [];

    job.progress = createProgress([{
        start: () => undefined,
        report: (done, description, detail) => said.push(`${description} | ${detail}`),
        pause: () => undefined,
        close: () => undefined
    }]);
    job.progress.expect({ units: THREE.length, images: THREE.length });

    return { host, job, said };
}

function run(context) {
    try {
        return { results: createSeparatePdfs(context.job, THREE.map(imageOf)) };
    } catch (error) {
        return { threw: error };
    }
}

function cancelWhen(matches) {
    return (command) => (matches(command) ? cancellation() : undefined);
}

function publishedIn(host) {
    return [...host.files].filter(
        (path) => path.startsWith("/a/") && path.endsWith(".pdf")
    );
}

test("a cancellation while claiming the name still publishes that image", () => {
    /*
     * By then the PDF is built, validated, and one operation from the
     * person's folder. Unwinding to honour a button would throw finished work
     * away -- the same reason there is no checkpoint inside a publication --
     * so the ordinary path carries it through and the run stops afterwards.
     */
    const context = shellSaying(cancelWhen((command) =>
        command.includes("/bin/ln") && command.includes(SECOND_OUTPUT)));
    const { results } = run(context);

    assert.equal(results.outputs.length, 2, "the image in hand was published too");
    assert.equal(results.stopped, true, "and no third image was started");
    assert.equal(publishedIn(context.host).length, 2);
});

test("a cancellation while copying beside the destination does the same", () => {
    // The link has to be refused first, or nothing is ever copied.
    const context = shellSaying((command) => {
        if (command.includes("/bin/ln") && command.includes(SECOND_OUTPUT)) {
            return new Error("Operation not supported");
        }

        return command.includes("/bin/cp") ? cancellation() : undefined;
    });
    const { results } = run(context);

    assert.equal(results.stopped, true);

    /*
     * The third image's "Preparing" is in the log: a report says its piece
     * and then stops the run, so the line that raised is the last one
     * recorded. What matters is that nothing after it happened.
     */
    assert.ok(
        !context.said.some((line) => line.startsWith("Creating PDF | 3 of 3")),
        `the third image was never converted: ${context.said.join(", ")}`
    );

    // The PDF that could not be copied is not lost: publication sets it aside
    // and says where, which is what the person needs whether they stopped the
    // run or the copy simply failed.
    assert.equal(results.failures.length, 1);
    assert.match(results.failures[0].message, /could not be saved/u);
});

test("a cancellation while making the place to copy into does the same", () => {
    // The other half of copyBeside. Nothing of this run exists at the
    // destination yet, so the finished PDF is set aside and reported, and the
    // next image is never begun.
    const context = shellSaying((command) => {
        if (command.includes("/bin/ln") && command.includes(SECOND_OUTPUT)) {
            return new Error("Operation not supported");
        }

        return command.includes("/bin/mkdir") ? cancellation() : undefined;
    });
    const { results } = run(context);

    assert.equal(results.stopped, true);
    assert.equal(results.outputs.length, 1, "the first image is still reported");
    assert.ok(
        !context.said.some((line) => line.startsWith("Creating PDF | 3 of 3")),
        `the third image was never converted: ${context.said.join(", ")}`
    );
});
