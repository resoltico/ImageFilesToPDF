"use strict";

/*
 * A stop that arrives after the filesystem has already done the thing.
 *
 * An interrupted call is not proof that nothing happened. The previous round
 * assumed it was: an abandoned publication cleared up and raised without ever
 * asking the output path what it held, so a PDF that had been linked into
 * place went unmentioned -- which is the one thing completion.js exists to
 * prevent, and the one thing publish.js has always refused to infer.
 *
 * The link is made and the call then raises, which is what these arrange.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const { isCompleteSuccess } = require("../../../src/runtime/receipt.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const ONE = ["/a/1.png"];
const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];

/*
 * The command runs, and then the call raises: the schedule that tells an
 * assumption about absence apart from a measurement of it.
 */
function raisingAfter(files, matches, failures = []) {
    const host = createFakeHost({ files, failures });
    const real = host.doShellScript.bind(host);

    host.doShellScript = (command) => {
        const answer = real(command);

        if (matches(command)) {
            const error = new Error("User cancelled.");

            error.errorNumber = -128;

            throw error;
        }

        return answer;
    };

    return { host, job: makeJob(host) };
}

function publishedIn(host) {
    return [...host.files].filter((path) => path.startsWith("/a/") &&
        path.endsWith(".pdf") && !path.includes("staged"));
}

const linkTo = (name) => (command) =>
    command.includes("/bin/ln") && command.includes(name);

test("a PDF that was linked into place is reported, and the run stops", () => {
    const { host, job } = raisingAfter(THREE, linkTo("/a/2_"));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.deepEqual(
        results.outputs,
        publishedIn(host),
        "what is on disk is what is reported"
    );
    assert.equal(results.outputs.length, 2);
    assert.equal(results.failures.length, 0, "and it is not a failure");
    assert.equal(results.stopped, true, "the third image was never begun");
    assert.equal(job.unpublished.size, 0, "and nothing is held for recovery");
});

test("the same through the route beside the destination", () => {
    /*
     * The link from the workspace is refused for an ordinary reason, so the
     * PDF is copied into a place beside the destination and claimed from
     * there -- and that second claim is the one interrupted after it
     * succeeded. The two are told apart by where they link from.
     */
    const BESIDE = "/a/.ImageFilesToPDF";
    const claimsFor = (command, name) =>
        command.includes("/bin/ln") && command.includes(name);
    const { host, job } = raisingAfter(
        THREE,
        (command) => claimsFor(command, "/a/2_") && command.includes(BESIDE),
        [["/bin/ln", (command) => (claimsFor(command, "/a/2_") &&
            !command.includes(BESIDE)
            ? new Error("Operation not supported")
            : undefined)]]
    );
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.deepEqual(results.outputs, publishedIn(host));
    assert.equal(results.outputs.length, 2, "the second image was published");
    assert.equal(results.stopped, true, "and the third was never begun");
});

test("a stop while the last image is saved leaves a complete run", () => {
    // Every image was converted. Calling that incomplete would fail a
    // headless run that produced every PDF asked of it.
    const { host, job } = raisingAfter(THREE, linkTo("/a/3_"));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    results.rejected = [];

    assert.equal(results.outputs.length, THREE.length);
    assert.equal(publishedIn(host).length, THREE.length);
    assert.equal(results.stopped, undefined, "nothing was left to stop");
    assert.equal(isCompleteSuccess(results), true);
});

test("a combined run stopped as it saves is complete, and says where", () => {
    // It publishes once, at the end, so a stop arriving then has nothing left
    // to stop either.
    const { host, job } = raisingAfter(ONE, linkTo("/a/output_"));
    const results = createCombinedPdf(job, ONE.map(imageOf));

    assert.deepEqual(results.outputs, publishedIn(host));
    assert.equal(results.outputs.length, 1);
    assert.equal(results.stopped, undefined);
});

test("an image that failed still counts as one the run got to", () => {
    /*
     * Three images: the first fails on its own, the other two are published,
     * and the stop arrives as the last is saved. Everything was attempted, so
     * nothing was left to stop -- and counting only the successes would call
     * a run that got to every image an interrupted one.
     */
    const { host, job } = raisingAfter(THREE, linkTo("/a/3_"), [
        ["/a/1.png", (command) => (command.includes("thumbnail")
            ? new Error("broken image")
            : undefined)]
    ]);
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, 2);
    assert.equal(results.failures.length, 1);
    assert.equal(publishedIn(host).length, 2);
    assert.equal(results.stopped, undefined, "every image was got to");
});
