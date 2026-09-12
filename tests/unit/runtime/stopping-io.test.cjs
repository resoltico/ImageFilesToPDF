"use strict";

/*
 * A cancellation that arrives at a shell command rather than at a progress
 * surface.
 *
 * Nothing establishes that one can: doShellScript raises the command's exit
 * status, which is 0 to 255 and positive. Nothing disproves it either, and
 * the reasoning cuts both ways -- `do shell script` is an Apple Event, and
 * Apple Events are where -128 conventionally arrives in this environment, so
 * the premise threatens the progress-surface mechanism at least as much as it
 * threatens this. QA.md says how to settle it.
 *
 * The treatment follows the rule the whole design uses: unwind where nothing
 * is lost, record where something would be.
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

function cancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

/*
 * A run whose shell answers whatever `decide` says: a cancellation, an
 * ordinary failure, or nothing at all, which lets it run.
 *
 * Always aimed at the second image, so the first has been published by the
 * time the stop arrives and there is a report to preserve.
 */
function shellSaying(decide) {
    const host = createFakeHost({
        files: THREE,
        failures: [["", decide]]
    });
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

const SECOND_IMAGE = "/a/2.png";
const SECOND_PREPARED = "000002-prepared.v";

function cancelWhen(matches) {
    return (command) => (matches(command) ? cancellation() : undefined);
}

function run(context) {
    try {
        return { results: createSeparatePdfs(context.job, THREE.map(imageOf)) };
    } catch (error) {
        return { threw: error };
    }
}

function publishedIn(host) {
    return [...host.files].filter(
        (path) => path.startsWith("/a/") && path.endsWith(".pdf")
    );
}

test("a cancellation at a vips stage stops the run and keeps the report", () => {
    // This one already worked: runArgv preserves it as a cause and the loop
    // asks. It is here so a change that breaks it is noticed.
    const context = shellSaying(cancelWhen((command) =>
        command.includes("thumbnail") && command.includes(SECOND_IMAGE)));
    const { results } = run(context);

    assert.equal(results.outputs.length, 1, "the first image is still reported");
    assert.equal(results.stopped, true);
    assert.equal(results.failures.length, 0, "not blamed on the photograph");
});

test("a cancellation while verifying a stage is not an answer about a file", () => {
    // It used to be reported as "prepared page image is not a file with
    // anything in it", which is a wrong diagnosis rather than a late stop.
    const context = shellSaying(cancelWhen((command) =>
        command.includes("/bin/test") && command.includes(SECOND_PREPARED)));
    const { results } = run(context);

    assert.equal(results.stopped, true);
    assert.equal(results.failures.length, 0, "and not a file that is missing");
    assert.equal(publishedIn(context.host).length, 1, "only the first image");
});

test("an ordinary failure is still an ordinary failure", () => {
    // The distinction has to cut both ways or it is not a distinction: a
    // broken image fails on its own and the batch carries on.
    const host = createFakeHost({
        files: THREE,
        failures: [[SECOND_IMAGE, (command) => (
            command.includes("thumbnail") ? new Error("broken image") : undefined
        )]]
    });
    const results = createSeparatePdfs(makeJob(host), THREE.map(imageOf));

    assert.equal(results.outputs.length, 2);
    assert.equal(results.failures.length, 1);
    assert.equal(results.stopped, undefined);
});
