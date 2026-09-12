"use strict";

/*
 * What a run does when it has been asked to stop.
 *
 * Between images, which is the only place stopping is safe: a publication in
 * progress owns a finished PDF and a name it has claimed, and unwinding it
 * from a progress report is how both are lost. Once the pages are prepared, a
 * combined run is one indivisible operation and finishes.
 *
 * The two modes answer differently, and the asymmetry is the honest one. A
 * separate run has published real PDFs by the time it stops and must say so;
 * a combined run that stops before its PDF exists has produced nothing, and
 * ends in silence like every other cancellation in this action.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

/*
 * A reporter that says stop once the given number of images have been begun,
 * which is how a person pressing a button partway through is modelled.
 */
function stoppingAfter(images) {
    let begun = 0;

    return {
        stopped: () => begun >= images,
        expect: () => undefined,
        beginning() {
            begun += 1;
        },
        about: () => undefined,
        phase: () => undefined,
        finished: () => undefined,
        pause: () => undefined,
        close: () => undefined
    };
}

function jobFor(paths, progress) {
    const host = createFakeHost({ files: paths });
    const job = makeJob(host);

    job.progress = progress;

    return { host, job };
}

const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];

test("a separate run keeps what it published and starts nothing more", () => {
    const { host, job } = jobFor(THREE, stoppingAfter(1));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, 1, "the first image was published");
    assert.equal(results.failures.length, 0, "and nothing is blamed on a photograph");
    assert.equal(results.stopped, true);
    assert.ok(
        host.files.has(results.outputs[0]),
        "the PDF that was made is on disk"
    );
});

test("a separate run that was never stopped does not say it was", () => {
    const { job } = jobFor(THREE, stoppingAfter(THREE.length + 1));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, THREE.length);
    assert.equal(results.stopped, undefined);
});

test("a stop during the last image does not stop a run that finished", () => {
    // The flag is raised while the third image is converting. The loop has no
    // fourth image to ask about, so nothing was cut short and nothing says so.
    const { job } = jobFor(THREE, stoppingAfter(THREE.length));
    const results = createSeparatePdfs(job, THREE.map(imageOf));

    assert.equal(results.outputs.length, THREE.length);
    assert.equal(results.stopped, undefined);
});

test("a cancellation from inside an image is not blamed on the photograph", () => {
    /*
     * The loop asks between images, so nothing raises one from in there
     * today. If something ever does, recording it as a per-image failure
     * would say this photograph was at fault and carry on to the next one.
     * It is let out instead -- through the wrapping runArgv puts over it,
     * which is why the chain is walked rather than the top read.
     */
    const cancelled = () => {
        const error = new Error("User cancelled.");

        error.errorNumber = -128;

        return error;
    };
    const host = createFakeHost({
        files: THREE,
        failures: [["/a/1.png", (command) => (
            command.includes("thumbnail") ? cancelled() : undefined
        )]]
    });
    const job = makeJob(host);

    job.progress = stoppingAfter(THREE.length + 1);

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

test("a combined run that stops produces nothing and says nothing", () => {
    const { host, job } = jobFor(THREE, stoppingAfter(1));

    assert.throws(
        () => createCombinedPdf(job, THREE.map(imageOf)),
        (error) => isUserCancelled(error)
    );

    assert.deepEqual(
        [...host.files].filter((path) => path.endsWith(".pdf")),
        [],
        "no PDF was published, and none was left staged"
    );
});
