"use strict";

/*
 * A stop with no image after it.
 *
 * The previous design recorded a cancellation raised during publication and
 * waited for the next image's report to act on it. With one image there is no
 * next report, so the run published through the fallback and returned an
 * ordinary success -- which the headless receipt then read as a request
 * completely honoured.
 *
 * Nothing depends on a following image now: a cancelled publication unwinds,
 * so it reaches the catch that already asks whether it was one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const { isCompleteSuccess } = require("../../../src/runtime/receipt.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const ONE = ["/a/1.png"];
const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];

function cancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

function shellSaying(files, decide) {
    const host = createFakeHost({ files, failures: [["", decide]] });

    return { host, job: makeJob(host) };
}

const cancelAt = (needle) => (command) =>
    (command.includes(needle) ? cancellation() : undefined);

function publishedIn(host) {
    return [...host.files].filter((path) => path.startsWith("/a/") &&
        path.endsWith(".pdf") && !path.includes("staged"));
}

test("one image is enough: the stop reaches the result with nothing after it", () => {
    /*
     * The previous design recorded the cancellation and waited for the next
     * image's report to act on it. With one image there is no next report, so
     * the run published through the fallback and returned success.
     */
    const { host, job } = shellSaying(ONE, cancelAt("/bin/ln"));

    assert.throws(
        () => createSeparatePdfs(job, ONE.map(imageOf)),
        isUserCancelled
    );
    assert.deepEqual(publishedIn(host), []);
});

test("a stop on the last of several keeps what came before it", () => {
    const { host, job } = shellSaying(THREE, (command) =>
        (command.includes("/bin/ln") && command.includes("/a/3_")
            ? cancellation()
            : undefined));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, 2);
    assert.equal(results.stopped, true);
    assert.equal(publishedIn(host).length, 2);
});

test("a combined run of one image stops the same way", () => {
    // It publishes once, at the end, so its stop has no later report either.
    const { host, job } = shellSaying(ONE, cancelAt("/bin/ln"));

    assert.throws(
        () => createCombinedPdf(job, ONE.map(imageOf)),
        isUserCancelled
    );
    assert.deepEqual(publishedIn(host), []);
});

test("a stopped one-image run is not a complete success", () => {
    // The receipt reads result.stopped, and nothing was setting it when the
    // stop had no image after it to reveal it.
    const { job } = shellSaying(THREE, (command) =>
        (command.includes("/bin/ln") && command.includes("/a/3_")
            ? cancellation()
            : undefined));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    results.rejected = [];
    assert.equal(results.stopped, true);
    assert.equal(isCompleteSuccess(results), false);
});
