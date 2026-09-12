"use strict";

/*
 * A cancellation raised from inside an image, rather than recorded by a
 * progress surface.
 *
 * Nothing establishes that one can get there: doShellScript raises the
 * command's exit status, which is positive, and -128 is not one. Nothing
 * disproves it either, because do shell script is an Apple Event. So the
 * treatment has to be right under either premise, and it is cheap: the
 * cancellation is not written into the failure list as though the photograph
 * were at fault, and it does not escape the loop that holds the report of
 * everything already published.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];

// A reporter that never asks the run to stop of its own accord.
function neverStops() {
    return {
        stopped: () => false,
        expect: () => undefined,
        beginning: () => undefined,
        about: () => undefined,
        phase: () => undefined,
        finished: () => undefined,
        pause: () => undefined,
        close: () => undefined
    };
}

function cancelling(path) {
    return [[path, (command) => {
        if (!command.includes("thumbnail")) {
            return undefined;
        }

        const error = new Error("User cancelled.");

        error.errorNumber = -128;

        return error;
    }]];
}

function runWith(failures) {
    const host = createFakeHost({ files: THREE, failures });
    const job = makeJob(host);

    job.progress = neverStops();

    return { host, job };
}

test("a cancellation from inside an image keeps what was already published", () => {
    /*
     * Not this image's failure and not this batch's ending: the PDFs already
     * on disk are real, and letting the cancellation escape the loop would
     * throw the report of them away. Injected through the shell, which is
     * where it would arrive if it arrived at all.
     */
    const { host, job } = runWith(cancelling("/a/2.png"));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, 1, "the first image is still reported");
    assert.equal(results.failures.length, 0, "and nothing is blamed on a photograph");
    assert.equal(results.stopped, true);
    assert.ok(
        host.files.has(results.outputs[0]),
        "the PDF that was made is on disk"
    );
});

test("a cancellation from inside the first image is not blamed on the photograph", () => {
    /*
     * The loop asks between images, so nothing raises one from in there
     * today. If something ever does, recording it as a per-image failure
     * would say this photograph was at fault and carry on to the next one.
     * It is let out instead -- through the wrapping runArgv puts over it,
     * which is why the chain is walked rather than the top read.
     */
    const { host, job } = runWith(cancelling("/a/1.png"));

    // Nothing had been published, so there is nothing to report and the run
    // ends in silence like any other cancellation.
    assert.throws(
        () => createSeparatePdfs(job, THREE.map(imageOf)),
        (error) => isUserCancelled(error)
    );
    assert.deepEqual(
        [...host.files].filter((path) => path.endsWith(".pdf")),
        [],
        "and no second image was started"
    );
});

test("an ordinary error from the loop's own work is not read as a stop", () => {
    // The boundary catches a cancellation and nothing else. Swallowing the
    // rest would end a run quietly for a fault that deserved a dialog, and
    // would report it as though somebody had asked for it.
    const { job } = runWith([]);
    const { finished } = job.progress;

    job.progress.finished = (text) => {
        finished(text);

        throw new Error("the report itself broke");
    };

    assert.throws(
        () => createSeparatePdfs(job, THREE.map(imageOf)),
        /the report itself broke/u
    );
});
