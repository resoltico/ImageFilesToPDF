"use strict";

/*
 * Where a stop takes effect in a combined run.
 *
 * Three rounds of this design were a list of places somebody had thought of,
 * and each round an audit found the next one. The list is gone: a report of
 * what is about to happen raises, and a report of what has happened does not.
 * Those two lists were always the same list -- a report made before the work
 * is made before anything has been produced.
 *
 * Reproduced before the fix: a stop recorded at "Saving PDF" published the
 * PDF anyway and the run returned success.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");
const { stoppingWhen, atPhase } = require("./fake-stopping.cjs");

const TWO = ["/a/1.png", "/a/2.png"];

function combinedStoppedWhen(asked, files = TWO) {
    const host = createFakeHost({ files });
    const job = makeJob(host);
    const { said, progress } = stoppingWhen(asked);

    job.progress = progress;
    job.progress.expect({ units: files.length + 1, images: files.length });

    const outcome = { host, job, said, threw: null };

    try {
        createCombinedPdf(job, files.map(imageOf));
    } catch (error) {
        outcome.threw = error;
    }

    return outcome;
}

// Published, rather than staged: the workspace copy is removed with the
// workspace, by runJob, which is not what these exercise.
function pdfsIn(host) {
    return [...host.files].filter(
        (path) => path.startsWith("/a/") && path.endsWith(".pdf")
    );
}

test("a stop while saving publishes nothing", () => {
    // The one that used to get through. The report sits above the line that
    // records the staged PDF as unpublished and above the claim itself, so
    // nothing is claimed and the workspace goes with the staged file in it.
    const { host, said, threw } = combinedStoppedWhen(atPhase("Saving PDF"));

    assert.ok(isUserCancelled(threw), "the run ends as a cancellation");
    assert.deepEqual(pdfsIn(host), [], "nothing was published");
    assert.ok(
        !said.some((line) => line.startsWith("Saved")),
        `and nothing said it was: ${said.join(", ")}`
    );
});

test("a stop while saving leaves no workspace behind either", () => {
    // The report sits above the line that records the staged PDF as
    // unpublished. One line lower and the set would be non-empty, so runJob
    // would keep the whole workspace -- and a cancellation is silent, so
    // nobody would be told about the directory left on the disk.
    const { job } = combinedStoppedWhen(atPhase("Saving PDF"));

    assert.equal(job.unpublished.size, 0);
});

test("a stop while the PDF is being built starts no import", () => {
    const { host, said, threw } = combinedStoppedWhen(atPhase("Creating PDF"));

    assert.ok(isUserCancelled(threw));
    assert.deepEqual(pdfsIn(host), []);
    assert.ok(
        !said.some((line) => line.startsWith("Validating PDF")),
        `stopped there: ${said.join(", ")}`
    );
});

test("a stop while the PDF is being validated publishes nothing", () => {
    const { host, said, threw } = combinedStoppedWhen(atPhase("Validating PDF"));

    assert.ok(isUserCancelled(threw));
    assert.deepEqual(pdfsIn(host), []);
    assert.ok(!said.some((line) => line.startsWith("Saving PDF")));
});

test("a stop on the summary of prepared images starts no import", () => {
    const { host, said, threw } = combinedStoppedWhen(
        (description, detail) => detail === "2 images prepared"
    );

    assert.ok(isUserCancelled(threw));
    assert.deepEqual(pdfsIn(host), []);
    assert.ok(
        !said.some((line) => line.startsWith("Creating PDF")),
        `stopped there: ${said.join(", ")}`
    );
});

test("a stop on one image's report begins no further image", () => {
    const { said, threw } = combinedStoppedWhen(
        (description, detail) => detail === "1 of 2 — 1.png"
    );

    assert.ok(isUserCancelled(threw));
    assert.ok(
        !said.some((line) => line.includes("2 of 2")),
        `the second image was never begun: ${said.join(", ")}`
    );
});

test("a stop on the last image's report is caught by the next thing said", () => {
    // One image, so the loop has no further iteration to notice it in.
    const { host, said, threw } = combinedStoppedWhen(
        (description, detail) => detail === "1 of 1 — only.png",
        ["/a/only.png"]
    );

    assert.ok(isUserCancelled(threw));
    assert.deepEqual(pdfsIn(host), []);
    assert.ok(
        !said.some((line) => line.startsWith("Creating PDF")),
        `stopped there: ${said.join(", ")}`
    );
});

test("a run nobody stops is untouched by any of this", () => {
    const { host, threw } = combinedStoppedWhen(() => false);

    assert.equal(threw, null);
    assert.equal(pdfsIn(host).length, 1);
});
