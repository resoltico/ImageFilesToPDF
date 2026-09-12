"use strict";

/*
 * What a separate run does when it is asked to stop.
 *
 * It publishes as it goes, so stopping leaves real PDFs on disk and saying
 * nothing about them is the one thing completion.js exists to prevent. A stop
 * that produced nothing is a cancellation like any other and says nothing.
 *
 * A stop now takes effect inside an image as well as between them -- at
 * "Creating PDF", "Validating PDF" or "Saving PDF" -- because each of those
 * is said before the work it names. The previous design stopped only between
 * images, on the grounds that there was nowhere safe inside one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");
const { stoppingWhen, atPhase } = require("./fake-stopping.cjs");

const THREE = ["/a/1.png", "/a/2.png", "/a/3.png"];

function jobStoppedWhen(host, asked) {
    const job = makeJob(host);
    const { said, progress } = stoppingWhen(asked);

    job.settings.mode = "separate";
    job.progress = progress;
    job.progress.expect({ units: THREE.length, images: THREE.length });

    return { job, said };
}

function separateStoppedWhen(asked) {
    const host = createFakeHost({ files: THREE });
    const { job, said } = jobStoppedWhen(host, asked);
    const outcome = { host, said, threw: null, results: null };

    try {
        outcome.results = createSeparatePdfs(job, THREE.map(imageOf));
    } catch (error) {
        outcome.threw = error;
    }

    return outcome;
}

function publishedIn(host) {
    return [...host.files].filter(
        (path) => path.startsWith("/a/") && path.endsWith(".pdf")
    );
}

test("a stop between images keeps what was published and starts no more", () => {
    const { host, said, results } = separateStoppedWhen(
        (description, detail) => detail === "2 of 3 — 2.png"
    );

    assert.equal(results.outputs.length, 1, "the first image is reported");
    assert.equal(results.failures.length, 0, "nothing is blamed on a photograph");
    assert.equal(results.stopped, true);
    assert.equal(publishedIn(host).length, 1, "and its PDF is on disk");
    assert.ok(
        !said.some((line) => line.includes("3 of 3")),
        `no third image: ${said.join(", ")}`
    );
});

test("a stop as an image is about to be saved abandons that image", () => {
    // The second image is at the last thing it says before it claims a name.
    // It publishes nothing, the first image's PDF is still reported, and the
    // third is never begun.
    const { host, said, results } = separateStoppedWhen(
        (description, detail) => description === "Saving PDF" &&
            detail === "2 of 3 — 2.png"
    );

    assert.equal(results.stopped, true);
    assert.equal(results.outputs.length, 1, "the first image is still reported");
    assert.equal(results.failures.length, 0, "and the second is not a failure");
    assert.equal(publishedIn(host).length, 1, "only the first was published");
    assert.ok(!said.some((line) => line.includes("3 of 3")), said.join(", "));
});

test("a stop at the very first thing an image says produces nothing at all", () => {
    const { host, threw, results } = separateStoppedWhen(atPhase("Saving PDF"));

    assert.equal(results, null, "nothing was attempted, so nothing is reported");
    assert.ok(isUserCancelled(threw));
    assert.deepEqual(publishedIn(host), []);
});

test("a stop while an image's PDF is being built abandons only that image", () => {
    const { host, results } = separateStoppedWhen(
        (description, detail) => description === "Creating PDF" &&
            detail === "2 of 3 — 2.png"
    );

    assert.equal(results.stopped, true);
    assert.equal(results.outputs.length, 1, "the first image is still reported");
    assert.equal(publishedIn(host).length, 1);
});

test("a stop before the first image says nothing, because nothing happened", () => {
    // Reachable: a stop can be recorded while the tools are checked and the
    // folders are read, before any image is begun. Nothing was produced, so
    // the run ends the way every other cancellation does.
    const { threw, results } = separateStoppedWhen(
        (description, detail) => detail === "1 of 3 — 1.png"
    );

    assert.equal(results, null);
    assert.ok(isUserCancelled(threw));
});

test("a run nobody stops reports no stopping", () => {
    const { host, results } = separateStoppedWhen(() => false);

    assert.equal(results.outputs.length, THREE.length);
    assert.equal(results.stopped, undefined);
    assert.equal(publishedIn(host).length, THREE.length);
});
